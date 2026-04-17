// tests/TaxiRankStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxiRankStrategy } from '../src/strategies/TaxiRankStrategy.js';
import { GeoFeature, SensorProperties } from '../src/Types.js';

const mockLayerGroup = { addTo: vi.fn(), clearLayers: vi.fn() };
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn(() => ({
        className: '', style: {}, innerHTML: '', src: '', alt: '',
        appendChild: vi.fn(),
        onerror: null as (() => void) | null,
    })),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return { name: 'Taxi Rank A', strategy: 'taxi_rank', additional_info: {}, ...overrides };
}

const dummyFeature: GeoFeature = {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [27.47, 42.50] },
    properties: { name: 'Taxi A', strategy: 'taxi_rank', additional_info: {} },
};

describe('TaxiRankStrategy', () => {
    let strategy: TaxiRankStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TaxiRankStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('has correct identity fields', () => {
        expect(strategy.name).toBe('taxi_rank');
        expect(strategy.checkbox_id).toBe('toggle-taxi');
        expect(strategy.layerOptions.color).toBe('#f1c40f');
        expect(strategy.getIconClass()).toBe('icon-taxi-sign_76588');
    });

    it('getChartData always returns null', () => {
        expect(strategy.getChartData(makeSensor(), 'anything')).toBeNull();
    });
});

// ── buildMarkerHtml

describe('TaxiRankStrategy.buildMarkerHtml', () => {
    let strategy: TaxiRankStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TaxiRankStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('includes the strategy color in the marker', () => {
        const html = (strategy as any).buildMarkerHtml(dummyFeature);
        expect(html).toContain('#f1c40f');
    });

    it('uses dark text color for contrast on the yellow background', () => {
        const html = (strategy as any).buildMarkerHtml(dummyFeature);
        expect(html).toContain('dark-text');
    });

    it('includes the taxi icon class', () => {
        const html = (strategy as any).buildMarkerHtml(dummyFeature);
        expect(html).toContain('icon-taxi-sign_76588');
    });
});

// ── renderCardContent

describe('TaxiRankStrategy.renderCardContent', () => {
    let strategy: TaxiRankStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new TaxiRankStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('appends image when pic_url is present', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ pic_url: 'http://img/taxi.jpg', name: 'Rank B' }), '', vi.fn());
        const img = container.appendChild.mock.calls[0][0];
        expect(img.src).toBe('http://img/taxi.jpg');
        expect(img.alt).toBe('Rank B');
    });

    it('image onerror hides the image', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ pic_url: 'http://broken' }), '', vi.fn());
        const img = container.appendChild.mock.calls[0][0];
        img.onerror!();
        expect(img.style.display).toBe('none');
    });

    it('appends description as text (not HTML) to prevent XSS', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ description: 'Central taxi stand' }));
        const desc = container.appendChild.mock.calls[0][0];
        expect(desc.textContent).toBe('Central taxi stand');
        expect(desc.innerHTML).toBe('');
        expect(desc.style.fontWeight).toBe('bold');
    });

    it('does not render malicious description as executable HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<script>alert(1)</script>';
        strategy.renderCardContent(container, makeSensor({ description: malicious }));
        const desc = container.appendChild.mock.calls[0][0];
        expect(desc.innerHTML).toBe('');
        expect(desc.textContent).toBe(malicious);
    });

    it('appends name as location text (not HTML) to prevent XSS', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ name: 'Main Station' }));
        const loc = container.appendChild.mock.calls[0][0];
        expect(loc.textContent).toBe('Main Station');
        expect(loc.innerHTML).toBe('');
    });

    it('does not render malicious name as executable HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<img src=x onerror=alert(1)>';
        strategy.renderCardContent(container, makeSensor({ name: malicious }));
        const loc = container.appendChild.mock.calls[0][0];
        expect(loc.innerHTML).toBe('');
        expect(loc.textContent).toBe(malicious);
    });

    it('renders nothing for a sensor with no pic_url, description, or name', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ name: undefined, description: undefined, pic_url: undefined }), '', vi.fn());
        expect(container.appendChild).not.toHaveBeenCalled();
    });
});
