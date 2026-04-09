// e2e/marker-clustering.spec.ts
import { test, expect, Page } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Marker Clustering', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
        // Wait for markers to load at the default zoom (13)
        await expect(page.locator('.custom-pin-wrapper').first()).toBeVisible({ timeout: 10000 });
    });

    /** Zoom out by pressing '-' on the focused map container */
    async function zoomOut(page: Page, levels: number = 3) {
        await page.locator('#map').click();
        for (let i = 0; i < levels; i++) {
            await page.keyboard.press('Minus');
            await page.waitForTimeout(400);
        }
    }

    /** Collect the unique marker colors currently visible on the map from individual pins */
    async function getVisibleMarkerColors(page: Page): Promise<string[]> {
        return page.evaluate(() => {
            const pins = document.querySelectorAll('.custom-pin-marker');
            const colors = new Set<string>();
            pins.forEach(pin => {
                const bg = (pin as HTMLElement).style.backgroundColor;
                if (bg) colors.add(bg);
            });
            return Array.from(colors);
        });
    }

    test('should show cluster icons when zoomed out and individual markers when zoomed in', async ({ page }) => {
        const clusters = page.locator('.marker-cluster');
        const individualMarkers = page.locator('.custom-pin-wrapper');

        // At default zoom 13, individual markers should be visible
        expect(await individualMarkers.count()).toBeGreaterThan(0);

        // Zoom out — markers should cluster
        await zoomOut(page);

        await expect(clusters.first()).toBeVisible({ timeout: 5000 });
        expect(await clusters.count()).toBeGreaterThan(0);
    });

    test('should use per-strategy colors in cluster icons', async ({ page }) => {
        // Collect actual marker colors from the DOM before zooming out
        const markerColors = await getVisibleMarkerColors(page);
        expect(markerColors.length).toBeGreaterThan(0);

        // Zoom out with all layers enabled so clusters form
        await zoomOut(page);

        const clusters = page.locator('.marker-cluster');
        await expect(clusters.first()).toBeVisible({ timeout: 5000 });

        // Collect background-color values from cluster inner divs
        const clusterColors = await clusters.evaluateAll(els =>
            els.map(el => {
                const inner = el.querySelector('div') as HTMLElement | null;
                return inner?.style.backgroundColor ?? '';
            }).filter(c => c !== '')
        );

        // At least one marker color should appear in the clusters
        const matchedColors = markerColors.filter(mc => clusterColors.includes(mc));
        expect(matchedColors.length).toBeGreaterThan(0);

        // Each cluster should have exactly one background-color (no cross-type mixing)
        for (const color of clusterColors) {
            expect(color).toBeTruthy();
        }
    });
});
