// e2e/app.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';

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

    test('should display chart and allow filtering via range selector', async ({ page }) => {
        // Wait for the map and markers to finish loading from the API
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });

        // Click the first available marker to open the side panel
        await firstMarker.dispatchEvent('click');

        // Wait for the side panel to appear
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        // Click the visible label just like a real user would
        const chartToggleBtn = page.locator('.chart-toggle-btn').first();
        await expect(chartToggleBtn).toBeVisible();
        await chartToggleBtn.click();

        // Verify the Plotly chart rendered.
        // NOTE: No space! Plotly adds the class directly TO the container.
        const plotlyChart = page.locator('#chart-container-canvas.js-plotly-plot');
        await expect(plotlyChart).toBeVisible();

        // Locate the Plotly Range Selector buttons (rendered as SVG text)
        // Plotly uses <text class="button"> or similar groupings for these.
        const oneWeekBtn = page.locator('text="1w"');
        const oneMonthBtn = page.locator('text="1m"');
        const allBtn = page.locator('text="All"');

        await expect(oneWeekBtn).toBeVisible();
        await expect(oneMonthBtn).toBeVisible();
        await expect(allBtn).toBeVisible();

        // Click the '1w' button
        // Force the click because Plotly overlays invisible SVG shapes for bounding boxes
        await oneWeekBtn.click({ force: true });

        // Wait a brief moment for Plotly's internal transition/re-layout to process
        await page.waitForTimeout(500);

        // Verify the chart is still visible and didn't crash during the re-layout
        await expect(plotlyChart).toBeVisible();
    });

    test('should export strictly filtered CSV when 1w date range is selected', async ({ page }) => {
        // Open side panel
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        // Open chart view inside the panel
        const chartToggleBtn = page.locator('.chart-toggle-btn').first();
        await expect(chartToggleBtn).toBeVisible();
        await chartToggleBtn.click();

        // Target the FIRST '1w' button explicitly and use dispatchEvent to bypass Plotly SVG shields
        const oneWeekBtn = page.locator('text="1w"').first();
        await expect(oneWeekBtn).toBeVisible();
        await oneWeekBtn.dispatchEvent('click');

        // Wait for the Plotly animation/re-layout to complete
        await page.waitForTimeout(1000);

        // Download CSV
        const downloadPromise = page.waitForEvent('download');

        // Use dispatchEvent instead of .click() to guarantee the DOM node receives it
        await page.locator('.btn-download-csv').first().dispatchEvent('click');

        const download = await downloadPromise;

        // Read file and verify row count
        const fileContent = fs.readFileSync(await download.path(), 'utf8');
        const rows = fileContent.trim().split('\n');

        // Expect header + roughly 168 hours of data
        expect(rows.length).toBeGreaterThan(1);
        expect(rows.length).toBeLessThan(1400); // ~1345 records for 1 week
    });

    test('should display datepickers and allow manual date range filtering', async ({ page }) => {
        // Wait for map and click the first air quality marker
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        // Toggle the chart on
        const chartToggleBtn = page.locator('.chart-toggle-btn').first();
        await expect(chartToggleBtn).toBeVisible();
        await chartToggleBtn.click();

        // Verify our new custom date inputs are visible
        const fromInput = page.locator('#chart-container-from');
        const toInput = page.locator('#chart-container-to');
        await expect(fromInput).toBeVisible();
        await expect(toInput).toBeVisible();

        // Verify the new Plotly sub-canvas is visible
        const plotlyChart = page.locator('#chart-container-canvas.js-plotly-plot');
        await expect(plotlyChart).toBeVisible();

        // Simulate a user typing a new 'From' date
        // Playwright handles <input type="date"> easily with .fill('YYYY-MM-DD')
        await fromInput.fill('2025-01-01');

        // Manually dispatch the change event to ensure our JavaScript listener catches it
        await fromInput.dispatchEvent('change');

        // Verify the input accepted the value
        await expect(fromInput).toHaveValue('2025-01-01');

        // Wait a brief moment to ensure Plotly didn't crash during the relayout
        await page.waitForTimeout(500);
        await expect(plotlyChart).toBeVisible();
    });
});