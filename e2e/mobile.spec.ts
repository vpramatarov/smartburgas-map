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
});