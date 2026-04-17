import 'dotenv/config';
import express, {NextFunction, Request, Response} from 'express';
import compression from 'compression';
import { readFileSync } from 'fs';
import path from 'path';
import {Config, GeoFeature, GeoFeatureCollection, SupportedLanguage, Target, ZoneInfo} from './Types.js'

import {fileURLToPath} from 'url';
import {Utils} from "./Utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    process.exit(1);
});
process.on('unhandledRejection', (reason) => {
    console.error('[WARN] Unhandled Rejection:', reason);
});

// strict Environment Guard
const requireEnv = (key: string, fallback?: string): string => {
    const value = process.env[key] || fallback;
    if (!value) {
        console.error(`CRITICAL ERROR: Missing required environment variable: ${key}`);
        process.exit(1);
    }
    return value;
};

const config: Config = {
    appUrl: requireEnv('URL', 'http://localhost'),
    port: parseInt(requireEnv('PORT', '3000'), 10),
    airQualityTime: { key: 'airQualityTime', endpoint: requireEnv('AIR_QUALITY_TIME_URL') },
    traffic: { key: 'traffic', endpoint: requireEnv('TRAFFIC_URL') },
    cctv: { key: 'cctv', endpoint: requireEnv('CCTV_URL') },
    billingMachines: { key: 'billingMachines', endpoint: requireEnv('BILLING_MACHINES_URL') },
    evStations: { key: 'evStations', endpoint: requireEnv('EV_URL') },
    wasteCentres: { key: 'wasteCentres', endpoint: requireEnv('WASTE_URL') },
    smartParking: { key: 'smartParking', endpoint: requireEnv('SMART_CAR_PARKS_TIME_URL') },
    taxiRanks: { key: 'taxiRanks', endpoint: requireEnv('TAXI_RANKS_URL') }
}

const ALLOW_FRAME_URL = requireEnv('ALLOW_FRAME_URL', '*');
const FRONTEND_SENTRY_DSN = process.env.FRONTEND_SENTRY_DSN || null; // Optional
const apiCache = new Map<string, { data: any; lastUpdated: number; expiresAt: number }>();
const CACHE_TTL = 60_000; // 60 seconds
export const clearApiCache = (): void => apiCache.clear();
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS) || 120_000;
const adminRegionsData = loadStaticJson('cau.json');
const paidParkingZonesData = loadStaticJson('paid-parking-zones.json');
const zoneInfoCache: Record<'blue' | 'green', ZoneInfo | null> = { blue: null, green: null };
const ZONE_PRICE_URLS: Record<'blue' | 'green', string> = {
    blue:  'https://www.transportburgas.bg/bg/правила-в-платени-зони-град-бургас',
    green: 'https://www.transportburgas.bg/bg/правила-в-зелена-зона-град-бургас',
};
// midnight scheduler for paid zones prices
let midnightTimeoutId: ReturnType<typeof setTimeout> | undefined;
let midnightIntervalId: ReturnType<typeof setInterval> | undefined;

const targets: Target[] = Object.keys(config)
    .filter(prop => prop !== 'appUrl' && prop !== 'port')
    .map(prop => config[prop as keyof typeof config] as Target);

for (let target of targets) {
    if(!target.endpoint) {
        console.error(`CRITICAL ERROR: Missing API URL in environment variables for ${target.key}.`);
        process.exit(1);
    }
}

export const app = express();
app.use(compression());
// Global Express error handler
export const globalErrorHandler = (err: Error, req: Request, res: Response, _next: NextFunction): void => {
    console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);
    if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
    }
};
app.use(globalErrorHandler);
// Middleware to serve static files (Frontend)
const staticOpts = { maxAge: process.env.NODE_ENV === 'production' ? '7d' : 0 };
app.use(express.static(path.join(__dirname, '../public'), staticOpts));
// Serve compiled client JS
app.use('/js', express.static(path.join(__dirname, '../dist'), staticOpts));

// --- Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.setHeader('Content-Security-Policy', `frame-ancestors ${ALLOW_FRAME_URL}`);
    next();
});

function isSupportedLanguage(lang: any): lang is SupportedLanguage {
    return lang === 'bg' || lang === 'en';
}

const getValidatedLang = (req: Partial<Request>): SupportedLanguage => {
    const lang = req.query?.lang;
    if (!lang) {
        return 'bg';
    }
    if (isSupportedLanguage(lang)) {
        return lang;
    }
    throw new Error(`Invalid language: ${lang}. Supported: bg, en`);
};

/**
 * Builds query string for filters (excluding lang, which is handled by axios params)
 */
const buildExtraQuery = (req: Partial<Request>) => {
    const params = new URLSearchParams();
    const query = req.query || {};

    params.append('lang', getValidatedLang(req));
    const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
    if (query.start_date) {
        const sd = String(query.start_date);
        if (ISO_DATE.test(sd) && !isNaN(new Date(sd).getTime())) {
            params.append('start_date', sd);
        }
    }
    if (query.end_date) {
        const ed = String(query.end_date);
        if (ISO_DATE.test(ed) && !isNaN(new Date(ed).getTime())) {
            params.append('end_date', ed);
        }
    }

    return params.toString() ? `?${params.toString()}` : '';
};

