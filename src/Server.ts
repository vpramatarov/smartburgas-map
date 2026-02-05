import express from 'express';
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

const config: Config = {
    appUrl: process.env.URL || 'http://localhost',
    port: parseInt(process.env.PORT as string),
    airQualityTime: airQualityTimeTarget,
    traffic: trafficTarget,
    cctv: cctvTarget
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

// API Proxies
app.get('/api/air-quality-time', async (req, res) => {
    try {
        const lang = (req.query.lang === 'en' ? 'en' : 'bg') as SupportedLanguage;
        const target = config.airQualityTime;

        // Pass language to data fetcher
        const result = await getData(target.endpoint, lang);

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
        const lang = (req.query.lang === 'en' ? 'en' : 'bg') as SupportedLanguage;
        const target = config.traffic;

        // Pass language to data fetcher
        const result = await getData(target.endpoint, lang);

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
        const lang = (req.query.lang === 'en' ? 'en' : 'bg') as SupportedLanguage;
        const target = config.cctv;

        // Pass language to data fetcher
        const result = await getData(target.endpoint, lang);

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching cctv:', error);
        res.status(500).json({ error: 'Failed to fetch cctv data' });
    }
});

// STARTUP
prefetchAll().then(() => {
    app.listen(config.port, () => {
        console.log(`Server running at ${config.appUrl}:${config.port}`);
    });
});

async function getData(url: string, lang: SupportedLanguage = 'bg') {
    // Fetch fresh data from API with lang param
    console.log(`[Proxy] Fetching ${url} ? lang=${lang}`);
    const response = await axios.get(url, {
        params: { lang }
    });
    const data = response.data;

    return {
        data: data,
        lastUpdated: Date.now()
    };
}

async function prefetchAll() {
    console.log('--- Initializing Prefetch ---');
    try {
        let data = [];
        for (let target of targets) {
            data.push(getData(target.endpoint, 'bg')); // Default prefetch BG
        }

        await Promise.all(data);
        console.log('--- Prefetch Complete ---');
    } catch (error) {
        console.error('--- Prefetch Failed ---', error);
    }
}

function createFeaturesCollectionFromApiResult(result: { data: {features1: GeoFeature[]}; }): GeoFeatureCollection {
    let features: GeoFeature[] = [];

    for (let i = 0; i < result.data.features1.length; i++) {
        let feature = result.data.features1[i];
        let lat: number;
        let lng: number;
        let point = feature.properties.geometry.coordinates[0].toString();

        if (parseInt(point.split('.')[0]) < 26 || parseInt(point.split('.')[0]) > 28) {
            lat = feature.properties.geometry.coordinates[1]; // may be the order is reversed?
            lng = feature.properties.geometry.coordinates[0];
        } else {
            // Burgas starts with 26,27,28
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