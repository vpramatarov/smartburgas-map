// e2e/mobile.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Mobile Viewport Layout', () => {

    // Emulate a mobile device screen size (e.g., iPhone X/12/13)
    test.use({ viewport: { width: 375, height: 812 } });

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    test('should hide controls by default and toggle them via mobile buttons', async ({ page }) => {
        const controlsPanel = page.locator('#controls');
        const mobileFilterBtn = page.locator('#mobile-filter-btn');

        // Ensure the mobile filter button is visible (it is hidden on desktop)
        await expect(mobileFilterBtn).toBeVisible();

        // Ensure controls panel does NOT have the 'open' class by default
        await expect(controlsPanel).not.toHaveClass(/open/);

        // Click the floating filter button to OPEN the menu
        await mobileFilterBtn.click();

        // Verify the panel slides in by checking for the 'open' class
        await expect(controlsPanel).toHaveClass(/open/);

        // Wait a brief moment for the CSS slide transition to complete
        await page.waitForTimeout(300);

        // Click the floating filter button again to CLOSE the menu (Toggle behavior)
        await mobileFilterBtn.click();

        // Verify the panel slides out
        await expect(controlsPanel).not.toHaveClass(/open/);
    });

    // --- Helper: open the info panel by clicking the first air quality marker ---
    async function openInfoPanel(page: any) {
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);
        return infoPanel;
    }

    // --- Panel Minimize / Compact View ---

    test('should show the minimize button only on mobile', async ({ page }) => {
        await openInfoPanel(page);
        const minimizeBtn = page.locator('#minimize-panel');
        // On mobile viewport the button must be visible (mobile-only class resolves to flex/block)
        await expect(minimizeBtn).toBeVisible();
    });

    test('should start with minimize icon (icon-resize-small) when panel is expanded', async ({ page }) => {
        await openInfoPanel(page);
        const icon = page.locator('#minimize-panel span');
        await expect(icon).toHaveClass(/icon-resize-small/);
    });

    test('should minimize the info panel when the minimize button is clicked', async ({ page }) => {
        const infoPanel = await openInfoPanel(page);
        const minimizeBtn = page.locator('#minimize-panel');

        await minimizeBtn.click();

        // Panel gets the panel-minimized class
        await expect(infoPanel).toHaveClass(/panel-minimized/);

        // The minimized bar becomes visible
        await expect(page.locator('#panel-minimized-bar')).toBeVisible();

        // The full content and actions are hidden
        await expect(page.locator('#info-content')).toBeHidden();
        await expect(page.locator('.actions')).toBeHidden();
    });

    test('should switch to icon-resize-full when minimized', async ({ page }) => {
        await openInfoPanel(page);
        const minimizeBtn = page.locator('#minimize-panel');
        const icon = page.locator('#minimize-panel span');

        await minimizeBtn.click();

        await expect(icon).toHaveClass(/icon-resize-full/);
    });

    test('should expand the panel when minimize button is clicked again while minimized', async ({ page }) => {
        const infoPanel = await openInfoPanel(page);
        const minimizeBtn = page.locator('#minimize-panel');

        // Minimize
        await minimizeBtn.click();
        await expect(infoPanel).toHaveClass(/panel-minimized/);

        // Click again to expand
        await minimizeBtn.click();
        await expect(infoPanel).not.toHaveClass(/panel-minimized/);

        // Minimized bar is hidden again
        await expect(page.locator('#panel-minimized-bar')).toBeHidden();

        // Full content is visible again
        await expect(page.locator('#info-content')).toBeVisible();
    });

    test('should restore icon-resize-small after expanding from compact view', async ({ page }) => {
        await openInfoPanel(page);
        const minimizeBtn = page.locator('#minimize-panel');
        const icon = page.locator('#minimize-panel span');

        await minimizeBtn.click();
        await expect(icon).toHaveClass(/icon-resize-full/);

        await minimizeBtn.click();
        await expect(icon).toHaveClass(/icon-resize-small/);
    });

    test('should show sensor name chips in the minimized bar', async ({ page }) => {
        await openInfoPanel(page);
        await page.locator('#minimize-panel').click();

        // At least one chip should appear representing the open sensor
        const chips = page.locator('.minimized-sensor-chip');
        await expect(chips.first()).toBeVisible();
    });

    test('should expand to full view when a new sensor is selected while minimized', async ({ page }) => {
        const infoPanel = await openInfoPanel(page);

        // Minimize
        await page.locator('#minimize-panel').click();
        await expect(infoPanel).toHaveClass(/panel-minimized/);

        // Click a second marker (a different air quality pin)
        const markers = page.locator('.custom-pin-wrapper:has(.icon-air)');
        await expect(markers.nth(1)).toBeVisible({ timeout: 10000 });
        await markers.nth(1).dispatchEvent('click');

        // Panel should auto-expand back to full view
        await expect(infoPanel).not.toHaveClass(/panel-minimized/);
        await expect(page.locator('#panel-minimized-bar')).toBeHidden();
        await expect(page.locator('#info-content')).toBeVisible();
    });

    test('should NOT minimize on desktop viewport', async ({ browser }) => {
        // Open a fresh desktop-sized context to confirm mobile-only behaviour
        const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const desktopPage = await desktopContext.newPage();
        await desktopPage.goto(APP_URL);

        const minimizeBtn = desktopPage.locator('#minimize-panel');

        // Button must not be visible on desktop (hidden by mobile-only class)
        await expect(minimizeBtn).toBeHidden();

        await desktopContext.close();
    });
});