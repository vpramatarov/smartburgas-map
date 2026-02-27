// tests/Utils.test.ts
import { describe, it, expect } from 'vitest';
import { Utils } from '../src/Utils.js';
import { FilterGeometry } from '../src/Types.js';

describe('Utils.isPointInPolygon', () => {
    // A simple square polygon from [0,0] to [10,10]
    const mockPolygon: FilterGeometry = {
        type: 'Polygon',
        coordinates: [[
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0] // Closes the ring
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
                mockPolygon.coordinates, // The [0,10] square
                [[ [20, 20], [30, 20], [30, 30], [20, 30], [20, 20] ]] // A [20,30] square
            ]
        };

        expect(Utils.isPointInPolygon([5, 5], mockMultiPolygon)).toBe(true); // Inside polygon 1
        expect(Utils.isPointInPolygon([25, 25], mockMultiPolygon)).toBe(true); // Inside polygon 2
        expect(Utils.isPointInPolygon([15, 15], mockMultiPolygon)).toBe(false); // In the gap
    });
});