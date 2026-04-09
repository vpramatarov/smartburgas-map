// tests/BasePointStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChartDataset, FilterGeometry, GeoFeature, SensorProperties } from '../src/Types.js';
import { BasePointStrategy } from '../src/strategies/BasePointStrategy.js';

// ── Minimal Leaflet mock 

const mockLayerGroup = {
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
};

const mockGeoJsonLayer = { addTo: vi.fn() };

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    geoJSON: vi.fn(() => mockGeoJsonLayer),
    marker: vi.fn(() => ({ bindPopup: vi.fn().mockReturnThis(), on: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn(() => ({})),
});

// ── Concrete subclass for testing the abstract base 

class TestStrategy extends BasePointStrategy {
    public name = 'test_strategy';
    public checkbox_id = 'toggle-test';
    public layerOptions = { color: '#ff0000' };

    protected getApiUrl(lang: string): string { return `/api/test?lang=${lang}`; }
    protected getTimestampElementId(): string { return 'test-time'; }
    protected getIconClass(): string { return 'icon-test'; }
    renderCardContent(): void {}
    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null { return null; }
}

// Point features (the normal case — sensors with Point geometry)
const makePointFeature = (coordinates: [number, number]): GeoFeature => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties: { name: 'test-feature', strategy: 'test_strategy', additional_info: {} }
});

// Polygon covering [0,0] to [10,10]
const insidePolygon: FilterGeometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
};

// ── applyRegionFilter

describe('BasePointStrategy.applyRegionFilter', () => {
    let strategy: TestStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TestStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('clears the layer before re-rendering', () => {
        strategy.applyRegionFilter(null);
        expect(mockLayerGroup.clearLayers).toHaveBeenCalled();
    });

    it('passes all features through when filterGeometry is null (no filter active)', () => {
        (strategy as any).cachedData = [
            makePointFeature([5, 5]),
            makePointFeature([3, 3]),
        ];
        strategy.applyRegionFilter(null);
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(2);
    });

    it('filters out Point features whose coordinates fall outside the polygon', () => {
        (strategy as any).cachedData = [
            makePointFeature([5, 5]),   // inside [0,0]→[10,10]
            makePointFeature([15, 15]), // outside
            makePointFeature([2, 2]),   // inside
        ];
        strategy.applyRegionFilter(insidePolygon);
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(2);
        called.forEach(f => {
            const coords = f.geometry.coordinates as number[];
            expect(coords[0]).toBeLessThanOrEqual(10);
        });
    });

    it('filters out all features when none fall inside the polygon', () => {
        (strategy as any).cachedData = [
            makePointFeature([20, 20]),
            makePointFeature([50, 50]),
        ];
        strategy.applyRegionFilter(insidePolygon);
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(0);
    });

    it('excludes features with missing geometry', () => {
        const badFeature = {
            type: 'Feature' as const,
            geometry: null as any,
            properties: { name: 'bad', additional_info: {} }
        };
        (strategy as any).cachedData = [badFeature, makePointFeature([5, 5])];
        strategy.applyRegionFilter(insidePolygon);
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(1);
        expect(called[0].properties.name).toBe('test-feature');
    });

    it('excludes features with geometry but no coordinates', () => {
        const noCoords = {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: undefined as any },
            properties: { name: 'nocoords', additional_info: {} }
        };
        (strategy as any).cachedData = [noCoords, makePointFeature([5, 5])];
        strategy.applyRegionFilter(insidePolygon);
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(1);
    });

    it('handles an empty cachedData array without errors', () => {
        (strategy as any).cachedData = [];
        expect(() => strategy.applyRegionFilter(insidePolygon)).not.toThrow();
        const called = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        expect(called).toHaveLength(0);
    });

    it('applies the filter independently on successive calls', () => {
        (strategy as any).cachedData = [makePointFeature([5, 5]), makePointFeature([20, 20])];
        strategy.applyRegionFilter(insidePolygon);
        strategy.applyRegionFilter(insidePolygon);
        // clearLayers called once per applyRegionFilter
        expect(mockLayerGroup.clearLayers).toHaveBeenCalledTimes(2);
        const first = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        const second = vi.mocked(L.geoJSON).mock.calls[1][0] as GeoFeature[];
        expect(first).toHaveLength(1);
        expect(second).toHaveLength(1);
    });
});

// ── buildMarkerHtml

describe('BasePointStrategy.buildMarkerHtml', () => {
    let strategy: TestStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TestStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('includes the strategy color in the marker HTML', () => {
        const html = (strategy as any).buildMarkerHtml(makePointFeature([5, 5]));
        expect(html).toContain('#ff0000');
    });

    it('includes the icon class in the marker HTML', () => {
        const html = (strategy as any).buildMarkerHtml(makePointFeature([5, 5]));
        expect(html).toContain('icon-test');
    });
});

// ── Clustering

describe('BasePointStrategy.initialize — clustering', () => {
    let strategy: TestStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TestStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('creates a MarkerClusterGroup instead of a plain LayerGroup', () => {
        expect(L.markerClusterGroup).toHaveBeenCalledOnce();
        expect(L.layerGroup).not.toHaveBeenCalled();
    });

    it('passes a custom iconCreateFunction that uses the strategy color', () => {
        const options = vi.mocked(L.markerClusterGroup).mock.calls[0][0] as any;
        expect(options).toBeDefined();
        expect(typeof options.iconCreateFunction).toBe('function');

        // Simulate calling the iconCreateFunction with a mock cluster
        const mockCluster = { getChildCount: () => 5 };
        options.iconCreateFunction(mockCluster);

        // The divIcon should include the strategy's color (#ff0000)
        const divIconCall = vi.mocked(L.divIcon).mock.calls.at(-1)![0] as any;
        expect(divIconCall.html).toContain('#ff0000');
    });

    it('returns the cluster group from getLayer()', () => {
        expect(strategy.getLayer()).toBe(mockLayerGroup);
    });
});
