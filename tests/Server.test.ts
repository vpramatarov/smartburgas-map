// tests/Server.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { app } from '../src/Server.js';

// Define Mock Data (Simulating the 3rd party APIs)
// Mock for endpoints that return the 'features1' structure (Parking, Air Quality, Traffic, Waste)
const mockGeoJsonFeatureData = {
    features1: [
        {
            type: "Feature",
            properties: {
                name: "Test Sensor 1",
                description: "A mocked sensor for testing",
                total_lots: "50",
                total_free_lots: "20",
                geometry: {
                    type: "Point",
                    // The server expects coordinates as [lng, lat] or [lat, lng] and parses them
                    coordinates: ["27.4626", "42.5048"]
                },
                data: [
                    { time: "2023-10-01 12:00:00", value: "10" }
                ]
            }
        }
    ]
};

// Mock for flat JSON endpoints (CCTV, EV Stations, Taxi)
const mockFlatJsonData = [
    {
        id: "cam1",
        publicname: "Test Camera",
        video_url2: "http://example.com/stream.m3u8",
        position: 90
    }
];

// Setup MSW Server to Intercept External Axios Calls
const mswServer = setupServer(
    // Intercept Smart Parking
    http.get(process.env.SMART_CAR_PARKS_TIME_URL, () => {
        return HttpResponse.json(mockGeoJsonFeatureData);
    }),

    // Intercept Air Quality
    http.get(process.env.AIR_QUALITY_TIME_URL, () => {
        return HttpResponse.json(mockGeoJsonFeatureData);
    }),

    // Intercept CCTV
    http.get(process.env.CCTV_URL, () => {
        return HttpResponse.json(mockFlatJsonData);
    })
);

// Start MSW before tests run
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
// Reset any custom handlers after each test
afterEach(() => mswServer.resetHandlers());
// Close MSW after all tests
afterAll(() => mswServer.close());


// The Test Suite
describe('Backend API Endpoints', () => {

    describe('Local Endpoints', () => {
        it('GET /api/config should return frame URL config', async () => {
            const response = await request(app).get('/api/config');
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body).toHaveProperty('allowFrameUrl');
        });

        it('GET /api/admin-regions should return valid GeoJSON', async () => {
            const response = await request(app).get('/api/admin-regions');
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');
            expect(Array.isArray(response.body.features)).toBe(true);

            // Check that at least one feature has the CAU property we need for the UI
            const firstFeature = response.body.features[0];
            expect(firstFeature.geometry).toBeDefined();
            expect(firstFeature.properties).toHaveProperty('CAU');
        });
    });

    describe('Proxy Endpoints (Transforming features1 data)', () => {
        it('GET /api/smart-parking should fetch, transform, and return GeoJSON', async () => {
            const response = await request(app).get('/api/smart-parking?lang=en');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();

            // Verify our server correctly transformed the features1 array into standard GeoJSON
            expect(response.body.type).toBe('FeatureCollection');
            expect(response.body.features).toHaveLength(1);

            const feature = response.body.features[0];
            expect(feature.type).toBe('Feature');

            // Verify coordinate parsing logic worked
            expect(feature.geometry.coordinates).toHaveLength(2);

            // Verify properties were mapped correctly
            expect(feature.properties.name).toBe('Test Sensor 1');
            expect(feature.properties.additional_info.total_lots).toBe('50');
        });

        it('GET /api/air-quality-time should return transformed GeoJSON', async () => {
            const response = await request(app).get('/api/air-quality-time');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');
            expect(response.body.features[0].properties.name).toBe('Test Sensor 1');
        });

        it('should return 500 if upstream API fails or structure is invalid', async () => {
            // Temporarily override the MSW handler to return bad data just for this test
            mswServer.use(
                http.get('http://api.smartburgas.eu:86/geojson/SmartCarParks_time.php', () => {
                    return HttpResponse.json({ bad_data: "no features1 array here" });
                })
            );

            const response = await request(app).get('/api/smart-parking');
            // try/catch block in Server.ts should catch the missing features1 array and return 500
            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to fetch parking data');
        });
    });

    describe('Proxy Endpoints (Flat JSON data)', () => {
        it('GET /api/cctv should return raw data array', async () => {
            const response = await request(app).get('/api/cctv');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();

            // Verify it passes the array straight through without GeoJSON transformation
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body[0].id).toBe('cam1');
            expect(response.body[0].video_url2).toBe('http://example.com/stream.m3u8');
        });
    });

});