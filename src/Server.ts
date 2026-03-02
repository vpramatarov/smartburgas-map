import express, {NextFunction, Request, Response} from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import {Config, GeoFeature, GeoFeatureCollection, SupportedLanguage, Target} from './Types.js'

import {fileURLToPath} from 'url';
import {Utils} from "./Utils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

const airQualityTimeTarget: Target = {
    key: 'airQualityTime',
    endpoint: process.env.AIR_QUALITY_TIME_URL as string
}

const trafficTarget: Target = {
    key: 'traffic',
    endpoint: process.env.TRAFFIC_URL as string
}

const cctvTarget: Target = {
    key: 'cctv',
    endpoint: process.env.CCTV_URL as string
}

const billingTarget: Target = {
    key: 'billingMachines',
    endpoint: process.env.BILLING_MACHINES_URL as string
};

const evTarget: Target = {
    key: 'evStations',
    endpoint: process.env.EV_URL as string
};

const wasteTarget: Target = {
    key: 'wasteCentres',
    endpoint: process.env.WASTE_URL as string
};

const parkingTarget: Target = {
    key: 'smartParking',
    endpoint: process.env.SMART_CAR_PARKS_TIME_URL as string
};

const taxiTarget: Target = {
    key: 'taxiRanks',
    endpoint: process.env.TAXI_RANKS_URL as string
};

const config: Config = {
    appUrl: process.env.URL || 'http://localhost',
    port: parseInt(process.env.PORT as string),
    airQualityTime: airQualityTimeTarget,
    traffic: trafficTarget,
    cctv: cctvTarget,
    billingMachines: billingTarget,
    evStations: evTarget,
    wasteCentres: wasteTarget,
    smartParking: parkingTarget,
    taxiRanks: taxiTarget
}

const targets: Target[] = [];

for (let prop in config) {
    if (prop === 'appUrl' || prop === 'port') {
        continue;
    }

    targets.push(<Target>config[prop as keyof typeof config]);
}

for (let target of targets) {
    if(!target.endpoint) {
        console.error("CRITICAL ERROR: Missing API URLs in environment variables.");
        process.exit(1);
    }
}

// Middleware to serve static files (Frontend)
app.use(express.static(path.join(__dirname, '../public')));
// Serve compiled client JS
app.use('/js', express.static(path.join(__dirname, '../dist')));

// --- Middleware ---
app.use((req: Request, res: Response, next: NextFunction) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    res.setHeader('Content-Security-Policy', `frame-ancestors ${process.env.ALLOW_FRAME_URL as string}`);
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

    if (query.start_date) {
        params.append('start_date', query.start_date as string);
    }

    if (query.end_date) {
        params.append('end_date', query.end_date as string);
    }

    return params.toString() ? `?${params.toString()}` : '';
};

// --- Expose Public Config ---
app.get('/api/config', (req, res) => {
    // We send the ALLOW_FRAME_URL to the frontend.
    // Fallback to '*' (allow all) if it's not set in .env for local development.
    res.json({
        allowFrameUrl: process.env.ALLOW_FRAME_URL as string || '*'
    });
});

// --- Administrative Regions ---
app.get('/api/admin-regions', (req, res) => {
    // Construct path relative to the process root (where package.json is)
    const filePath = path.join(__dirname, '../cau.json');

    fs.readFile(filePath, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading cau.json:', err);
            // Return 500 if file is missing or unreadable
            res.status(500).json({ error: 'Failed to load regions data' });
            return;
        }

        try {
            const jsonData = JSON.parse(data);
            res.json(jsonData);
        } catch (parseError) {
            console.error('Error parsing JSON:', parseError);
            res.status(500).json({ error: 'Invalid JSON data' });
        }
    });
});

// API Proxies
app.get('/api/air-quality-time', async (req, res) => {
    try {
        const result = await getData(config.airQualityTime.endpoint, req);

        if (!Array.isArray(result.data.features1)) {
            throw new Error("Invalid structure: 'features1' key missing.");
        }

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result, config.airQualityTime.key));
    } catch (error) {
        console.error('Error fetching air quality:', error);
        res.status(500).json({ error: 'Failed to fetch air quality data' });
    }
});

