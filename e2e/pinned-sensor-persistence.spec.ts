// e2e/pinned-sensor-persistence.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Pinned Sensor Persistence', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    test('pinned sensor stays in the panel after selecting an admin region', async ({ page }) => {
        // Wait for air quality markers to load
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 15_000 });

        // Click the first marker to open the side panel
        await firstMarker.dispatchEvent('click');

        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        // Pin the sensor
        const pinBtn = page.locator('.btn-icon:has(.icon-pin)').first();
        await expect(pinBtn).toBeVisible();
        await pinBtn.click();
        await expect(pinBtn).toHaveClass(/active/);

        // Verify we have a pinned card
        const pinnedCard = page.locator('.sensor-card.card-pinned');
        await expect(pinnedCard).toHaveCount(1);
        const pinnedSensorName = await pinnedCard.locator('h3').textContent();

        // Now select an admin region
        const regionLabel = page.locator('#region-filters-wrapper label').first();
        await expect(regionLabel).toBeVisible({ timeout: 10_000 });
        await regionLabel.click();

        // Wait for the filter to apply
        await page.waitForTimeout(1000);

        // The pinned sensor should still be in the panel
        await expect(infoPanel).not.toHaveClass(/hidden/);
        const pinnedCardAfter = page.locator('.sensor-card.card-pinned');
        await expect(pinnedCardAfter).toHaveCount(1);

        // Verify it's the same sensor
        const pinnedNameAfter = await pinnedCardAfter.locator('h3').textContent();
        expect(pinnedNameAfter).toBe(pinnedSensorName);
    });

    test('pinned sensor stays in the panel after selecting a paid parking zone', async ({ page }) => {
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 15_000 });

        // Click and pin a sensor
        await firstMarker.dispatchEvent('click');
        const pinBtn = page.locator('.btn-icon:has(.icon-pin)').first();
        await expect(pinBtn).toBeVisible();
        await pinBtn.click();
        await expect(pinBtn).toHaveClass(/active/);

        const pinnedCard = page.locator('.sensor-card.card-pinned');
        await expect(pinnedCard).toHaveCount(1);

        // Select a paid parking zone
        const zoneLabel = page.locator('#paid-parking-zones-wrapper label').first();
        await expect(zoneLabel).toBeVisible({ timeout: 10_000 });
        await zoneLabel.click();
        await page.waitForTimeout(1000);

        // The pinned sensor should still be in the panel
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);
        await expect(page.locator('.sensor-card.card-pinned')).toHaveCount(1);
    });

    test('pinned sensor persists when clearing the region filter', async ({ page }) => {
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 15_000 });

        // Click and pin a sensor
        await firstMarker.dispatchEvent('click');
        const pinBtn = page.locator('.btn-icon:has(.icon-pin)').first();
        await expect(pinBtn).toBeVisible();
        await pinBtn.click();
        await expect(pinBtn).toHaveClass(/active/);

        // Select and then deselect an admin region (click same label twice)
        const regionLabel = page.locator('#region-filters-wrapper label').first();
        await expect(regionLabel).toBeVisible({ timeout: 10_000 });
        await regionLabel.click();
        await page.waitForTimeout(500);
        await regionLabel.click();
        await page.waitForTimeout(500);

        // The pinned sensor should still be there
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);
        await expect(page.locator('.sensor-card.card-pinned')).toHaveCount(1);
    });
});
