// tests/Utils.test.ts
import { describe, it, expect } from 'vitest';
import { Utils } from '../src/Utils.js';
import { FilterGeometry, SensorProperties } from '../src/Types.js';

describe('Utils.isPointInPolygon', () => {
    const mockPolygon: FilterGeometry = {
        type: 'Polygon',
        coordinates: [[
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0]
        ]]
    };

    it('should return true if no geometry is provided (no filter active)', () => {
        expect(Utils.isPointInPolygon([5, 5], null)).toBe(true);
    });

    it('should return true for a point strictly inside the polygon', () => {
        expect(Utils.isPointInPolygon([5, 5], mockPolygon)).toBe(true);
    });

    it('should return false for a point strictly outside the polygon', () => {
        expect(Utils.isPointInPolygon([15, 15], mockPolygon)).toBe(false);
        expect(Utils.isPointInPolygon([-1, 5], mockPolygon)).toBe(false);
    });

    it('should handle MultiPolygon correctly', () => {
        const mockMultiPolygon: FilterGeometry = {
            type: 'MultiPolygon',
            coordinates: [
                mockPolygon.coordinates,
                [[ [20, 20], [30, 20], [30, 30], [20, 30], [20, 20] ]]
            ]
        };
        expect(Utils.isPointInPolygon([5, 5], mockMultiPolygon)).toBe(true);
        expect(Utils.isPointInPolygon([25, 25], mockMultiPolygon)).toBe(true);
        expect(Utils.isPointInPolygon([15, 15], mockMultiPolygon)).toBe(false);
    });
});

// ── getSensorId 

describe('Utils.getSensorId', () => {
    it('returns id when present', () => {
        const s: SensorProperties = { id: 'sensor-42', additional_info: {} };
        expect(Utils.getSensorId(s)).toBe('sensor-42');
    });

    it('returns numeric id coerced to its value', () => {
        const s: SensorProperties = { id: 99, additional_info: {} };
        expect(Utils.getSensorId(s)).toBe(99);
    });

    it('falls back to name when id is absent', () => {
        const s: SensorProperties = { name: 'Паркинг Опера', additional_info: {} };
        expect(Utils.getSensorId(s)).toBe('Паркинг Опера');
    });

    it('falls back to publicname when id and name are both absent', () => {
        const s: SensorProperties = { publicname: 'Camera North', additional_info: {} };
        expect(Utils.getSensorId(s)).toBe('Camera North');
    });

    it('returns "unknown" when all identity fields are absent', () => {
        const s: SensorProperties = { additional_info: {} };
        expect(Utils.getSensorId(s)).toBe('unknown');
    });

    it('prefers id over name when both are present', () => {
        const s: SensorProperties = { id: 'first', name: 'second', additional_info: {} };
        expect(Utils.getSensorId(s)).toBe('first');
    });
});

// ── formatDateToLocal

describe('Utils.formatDateToLocal', () => {
    it('formats a date to YYYY-MM-DD using local time components', () => {
        // Construct a date from local time components to avoid UTC offset issues in CI
        const d = new Date(2025, 0, 5); // Jan 5 2025 in local time
        expect(Utils.formatDateToLocal(d)).toBe('2025-01-05');
    });

    it('zero-pads single-digit month and day', () => {
        const d = new Date(2025, 2, 3); // March 3
        expect(Utils.formatDateToLocal(d)).toBe('2025-03-03');
    });

    it('handles December correctly (month index 11)', () => {
        const d = new Date(2024, 11, 31); // Dec 31
        expect(Utils.formatDateToLocal(d)).toBe('2024-12-31');
    });

    it('produces a string that sorts correctly as a date (lexicographic == chronological)', () => {
        const jan = Utils.formatDateToLocal(new Date(2025, 0, 1));
        const dec = Utils.formatDateToLocal(new Date(2025, 11, 31));
        expect(jan < dec).toBe(true);
    });
});

// ── formatDateTimeToLocal

describe('Utils.formatDateTimeToLocal', () => {
    it('accepts a Date object and formats to DD-MM-YYYY HH:MM:SS', () => {
        const d = new Date(2025, 0, 5, 9, 7, 3); // Jan 5, 09:07:03 local
        expect(Utils.formatDateTimeToLocal(d)).toBe('05-01-2025 09:07:03');
    });

    it('accepts a numeric timestamp and formats it', () => {
        const d = new Date(2025, 5, 15, 14, 30, 0); // Jun 15, 14:30:00 local
        const ts = d.getTime();
        expect(Utils.formatDateTimeToLocal(ts)).toBe('15-06-2025 14:30:00');
    });

    it('zero-pads all components', () => {
        const d = new Date(2025, 0, 1, 1, 1, 1); // 01:01:01
        const result = Utils.formatDateTimeToLocal(d);
        expect(result).toBe('01-01-2025 01:01:01');
    });
});

// ── tagDataWithStrategy 

describe('Utils.tagDataWithStrategy', () => {
    it('tags each feature in a GeoJSON FeatureCollection', () => {
        const data = {
            type: 'FeatureCollection' as const,
            features: [
                { type: 'Feature' as const, properties: { name: 'A' }, geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] } },
                { type: 'Feature' as const, properties: { name: 'B' }, geometry: { type: 'Point' as const, coordinates: [1, 1] as [number, number] } },
            ]
        };

        Utils.tagDataWithStrategy(data, 'traffic_sensor');

        data.features.forEach(f => {
            expect(f.properties.strategy).toBe('traffic_sensor');
        });
    });

    it('tags each feature in a plain GeoFeature array', () => {
        const data = [
            { type: 'Feature' as const, properties: { name: 'X' }, geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] } },
        ];

        Utils.tagDataWithStrategy(data, 'cctv');
        expect(data[0].properties.strategy).toBe('cctv');
    });

    it('generates a name for features that have no name', () => {
        const data = [
            { type: 'Feature' as const, properties: { name: '' }, geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] } },
        ];

        Utils.tagDataWithStrategy(data, 'ev_station');
        expect(data[0].properties.name).toMatch(/^ev_station_/);
    });

    it('preserves existing names', () => {
        const data = [
            { type: 'Feature' as const, properties: { name: 'Keep me' }, geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] } },
        ];

        Utils.tagDataWithStrategy(data, 'taxi_rank');
        expect(data[0].properties.name).toBe('Keep me');
    });
});

// ── getSafeId
describe('Utils.getSafeId', () => {
    it('should correctly sanitize zone names into valid HTML IDs', () => {
        // Access the private method for testing
        const safeId = Utils.getSafeId('paid-zone', 'Синя зона 10');
        expect(safeId).toBe('paid-zone-Синя-зона-10');

        const complexId = Utils.getSafeId('paid-zone', '  Green   Zone 2  ');
        expect(complexId).toBe('paid-zone-Green-Zone-2');
    });
})
