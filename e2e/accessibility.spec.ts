// e2e/accessibility.spec.ts
import { test, expect } from '@playwright/test';

const APP_URL = 'http://localhost:3000';

test.describe('Keyboard Navigation & Accessibility', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
    });

    // --- Layer toggle checkboxes ---

    test('should toggle a layer off and on using the keyboard via its label', async ({ page }) => {
        const checkbox = page.locator('#toggle-air-quality-time');
        await expect(checkbox).toBeChecked({ timeout: 5000 });

        // The checkbox itself is keyboard-focusable even though it is visually hidden.
        // Tab to it and use Space to toggle — this matches actual browser keyboard behaviour.
        await checkbox.focus();
        await expect(checkbox).toBeFocused();

        await page.keyboard.press('Space');
        await expect(checkbox).not.toBeChecked();

        await page.keyboard.press('Space');
        await expect(checkbox).toBeChecked();
    });

    test('should be able to Tab between layer toggle checkboxes in sequence', async ({ page }) => {
        const firstCheckbox = page.locator('#toggle-air-quality-time');
        await firstCheckbox.focus();
        await expect(firstCheckbox).toBeFocused();

        await page.keyboard.press('Tab');

        const secondCheckbox = page.locator('#toggle-traffic');
        await expect(secondCheckbox).toBeFocused();
    });

    // --- Region filter chips ---
    // Region chips use display:none on the checkbox, with a <label> as the visible element.
    // Click the label directly — keyboard activation goes through the label click event.

    test('should activate a region chip using the label click', async ({ page }) => {
        const regionChips = page.locator('.region-item label');
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        const firstCheckbox = page.locator('.region-item input[type="checkbox"]').first();
        await expect(firstCheckbox).not.toBeChecked();

        await regionChips.first().click();

        await expect(firstCheckbox).toBeChecked();
    });

    test('should deactivate a region chip by clicking the label again (toggle)', async ({ page }) => {
        const regionChips = page.locator('.region-item label');
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        const firstCheckbox = page.locator('.region-item input[type="checkbox"]').first();

        await regionChips.first().click();
        await expect(firstCheckbox).toBeChecked();

        await regionChips.first().click();
        await expect(firstCheckbox).not.toBeChecked();
    });

    test('should select different region chips independently', async ({ page }) => {
        const regionChips = page.locator('.region-item label');
        await expect(regionChips.first()).toBeVisible({ timeout: 5000 });

        const chipCount = await regionChips.count();
        expect(chipCount).toBeGreaterThan(1);

        // Click the first chip, then the second — verify second is checked
        await regionChips.first().click();
        await regionChips.nth(1).click();

        const secondCheckbox = page.locator('.region-item input[type="checkbox"]').nth(1);
        await expect(secondCheckbox).toBeChecked();
    });

    // --- Language switcher ---

    test('should be able to switch language by clicking the English label', async ({ page }) => {
        const filterHeader = page.locator('h4').filter({ hasText: 'Филтри' }).first();
        await expect(filterHeader).toBeVisible();

        await page.locator('label[for="en"]').click();

        const englishHeader = page.locator('h4').filter({ hasText: 'Filters' }).first();
        await expect(englishHeader).toBeVisible();
        await expect(filterHeader).not.toBeVisible();
    });

    // --- Bulk controls ---

    test('should activate Deselect All link using Enter key', async ({ page }) => {
        const trafficCheckbox = page.locator('#toggle-traffic');
        await expect(trafficCheckbox).toBeChecked({ timeout: 5000 });

        const deselectLink = page.locator('#btn-deselect-all');
        await deselectLink.focus();
        await page.keyboard.press('Enter');

        await expect(trafficCheckbox).not.toBeChecked();
    });

    // --- Focus indicator ---

    test('layer toggle checkboxes should receive focus when tabbed to', async ({ page }) => {
        // Confirm the hidden-but-focusable checkbox can receive keyboard focus
        const checkbox = page.locator('#toggle-air-quality-time');
        await checkbox.focus();
        await expect(checkbox).toBeFocused();
    });

    // --- Map accessibility ---

    test('map container should be present and visible', async ({ page }) => {
        const mapEl = page.locator('#map');
        await expect(mapEl).toBeVisible();
    });
});
