// tests/SmartParkingStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SmartParkingStrategy } from '../src/strategies/SmartParkingStrategy.js';
import { SensorProperties } from '../src/Types.js';

const mockLayerGroup = { addTo: vi.fn(), clearLayers: vi.fn() };
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn((tag: string) => {
        const el: any = {
            className: '', type: '', id: '', htmlFor: '',
            innerHTML: '', dataset: {}, style: {},
            appendChild: vi.fn(), addEventListener: vi.fn(),
            querySelector: vi.fn().mockReturnValue({ addEventListener: vi.fn() }),
        };
        return el;
    }),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return {
        id: 'parking-1', name: 'Паркинг Опера', strategy: 'smart_parking',
        additional_info: { total_lots: '211', total_free_lots: '10' },
        data: [
            { time: '2025-01-03T10:00:00', free_lots: '10' },
            { time: '2025-01-01T08:00:00', free_lots: '50' },
            { time: '2025-01-02T09:00:00', free_lots: '30' },
        ],
        ...overrides,
    };
}

// ── getChartData

describe('SmartParkingStrategy.getChartData', () => {
    let strategy: SmartParkingStrategy;

    beforeEach(() => { vi.clearAllMocks(); strategy = new SmartParkingStrategy(); strategy.initialize({} as any, vi.fn()); });

    it('returns null for any property other than free_lots', () => {
        expect(strategy.getChartData(makeSensor(), 'total_lots')).toBeNull();
        expect(strategy.getChartData(makeSensor(), '')).toBeNull();
    });

    it('returns null when sensor has no data', () => {
        expect(strategy.getChartData(makeSensor({ data: [] }), 'free_lots')).toBeNull();
    });

    it('returns null when sensor data is undefined', () => {
        expect(strategy.getChartData(makeSensor({ data: undefined }), 'free_lots')).toBeNull();
    });

    it('returns a dataset with values parsed as integers', () => {
        const result = strategy.getChartData(makeSensor(), 'free_lots');
        expect(result).not.toBeNull();
        expect(result!.values.every(v => Number.isInteger(v))).toBe(true);
    });

    it('sorts data points chronologically regardless of input order', () => {
        const result = strategy.getChartData(makeSensor(), 'free_lots');
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
        expect(result!.label).toBe('free_spots');
        expect(result!.unit).toBe('spots');
    });
});

// ── renderCardContent (XSS hardening)

describe('SmartParkingStrategy.renderCardContent', () => {
    let strategy: SmartParkingStrategy;

    beforeEach(() => { vi.clearAllMocks(); strategy = new SmartParkingStrategy(); strategy.initialize({} as any, vi.fn()); });

    it('escapes last_sync (sensor.data[0].time) inside the stats template', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<script>alert(1)</script>';
        const sensor = makeSensor({ data: [{ time: malicious, free_lots: '10' }] });
        strategy.renderCardContent(container, sensor, 'prefix', vi.fn());

        // stats element is the first div appended (no image in this sensor)
        const stats = container.appendChild.mock.calls[0][0];
        expect(stats.innerHTML).not.toContain('<script>alert(1)</script>');
        expect(stats.innerHTML).toContain('&lt;script&gt;');
    });

    it('renders sensor.description as text, not HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<img src=x onerror="alert(1)">';
        const sensor = makeSensor({ description: malicious });
        strategy.renderCardContent(container, sensor, 'prefix', vi.fn());

        // With data + description, description is appended after stats
        const calls = container.appendChild.mock.calls;
        const desc = calls.find((c: any[]) => c[0].className === 'sensor-description')?.[0];
        expect(desc).toBeDefined();
        expect(desc.innerHTML).toBe('');
        expect(desc.textContent).toBe(malicious);
    });
});

// ── getUsageColor (tested directly via private method)

describe('SmartParkingStrategy.getUsageColor', () => {
    let strategy: SmartParkingStrategy;

    beforeEach(() => { vi.clearAllMocks(); strategy = new SmartParkingStrategy(); strategy.initialize({} as any, vi.fn()); });

    const color = (pct: number) => (strategy as any).getUsageColor(pct);

    it('returns green (#27ae60) when occupancy is below 50%', () => {
        expect(color(10).toLowerCase()).toBe('#27ae60');
        expect(color(49).toLowerCase()).toBe('#27ae60');
    });

    it('returns orange (#f39c12) when occupancy is between 50% and 84%', () => {
        expect(color(50).toLowerCase()).toBe('#f39c12');
        expect(color(70).toLowerCase()).toBe('#f39c12');
        expect(color(84).toLowerCase()).toBe('#f39c12');
    });

    it('returns red (#c0392b) when occupancy is 85% or above', () => {
        expect(color(85).toLowerCase()).toBe('#c0392b');
        expect(color(100).toLowerCase()).toBe('#c0392b');
    });

    it('returns green when parking is completely empty (0% occupied)', () => {
        expect(color(0).toLowerCase()).toBe('#27ae60');
    });
});
