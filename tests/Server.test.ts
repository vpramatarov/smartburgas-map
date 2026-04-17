// tests/Server.test.ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import { app, globalErrorHandler, clearApiCache } from '../src/Server.js';

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
afterEach(() => { mswServer.resetHandlers(); clearApiCache(); });
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

        it('rejects (silently drops) malformed start_date', async () => {
            let capturedUrl = '';
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockAirQualityData);
                })
            );

            await request(app).get('/api/air-quality-time?lang=bg&start_date=not-a-date&end_date=2025-03-01');

            expect(capturedUrl).not.toContain('start_date=not-a-date');
            expect(capturedUrl).toContain('end_date=2025-03-01');
        });

        it('rejects injection attempts in start_date', async () => {
            let capturedUrl = '';
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockAirQualityData);
                })
            );

            await request(app).get('/api/air-quality-time?lang=bg&start_date=2025-01-01%26evil%3D1');

            expect(capturedUrl).not.toContain('evil');
        });

        it('rejects non-ISO date formats', async () => {
            let capturedUrl = '';
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, ({ request }) => {
                    capturedUrl = request.url;
                    return HttpResponse.json(mockAirQualityData);
                })
            );

            await request(app).get('/api/air-quality-time?lang=bg&start_date=01/02/2025');

            expect(capturedUrl).not.toContain('start_date');
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

    // ── Static asset cache headers ──

    describe('Static asset cache headers', () => {
        it('sets a Cache-Control header on static assets', async () => {
            const res = await request(app).get('/index.html');
            expect(res.status).toBe(200);
            expect(res.headers['cache-control']).toBeDefined();
        });
    });

    // ── Response compression ──

    describe('Response compression', () => {
        it('compresses large JSON responses when Accept-Encoding: gzip is requested', async () => {
            // admin-regions returns ~620KB GeoJSON — well above the default threshold (1KB)
            const res = await request(app)
                .get('/api/admin-regions')
                .set('Accept-Encoding', 'gzip');
            expect(res.headers['content-encoding']).toBe('gzip');
        });

        it('does not compress if Accept-Encoding is identity', async () => {
            const res = await request(app)
                .get('/api/admin-regions')
                .set('Accept-Encoding', 'identity');
            expect(res.headers['content-encoding']).toBeUndefined();
        });
    });

    // ── Upstream structural validation ──

    describe('Upstream response validation (transform endpoints)', () => {
        it('skips features missing geometry.coordinates instead of crashing', async () => {
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, () => HttpResponse.json({
                    features1: [
                        { properties: { GlobalId: 'ok', name: 'ok', geometry: { coordinates: [27.5, 42.5] } } },
                        { properties: { GlobalId: 'bad-nogeom', name: 'bad' } }, // missing geometry
                        { properties: { GlobalId: 'bad-emptycoords', name: 'bad2', geometry: {} } }, // missing coordinates
                    ]
                }))
            );

            // Unique lang to bypass cache
            const res = await request(app).get('/api/air-quality-time?lang=en');
            expect(res.status).toBe(200);
            expect(res.body.type).toBe('FeatureCollection');
            expect(Array.isArray(res.body.features)).toBe(true);
            // Only the valid feature should be included
            expect(res.body.features).toHaveLength(1);
        });
    });

    // ── Upstream fetch timeouts ──

    describe('Upstream fetch timeout', () => {
        it('aborts an upstream request that never responds within the timeout', async () => {
            // MSW handler that never resolves — simulates an upstream hang.
            mswServer.use(
                http.get(process.env.AIR_QUALITY_TIME_URL, () => {
                    return new Promise(() => {}); // never resolves
                })
            );

            const start = Date.now();
            // Use a unique lang to bypass any cache from earlier tests
            const res = await request(app).get('/api/air-quality-time?lang=en');
            const elapsed = Date.now() - start;

            expect(res.status).toBe(500);
            // vitest.config sets UPSTREAM_TIMEOUT_MS=3000 — request should abort in ~3s
            expect(elapsed).toBeLessThan(8_000);
        }, 15_000);
    });

    // ── Upstream response caching ──

    describe('Upstream API cache', () => {
        it('only hits the upstream once for two requests to the same URL within TTL', async () => {
            let fetchCount = 0;
            mswServer.use(
                http.get(process.env.TAXI_RANKS_URL, () => {
                    fetchCount++;
                    return HttpResponse.json(mockTaxiRanksData);
                })
            );

            // Unique lang forces a distinct cache key from any earlier suite usage
            await request(app).get('/api/taxi-ranks?lang=en');
            await request(app).get('/api/taxi-ranks?lang=en');
            expect(fetchCount).toBe(1);
        });
    });

    // ── Global error handler ──

    describe('Global Express error handler', () => {
        // Test routes are registered AFTER Server.ts's error handler was mounted, so we
        // re-mount the same exported handler to cover these new routes.
        beforeAll(() => {
            app.get('/__test_throw_sync', () => { throw new Error('boom'); });
            app.get('/__test_throw_async', async () => { throw new Error('async boom'); });
            app.use(globalErrorHandler);
        });

        it('returns 500 JSON when a route handler throws synchronously', async () => {
            const res = await request(app).get('/__test_throw_sync');
            expect(res.status).toBe(500);
            expect(res.headers['content-type']).toMatch(/json/);
            expect(res.body).toEqual({ error: 'Internal server error' });
        });

        it('returns 500 JSON when a route handler rejects (async throw)', async () => {
            const res = await request(app).get('/__test_throw_async');
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Internal server error' });
        });
    });
});
