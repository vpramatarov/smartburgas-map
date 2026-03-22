// tests/TrafficSensorStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TrafficSensorStrategy } from '../src/strategies/TrafficSensorStrategy.js';

// ── Minimal mocks 

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({
        addTo: vi.fn(),
        clearLayers: vi.fn(),
    })),
});

// Capture what gets written to the timestamp element
const mockTimestampEl = { innerText: '' };
vi.stubGlobal('document', {
    getElementById: vi.fn((id: string) => {
        if (id === 'traffic-time') return mockTimestampEl;
        return null;
    }),
    createElement: vi.fn(() => ({
        className: '',
        innerHTML: '',
        appendChild: vi.fn(),
        querySelectorAll: vi.fn(() => []),
    })),
});

// ── Helpers 

function makeStrategy() {
    const strategy = new TrafficSensorStrategy();
    strategy.initialize({} as any, vi.fn());
    return strategy;
}

/** Calls the private resolveDateParams via casting */
function resolve(strategy: TrafficSensorStrategy, opts?: { start_date?: string; end_date?: string }) {
    return (strategy as any).resolveDateParams(opts);
}

// ── Date validation 

describe('TrafficSensorStrategy.resolveDateParams', () => {
    let strategy: TrafficSensorStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = makeStrategy();
    });

    it('returns valid start/end when no options are provided (defaults to last month → today)', () => {
        const result = resolve(strategy);
        expect(result.error).toBeUndefined();
        expect(result.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(result.start! < result.end!).toBe(true);
    });

    it('returns valid start/end for an explicit 7-day range', () => {
        const result = resolve(strategy, { start_date: '2025-01-01', end_date: '2025-01-10' });
        expect(result.error).toBeUndefined();
        expect(result.start).toBe('2025-01-01');
        expect(result.end).toBe('2025-01-10');
    });

    it('returns an error for an invalid date string', () => {
        const result = resolve(strategy, { start_date: 'not-a-date', end_date: '2025-01-10' });
        expect(result.error).toBeDefined();
        expect(result.start).toBeUndefined();
    });

    it('returns an error when the range is less than 2 days', () => {
        const result = resolve(strategy, { start_date: '2025-01-01', end_date: '2025-01-01' });
        expect(result.error).toBeDefined();
    });

    it('returns an error when the range exceeds 6 months (~180 days)', () => {
        const result = resolve(strategy, { start_date: '2024-01-01', end_date: '2024-09-01' });
        expect(result.error).toBeDefined();
    });

    it('returns an error when start is after end', () => {
        const result = resolve(strategy, { start_date: '2025-06-01', end_date: '2025-01-01' });
        expect(result.error).toBeDefined();
    });

    it('accepts exactly 6 months (boundary)', () => {
        const result = resolve(strategy, { start_date: '2025-01-01', end_date: '2025-07-01' });
        // 181 days — should fail (just over the 6-month limit)
        expect(result.error).toBeDefined();
    });

    it('accepts a 5-month range (well within limit)', () => {
        const result = resolve(strategy, { start_date: '2025-01-01', end_date: '2025-06-01' });
        expect(result.error).toBeUndefined();
    });
});

// ── Error surfacing (no alert, uses timestamp UI) 

describe('TrafficSensorStrategy.loadData error handling', () => {
    it('writes the validation error to the timestamp element instead of calling alert()', async () => {
        const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});
        const strategy = makeStrategy();

        await strategy.loadData('bg', { start_date: 'bad-date', end_date: '2025-01-10' });

        expect(alertSpy).not.toHaveBeenCalled();
        expect(mockTimestampEl.innerText).toContain('⚠');
    });
});

// ── Date parsing

describe('TrafficSensorStrategy.parseTrafficDate', () => {
    let strategy: TrafficSensorStrategy;

    beforeEach(() => {
        strategy = makeStrategy();
    });

    function parse(raw: string): number {
        return (strategy as any).parseTrafficDate(raw);
    }

    it('returns 0 for an empty string', () => {
        expect(parse('')).toBe(0);
    });

    it('parses a standard ISO string', () => {
        const result = parse('2025-03-15T10:30:00');
        expect(result).toBeGreaterThan(0);
        expect(new Date(result).getFullYear()).toBe(2025);
    });

    it('parses the underscore-separated upstream format (DD_MM_YYYY HH:MM)', () => {
        // Upstream traffic API returns dates like "15_03_2025 10:30"
        const result = parse('15.03.2025 10:30');
        expect(result).toBeGreaterThan(0);
        const d = new Date(result);
        expect(d.getFullYear()).toBe(2025);
        expect(d.getMonth()).toBe(2); // 0-indexed March
        expect(d.getDate()).toBe(15);
    });

    it('returns 0 for a completely unparseable string', () => {
        expect(parse('not a date at all')).toBe(0);
    });
});

// ── getChartData

describe('TrafficSensorStrategy.getChartData', () => {
    let strategy: TrafficSensorStrategy;

    beforeEach(() => {
        strategy = makeStrategy();
    });

    const mockSensor = {
        name: 'Test sensor',
        strategy: 'traffic_sensor',
        additional_info: {},
        data: [
            { time: '2025-01-03T10:00:00', car_count: '50', car_speed: '40' },
            { time: '2025-01-01T08:00:00', car_count: '30', car_speed: '60' },
            { time: '2025-01-02T09:00:00', car_count: '20', car_speed: '80' },
        ]
    };

    it('returns null for an unsupported property', () => {
        expect(strategy.getChartData(mockSensor, 'unknown_property')).toBeNull();
    });

    it('returns null when sensor has no data', () => {
        expect(strategy.getChartData({ ...mockSensor, data: [] }, 'car_count')).toBeNull();
    });

    it('returns sorted data points for car_count', () => {
        const result = strategy.getChartData(mockSensor, 'car_count');
        expect(result).not.toBeNull();
        expect(result!.values).toEqual([30, 20, 50]); // sorted by timestamp ascending
        expect(result!.times).toHaveLength(3);
        expect(result!.unit).toBe('коли'); // Bulgarian default
    });

    it('returns sorted data points for car_speed', () => {
        const result = strategy.getChartData(mockSensor, 'car_speed');
        expect(result).not.toBeNull();
        expect(result!.values).toEqual([60, 80, 40]); // sorted ascending by time
    });

    it('data points are sorted chronologically (oldest first)', () => {
        const result = strategy.getChartData(mockSensor, 'car_count');
        const times = result!.times!.map(t => new Date(t).getTime());
        for (let i = 1; i < times.length; i++) {
            expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
        }
    });
});
