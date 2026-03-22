// tests/AdministrativeRegionStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdministrativeRegionStrategy } from '../src/strategies/AdministrativeRegionStrategy.js';
import { FilterGeometry, GeoFeature } from '../src/Types.js';

// ── Leaflet mock

// The geoJSON mock behaves like real Leaflet: it calls onEachFeature for every feature in the data, passing the feature and a fresh layer mock each time.
// This keeps featureMap populated automatically — no manual invocation needed.
// We also store the last-created layer per feature name so tests can fire events.
const createdLayers: Map<string, ReturnType<typeof makeLayerMock>> = new Map();

const mockGeoJsonLayer = {
    addTo: vi.fn(),
    resetStyle: vi.fn(),
};

const mockLayerGroup = {
    addTo: vi.fn(),
    clearLayers: vi.fn(),
    addLayer: vi.fn(),
};

vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    geoJSON: vi.fn((data: any, options: any) => {
        // Invoke onEachFeature for each feature, exactly as Leaflet does
        const features = data?.features ?? (Array.isArray(data) ? data : []);
        features.forEach((feature: any) => {
            if (options?.onEachFeature) {
                const layer = makeLayerMock();
                const name = feature?.properties?.CAU ?? 'unknown';
                createdLayers.set(name, layer);
                options.onEachFeature(feature, layer);
            }
        });
        return mockGeoJsonLayer;
    }),
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

// ── DOM mock

const mockCheckbox = { checked: false };
const mockContainer = { innerHTML: '', appendChild: vi.fn() };

vi.stubGlobal('document', {
    getElementById: vi.fn((id: string) => {
        if (id === 'region-filters-wrapper') return mockContainer;
        if (id.startsWith('region-')) return mockCheckbox;
        return null;
    }),
    createElement: vi.fn((tag: string) => {
        if (tag === 'input') return { type: '', id: '', value: '', addEventListener: vi.fn(), checked: false };
        if (tag === 'label') return { htmlFor: '', innerText: '' };
        return { className: '', appendChild: vi.fn() };
    }),
});

// ── Fixtures

const regionGeometry: FilterGeometry = {
    type: 'Polygon',
    coordinates: [[[27.40, 42.45], [27.55, 42.45], [27.55, 42.56], [27.40, 42.56], [27.40, 42.45]]]
};

const mockGeoJsonFeature = {
    type: 'Feature',
    geometry: regionGeometry,
    properties: { CAU: 'Бургас', Name: 'Бургас' }
};

/** Creates a mock Leaflet layer with event support, mimicking what L.geoJSON creates per feature. */
function makeLayerMock() {
    const handlers: Record<string, (() => void)[]> = {};
    return {
        setStyle: vi.fn(),
        bindTooltip: vi.fn(),
        on: vi.fn((event: string, handler: () => void) => {
            handlers[event] = handlers[event] || [];
            handlers[event].push(handler);
        }),
        fire: (event: string) => {
            (handlers[event] || []).forEach(h => h());
        },
        feature: mockGeoJsonFeature, // Leaflet attaches the original GeoJSON feature here
    };
}

// ── Helpers 

function makeStrategy() {
    const onFilterChange = vi.fn();
    const strategy = new AdministrativeRegionStrategy(onFilterChange);
    strategy.initialize({} as any, vi.fn());
    return { strategy, onFilterChange };
}

/** Simulates loadData completing with one region feature.
 *  The L.geoJSON mock automatically calls onEachFeature for each feature,
 *  so featureMap is populated and createdLayers is updated.
 *  Returns the layer mock for 'Бургас' so tests can fire events on it.
 */
async function loadWithOneRegion(strategy: AdministrativeRegionStrategy) {
    createdLayers.clear();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ features: [mockGeoJsonFeature] })
    }));
    await strategy.loadData('bg');
    return createdLayers.get('Бургас')!;
}

// ── Map click: the regression test 

describe('AdministrativeRegionStrategy — map click triggers filter with correct geometry', () => {
    let strategy: AdministrativeRegionStrategy;
    let onFilterChange: ReturnType<typeof vi.fn>;
    let layerMock: ReturnType<typeof makeLayerMock>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockCheckbox.checked = false;
        mockContainer.innerHTML = '';
        ({ strategy, onFilterChange } = makeStrategy());
        // loadWithOneRegion returns the layer mock created by onEachFeature,
        // so each test can fire click events on it directly.
        layerMock = await loadWithOneRegion(strategy);
    });

    it('clicking a map region calls onFilterChange with the feature geometry (not undefined)', () => {
        layerMock.fire('click');

        expect(onFilterChange).toHaveBeenCalledOnce();
        const [passedGeometry, passedStrategy] = onFilterChange.mock.calls[0];

        // Regression assertion: before the fix, passedGeometry was undefined because
        // the handler used props.geometry instead of feature.geometry.
        expect(passedGeometry).toBeDefined();
        expect(passedGeometry.type).toBe('Polygon');
        expect(passedGeometry.coordinates).toEqual(regionGeometry.coordinates);
        expect(passedStrategy).toBe(strategy);
    });

    it('clicking a map region passes the same geometry object as was on the GeoJSON feature', () => {
        layerMock.fire('click');

        const passedGeometry = onFilterChange.mock.calls[0][0];
        // Strict identity — it must be the actual feature geometry, not a copy or undefined
        expect(passedGeometry).toBe(mockGeoJsonFeature.geometry);
    });
});

