// tests/Server.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { app } from '../src/Server.js';

import mockAirQualityData from './mocks/Air_quality_time.json';
import mockTrafficData from './mocks/Cars_count.json';
import mockCctvData from './mocks/CCTV.json';
import mockBillingMachinesData from './mocks/Billing_machines.json';
import mockEvPointsData from './mocks/EVPoint.json';
import mockMobileTrashData from './mocks/Mobiletrash.json';
import mockParkingData from './mocks/SmartCarParks_time.json';
import mockTaxiRanksData from './mocks/Taxi_ranks.json';

// Setup MSW Server to Intercept External Axios Calls
const mswServer = setupServer(
    http.get(process.env.SMART_CAR_PARKS_TIME_URL, () => HttpResponse.json(mockParkingData)),
    http.get(process.env.AIR_QUALITY_TIME_URL, () => HttpResponse.json(mockAirQualityData)),
    http.get(process.env.TRAFFIC_URL, () => HttpResponse.json(mockTrafficData)),
    http.get(process.env.WASTE_URL, () => HttpResponse.json(mockMobileTrashData)),
    http.get(process.env.CCTV_URL, () => HttpResponse.json(mockCctvData)),
    http.get(process.env.BILLING_MACHINES_URL, () => HttpResponse.json(mockBillingMachinesData)),
    http.get(process.env.EV_URL, () => HttpResponse.json(mockEvPointsData)),
    http.get(process.env.TAXI_RANKS_URL, () => HttpResponse.json(mockTaxiRanksData)),
);

