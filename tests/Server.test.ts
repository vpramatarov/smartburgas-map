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
    // Intercept Smart Parking
    http.get(process.env.SMART_CAR_PARKS_TIME_URL, () => {
        return HttpResponse.json(mockParkingData);
    }),

    // Intercept Air Quality
    http.get(process.env.AIR_QUALITY_TIME_URL, () => {
        return HttpResponse.json(mockAirQualityData);
    }),

    // Intercept Traffic
    http.get(process.env.TRAFFIC_URL, () => {
        return HttpResponse.json(mockTrafficData);
    }),

    // Intercept Mobile trash
    http.get(process.env.WASTE_URL, () => {
        return HttpResponse.json(mockMobileTrashData);
    }),

    // Intercept Mobile trash
    http.get(process.env.WASTE_URL, () => {
        return HttpResponse.json(mockMobileTrashData);
    }),

    // Intercept CCTV
    http.get(process.env.CCTV_URL, () => {
        return HttpResponse.json(mockCctvData);
    }),

    // Intercept Billing Machines
    http.get(process.env.BILLING_MACHINES_URL, () => {
        return HttpResponse.json(mockBillingMachinesData);
    }),

    // Intercept EV Point
    http.get(process.env.EV_URL, () => {
        return HttpResponse.json(mockEvPointsData);
    }),

    // Intercept Taxi ranks
    http.get(process.env.TAXI_RANKS_URL, () => {
        return HttpResponse.json(mockTaxiRanksData);
    }),
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
            const feature = response.body.features[0];
            expect(feature.geometry).toBeDefined();
            expect(feature.properties).toHaveProperty('CAU');
        });
    });

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

            // Verify properties were mapped correctly
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
            // Temporarily override the MSW handler to return bad data just for this test
            mswServer.use(
                http.get(process.env.SMART_CAR_PARKS_TIME_URL, () => {
                    return HttpResponse.json({ bad_data: "no features1 array here" });
                })
            );

            const response = await request(app).get('/api/smart-parking');
            // try/catch block in Server.ts should catch the missing features1 array and return 500
            expect(response.status).toBe(500);
            expect(response.body.error).toBe('Failed to fetch smartParking data');
        });
    });

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

});