// ── Sidebar checkbox: existing path (still works)

describe('AdministrativeRegionStrategy — sidebar checkbox triggers filter', () => {
    let strategy: AdministrativeRegionStrategy;
    let onFilterChange: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockCheckbox.checked = false;
        ({ strategy, onFilterChange } = makeStrategy());
        await loadWithOneRegion(strategy);
    });

    it('calling selectRegionByPoint triggers onFilterChange with the region geometry', () => {
        // A point inside the mock region polygon
        const pointInside: [number, number] = [27.48, 42.50];
        strategy.selectRegionByPoint(pointInside);

        expect(onFilterChange).toHaveBeenCalledOnce();
        const [passedGeometry] = onFilterChange.mock.calls[0];
        expect(passedGeometry).toBeDefined();
        expect(passedGeometry.type).toBe('Polygon');
    });

    it('calling selectRegionByPoint with a point outside all regions clears the selection', () => {
        const pointOutside: [number, number] = [0, 0];
        strategy.selectRegionByPoint(pointOutside);

        expect(onFilterChange).toHaveBeenCalledOnce();
        // clearSelection calls onFilterChange(null, this)
        expect(onFilterChange.mock.calls[0][0]).toBeNull();
    });
});

// ── selectRegion / clearSelection behaviour

describe('AdministrativeRegionStrategy — selection state management', () => {
    let strategy: AdministrativeRegionStrategy;
    let onFilterChange: ReturnType<typeof vi.fn>;
    let layerMock: ReturnType<typeof makeLayerMock>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockCheckbox.checked = false;
        ({ strategy, onFilterChange } = makeStrategy());
        layerMock = await loadWithOneRegion(strategy);
    });

    it('highlights the clicked layer with the selection style', () => {
        layerMock.fire('click');

        const styleCall = layerMock.setStyle.mock.calls[0][0];
        expect(styleCall.color).toBe('#e74c3c');
        expect(styleCall.weight).toBe(3);
    });

    it('checks the corresponding sidebar checkbox when a map region is clicked', () => {
        layerMock.fire('click');

        expect(mockCheckbox.checked).toBe(true);
    });

    it('does not call onFilterChange again when the same region is clicked twice', () => {
        layerMock.fire('click'); // first click — selects
        layerMock.fire('click'); // second click — selectRegion guard: same name, returns early

        expect(onFilterChange).toHaveBeenCalledOnce();
    });

    it('clears the previous selection style when a different region is selected', async () => {
        const secondGeometry: FilterGeometry = {
            type: 'Polygon',
            coordinates: [[[27.38, 42.43], [27.42, 42.43], [27.42, 42.48], [27.38, 42.48], [27.38, 42.43]]]
        };
        const secondFeature = {
            type: 'Feature',
            geometry: secondGeometry,
            properties: { CAU: 'Меден Рудник', Name: 'Меден Рудник' }
        };

        // Reload with two features — the geoJSON mock will call onEachFeature for both
        createdLayers.clear();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ features: [mockGeoJsonFeature, secondFeature] })
        }));
        await strategy.loadData('bg');

        const firstLayer = createdLayers.get('Бургас')!;
        const secondLayer = createdLayers.get('Меден Рудник')!;

        firstLayer.fire('click');  // select first region
        secondLayer.fire('click'); // select second region

        // First layer should have been reset to default style
        const resetStyle = firstLayer.setStyle.mock.calls[1][0];
        expect(resetStyle.color).toBe('#3498db'); // layerOptions.color
        expect(resetStyle.weight).toBe(1);

        // onFilterChange called twice — once per region
        expect(onFilterChange).toHaveBeenCalledTimes(2);

        // Second call passes the second geometry
        expect(onFilterChange.mock.calls[1][0]).toBe(secondGeometry);
    });

    it('clearSelection calls onFilterChange with null', () => {
        layerMock.fire('click'); // select the region first

        onFilterChange.mockClear();
        strategy.clearSelection();

        expect(onFilterChange).toHaveBeenCalledOnce();
        expect(onFilterChange.mock.calls[0][0]).toBeNull();
    });

    it('clearSelection with triggerFilter=false does not call onFilterChange', () => {
        layerMock.fire('click');

        onFilterChange.mockClear();
        strategy.clearSelection(false);

        expect(onFilterChange).not.toHaveBeenCalled();
    });
});

// ── loadData error handling 

describe('AdministrativeRegionStrategy — loadData', () => {
    it('does not throw when the API returns a non-ok response', async () => {
        vi.clearAllMocks();
        const { strategy } = makeStrategy();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
        await expect(strategy.loadData('bg')).resolves.not.toThrow();
    });

    it('caches the features from the API response', async () => {
        vi.clearAllMocks();
        const { strategy } = makeStrategy();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ features: [mockGeoJsonFeature] })
        }));
        await strategy.loadData('bg');

        const cached = (strategy as any).cachedData as GeoFeature[];
        expect(cached).toHaveLength(1);
        expect(cached[0].properties.CAU).toBe('Бургас');
    });
});
