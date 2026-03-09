// e2e/charts-export.spec.ts
import { test, expect } from '@playwright/test';
import fs from 'fs';

const APP_URL = 'http://localhost:3000';

test.describe('Charts, Export & Side Panel', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(APP_URL);
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

    // --- Multiple Pins & Combined Charts ---
    test('should allow pinning multiple sensors and combining them in the chart', async ({ page }) => {
        // Click first marker
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').nth(0);
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        // Pin it by clicking the pin icon in the card header
        const pinBtn = page.locator('.btn-icon:has(.icon-pin)').first();
        await expect(pinBtn).toBeVisible();
        await pinBtn.click();

        // Wait for it to become pinned (card border changes and icon gets active class)
        await expect(pinBtn).toHaveClass(/active/);

        // Click a second marker of the same type
        const secondMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').nth(1);
        await expect(secondMarker).toBeVisible();
        await secondMarker.dispatchEvent('click');

        // Verify two sensor cards are now in the panel (one pinned, one preview)
        const sensorCards = page.locator('.sensor-card');
        await expect(sensorCards).toHaveCount(2);

        // Toggle the first chart checkbox found in both cards
        const firstCardBtn = sensorCards.nth(0).locator('.chart-toggle-btn').first();
        const secondCardBtn = sensorCards.nth(1).locator('.chart-toggle-btn').first();

        await expect(firstCardBtn).toBeVisible();
        await firstCardBtn.click();

        await expect(secondCardBtn).toBeVisible();
        await secondCardBtn.click();

        // Verify chart rendered successfully with both datasets
        const plotlyChart = page.locator('#chart-container-canvas.js-plotly-plot');
        await expect(plotlyChart).toBeVisible({ timeout: 10000 });
    });

    // --- Full Screen Modal ---
    test('should open and close the full screen chart modal', async ({ page }) => {
        // Open a sensor and render a chart
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        const chartToggleBtn = page.locator('.chart-toggle-btn').first();
        await expect(chartToggleBtn).toBeVisible();
        await chartToggleBtn.click();

        // Wait for the full screen button to become visible
        const fullChartBtn = page.locator('#btn-full-chart');
        await expect(fullChartBtn).toBeVisible();

        // Click it
        await fullChartBtn.click();

        // Verify Modal is visible
        const chartModal = page.locator('#chart-modal');
        await expect(chartModal).toBeVisible();
        await expect(chartModal).not.toHaveClass(/hidden/);

        // Verify Plotly rendered inside the modal container
        const fullPlotlyChart = page.locator('#full-chart-container-canvas.js-plotly-plot');
        await expect(fullPlotlyChart).toBeVisible({ timeout: 10000 });

        // Close Modal
        const closeModalBtn = page.locator('#close-modal');
        await closeModalBtn.click();

        // Verify Modal is hidden
        await expect(chartModal).toBeHidden();
    });

    // --- Unpin and Close Flow (Side Panel State) ---
    test('should allow unpinning and closing sensors, and hide panel when empty', async ({ page }) => {
        // Open a sensor and pin it
        const firstMarker = page.locator('.custom-pin-wrapper:has(.icon-air)').first();
        await expect(firstMarker).toBeVisible({ timeout: 10000 });
        await firstMarker.dispatchEvent('click');

        const pinBtn = page.locator('.btn-icon:has(.icon-pin)').first();
        await expect(pinBtn).toBeVisible();
        await pinBtn.click();

        // Wait for it to become pinned
        await expect(pinBtn).toHaveClass(/active/);

        // Click the close (X) button
        const closeBtn = page.locator('.btn-icon:has(.icon-cancel)').first();
        await closeBtn.click();

        // Verify the side panel completely hides itself when all sensors are closed
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).toHaveClass(/hidden/);
    });

    // --- CCTV Video Player Flow ---
    test('should successfully inject and render the CCTV video player', async ({ page }) => {
        // Wait for CCTV markers to appear. We use the specific CCTV icon wrapper class.
        const cctvMarker = page.locator('.cctv-icon-wrapper').first();
        await expect(cctvMarker).toBeVisible({ timeout: 10000 });

        // Click the CCTV marker
        await cctvMarker.dispatchEvent('click');

        // Verify the side panel opens
        const infoPanel = page.locator('#info-panel');
        await expect(infoPanel).not.toHaveClass(/hidden/);

        // Verify the video wrapper and the actual <video> element are injected
        const videoElement = page.locator('.cctv-video-wrapper video');
        await expect(videoElement).toBeVisible({ timeout: 5000 });
    });
});