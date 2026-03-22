// e2e/layer-visibility.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Layer Toggle Visibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    // --- Core toggle wiring ---

    test('should remove air quality markers from the map when the layer is unchecked', async ({ page }) => {
        // Wait for air quality markers to be present
        const airMarkers = page.locator('.custom-pin-wrapper:has(.icon-air)');
        await expect(airMarkers.first()).toBeVisible({ timeout: 10000 });

        const initialCount = await airMarkers.count();
        expect(initialCount).toBeGreaterThan(0);

        // Uncheck the air quality layer via its checkbox
        const checkbox = page.locator('#toggle-air-quality-time');
        await expect(checkbox).toBeChecked();
        await checkbox.uncheck();

        // Verify markers are removed from the DOM
        await expect(airMarkers).toHaveCount(0);

        // Verify the checkbox is now unchecked
        await expect(checkbox).not.toBeChecked();
    });

    test('should restore air quality markers when the layer is re-checked after being hidden', async ({ page }) => {
        // Wait for initial load
        const airMarkers = page.locator('.custom-pin-wrapper:has(.icon-air)');
        await expect(airMarkers.first()).toBeVisible({ timeout: 10000 });

        const checkbox = page.locator('#toggle-air-quality-time');

        // Hide the layer
        await checkbox.uncheck();
        await expect(airMarkers).toHaveCount(0);

        // Re-enable it
        await checkbox.check();

        // Markers should reappear
        await expect(airMarkers.first()).toBeVisible({ timeout: 5000 });
        expect(await airMarkers.count()).toBeGreaterThan(0);
    });

    test('should remove CCTV markers from the map when the layer is unchecked', async ({ page }) => {
        // Use the specific CCTV icon wrapper class (distinct from regular custom-pin-wrapper)
        const cctvMarkers = page.locator('.cctv-icon-wrapper');
        await expect(cctvMarkers.first()).toBeVisible({ timeout: 10000 });

        const checkbox = page.locator('#toggle-cctv');
        await expect(checkbox).toBeChecked();

        await checkbox.uncheck();

        await expect(cctvMarkers).toHaveCount(0);
    });

    test('should remove smart parking markers from the map when the layer is unchecked', async ({ page }) => {
        const parkingMarkers = page.locator('.custom-pin-wrapper:has(.icon-car-parking)');
        await expect(parkingMarkers.first()).toBeVisible({ timeout: 10000 });

        const checkbox = page.locator('#toggle-smart-parking');
        await checkbox.uncheck();

        await expect(parkingMarkers).toHaveCount(0);
    });

    // --- Deselect All wires through to the map ---

    test('should remove all markers from the map when Deselect All is clicked', async ({ page }) => {
        // Wait for at least one layer to render
        const anyMarker = page.locator('.custom-pin-wrapper, .cctv-icon-wrapper');
        await expect(anyMarker.first()).toBeVisible({ timeout: 10000 });

        await page.locator('#btn-deselect-all').click();

        // All marker types should be gone
        await expect(page.locator('.custom-pin-wrapper')).toHaveCount(0);
        await expect(page.locator('.cctv-icon-wrapper')).toHaveCount(0);
    });

    test('should restore all markers after Select All is clicked following Deselect All', async ({ page }) => {
        const anyMarker = page.locator('.custom-pin-wrapper, .cctv-icon-wrapper');
        await expect(anyMarker.first()).toBeVisible({ timeout: 10000 });

        // Hide everything
        await page.locator('#btn-deselect-all').click();
        await expect(page.locator('.custom-pin-wrapper')).toHaveCount(0);

        // Restore everything
        await page.locator('#btn-select-all').click();

        // At least some markers should return
        await expect(anyMarker.first()).toBeVisible({ timeout: 5000 });
    });

    // --- Side panel closes when its sensor's layer is toggled off ---

    test('should close the side panel when the layer for the open sensor is toggled off', async ({ page }) => {
        // Open a sensor's side panel
        const firstAirMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstAirMarker).toBeVisible({ timeout: 10000 });
        await firstAirMarker.dispatchEvent('click');

        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        // Toggle off the air quality layer
        await page.locator('#toggle-air-quality-time').uncheck();

        // Panel should close because the sensor is no longer visible on the map
        await expect(infoPanel).toHaveClass(/hidden/);
    });
});