// Start MSW before tests run
beforeAll(() => mswServer.listen({ onUnhandledRequest: 'bypass' }));
// Reset any custom handlers after each test
afterEach(() => mswServer.resetHandlers());
// Close MSW after all tests
afterAll(() => mswServer.close());

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
            const feature = response.body.features[0];
            expect(feature.geometry).toBeDefined();
            expect(feature.properties).toHaveProperty('CAU');
        });

        it('GET /api/paid-parking-zones should return valid GeoJSON', async () => {
            const response = await request(app).get('/api/paid-parking-zones');
            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');
            expect(Array.isArray(response.body.features)).toBe(true);

            const feature = response.body.features[0];
            expect(feature.geometry.type).toBe('Polygon');
            expect(feature.properties).toHaveProperty('ZoneType');
            expect(feature.properties).toHaveProperty('Name');
        });
    });

    // ── Proxy Endpoints (transform: true) 

    describe('Proxy Endpoints (Transforming features1 data)', () => {
        it('GET /api/smart-parking should fetch, transform, and return GeoJSON', async () => {
            const response = await request(app).get('/api/smart-parking');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();
            // Verify our server correctly transformed the features1 array into standard GeoJSON
            expect(response.body.type).toBe('FeatureCollection');
            expect(response.body.features).toHaveLength(7);

            const feature = response.body.features[0];
            expect(feature.type).toBe('Feature');
            expect(Array.isArray(feature.properties.data)).toBe(true);
            // Verify coordinate parsing logic worked
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
            expect(feature.properties.name).toBe('Паркинг Опера');
            expect(feature.properties.additional_info.total_lots).toBe('211');
            expect(feature.properties.additional_info.total_free_lots).toBe('1');
            expect(feature.properties.additional_info.load).toBe('100');
            expect(feature.properties.additional_info.image).toBe('' || null);
        });

        it('GET /api/air-quality-time should return transformed GeoJSON', async () => {
            const response = await request(app).get('/api/air-quality-time');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('Долно Езерово');
            expect(Array.isArray(feature.properties.data)).toBe(true);
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('GET /api/traffic should return transformed GeoJSON', async () => {
            const response = await request(app).get('/api/traffic');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('ул. Индустриална - запад');
            expect(Array.isArray(feature.properties.data)).toBe(true);
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('GET /api/waste-mobile should return transformed GeoJSON', async () => {
            const response = await request(app).get('/api/waste-mobile');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('МЦ01');
            expect(feature.properties.additional_info.address).toBe('ж.к.Меден рудник, бл.369');
            expect(feature.properties.description).toBe('Работно време: Вторник - Събота–8:00-16:30 ч. Обедна почивка: 12:00-12:30 ч. За повече информация https://www.chistotaeco.com/  Мобилен контейнер за събиране на електронно оборудване, луминисцентни и живачни лампи, лекарства с изтекъл срок на годност, опаковки от бои, химикали, киселини, флакони със сгъстени газове, тонер касети, пържилна мазнина, обувки, дрехи, текстил');
            expect(feature.properties.additional_info.image.trim()).toBe('http://pics.smartburgas.eu/waste/mobile/1.jpg');
            expect(Array.isArray(feature.properties.data)).toBe(true);
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('should return 500 if upstream API fails or structure is invalid', async () => {
            mswServer.use(
                http.get(process.env.SMART_CAR_PARKS_TIME_URL, () => {
                    return HttpResponse.json({ bad_data: "no features1 array here" });
                })
            );

            const response = await request(app).get('/api/smart-parking');
            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to fetch smartParking data');
        });
    });

    // ── Proxy Endpoints (transform: false) ───

    describe('Proxy Endpoints (No data property in properties)', () => {
        it('GET /api/cctv should return GeoJson data', async () => {
            const response = await request(app).get('/api/cctv');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.publicname).toBe('Zahari Stoyanov Blvd. and Kooperator St');
            expect(feature.properties.position).toBe(280);
            expect(feature.properties.pic_url).toBe('http://pics.smartburgas.eu/cam/kooperator.jpg');
            expect(feature.properties.video_url2).toBe('https://pics.smartburgas.eu/m3u8/kooperator.m3u8');
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('GET /api/ev-stations should return GeoJson data', async () => {
            const response = await request(app).get('/api/ev-stations');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('Смарт Бизнес Център');
            expect(feature.properties.description).toBe('20 KW');
            expect(feature.properties.pic_url).toBe(null);
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('GET /api/billing-machines should return GeoJson data', async () => {
            const response = await request(app).get('/api/billing-machines');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('Ивайло/Сливница');
            expect(feature.properties.description).toBe('Подробна информация за правилата за паркиране ще откриете на www.transportburgas.bg/bg/синя-зона');
            expect(feature.properties.pic_url).toBe('http://pics.smartburgas.eu/parking/zone/parkingmashine.jpg');
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });

        it('GET /api/taxi-ranks should return GeoJson data', async () => {
            const response = await request(app).get('/api/taxi-ranks');

            expect(response.status).toBe(200);
            expect(response.headers['content-type']).toMatch(/json/);
            expect(response.headers['x-last-updated']).toBeDefined();
            expect(response.body.type).toBe('FeatureCollection');

            const feature = response.body.features[0];
            expect(feature.properties.name).toBe('бул."Демокрация", пред ІІІ-та поликлиника, в паркинга');
            expect(feature.properties.description).toBe('5 броя таксиметрови автомобила');
            expect(feature.properties.pic_url).toBe('http://pics.smartburgas.eu/parking/taxi/t23.jpg');
            expect(feature.geometry).toBeDefined();
            expect(feature.geometry.coordinates).toHaveLength(2);
        });
    });

    // ── Language validation ───

    describe('Language parameter validation', () => {
        it('accepts ?lang=bg and returns 200', async () => {
            const response = await request(app).get('/api/cctv?lang=bg');
            expect(response.status).toBe(200);
        });

        it('accepts ?lang=en and returns 200', async () => {
            const response = await request(app).get('/api/cctv?lang=en');
            expect(response.status).toBe(200);
        });

        it('defaults to Bulgarian when no lang param is provided', async () => {
            // No lang param — getValidatedLang returns 'bg' silently
            const response = await request(app).get('/api/cctv');
            expect(response.status).toBe(200);
        });

        it('returns 500 for an unsupported lang value', async () => {
            // getValidatedLang throws for anything other than 'bg' or 'en',
            // which is caught by the proxy try/catch and returned as 500
            const response = await request(app).get('/api/cctv?lang=fr');
            expect(response.status).toBe(500);
        });

        it('returns 500 for a lang injection attempt', async () => {
            const response = await request(app).get('/api/cctv?lang=bg;DROP TABLE sensors');
            expect(response.status).toBe(500);
        });

        // Local static endpoints ignore lang entirely
        it('static endpoints return 200 regardless of lang param', async () => {
            const regions = await request(app).get('/api/admin-regions?lang=xx');
            expect(regions.status).toBe(200);

            const zones = await request(app).get('/api/paid-parking-zones?lang=xx');
            expect(zones.status).toBe(200);
        });
    });

    // ── Date parameter forwarding 

    describe('Date parameter forwarding', () => {
        it('forwards start_date and end_date to the upstream API', async () => {
            let capturedUrl = '';

            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockAirQualityData);
                })
            );

            await request(app).get('/api/air-quality-time?lang=bg&start_date=2025-01-01&end_date=2025-03-01');

            expect(capturedUrl).toContain('start_date=2025-01-01');
            expect(capturedUrl).toContain('end_date=2025-03-01');
        });

        it('forwards lang to the upstream API as a query param', async () => {
            let capturedUrl = '';

            mswServer.use(
                http.get(process.env.CCTV_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockCctvData);
                })
            );

            await request(app).get('/api/cctv?lang=en');

            expect(capturedUrl).toContain('lang=en');
        });

        it('does not forward start_date when not provided', async () => {
            let capturedUrl = '';

            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockAirQualityData);
                })
            );

            await request(app).get('/api/air-quality-time?lang=bg');

            expect(capturedUrl).not.toContain('start_date');
            expect(capturedUrl).not.toContain('end_date');
        });
    });

    // ── Content-Security-Policy header ──

    describe('Content-Security-Policy header', () => {
        it('sets the CSP frame-ancestors header on proxy endpoint responses', async () => {
            const response = await request(app).get('/api/cctv');
            expect(response.headers['content-security-policy']).toBeDefined();
            expect(response.headers['content-security-policy']).toContain('frame-ancestors');
        });

        it('sets the CSP frame-ancestors header on static GeoJSON endpoint responses', async () => {
            const response = await request(app).get('/api/admin-regions');
            expect(response.headers['content-security-policy']).toContain('frame-ancestors');
        });

        it('sets the CSP frame-ancestors header on the config endpoint', async () => {
            const response = await request(app).get('/api/config');
            expect(response.headers['content-security-policy']).toContain('frame-ancestors');
        });

        it('uses the ALLOW_FRAME_URL env value in the header', async () => {
            // vitest.config.ts sets ALLOW_FRAME_URL = '*' for the test environment
            const response = await request(app).get('/api/config');
            const csp = response.headers['content-security-policy'];
            expect(csp).toContain(process.env.ALLOW_FRAME_URL);
        });
    });

    // ── Upstream network failures 

    describe('Upstream network failure handling', () => {
        it('returns 500 when the upstream API is unreachable (network error)', async () => {
            mswServer.use(
                http.get(process.env.CCTV_URL, () => {
                    // HttpResponse.error() simulates a network-level failure
                    // (connection refused, DNS failure, etc.) — axios throws
                    return HttpResponse.error();
                })
            );

            const response = await request(app).get('/api/cctv');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        it('returns 500 when the upstream returns a non-2xx status', async () => {
            mswServer.use(
                http.get(process.env.EV_URL, () => {
                    return new HttpResponse(null, { status: 503 });
                })
            );

            const response = await request(app).get('/api/ev-stations');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        it('returns 500 when the upstream returns malformed JSON for a transform endpoint', async () => {
            // Axios has silentJSONParsing=true: for pass-through routes it returns a string body
            // without throwing, so the 500 only triggers on transform routes that inspect
            // result.data.features1 (requiresFeatures1: true).
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, () => {
                    return new HttpResponse('this is not json {{{', {
                        headers: { 'Content-Type': 'application/json' }
                    });
                })
            );

            const response = await request(app).get('/api/air-quality-time');
            expect(response.status).toBe(500);
            expect(response.body).toHaveProperty('error');
        });

        it('error response body includes a human-readable error key', async () => {
            mswServer.use(
                http.get(process.env.BILLING_MACHINES_URL, () => HttpResponse.error())
            );

            const response = await request(app).get('/api/billing-machines');
            expect(response.status).toBe(500);
            // The error message should name the data source, not expose internals
            expect(response.body.error).toContain('billingMachines');
        });
    });
});
