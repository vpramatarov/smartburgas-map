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
        // Skip the lazy Plotly loader for the non-loader tests
        (ChartRenderer as any).plotlyLoaded = true;
        (ChartRenderer as any).plotlyLoading = null;
    });

    it('should include a rangeslider and rangeselector in standard render layout', async () => {
        // Arrange
        const mockDatasets = [{ label: 'Test Sensor', values: [10, 20], times: ['2025-01-01', '2025-01-02'] }];

        // Act
        await ChartRenderer.render('chart-container', [], mockDatasets);

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

    it('should include a rangeslider and rangeselector in full-screen render layout', async () => {

        const mockDatasets = [{ label: 'Test Sensor', values: [15], times: ['2025-01-01'] }];

        await ChartRenderer.renderFull('full-chart-container', 'Test Title', [], mockDatasets);

        expect(mockPlotly.newPlot).toHaveBeenCalled();
        const layoutArg = mockPlotly.newPlot.mock.calls[0][2];

        expect(layoutArg.xaxis).toHaveProperty('rangeslider');
        expect(layoutArg.xaxis.rangeslider.visible).toBe(true);
        expect(layoutArg.xaxis).toHaveProperty('rangeselector');
    });

    describe('ensurePlotly (lazy Plotly loader)', () => {
        beforeEach(() => {
            (ChartRenderer as any).plotlyLoaded = false;
            (ChartRenderer as any).plotlyLoading = null;
        });

        it('appends exactly one <script> tag on first call', async () => {
            const created: any[] = [];
            const appended: any[] = [];
            vi.stubGlobal('document', {
                getElementById: vi.fn(() => mockElement),
                createElement: vi.fn((tag) => {
                    const el: any = { tag, src: '', onload: null, onerror: null };
                    if (tag === 'script') created.push(el);
                    return el;
                }),
                head: { appendChild: vi.fn((el) => appended.push(el)) },
            });

            const p = (ChartRenderer as any).ensurePlotly();
            expect(created.length).toBe(1);
            expect(created[0].src).toContain('plotly');
            expect(appended.length).toBe(1);

            created[0].onload();
            await expect(p).resolves.toBeUndefined();
        });

        it('reuses the cached promise on subsequent calls', async () => {
            const created: any[] = [];
            const appended: any[] = [];
            vi.stubGlobal('document', {
                getElementById: vi.fn(() => mockElement),
                createElement: vi.fn((tag) => {
                    const el: any = { tag, src: '', onload: null, onerror: null };
                    if (tag === 'script') created.push(el);
                    return el;
                }),
                head: { appendChild: vi.fn((el) => appended.push(el)) },
            });

            const p1 = (ChartRenderer as any).ensurePlotly();
            const p2 = (ChartRenderer as any).ensurePlotly();
            expect(p1).toBe(p2);
            expect(created.length).toBe(1);

            created[0].onload();
            await p1;

            // After load, third call should resolve without re-injecting
            const p3 = (ChartRenderer as any).ensurePlotly();
            await expect(p3).resolves.toBeUndefined();
            expect(created.length).toBe(1);
        });
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