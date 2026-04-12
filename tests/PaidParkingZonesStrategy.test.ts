// tests/PaidParkingZonesStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaidParkingZonesStrategy } from '../src/strategies/PaidParkingZonesStrategy.js';

// Mock the global Leaflet (L) library
// The geoJSON mock invokes onEachFeature for every feature (like real Leaflet)
// so featureMap gets populated and selectRegionByPoint can work.
const createdLayers: Map<string, any> = new Map();

function makeLayerMock(feature: any) {
    const handlers: Record<string, (() => void)[]> = {};
    return {
        setStyle: vi.fn(),
        bindTooltip: vi.fn(),
        unbindTooltip: vi.fn(),
        closeTooltip: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        }),
        fire: (event: string) => { (handlers[event] || []).forEach(h => h()); },
        feature,
    };
}

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({
        addTo: vi.fn(),
        clearLayers: vi.fn(),
        addLayer: vi.fn(),
        removeLayer: vi.fn()
    })),
    geoJSON: vi.fn((data: any, options: any) => {
        const features = Array.isArray(data) ? data : (data?.features ?? []);
        features.forEach((feature: any) => {
            if (options?.onEachFeature) {
                const layer = makeLayerMock(feature);
                const name = feature?.properties?.NameEn || feature?.properties?.Name || 'unknown';
                createdLayers.set(name, layer);
                options.onEachFeature(feature, layer);
            }
        });
        return { resetStyle: vi.fn() };
    }),
    popup: vi.fn(() => ({
        setLatLng: vi.fn().mockReturnThis(),
        setContent: vi.fn().mockReturnThis(),
        openOn: vi.fn().mockReturnThis(),
        remove: vi.fn(),
    })),
    latLng: vi.fn(() => ({})),
    DomEvent: { stopPropagation: vi.fn() },
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

// Mock the Browser DOM
vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerHTML: '', appendChild: vi.fn() }),
    createElement: vi.fn((tag) => {
        return { className: '', appendChild: vi.fn(), addEventListener: vi.fn(), style: {}, type: '', id: '', value: '', htmlFor: '', innerText: '', checked: false };
    }),
    querySelectorAll: vi.fn(() => []),
});

vi.stubGlobal('window', { innerWidth: 1200 });

describe('PaidParkingZonesStrategy Core Logic', () => {
    let strategy: PaidParkingZonesStrategy;
    let mockOnFilterChange: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnFilterChange = vi.fn();
        strategy = new PaidParkingZonesStrategy(mockOnFilterChange);

        // Initialize the mocked layer
        strategy.initialize({ on: vi.fn() } as any, vi.fn());
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

describe('PaidParkingZonesStrategy — filter persistence', () => {
    let strategy: PaidParkingZonesStrategy;
    let mockOnFilterChange: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockOnFilterChange = vi.fn();
        strategy = new PaidParkingZonesStrategy(mockOnFilterChange);
        strategy.initialize({ on: vi.fn() } as any, vi.fn());
    });

    it('re-applies the stored admin region filter after loadData', async () => {
        const adminGeometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };

        // Set cached data with a zone that has a DIFFERENT geometry (not the admin one)
        (strategy as any).cachedData = [
            { properties: { Name: 'Zone A' }, geometry: { type: 'Polygon', coordinates: [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]] } }
        ];

        // Apply admin region filter — this should be remembered
        strategy.applyRegionFilter(adminGeometry as any);

        const layerMock = (strategy as any).layer;
        layerMock.clearLayers.mockClear();

        // Mock fetch for loadData
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                features: [
                    { properties: { Name: 'Zone Inside' }, geometry: { type: 'Polygon', coordinates: [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]] } },
                    { properties: { Name: 'Zone Outside' }, geometry: { type: 'Polygon', coordinates: [[[50, 50], [51, 50], [51, 51], [50, 51], [50, 50]]] } }
                ]
            })
        }));

        await strategy.loadData('bg');

        // applyRegionFilter should have been called with the admin geometry, not null
        // This means clearLayers should have been called (filter was applied, not bypassed)
        expect(layerMock.clearLayers).toHaveBeenCalled();

        // Verify L.geoJSON was called with only the filtered zone (inside admin region)
        const lastCall = vi.mocked(L.geoJSON).mock.calls;
        const rendered = lastCall[lastCall.length - 1][0] as any[];
        expect(rendered).toHaveLength(1);
        expect(rendered[0].properties.Name).toBe('Zone Inside');
    });

    it('preserves zone selection after loadData reload (language change)', async () => {
        const zoneGeometry = { type: 'Polygon', coordinates: [[[3, 3], [7, 3], [7, 7], [3, 7], [3, 3]]] };
        const bgFeature = { type: 'Feature', properties: { Name: 'Синя зона 1', NameEn: 'Blue zone 1' }, geometry: zoneGeometry };

        // Simulate: data loaded in BG, zone selected
        (strategy as any).cachedData = [bgFeature];
        (strategy as any).currentSelection = {
            name: 'Синя зона 1',
            layer: { feature: bgFeature, setStyle: vi.fn(), unbindTooltip: vi.fn() }
        };

        createdLayers.clear();

        // Mock fetch returning the same feature for EN reload
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ features: [bgFeature] })
        }));

        // Reload in EN — the display name changes to 'Blue zone 1'
        await strategy.loadData('en');

        // The selection should have been re-applied using Name-based lookup
        const selection = (strategy as any).currentSelection;
        expect(selection).not.toBeNull();
        // The display name should now be the EN name
        expect(selection?.name).toBe('Blue zone 1');
    });

    it('does not store self-geometry as the filter (guard preserves previous filter)', () => {
        const adminGeometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] };
        const selfGeometry = { type: 'Polygon', coordinates: [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]] };

        // Set cached data containing a zone with selfGeometry
        (strategy as any).cachedData = [
            { properties: { Name: 'Zone A' }, geometry: selfGeometry }
        ];

        // Apply admin filter first — this should be stored
        strategy.applyRegionFilter(adminGeometry as any);

        // Now try to apply the zone's own geometry — self-filter guard should block it
        strategy.applyRegionFilter(selfGeometry as any);

        // The stored filter should still be the admin geometry, NOT the self geometry
        expect((strategy as any).currentFilterGeometry).toBe(adminGeometry);
    });
});