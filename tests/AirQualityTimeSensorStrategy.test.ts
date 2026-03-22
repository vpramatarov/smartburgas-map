// tests/AirQualityTimeSensorStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AirQualityTimeSensorStrategy } from '../src/strategies/AirQualityTimeSensorStrategy.js';
import { SensorProperties } from '../src/Types.js';

// ── Minimal mocks ─────────────────────────────────────────────────────────────

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({
        addTo: vi.fn(),
        clearLayers: vi.fn(),
    })),
});

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
            classList: { add: vi.fn() },
            style: {},
            appendChild: vi.fn(),
            addEventListener: vi.fn(),
        };
        return el;
    }),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return {
        id: 'AQ01',
        name: 'Долно Езерово',
        strategy: 'air_quality_time',
        additional_info: {},
        ...overrides,
    };
}

// ── getChartData ──────────────────────────────────────────────────────────────

describe('AirQualityTimeSensorStrategy.getChartData', () => {
    let strategy: AirQualityTimeSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new AirQualityTimeSensorStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('returns null when sensor has no data array', () => {
        const sensor = makeSensor({ data: undefined });
        expect(strategy.getChartData(sensor, 'PM10')).toBeNull();
    });

    it('returns null when sensor data is an empty array', () => {
        const sensor = makeSensor({ data: [] });
        expect(strategy.getChartData(sensor, 'PM10')).toBeNull();
    });

    it('returns a dataset with correct label, values, and times for a valid property', () => {
        const sensor = makeSensor({
            data: [
                { time: '2025-01-01T10:00:00Z', PM10: '25', PM10_unit: 'μg/m³' },
                { time: '2025-01-02T10:00:00Z', PM10: '30', PM10_unit: 'μg/m³' },
            ]
        });

        const result = strategy.getChartData(sensor, 'PM10');

        expect(result).not.toBeNull();
        expect(result!.label).toBe('PM10');
        expect(result!.values).toEqual([25, 30]);
        expect(result!.times).toHaveLength(2);
        expect(result!.unit).toBe('μg/m³');
    });

    it('sorts data points chronologically regardless of input order', () => {
        const sensor = makeSensor({
            data: [
                { time: '2025-01-03T10:00:00Z', PM10: '40' },
                { time: '2025-01-01T10:00:00Z', PM10: '10' },
                { time: '2025-01-02T10:00:00Z', PM10: '20' },
            ]
        });

        const result = strategy.getChartData(sensor, 'PM10');

        expect(result!.values).toEqual([10, 20, 40]);
        const times = result!.times!.map(t => new Date(t).getTime());
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThan(times[i - 1]);
        }
    });

    it('treats non-numeric values as 0 rather than NaN', () => {
        const sensor = makeSensor({
            data: [
                { time: '2025-01-01T10:00:00Z', PM10: 'N/A' },
                { time: '2025-01-02T10:00:00Z', PM10: '15' },
            ]
        });

        const result = strategy.getChartData(sensor, 'PM10');

        expect(result!.values[0]).toBe(0);
        expect(result!.values[1]).toBe(15);
    });

    it('picks up the unit from whichever data point has it', () => {
        const sensor = makeSensor({
            data: [
                { time: '2025-01-01T10:00:00Z', temp: '20', temp_unit: '°C' },
                { time: '2025-01-02T10:00:00Z', temp: '22', temp_unit: '°C' },
            ]
        });

        const result = strategy.getChartData(sensor, 'temp');
        expect(result!.unit).toBe('°C');
    });

    it('returns empty string for unit when no _unit key exists in the data', () => {
        const sensor = makeSensor({
            data: [{ time: '2025-01-01T10:00:00Z', humidity: '65' }]
        });

        const result = strategy.getChartData(sensor, 'humidity');
        expect(result!.unit).toBe('');
    });
});

// ── parseDate (via getChartData output) ───────────────────────────────────────

describe('AirQualityTimeSensorStrategy.parseDate (via getChartData times)', () => {
    let strategy: AirQualityTimeSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new AirQualityTimeSensorStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('parses a standard ISO string', () => {
        const sensor = makeSensor({
            data: [{ time: '2025-03-15T10:30:00Z', v: '1' }]
        });
        const result = strategy.getChartData(sensor, 'v');
        expect(new Date(result!.times![0]).getFullYear()).toBe(2025);
    });

    it('parses the underscore-dot upstream format by normalising separators', () => {
        // The upstream API sometimes returns "15.03.2025_10:30"
        const sensor = makeSensor({
            data: [{ time: '15.03.2025_10:30', v: '1' }]
        });
        const result = strategy.getChartData(sensor, 'v');
        // Should produce a valid ISO time, not epoch 0
        const ms = new Date(result!.times![0]).getTime();
        expect(ms).toBeGreaterThan(0);
    });

    it('falls back to epoch 0 for completely unparseable strings', () => {
        const sensor = makeSensor({
            data: [{ time: 'garbage', v: '1' }]
        });
        const result = strategy.getChartData(sensor, 'v');
        // Epoch 0 maps to 1970
        expect(new Date(result!.times![0]).getFullYear()).toBe(1970);
    });
});
