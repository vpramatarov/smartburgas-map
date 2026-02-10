import express, { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import path from 'path';
import {
    Config, GeoFeature, GeoFeatureCollection, Target, SupportedLanguage
} from './Types.js'

import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

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

const config: Config = {
    appUrl: process.env.URL || 'http://localhost',
    port: parseInt(process.env.PORT as string),
    airQualityTime: airQualityTimeTarget,
    traffic: trafficTarget,
    cctv: cctvTarget,
    billingMachines: billingTarget
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

// API Proxies
app.get('/api/air-quality-time', async (req, res) => {
    try {
        const result = await getData(config.airQualityTime.endpoint, req);

        if (!Array.isArray(result.data.features1)) {
            throw new Error("Invalid structure: 'features1' key missing.");
        }

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result));
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
        res.json(createFeaturesCollectionFromApiResult(result));
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

async function getData(url: string, req: Partial<Request>) {
    const upstreamUrl = `${url}${buildExtraQuery(req)}`;
    console.log(`[Proxy] Fetching ${upstreamUrl}`);
    const response = await axios.get(upstreamUrl);

    return {data: response.data, lastUpdated: Date.now()};
}

async function prefetchAll() {
    console.log('--- Initializing Prefetch ---');

    // @todo: need to find better way to improve performance for traffic endpoint.
    const d = new Date()
    const currentDate = d.toISOString().split('T')[0];
    const yesterday = new Date(d).setDate(d.getDate() - 1);
    const yesterdayFormated = new Date(yesterday).toISOString().split('T')[0];
    // Mock Request Object
    const mockReq: Partial<Request> = {
        query: { lang: 'bg', start_date: yesterdayFormated, end_date: currentDate }
    };

    try {
        const promises = targets.map(target =>
            getData(target.endpoint, mockReq).catch(err => console.error(`Prefetch failed for ${target.key}: ${err.message}`))
        );

        await Promise.all(promises);
        console.log('--- Prefetch Complete ---');
    } catch (error) {
        console.error('--- Prefetch Critical Fail ---', error);
    }
}

function createFeaturesCollectionFromApiResult(result: { data: {features1: GeoFeature[]}; }): GeoFeatureCollection {
    let features: GeoFeature[] = [];

    for (let i = 0; i < result.data.features1.length; i++) {
        let feature = result.data.features1[i];
        let lat: number;
        let lng: number;
        let point = feature.properties.geometry.coordinates[0].toString();

        // if (parseInt(point.split('.')[0]) < 26 || parseInt(point.split('.')[0]) > 28) {
        //     lat = feature.properties.geometry.coordinates[1]; // may be the order is reversed?
        //     lng = feature.properties.geometry.coordinates[0];
        // } else {
        //     // Burgas starts with 26,27,28
        //     lat = feature.properties.geometry.coordinates[0];
        //     lng = feature.properties.geometry.coordinates[1];
        // }

        if (point > 40) {
            lat = feature.properties.geometry.coordinates[1]; // may be the order is reversed?
            lng = feature.properties.geometry.coordinates[0];
        } else {
            lat = feature.properties.geometry.coordinates[0];
            lng = feature.properties.geometry.coordinates[1];
        }

        features[i] = {
            type: "Feature",
            geometry: {
                "type": feature.properties.geometry.type,
                "coordinates": [lat, lng]
            },
            properties: {
                name: feature.properties.name,
                description: feature.properties.description,
                data: feature.properties.data
            }
        };
    }

    return {
        type: "FeatureCollection",
        features: features
    };
}

// Start Server
app.listen(config.port, async () => {
    console.log(`\n🚀 Server running at ${config.appUrl}:${config.port}`);
    await prefetchAll();
});