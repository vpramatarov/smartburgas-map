// e2e/layout-controls.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Layout & Controls', () => {

    test.beforeEach(async ({ page }) => {
        // Intercept the config API to allow Playwright's localhost origin to send messages
        await page.route('/api/config', async route => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({ allowFrameUrl: '*' })
            });
        });

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

    // --- Bulk Controls ---
    test('should handle Select All and Deselect All bulk actions', async ({ page }) => {
        // Grab a specific layer checkbox to monitor
        const trafficCheckbox = page.locator('#toggle-traffic');

        // Wait for it to be checked by default on load
        await expect(trafficCheckbox).toBeChecked();

        // Click Deselect All
        await page.locator('#btn-deselect-all').click();

        // Verify the checkbox is now unchecked
        await expect(trafficCheckbox).not.toBeChecked();

        // Click Select All
        await page.locator('#btn-select-all').click();

        // Verify it is checked again
        await expect(trafficCheckbox).toBeChecked();
    });

    // --- Language Switching ---
    test('should switch language dictionaries dynamically', async ({ page }) => {
        // Verify default Bulgarian text is visible
        const filterHeader = page.locator('h4').filter({ hasText: 'Филтри' }).first();
        await expect(filterHeader).toBeVisible();

        // Click the English radio label
        await page.locator('label[for="en"]').click();

        // Verify the Bulgarian text disappears and the English text appears
        const englishFilterHeader = page.locator('h4').filter({ hasText: 'Filters' }).first();
        await expect(englishFilterHeader).toBeVisible();
        await expect(filterHeader).not.toBeVisible();
    });

    // --- Region Filtering Data Impact ---
    test('should clear the side panel when a region filter is applied', async ({ page }) => {
        // 1. Open a sensor so the side panel is visible
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        // 2. Wait for region chips to load and click one
        const regionChips = page.locator('.region-item label');
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });
        await regionChips.first().click();

        // 3. Verify that applying a spatial filter forces the side panel to close
        // (because the currently previewed sensor might no longer be in the filtered data)
        await expect(infoPanel).toHaveClass(/hidden/);
    });

    // --- IFrame Communication Bridge ---
    test('should intercept postMessage commands to toggle map layers', async ({ page }) => {
        const targetCheckbox = page.locator('#toggle-air-quality-time');

        // Wait for it to be checked by default
        await expect(targetCheckbox).toBeChecked();

        // Simulate the parent website sending a message to our iframe
        // We instruct the app to turn the layer off
        await page.evaluate(() => {
            window.postMessage({
                action: 'SET_LAYER',
                payload: { layerId: 'toggle-air-quality-time', visible: false }
            }, '*');
        });

        // Verify the app intercepted the message and unchecked the box programmatically
        await expect(targetCheckbox).not.toBeChecked();

        // Send a second message to turn it back on (FIXED layerId typo here)
        await page.evaluate(() => {
            window.postMessage({
                action: 'SET_LAYER',
                payload: { layerId: 'toggle-air-quality-time', visible: true }
            }, '*');
        });

        // Verify it checked itself again
        await expect(targetCheckbox).toBeChecked();
    });

    // --- Paid Parking Zones Layer ---
    test('should cross-filter Paid Parking Zones when an Administrative Region is selected', async ({ page }) => {
        // Wait for the visible parent containers to render and count them
        const paidZoneItems = page.locator('.paid-zone-item');
        await expect(paidZoneItems.first()).toBeVisible({ timeout: 10000 });

        const initialCount = await paidZoneItems.count();
        expect(initialCount).toBeGreaterThan(5); // Ensure data actually loaded

        // Click the first Administrative Region in the sidebar
        // Get all the labels (our styled chips) inside the region item wrapper
        const regionChips = page.locator('.region-item label');

        // Wait until at least 1 region is loaded from the /api/admin-regions endpoint
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        // Get the specific elements for the first region
        const firstRegion = regionChips.nth(0);

        await firstRegion.click();

        // The hidden checkbox belonging to this label should now be checked
        const firstCheckbox = page.locator('.region-item input[type="checkbox"]').nth(0);
        await expect(firstCheckbox).toBeChecked();

        //Wait for the map to re-render the filtered features
        await page.waitForTimeout(500);

        // Verify the paid zones list shrank because it filtered out zones outside the region
        const filteredCount = await paidZoneItems.count();
        expect(filteredCount).toBeLessThan(initialCount);
    });

    test('should automatically select the parent Administrative Region when a Paid Zone is clicked', async ({ page }) => {
        // Wait for the visible parent containers to render
        const paidZoneItems = page.locator('.paid-zone-item');
        const regionItems = page.locator('.region-item');

        await expect(paidZoneItems.first()).toBeVisible({ timeout: 10000 });
        await expect(regionItems.first()).toBeVisible({ timeout: 10000 });

        // Ensure NO regions are checked initially
        await expect(page.locator('.region-item input[type="checkbox"]:checked')).toHaveCount(0);

        // Select a specific Paid Zone
        const paidZoneChips = page.locator('.paid-zone-item label');

        // Wait until at least 1 paid zone is loaded from the endpoint
        await expect(paidZoneChips.first()).toBeVisible({ timeout: 5000 });

        // Get the specific elements for the first paid zone
        const firstPaidZone = paidZoneChips.nth(0);

        await firstPaidZone.click();

        // The hidden checkbox belonging to this label should now be checked
        const firstCheckbox = page.locator('.paid-zone-item input[type="checkbox"]').nth(0);
        await expect(firstCheckbox).toBeChecked();

        // Verify that Client.ts intercepted the filter, ran the math, and automatically checked EXACTLY 1 Admin Region
        await page.waitForTimeout(500);
        await expect(page.locator('.region-item input[type="checkbox"]:checked')).toHaveCount(1);
    });

    test('should cross-filter Paid Parking Zones to show only zones in the selected Administrative Region', async ({ page }) => {
        // Wait for the visible parent containers to render and count them
        const paidZoneItems = page.locator('.paid-zone-item');
        await expect(paidZoneItems.first()).toBeVisible({ timeout: 10000 });

        const initialCount = await paidZoneItems.count();
        expect(initialCount).toBeGreaterThan(5); // Ensure all data actually loaded

        // Get all the labels (our styled chips) inside the region item wrapper
        const regionChips = page.locator('.region-item label');

        // Wait until at least 1 region is loaded from the /api/admin-regions endpoint
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        // Select the LAST administrative region (which we know contains paid zones)
        const lastRegion = regionChips.last();
        await lastRegion.click();

        // The hidden checkbox belonging to this label should now be checked
        const lastCheckbox = page.locator('.region-item input[type="checkbox"]').last();
        await expect(lastCheckbox).toBeChecked();

        // Wait for the map and sidebar to re-render the filtered features
        await page.waitForTimeout(500);

        // Verify the paid zones list shrank because it filtered out zones outside the region,
        // BUT verify it is still strictly greater than 0 to prove the region's zones were kept!
        const filteredCount = await paidZoneItems.count();
        expect(filteredCount).toBeGreaterThan(0);
        expect(filteredCount).toBeLessThan(initialCount);
    });
});