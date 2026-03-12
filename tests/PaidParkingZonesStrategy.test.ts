// tests/PaidParkingZonesStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaidParkingZonesStrategy } from '../src/strategies/PaidParkingZonesStrategy.js';

// Mock the global Leaflet (L) library
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({
        addTo: vi.fn(),
        clearLayers: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn()
    })),
    geoJSON: vi.fn(() => ({
        resetStyle: vi.fn()
    }))
});

// Mock the Browser DOM
vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerHTML: '', appendChild: vi.fn() }),
    createElement: vi.fn((tag) => {
        return { className: '', appendChild: vi.fn(), addEventListener: vi.fn(), style: {} };
    })
});

describe('PaidParkingZonesStrategy Core Logic', () => {
    let strategy: PaidParkingZonesStrategy;
    let mockOnFilterChange: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnFilterChange = vi.fn();
        strategy = new PaidParkingZonesStrategy(mockOnFilterChange);

        // Initialize the mocked layer
        strategy.initialize({}, vi.fn());
    });

    it('should correctly sanitize zone names into valid HTML IDs', () => {
        // Access the private method for testing
        const safeId = (strategy as any).getSafeId('Синя зона 10');
        expect(safeId).toBe('paid-zone-Синя-зона-10');

        const complexId = (strategy as any).getSafeId('  Green   Zone 2  ');
        expect(complexId).toBe('paid-zone--Green-Zone-2-');
    });

    it('should bypass the region filter if the geometry matches one of its own zones (Self-Filter Guard)', () => {
        const mockSelfGeometry = { type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] };

        // Mock the internal cached data so it knows about this geometry
        (strategy as any).cachedData = [
            { properties: { Name: 'Test Zone' }, geometry: mockSelfGeometry }
        ];

        const layerMock = (strategy as any).layer;

        // Try to filter the map using the zone's OWN geometry
        strategy.applyRegionFilter(mockSelfGeometry as any);

        // It should hit the self-filter guard and return immediately, completely skipping the clearLayers() wipe.
        expect(layerMock.clearLayers).not.toHaveBeenCalled();
    });

    it('should execute the region filter if a valid, foreign Administrative Region geometry is passed', () => {
        const mockAdminGeometry = { type: 'Polygon', coordinates: [[[9, 9], [10, 10]]] };

        // Cached data has a different geometry
        (strategy as any).cachedData = [
            { properties: { Name: 'Test Zone' }, geometry: { type: 'Polygon', coordinates: [[[1, 2], [3, 4]]] } }
        ];

        const layerMock = (strategy as any).layer;

        // Filter the map using an external geometry
        strategy.applyRegionFilter(mockAdminGeometry as any);

        // It bypassed the guard and cleared the layers to prepare for re-rendering
        expect(layerMock.clearLayers).toHaveBeenCalled();
    });
});