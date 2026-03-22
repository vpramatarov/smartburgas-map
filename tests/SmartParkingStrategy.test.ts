// tests/SmartParkingStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartParkingStrategy } from '../src/strategies/SmartParkingStrategy.js';
import { SensorProperties } from '../src/Types.js';

// ── Minimal mocks ─────────────────────────────────────────────────────────────

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({
        addTo: vi.fn(),
        clearLayers: vi.fn(),
    })),
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn((tag: string) => {
        const el: any = {
            className: '',
            type: '',
            id: '',
            htmlFor: '',
            innerHTML: '',
            dataset: {},
            style: {},
            appendChild: vi.fn(),
            addEventListener: vi.fn(),
            querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }),
        };
        return el;
    }),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return {
        id: 'parking-1',
        name: 'Паркинг Опера',
        strategy: 'smart_parking',
        additional_info: {
            total_lots: '211',
            total_free_lots: '10',
        },
        data: [
            { time: '2025-01-03T10:00:00', free_lots: '10' },
            { time: '2025-01-01T08:00:00', free_lots: '50' },
            { time: '2025-01-02T09:00:00', free_lots: '30' },
        ],
        ...overrides,
    };
}

// ── getChartData ──────────────────────────────────────────────────────────────

describe('SmartParkingStrategy.getChartData', () => {
    let strategy: SmartParkingStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new SmartParkingStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('returns null for any property other than free_lots', () => {
        expect(strategy.getChartData(makeSensor(), 'total_lots')).toBeNull();
        expect(strategy.getChartData(makeSensor(), 'occupancy')).toBeNull();
        expect(strategy.getChartData(makeSensor(), '')).toBeNull();
    });

    it('returns null when sensor has no data', () => {
        const sensor = makeSensor({ data: [] });
        expect(strategy.getChartData(sensor, 'free_lots')).toBeNull();
    });

    it('returns null when sensor data is undefined', () => {
        const sensor = makeSensor({ data: undefined });
        expect(strategy.getChartData(sensor, 'free_lots')).toBeNull();
    });

    it('returns a dataset with values parsed as integers', () => {
        const result = strategy.getChartData(makeSensor(), 'free_lots');

        expect(result).not.toBeNull();
        expect(result!.values.every(v => Number.isInteger(v))).toBe(true);
    });

    it('sorts data points chronologically regardless of input order', () => {
        const result = strategy.getChartData(makeSensor(), 'free_lots');

        // Input order: Jan 3, Jan 1, Jan 2 — should come out Jan 1, Jan 2, Jan 3
        expect(result!.values).toEqual([50, 30, 10]);
        expect(result!.times).toEqual([
            '2025-01-01T08:00:00',
            '2025-01-02T09:00:00',
            '2025-01-03T10:00:00',
        ]);
    });

    it('times array preserves the original time strings from the data', () => {
        const sensor = makeSensor({
            data: [
                { time: '2025-06-15T12:00:00', free_lots: '5' },
                { time: '2025-06-16T12:00:00', free_lots: '8' },
            ]
        });
        const result = strategy.getChartData(sensor, 'free_lots');
        expect(result!.times).toEqual(['2025-06-15T12:00:00', '2025-06-16T12:00:00']);
    });

    it('returns a dataset with the translation keys for label and unit', () => {
        const result = strategy.getChartData(makeSensor(), 'free_lots');
        // t() mock returns the key itself
        expect(result!.label).toBe('free_spots');
        expect(result!.unit).toBe('spots');
    });
});

// ── getUsageColor (via renderCardContent HTML output) ─────────────────────────

describe('SmartParkingStrategy.getUsageColor', () => {
    let strategy: SmartParkingStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new SmartParkingStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    function getProgressBarColor(freeLots: string, totalLots: string): string {
        const container: any = {
            innerHTML: '',
            appendChild: vi.fn(),
            style: {},
        };
        // Intercept innerHTML assignment to capture the rendered HTML
        let capturedHtml = '';
        Object.defineProperty(container, 'innerHTML', {
            get: () => capturedHtml,
            set: (v: string) => { capturedHtml = v; },
        });

        const sensor: SensorProperties = {
            name: 'P',
            strategy: 'smart_parking',
            additional_info: { total_free_lots: freeLots, total_lots: totalLots },
            data: [],
        };

        strategy.renderCardContent(container, sensor, 'prefix', vi.fn());

        // Extract the background color from the progress bar div
        const match = capturedHtml.match(/background:(#[0-9a-f]+)/i);
        return match ? match[1] : '';
    }

    it('returns green (#27ae60) when occupancy is below 50%', () => {
        // 10 free / 100 total = 10% occupied
        const color = getProgressBarColor('90', '100');
        expect(color.toLowerCase()).toBe('#27ae60');
    });

    it('returns orange (#f39c12) when occupancy is between 50% and 84%', () => {
        // 30 free / 100 total = 70% occupied
        const color = getProgressBarColor('30', '100');
        expect(color.toLowerCase()).toBe('#f39c12');
    });

    it('returns red (#c0392b) when occupancy is 85% or above', () => {
        // 5 free / 100 total = 95% occupied
        const color = getProgressBarColor('5', '100');
        expect(color.toLowerCase()).toBe('#c0392b');
    });

    it('returns green when parking is completely empty (0% occupied)', () => {
        const color = getProgressBarColor('100', '100');
        expect(color.toLowerCase()).toBe('#27ae60');
    });

    it('returns 0% usage (green) when total is 0 to avoid division by zero', () => {
        const color = getProgressBarColor('0', '0');
        expect(color.toLowerCase()).toBe('#27ae60');
    });
});
