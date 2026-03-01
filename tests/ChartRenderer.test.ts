// tests/ChartRenderer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChartRenderer } from '../src/components/ChartRenderer.js';

// Mock the browser environment (DOM and Plotly)
const mockElement = { innerHTML: '' };
vi.stubGlobal('document', {
    getElementById: vi.fn(() => mockElement)
});

const mockPlotly = {
    newPlot: vi.fn(),
    purge: vi.fn()
};
vi.stubGlobal('Plotly', mockPlotly);

describe('ChartRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should include a rangeslider and rangeselector in standard render layout', () => {
        // Arrange
        const mockDatasets = [{ label: 'Test Sensor', values: [10, 20], times: ['2025-01-01', '2025-01-02'] }];

        // Act
        ChartRenderer.render('chart-container', [], mockDatasets);

        // Assert
        expect(mockPlotly.newPlot).toHaveBeenCalled();
        const layoutArg = mockPlotly.newPlot.mock.calls[0][2]; // 3rd argument is 'layout'

        // Check for Rangeslider
        expect(layoutArg.xaxis).toHaveProperty('rangeslider');
        expect(layoutArg.xaxis.rangeslider.visible).toBe(true);

        // Check for Rangeselector Buttons
        expect(layoutArg.xaxis).toHaveProperty('rangeselector');
        expect(layoutArg.xaxis.rangeselector.buttons).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ step: 'day', count: 1 }),
                expect.objectContaining({ step: 'day', count: 7 }),
                expect.objectContaining({ step: 'month', count: 1 }),
                expect.objectContaining({ step: 'all' })
            ])
        );
    });

    it('should include a rangeslider and rangeselector in full-screen render layout', () => {

        const mockDatasets = [{ label: 'Test Sensor', values: [15], times: ['2025-01-01'] }];

        ChartRenderer.renderFull('full-chart-container', 'Test Title', [], mockDatasets);

        expect(mockPlotly.newPlot).toHaveBeenCalled();
        const layoutArg = mockPlotly.newPlot.mock.calls[0][2];

        expect(layoutArg.xaxis).toHaveProperty('rangeslider');
        expect(layoutArg.xaxis.rangeslider.visible).toBe(true);
        expect(layoutArg.xaxis).toHaveProperty('rangeselector');
    });
});