// --- Load static GeoJSON files once at startup ---
function loadStaticJson(filename: string): object {
    const filePath = path.join(__dirname, '..', filename);
    try {
        return JSON.parse(readFileSync(filePath, 'utf8'));
    } catch (err) {
        console.error(`CRITICAL ERROR: Failed to load ${filename} at startup:`, err);
        process.exit(1);
    }
}

async function scrapeZoneInfo(zone: 'blue' | 'green'): Promise<void> {
    const url = ZONE_PRICE_URLS[zone];
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const html = await response.text();

        // Strip all tags and decode entities first, then match the price
        const text = html
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&euro;/g, 'евро')
            .replace(/\s+/g, ' ');

        const priceMatch = text.match(/([\d,\.]+)\s*евро\s*\/?[\s]*?([\d,\.]+)\s*лева/i);

        if (!priceMatch) {
            console.warn(`[ZoneInfoScraper] Could not find price for zone: ${zone}`);
            return;
        }

        const price = `${priceMatch[1].replace(',', '.')} \u20AC / ${priceMatch[2]}`;

        // Extract working hours & periods (if any)
        const workingHours = Utils.extractFormattedPeriods(html);

        zoneInfoCache[zone] = { price, workingHours, fetchedAt: new Date().toISOString() };
        console.log(`[ZoneInfoScraper] ${zone} zone price: "${price}"`);
        console.log(`[ZoneInfoScraper] ${zone} zone working hours: "${workingHours}"`);

    } catch (err: any) {
        console.error(`[ZoneInfoScraper] Failed to fetch ${zone} zone price or working hours:`, err.message);
        // Retry after 5 minutes if the cache is still empty
        if (!zoneInfoCache[zone]) {
            setTimeout(() => scrapeZoneInfo(zone), 5 * 60 * 1000);
        }
    }
}

async function scrapeAllZonePrices(): Promise<void> {
    await Promise.allSettled([
        scrapeZoneInfo('blue'),
        scrapeZoneInfo('green'),
    ]);
}

// --- Expose Public Config ---
app.get('/api/config', (_req, res) => {
    res.json({
        allowFrameUrl: ALLOW_FRAME_URL,
        sentryDsn: FRONTEND_SENTRY_DSN
    });
});

// --- Administrative Regions ---
app.get('/api/admin-regions', (_req, res) => {
    res.json(adminRegionsData);
});

// --- Paid Parking Zones ---
app.get('/api/paid-parking-zones', (_req, res) => {
    const data = paidParkingZonesData as GeoFeatureCollection;

    const paidZonesData = {
        ...data,
        features: data.features.map((feature: GeoFeature) => ({
            ...feature,
            properties: {
                ...feature.properties,
                parsedPrice: feature.properties.ZoneType === 1
                    ? zoneInfoCache.green?.price ?? null
                    : zoneInfoCache.blue?.price ?? null,
                parsedWorkingHours: feature.properties.ZoneType === 1
                    ? zoneInfoCache.green?.workingHours ?? null
                    : zoneInfoCache.blue?.workingHours ?? null,
                zoneInfoUrl: feature.properties.ZoneType === 1 ? ZONE_PRICE_URLS.green : ZONE_PRICE_URLS.blue
            }
        }))
    };

    res.json(paidZonesData);
});

// --- Dynamic API Proxy Router ---
const routeConfigs = [
    { path: '/api/air-quality-time', target: config.airQualityTime, transform: true, requiresFeatures1: true },
    { path: '/api/traffic', target: config.traffic, transform: true, requiresFeatures1: true },
    { path: '/api/cctv', target: config.cctv, transform: false, requiresFeatures1: false },
    { path: '/api/billing-machines', target: config.billingMachines, transform: false, requiresFeatures1: false },
    { path: '/api/ev-stations', target: config.evStations, transform: false, requiresFeatures1: false },
    { path: '/api/waste-mobile', target: config.wasteCentres, transform: true, requiresFeatures1: false },
    { path: '/api/smart-parking', target: config.smartParking, transform: true, requiresFeatures1: false },
    { path: '/api/taxi-ranks', target: config.taxiRanks, transform: false, requiresFeatures1: false }
];

routeConfigs.forEach(route => {
    app.get(route.path, async (req, res) => {
        try {
            const result = await getData(route.target.endpoint, req);

            if (route.requiresFeatures1 && !Array.isArray(result.data.features1)) {
                throw new Error("Invalid structure: 'features1' key missing.");
            }

            res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());

            if (route.transform) {
                res.json(createFeaturesCollectionFromApiResult(result, route.target.key));
            } else {
                res.json(result.data);
            }
        } catch (error) {
            console.error(`Error fetching ${route.target.key}:`, error);
            res.status(500).json({ error: `Failed to fetch ${route.target.key} data` });
        }
    });
});