app.get('/api/traffic', async (req, res) => {
    try {
        const result = await getData(config.traffic.endpoint, req);

        if (!Array.isArray(result.data.features1)) {
            throw new Error("Invalid structure: 'features1' key missing.");
        }

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result, config.traffic.key));
    } catch (error) {
        console.error('Error fetching traffic:', error);
        res.status(500).json({ error: 'Failed to fetch traffic data' });
    }
});

app.get('/api/cctv', async (req, res) => {
    try {
        const result = await getData(config.cctv.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching cctv:', error);
        res.status(500).json({ error: 'Failed to fetch cctv data' });
    }
});

app.get('/api/billing-machines', async (req, res) => {
    try {
        const result = await getData(config.billingMachines.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching billing machines:', error);
        res.status(500).json({ error: 'Failed to fetch billing data' });
    }
});

app.get('/api/ev-stations', async (req, res) => {
    try {
        const result = await getData(config.evStations.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching EV stations:', error);
        res.status(500).json({ error: 'Failed to fetch EV data' });
    }
});

app.get('/api/waste-mobile', async (req, res) => {
    try {
        const result = await getData(config.wasteCentres.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result, config.wasteCentres.key));
    } catch (error) {
        console.error('Error fetching waste data:', error);
        res.status(500).json({ error: 'Failed to fetch waste data' });
    }
});

app.get('/api/smart-parking', async (req, res) => {
    try {
        const result = await getData(config.smartParking.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result, config.smartParking.key));
    } catch (error) {
        console.error('Error fetching parking data:', error);
        res.status(500).json({ error: 'Failed to fetch parking data' });
    }
});

app.get('/api/taxi-ranks', async (req, res) => {
    try {
        const result = await getData(config.taxiRanks.endpoint, req);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching taxi data:', error);
        res.status(500).json({ error: 'Failed to fetch taxi data' });
    }
});

async function getData(url: string, req: Partial<Request>) {
    const upstreamUrl = `${url}${buildExtraQuery(req)}`;
    console.log(`[Proxy] Fetching ${upstreamUrl}`);
    const response = await axios.get(upstreamUrl);

    return {data: response.data, lastUpdated: Date.now()};
}

async function prefetchAll() {
    console.log('--- Initializing Prefetch ---');
    try {
        const promises = targets.map(target => {
            let mockReq: Partial<Request> = {
                query: { lang: 'bg' }
            };

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
    let features: GeoFeature[] = [];

    for (let i = 0; i < result.data.features1.length; i++) {
        let feature = result.data.features1[i];
        let lat: number;
        let lng: number;
        let point = feature.properties.geometry.coordinates[0].toString();

        if (parseFloat(point) > 40) {
            lat = feature.properties.geometry.coordinates[1]; // may be the order is reversed?
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

        features[i] = {
            type: "Feature",
            geometry: {
                "type": feature.properties.geometry.type,
                "coordinates": [lat, lng]
            },
            properties: {
                id: feature.properties.detector_id || feature.properties.id || feature.properties.MobileCenterId || feature.properties.parking_id || null,
                name: feature.properties.name || feature.properties.MobileCenterName || target_key + '_' + Utils.generateCustomId(),
                description: feature.properties.description || feature.properties.MobileCenterDescription || '',
                data: feature.properties.data,
                additional_info: additional_info
            }
        };
    }

    return {
        type: "FeatureCollection",
        features: features
    };
}

// Start Server
if (process.env.NODE_ENV !== 'test') {
    app.listen(config.port, async () => {
        console.log(`\n🚀 Server running at ${config.appUrl}:${config.port}`);
        await prefetchAll();

        // run every 5 minutes (300,000 milliseconds) in the background
        // setInterval(prefetchAll, 5 * 60 * 1000);
    });
}