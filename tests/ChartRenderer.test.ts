// tests/ChartRenderer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChartRenderer } from '../src/components/ChartRenderer.js';

// Mock the browser environment (DOM and Plotly)
const mockElement: any = {
    innerHTML: '',
    appendChild: vi.fn(),
    addEventListener: vi.fn(),
    value: '',
    querySelector: vi.fn((selector) => {
        // Return a dummy object so event listeners don't crash in Node.js
        return { addEventListener: vi.fn(), value: '' };
    })
};

vi.stubGlobal('document', {
    getElementById: vi.fn(() => mockElement),
    createElement: vi.fn((tag) => ({
        id: '',
        className: '',
        innerHTML: '',
        appendChild: vi.fn(),
        style: {}
    }))
});

const mockPlotly = {
    newPlot: vi.fn().mockResolvedValue({
        removeAllListeners: vi.fn(),
        on: vi.fn()
    }),
    purge: vi.fn()
};
vi.stubGlobal('Plotly', mockPlotly);

vi.stubGlobal('localStorage', {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
});

describe('ChartRenderer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.getItem.mockReturnValue('bg');
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

    it('should inject From and To datepickers with correct min/max bounds based on the dataset', () => {
        const mockDatasets = [{
            label: 'Test Sensor',
            values: [10, 20, 30],
            // Dataset spans exactly from Jan 1st to Jan 15th
            times: ['2026-01-01T10:00:00Z', '2026-01-08T10:00:00Z', '2026-01-15T10:00:00Z']
        }];

        ChartRenderer.render('chart-container', [], mockDatasets);

        // Assert that the container's HTML now contains our custom date inputs with correct limits
        expect(mockElement.innerHTML).toContain('type="date"');
        expect(mockElement.innerHTML).toContain('min="2026-01-01"');
        expect(mockElement.innerHTML).toContain('max="2026-01-15"');
    });
});