// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        env: {
            PORT: '3000',
            URL: 'http://localhost',
            ALLOW_FRAME_URL: '*',
            TRAFFIC_URL: 'http://mock.api/traffic',
            AIR_QUALITY_TIME_URL: 'http://mock.api/air',
            CCTV_URL: 'http://mock.api/cctv',
            BILLING_MACHINES_URL: 'http://mock.api/billing',
            EV_URL: 'http://mock.api/ev',
            WASTE_URL: 'http://mock.api/waste',
            SMART_CAR_PARKS_TIME_URL: 'http://mock.api/parking',
            TAXI_RANKS_URL: 'http://mock.api/taxi',
        },
        // Exclude the Playwright e2e directory and the compiled dist folder
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
        // Include standard test files
        include: ['tests/**/*.{test,spec}.{js,ts}'],
    },
});