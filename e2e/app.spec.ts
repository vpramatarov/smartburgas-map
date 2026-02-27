// e2e/app.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Smart Burgas Map UI', () => {

    // This runs before every single test
    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    test('should load the Leaflet map and main controls', async ({ page }) => {
        // Check if the map container exists and is visible
        const mapContainer = page.locator('#map');
        await expect(mapContainer).toBeVisible();

        // Check if the Leaflet attribution renders (this proves Leaflet initialized successfully)
        const leafletAttribution = page.locator('.leaflet-control-attribution');
        await expect(leafletAttribution).toBeVisible();
    });

    test('should render region filter chips and allow single selection', async ({ page }) => {
        // Wait for the region filters container to populate via the API call
        const regionContainer = page.locator('#region-filters');
        await expect(regionContainer).toBeVisible();

        // Get all the labels (our styled chips) inside the region item wrapper
        const regionChips = page.locator('.region-item label');

        // Wait until at least 1 region is loaded from the /api/admin-regions endpoint
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        // Get the specific elements for the first two regions
        const firstRegion = regionChips.nth(0);
        const secondRegion = regionChips.nth(1);

        await firstRegion.click();

        // The hidden checkbox belonging to this label should now be checked
        const firstCheckbox = page.locator('.region-item input[type="checkbox"]').nth(0);
        await expect(firstCheckbox).toBeChecked();

        await secondRegion.click();

        // The second should be checked, and the FIRST should be automatically UNCHECKED
        // This verifies our single-selection logic in AdministrativeRegionStrategy.ts
        const secondCheckbox = page.locator('.region-item input[type="checkbox"]').nth(1);
        await expect(secondCheckbox).toBeChecked();
        await expect(firstCheckbox).not.toBeChecked();
    });
});