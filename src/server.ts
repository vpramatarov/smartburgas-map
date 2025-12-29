import express from 'express';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import {existsSync, mkdirSync} from 'fs';

const app = express();

const airQualityTarget: Target = {
    key: 'airQuality',
    endpoint: process.env.AIR_QUALITY_URL as string,
    ttl: parseInt(process.env.CACHE_DURATION_AIR_QUALITY_MS as string),
    cacheFile: 'air-quality.json'
}

const airQualityTimeTarget: Target = {
    key: 'airQualityTime',
    endpoint: process.env.AIR_QUALITY_TIME_URL as string,
    ttl: parseInt(process.env.CACHE_DURATION_AIR_QUALITY_TIME_MS as string),
    cacheFile: 'air-quality-time.json'
}

const trafficTarget: Target = {
    key: 'traffic',
    endpoint: process.env.TRAFFIC_URL as string,
    ttl: parseInt(process.env.CACHE_DURATION_TRAFFIC_MS as string),
    cacheFile: 'traffic.json'
}

const config: Config = {
    appUrl: process.env.URL || 'http://localhost',
    port: parseInt(process.env.PORT as string),
    airQuality: airQualityTarget,
    airQualityTime: airQualityTimeTarget,
    traffic: trafficTarget
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

const CACHE_DIR = path.join(__dirname, '../cache');
if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR);
    console.log(`Created cache directory at: ${CACHE_DIR}`);
}

// Middleware to serve static files (Frontend)
app.use(express.static(path.join(__dirname, '../public')));
// Serve compiled client JS
app.use('/js', express.static(path.join(__dirname, '../dist')));

// API Proxies
app.get('/api/status', async (req, res) => {
    type Response = Record<string, {}>;
    let response: Response = {};
    const getInfo = async (p: string) => existsSync(p) ? (await fs.stat(p)).mtimeMs : 0;

    for (let target of targets) {
        let cacheFilePath = path.join(CACHE_DIR, target.cacheFile)
        response[target.key] = { lastUpdated: await getInfo(cacheFilePath), exists: existsSync(cacheFilePath) }
    }

    res.json(response);
});

app.get('/api/air-quality', async (req, res) => {
    try {
        const target = config.airQuality;
        const result = await getDataWithCache(target.endpoint, target.cacheFile, target.ttl);
        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(result.data);
    } catch (error) {
        console.error('Error fetching air quality:', error);
        res.status(500).json({ error: 'Failed to fetch air quality data' });
    }
});

app.get('/api/air-quality-time', async (req, res) => {
    try {
        const target = config.airQualityTime;
        const result = await getDataWithCache(target.endpoint, target.cacheFile, target.ttl);
        // Validation: Ensure data matches GeoJSON FeatureCollection format
        if (!Array.isArray(result.data.features1)) {
            throw new Error(
                "Air Quality Time is missing 'features1' array. Attempting to parse raw data..." +
                "Invalid structure: 'features1' key missing."
            );
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
        const target = config.traffic;
        const result = await getDataWithCache(target.endpoint, target.cacheFile, target.ttl);

        // Validation: Ensure data matches GeoJSON FeatureCollection format
        if (!Array.isArray(result.data.features1)) {
            throw new Error(
                "Traffic data is missing 'features1' array. Attempting to parse raw data..." +
                "Invalid structure: 'features1' key missing."
            );
        }

        res.set('X-Last-Updated', new Date(result.lastUpdated).toISOString());
        res.json(createFeaturesCollectionFromApiResult(result));
    } catch (error) {
        console.error('Error fetching traffic:', error);
        res.status(500).json({ error: 'Failed to fetch traffic data' });
    }
});

// STARTUP
prefetchAll().then(() => {
    app.listen(config.port, () => {
        console.log(`Server running at ${config.appUrl}:${config.port}`);
    });
});


async function getDataWithCache(url: string, filename: string, cacheDuration: number) {
    const filePath = path.join(CACHE_DIR, filename);

    try {
        // Check if file exists and get stats
        const stats = await fs.stat(filePath);
        const now = Date.now();
        const fileAge = now - stats.mtimeMs;

        // If cache is valid (less than cacheDuration old), return it
        if (fileAge < cacheDuration) {
            console.log(`[CACHE HIT] Serving ${filename} from local file (${(fileAge/1000).toFixed(1)}s old)`);
            const fileContent = await fs.readFile(filePath, 'utf-8');
            return {
                data: JSON.parse(fileContent),
                lastUpdated: stats.mtimeMs // Return cache file time
            };
        }

        console.log(`[CACHE EXPIRED] ${filename} is ${(fileAge/1000).toFixed(1)}s old. Refreshing...`);
    } catch (error: any) {
        // If file doesn't exist (ENOENT), we just proceed to fetch
        if (error.code !== 'ENOENT') {
            console.error(`Error reading cache for ${filename}:`, error);
        } else {
            console.log(`[CACHE MISS] File ${filename} not found. Fetching from API...`);
        }
    }

    // Fetch fresh data from API
    const response = await axios.get(url);
    const data = response.data;

    // Save to cache file (asynchronously, don't wait for it to block response)
    fs.writeFile(filePath, JSON.stringify(data, null, 2))
        .then(() => console.log(`[CACHE SAVED] Updated ${filename}`))
        .catch(err => console.error(`Failed to write cache for ${filename}`, err));

    return {
        data: data,
        lastUpdated: Date.now()
    };
}

// Prefetch Logic
async function prefetchAll() {
    console.log('--- Initializing Prefetch ---');
    try {
        let data = [];
        for (let target of targets) {
            data.push(getDataWithCache(target.endpoint, target.cacheFile, target.ttl));
        }

        await Promise.all(data);
        console.log('--- Prefetch Complete: Cache is warm ---');
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