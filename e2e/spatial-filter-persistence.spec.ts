// e2e/spatial-filter-persistence.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Spatial Filter Persistence', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    // Helper: click the visible label to toggle the checkbox (actual checkbox has opacity:0)
    function layerLabel(page: any, checkboxId: string) {
        return page.locator(`label.checkbox[for="${checkboxId}"]`);
    }

    /**
     * Wait for marker count to stabilise — returns the settled count.
     * Polls until two consecutive reads 500ms apart return the same value.
     */
    async function stableMarkerCount(page: any, selector: string, timeout = 15_000): Promise<number> {
        let prev = -1;
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
            const count = await page.locator(selector).count();
            if (count === prev && count >= 0) {
                return count;
            }
            prev = count;
            await page.waitForTimeout(500);
        }
        return prev;
    }

    test('markers remain filtered after toggling a sensor layer off/on with an admin region selected', async ({ page }) => {
        const airMarkers = '.custom-pin-wrapper:has(.icon-air)';

        // Wait for air quality markers to load
        await expect(page.locator(airMarkers).first()).toBeVisible({ timeout: 15_000 });
        const totalCount = await stableMarkerCount(page, airMarkers);
        expect(totalCount).toBeGreaterThan(0);

        const regionLabel = page.locator('#region-filters-wrapper label').first();
        await expect(regionLabel).toBeVisible({ timeout: 10_000 });
        await regionLabel.click();

        // Wait for markers to be filtered (count should drop or stay equal, but the filter is applied)
        await page.waitForTimeout(1000);
        const filteredCount = await stableMarkerCount(page, airMarkers);

        // The filtered count should be less than the total (unless all sensors happen to be in this region)
        // At minimum, the filter was applied and some count is returned
        expect(filteredCount).toBeGreaterThanOrEqual(0);
        expect(filteredCount).toBeLessThanOrEqual(totalCount);

        // Toggle air quality layer OFF
        await layerLabel(page, 'toggle-air-quality-time').click();
        await expect(page.locator(airMarkers)).toHaveCount(0);

        // Toggle air quality layer back ON
        await layerLabel(page, 'toggle-air-quality-time').click();

        // Wait for markers to reappear and stabilise
        if (filteredCount > 0) {
            await expect(page.locator(airMarkers).first()).toBeVisible({ timeout: 10_000 });
        }
        const afterToggleCount = await stableMarkerCount(page, airMarkers);

        // The count after toggle should match the filtered count, NOT the unfiltered total
        expect(afterToggleCount).toBe(filteredCount);
    });

    test('markers remain filtered after toggling a sensor layer off/on with a paid parking zone selected', async ({ page }) => {
        const airMarkers = '.custom-pin-wrapper:has(.icon-air)';

        await expect(page.locator(airMarkers).first()).toBeVisible({ timeout: 15_000 });
        const totalCount = await stableMarkerCount(page, airMarkers);
        expect(totalCount).toBeGreaterThan(0);

        const zoneLabel = page.locator('#paid-parking-zones-wrapper label').first();
        await expect(zoneLabel).toBeVisible({ timeout: 10_000 });
        await zoneLabel.click();

        await page.waitForTimeout(1000);
        const filteredCount = await stableMarkerCount(page, airMarkers);

        expect(filteredCount).toBeGreaterThanOrEqual(0);
        expect(filteredCount).toBeLessThanOrEqual(totalCount);

        // Toggle air quality layer OFF
        await layerLabel(page, 'toggle-air-quality-time').click();
        await expect(page.locator(airMarkers)).toHaveCount(0);

        // Toggle air quality layer back ON
        await layerLabel(page, 'toggle-air-quality-time').click();

        // Wait for markers to reappear and stabilise
        if (filteredCount > 0) {
            await expect(page.locator(airMarkers).first()).toBeVisible({ timeout: 10_000 });
        }
        const afterToggleCount = await stableMarkerCount(page, airMarkers);

        // The count after toggle should match the filtered count, NOT the unfiltered total
        expect(afterToggleCount).toBe(filteredCount);
    });

    test('admin region selection highlight persists after switching language', async ({ page }) => {
        // Wait for admin region sidebar to appear
        const regionCheckbox = page.locator('#region-filters-wrapper input[type="checkbox"]').first();
        await expect(regionCheckbox).toBeAttached({ timeout: 10_000 });

        // Select the first admin region
        const regionLabel = page.locator('#region-filters-wrapper label').first();
        await regionLabel.click();
        await expect(regionCheckbox).toBeChecked();

        // Switch language to English
        await page.locator('label[for="en"]').click();

        // Wait for data to reload
        await page.waitForTimeout(2000);

        // The first region checkbox should still be checked after language switch
        const regionCheckboxAfter = page.locator('#region-filters-wrapper input[type="checkbox"]').first();
        await expect(regionCheckboxAfter).toBeAttached({ timeout: 10_000 });
        await expect(regionCheckboxAfter).toBeChecked();
    });

    test('paid parking zone selection highlight persists after switching language', async ({ page }) => {
        // Wait for paid parking zone sidebar to appear
        const zoneCheckbox = page.locator('#paid-parking-zones-wrapper input[type="checkbox"]').first();
        await expect(zoneCheckbox).toBeAttached({ timeout: 10_000 });

        // Select the first paid parking zone
        const zoneLabel = page.locator('#paid-parking-zones-wrapper label').first();
        const zoneLabelTextBefore = await zoneLabel.textContent();
        await zoneLabel.click();
        await expect(zoneCheckbox).toBeChecked();

        // Switch language to English
        await page.locator('label[for="en"]').click();

        // Wait for data to reload
        await page.waitForTimeout(2000);

        // A checkbox should be checked (the same zone, now with an English name)
        const checkedZone = page.locator('#paid-parking-zones-wrapper input[type="checkbox"]:checked');
        await expect(checkedZone).toBeAttached({ timeout: 10_000 });
        expect(await checkedZone.count()).toBe(1);

        // The zone label text should have changed (BG → EN)
        const checkedLabel = page.locator(`#paid-parking-zones-wrapper label[for="${await checkedZone.getAttribute('id')}"]`);
        const zoneLabelTextAfter = await checkedLabel.textContent();
        expect(zoneLabelTextAfter).not.toBe(zoneLabelTextBefore);
    });
});
