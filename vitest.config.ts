// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        // Exclude the Playwright e2e directory and the compiled dist folder
        exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
        // Include standard test files
        include: ['tests/**/*.{test,spec}.{js,ts}'],
    },
});