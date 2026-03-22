// e2e/layer-visibility.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Layer Toggle Visibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    // Helper: click the visible label to toggle the checkbox
    function layerLabel(page: any, checkboxId: string) {
        return page.locator(`label.checkbox[for="${checkboxId}"]`);
    }

    // --- Core toggle wiring ---

    test('should remove air quality markers from the map when the layer is unchecked', async ({ page }) => {
        const airMarkers = page.locator('.custom-pin-wrapper:has(.icon-air)');
        await expect(airMarkers.first()).toBeVisible({ timeout: 10000 });

        const initialCount = await airMarkers.count();
        expect(initialCount).toBeGreaterThan(0);

        // Click the visible label — the underlying checkbox is hidden by CSS
        await layerLabel(page, 'toggle-air-quality-time').click();

        await expect(airMarkers).toHaveCount(0);
        await expect(page.locator('#toggle-air-quality-time')).not.toBeChecked();
    });

    test('should restore air quality markers when the layer is re-checked after being hidden', async ({ page }) => {
        const airMarkers = page.locator('.custom-pin-wrapper:has(.icon-air)');
        await expect(airMarkers.first()).toBeVisible({ timeout: 10000 });

        const label = layerLabel(page, 'toggle-air-quality-time');

        // Hide
        await label.click();
        await expect(airMarkers).toHaveCount(0);

        // Restore
        await label.click();
        await expect(airMarkers.first()).toBeVisible({ timeout: 5000 });
        expect(await airMarkers.count()).toBeGreaterThan(0);
    });

    test('should remove CCTV markers from the map when the layer is unchecked', async ({ page }) => {
        const cctvMarkers = page.locator('.cctv-icon-wrapper');
        await expect(cctvMarkers.first()).toBeVisible({ timeout: 10000 });

        await layerLabel(page, 'toggle-cctv').click();

        await expect(cctvMarkers).toHaveCount(0);
    });

    test('should remove smart parking markers from the map when the layer is unchecked', async ({ page }) => {
        const parkingMarkers = page.locator('.custom-pin-wrapper:has(.icon-car-parking)');
        await expect(parkingMarkers.first()).toBeVisible({ timeout: 10000 });

        await layerLabel(page, 'toggle-smart-parking').click();

        await expect(parkingMarkers).toHaveCount(0);
    });

    // --- Deselect All wires through to the map ---

    test('should remove all markers from the map when Deselect All is clicked', async ({ page }) => {
        const anyMarker = page.locator('.custom-pin-wrapper, .cctv-icon-wrapper');
        await expect(anyMarker.first()).toBeVisible({ timeout: 10000 });

        await page.locator('#btn-deselect-all').click();

        await expect(page.locator('.custom-pin-wrapper')).toHaveCount(0);
        await expect(page.locator('.cctv-icon-wrapper')).toHaveCount(0);
    });

    test('should restore all markers after Select All is clicked following Deselect All', async ({ page }) => {
        const anyMarker = page.locator('.custom-pin-wrapper, .cctv-icon-wrapper');
        await expect(anyMarker.first()).toBeVisible({ timeout: 10000 });

        await page.locator('#btn-deselect-all').click();
        await expect(page.locator('.custom-pin-wrapper')).toHaveCount(0);

        await page.locator('#btn-select-all').click();

        await expect(anyMarker.first()).toBeVisible({ timeout: 5000 });
    });

    // --- Side panel closes when its sensor's layer is toggled off ---

    test('should close the side panel when the layer for the open sensor is toggled off', async ({ page }) => {
        const firstAirMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstAirMarker).toBeVisible({ timeout: 10000 });
        await firstAirMarker.dispatchEvent('click');

        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        await layerLabel(page, 'toggle-air-quality-time').click();

        await expect(infoPanel).toHaveClass(/hidden/);
    });
});
