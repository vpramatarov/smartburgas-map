// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    // Fail the build on CI if you accidentally left test.only in the source code.
    forbidOnly: !!process.env.CI,
    // Retry on CI only
    retries: process.env.CI ? 2 : 0,
    // Opt out of parallel tests on CI to save CPU/Memory
    workers: process.env.CI ? 1 : undefined,

    use: {
        baseURL: 'http://localhost:3000',
        trace: 'on-first-retry',
    },

    // This tells Playwright to boot your Express server before running tests!
    webServer: {
        command: 'npm run build && node dist/Server.js',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120 * 1000,
    },
});