async function getData(url: string, req: Partial<Request>) {
    const upstreamUrl = `${url}${buildExtraQuery(req)}`;
    const cached = apiCache.get(upstreamUrl);
    if (cached && Date.now() < cached.expiresAt) {
        return { data: cached.data, lastUpdated: cached.lastUpdated };
    }

    console.log(`[Proxy] Fetching ${upstreamUrl}`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
        const response = await fetch(upstreamUrl, { signal: controller.signal });

        if (!response.ok) {
            throw new Error(`Upstream returned ${response.status}`);
        }

        const jsonData = await response.json();
        const now = Date.now();
        apiCache.set(upstreamUrl, { data: jsonData, lastUpdated: now, expiresAt: now + CACHE_TTL });
        return { data: jsonData, lastUpdated: now };
    } finally {
        clearTimeout(timeoutId);
    }
}

async function prefetchAll() {
    console.log('--- Initializing Prefetch ---');
    try {
        const promises = targets.map(target => {
            let mockReq: Partial<Request> = { query: { lang: 'bg' } };

            if (target.key === 'traffic') {
                const today = new Date()
                const yesterday = new Date(today).setDate(today.getDate() - 1);
                mockReq = {
                    query: { lang: 'bg', start_date: new Date(yesterday).toISOString().split('T')[0], end_date: today.toISOString().split('T')[0] }
                };
            }
            return getData(target.endpoint, mockReq).catch(err => console.error(`Prefetch failed for ${target.key}: ${err.message}`))
        });

        await Promise.all(promises);
        console.log('--- Prefetch Complete ---');
    } catch (error) {
        console.error('--- Prefetch Critical Fail ---', error);
    }
}

function createFeaturesCollectionFromApiResult(result: { data: {features1: GeoFeature[]}; }, target_key: string): GeoFeatureCollection {
    const featureMap = new Map<string, GeoFeature>();

    for (let i = 0; i < result.data.features1.length; i++) {
        let feature = result.data.features1[i];
        if (!feature?.properties?.geometry?.coordinates?.length) {
            console.warn(`[${target_key}] Skipping feature ${i}: missing geometry`);
            continue;
        }
        let lat: number;
        let lng: number;
        let point = feature.properties.geometry.coordinates[0].toString();

        if (parseFloat(point) > 40) {
            lat = feature.properties.geometry.coordinates[1];
            lng = feature.properties.geometry.coordinates[0];
        } else {
            lat = feature.properties.geometry.coordinates[0];
            lng = feature.properties.geometry.coordinates[1];
        }

        let additional_info = {};

        if (target_key === 'wasteCentres') {
            additional_info = {
                address: feature.properties.MobileCenterAddress || '',
                image: feature.properties.MobileCenterPics || null,
            };
        } else if (target_key === 'smartParking') {
            additional_info = {
                total_lots: feature.properties.total_lots || '',
                total_free_lots: feature.properties.total_free_lots || '',
                load: feature.properties.load || '',
                image: feature.properties.pic_url || null
            };
        }

        const id = feature.properties.detector_id || feature.properties.id || feature.properties.MobileCenterId || feature.properties.parking_id || null;
        const name = feature.properties.name || feature.properties.MobileCenterName || target_key + '_' + Utils.generateCustomId();
        const key = id != null ? String(id) : name;

        if (featureMap.has(key)) {
            continue;
        }

        featureMap.set(key, {
            type: "Feature",
            geometry: {
                "type": feature.properties.geometry.type,
                "coordinates": [lat, lng]
            },
            properties: {
                id: id,
                name: name,
                description: feature.properties.description || feature.properties.MobileCenterDescription || '',
                data: feature.properties.data,
                additional_info: additional_info
            }
        });
    }

    return {
        type: "FeatureCollection",
        features: Array.from(featureMap.values())
    };
}

function scheduleMidnightJob(job: () => Promise<void>): void {
    const msUntilMidnight = (): number => {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);   // next midnight in local time
        return midnight.getTime() - now.getTime();
    };

    // Fire once at the next midnight, then every 24 h after that
    midnightTimeoutId = setTimeout(() => {
        job();
        midnightIntervalId = setInterval(job, 24 * 60 * 60 * 1000);
    }, msUntilMidnight());

    console.log(`[ZoneInfoScraper] Next scrape in ${Math.round(msUntilMidnight() / 60000)} minutes`);
}

async function initialize(): Promise<void> {
    // Scrape zone prices immediately on startup, then every night at midnight
    console.log('[ZoneInfoScraper] Running initial scrape...');
    await scrapeAllZonePrices();
    console.log('[ZoneInfoScraper] Initial scrape done.');
    scheduleMidnightJob(scrapeAllZonePrices);
    await prefetchAll();
}

// Start Server
if (process.env.NODE_ENV !== 'test') {
    const server = app.listen(config.port, async () => {
        console.log(`\n🚀 Server running at ${config.appUrl}:${config.port}`);
        await initialize();
    });

    const shutdown = (signal: string) => {
        console.log(`${signal} received, shutting down gracefully...`);
        if (midnightTimeoutId) {
            clearTimeout(midnightTimeoutId);
        }
        if (midnightIntervalId) {
            clearInterval(midnightIntervalId);
        }
        server.close(() => {
            console.log('Server closed.');
            process.exit(0);
        });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}