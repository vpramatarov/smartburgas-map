// tests/BasePointStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChartDataset, FilterGeometry, GeoFeature, SensorProperties } from '../src/Types.js';
import { BasePointStrategy } from '../src/strategies/BasePointStrategy.js';

// ── Minimal Leaflet mock ──────────────────────────────────────────────────────

const mockLayerGroup = {
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
};

const mockGeoJsonLayer = { addTo: vi.fn() };

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
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

// ── Concrete subclass for testing the abstract base ───────────────────────────

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

// Polygon covering coordinates [0,0] to [10,10]
const insidePolygon: FilterGeometry = {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]
};

function makeFeature(coordinates: [number, number]): GeoFeature {
    return {
        type: 'Feature',
        geometry: { type: 'Point', coordinates },
        properties: { name: 'test-feature', strategy: 'test_strategy', additional_info: {} }
    };
}

// ── applyRegionFilter ─────────────────────────────────────────────────────────

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
            makeFeature([5, 5]),
            makeFeature([3, 3]),
        ];

        strategy.applyRegionFilter(null);

        // L.geoJSON should be called with both features
        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(2);
    });

    it('filters out features whose coordinates fall outside the polygon', () => {
        (strategy as any).cachedData = [
            makeFeature([5, 5]),   // inside [0,0]→[10,10]
            makeFeature([15, 15]), // outside
            makeFeature([2, 2]),   // inside
        ];

        strategy.applyRegionFilter(insidePolygon);

        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(2);
        expect(calledWithFeatures.every(f =>
            (f.geometry.coordinates as number[])[0] <= 10
        )).toBe(true);
    });

    it('filters out all features when none fall inside the polygon', () => {
        (strategy as any).cachedData = [
            makeFeature([20, 20]),
            makeFeature([50, 50]),
        ];

        strategy.applyRegionFilter(insidePolygon);

        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(0);
    });

    it('excludes features with missing geometry', () => {
        const badFeature = {
            type: 'Feature' as const,
            geometry: null as any,
            properties: { name: 'bad', additional_info: {} }
        };

        (strategy as any).cachedData = [badFeature, makeFeature([5, 5])];

        strategy.applyRegionFilter(insidePolygon);

        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(1);
        expect(calledWithFeatures[0].properties.name).toBe('test-feature');
    });

    it('excludes features with geometry but no coordinates', () => {
        const noCoords = {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: undefined as any },
            properties: { name: 'nocoords', additional_info: {} }
        };

        (strategy as any).cachedData = [noCoords, makeFeature([5, 5])];

        strategy.applyRegionFilter(insidePolygon);

        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(1);
    });

    it('handles an empty cachedData array without errors', () => {
        (strategy as any).cachedData = [];
        expect(() => strategy.applyRegionFilter(insidePolygon)).not.toThrow();

        const calledWithFeatures = (vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[]);
        expect(calledWithFeatures).toHaveLength(0);
    });

    it('calls applyRegionFilter with the same geometry after a second filter change', () => {
        (strategy as any).cachedData = [makeFeature([5, 5]), makeFeature([20, 20])];

        strategy.applyRegionFilter(insidePolygon);
        strategy.applyRegionFilter(insidePolygon);

        // clearLayers should have been called once per applyRegionFilter call
        expect(mockLayerGroup.clearLayers).toHaveBeenCalledTimes(2);
        // Both times only 1 feature should have passed
        const firstCall = vi.mocked(L.geoJSON).mock.calls[0][0] as GeoFeature[];
        const secondCall = vi.mocked(L.geoJSON).mock.calls[1][0] as GeoFeature[];
        expect(firstCall).toHaveLength(1);
        expect(secondCall).toHaveLength(1);
    });
});

// ── buildMarkerHtml (default implementation) ──────────────────────────────────

describe('BasePointStrategy.buildMarkerHtml', () => {
    let strategy: TestStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TestStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('includes the strategy color in the marker HTML', () => {
        const feature = makeFeature([5, 5]);
        const html = (strategy as any).buildMarkerHtml(feature);
        expect(html).toContain('#ff0000');
    });

    it('includes the icon class in the marker HTML', () => {
        const feature = makeFeature([5, 5]);
        const html = (strategy as any).buildMarkerHtml(feature);
        expect(html).toContain('icon-test');
    });
});
