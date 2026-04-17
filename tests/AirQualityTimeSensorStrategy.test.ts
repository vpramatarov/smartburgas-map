// tests/AirQualityTimeSensorStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AirQualityTimeSensorStrategy } from '../src/strategies/AirQualityTimeSensorStrategy.js';
import { SensorProperties } from '../src/Types.js';

const mockLayerGroup = { addTo: vi.fn(), clearLayers: vi.fn() };
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn((tag: string) => ({
        className: '', type: '', id: '', htmlFor: '', innerHTML: '',
        dataset: {}, classList: { add: vi.fn() }, style: {},
        appendChild: vi.fn(), addEventListener: vi.fn(),
    })),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return { id: 'AQ01', name: 'Долно Езерово', strategy: 'air_quality_time', additional_info: {}, ...overrides };
}

// ── getChartData

describe('AirQualityTimeSensorStrategy.getChartData', () => {
    let strategy: AirQualityTimeSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new AirQualityTimeSensorStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('returns null when sensor has no data array', () => {
        expect(strategy.getChartData(makeSensor({ data: undefined }), 'PM10')).toBeNull();
    });

    it('returns null when sensor data is an empty array', () => {
        expect(strategy.getChartData(makeSensor({ data: [] }), 'PM10')).toBeNull();
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
            data: [{ time: '2025-01-01T10:00:00Z', temp: '20', temp_unit: '°C' }]
        });
        expect(strategy.getChartData(sensor, 'temp')!.unit).toBe('°C');
    });

    it('returns empty string for unit when no _unit key exists in the data', () => {
        const sensor = makeSensor({
            data: [{ time: '2025-01-01T10:00:00Z', humidity: '65' }]
        });
        expect(strategy.getChartData(sensor, 'humidity')!.unit).toBe('');
    });
});

// ── renderCardContent (XSS hardening)

describe('AirQualityTimeSensorStrategy.renderCardContent', () => {
    let strategy: AirQualityTimeSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new AirQualityTimeSensorStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('escapes property name, value, unit, and time in the textDiv innerHTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const maliciousKey = '<script>alert(1)</script>';
        const data = [{
            time: '<b>when</b>',
            [maliciousKey]: '<img src=x>',
            [maliciousKey + '_unit']: '"><svg',
        }];
        strategy.renderCardContent(container, makeSensor({ data }), 'pfx', vi.fn());

        // container.appendChild[0] is toggleContainer; toggleContainer.appendChild[0] is rowDiv;
        // rowDiv.appendChild[0] is textDiv.
        const toggleContainer = container.appendChild.mock.calls[0][0];
        const rowDiv = toggleContainer.appendChild.mock.calls[0][0];
        const textDiv = rowDiv.appendChild.mock.calls[0][0];

        expect(textDiv.innerHTML).not.toContain('<script>alert(1)</script>');
        expect(textDiv.innerHTML).not.toContain('<img src=x>');
        expect(textDiv.innerHTML).not.toContain('<b>when</b>');
        expect(textDiv.innerHTML).toContain('&lt;script&gt;');
        expect(textDiv.innerHTML).toContain('&lt;img');
        expect(textDiv.innerHTML).toContain('&lt;b&gt;when&lt;/b&gt;');
    });
});

// ── parseDate (via getChartData times output)

describe('AirQualityTimeSensorStrategy.parseDate', () => {
    let strategy: AirQualityTimeSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new AirQualityTimeSensorStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    function getFirstTime(timeStr: string): number {
        const sensor = makeSensor({ data: [{ time: timeStr, v: '1' }] });
        const result = strategy.getChartData(sensor, 'v');
        return new Date(result!.times![0]).getTime();
    }

    it('parses a standard ISO string', () => {
        const ms = getFirstTime('2025-03-15T10:30:00Z');
        expect(ms).toBeGreaterThan(0);
        expect(new Date(ms).getFullYear()).toBe(2025);
    });

    it('filters out entries with unparseable time (returns NaN from parseDate — audit 5.4)', () => {
        // After audit 5.4, invalid times yield NaN from parseDate, so the entry is filtered
        // out of the dataset rather than surfacing as Jan 1 1970.
        const sensor = makeSensor({ data: [{ time: 'garbage', v: '1' }] });
        const result = strategy.getChartData(sensor, 'v');
        expect(result).not.toBeNull();
        expect(result!.times!.length).toBe(0);
        expect(result!.values.length).toBe(0);
    });
});
