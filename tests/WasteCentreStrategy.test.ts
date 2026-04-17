// tests/WasteCentreStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WasteCentreStrategy } from '../src/strategies/WasteCentreStrategy.js';
import { SensorProperties } from '../src/Types.js';

const mockLayerGroup = { addTo: vi.fn(), clearLayers: vi.fn() };
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key: string) => key),
}));

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn(() => {
        const el: any = {
            className: '', style: {}, innerHTML: '', src: '', alt: '',
            appendChild: vi.fn(),
            querySelectorAll: vi.fn(() => []),
            onerror: null,
        };
        return el;
    }),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return {
        id: 'W01', name: 'Waste Centre 1', strategy: 'waste_centre',
        additional_info: {},
        ...overrides,
    };
}

const wasteData = [
    { Garbage_id: 'G1', Garbage_name: 'Paper', Garbage_Colour: '#0000ff', Garbage_Weight: '120', Garbage_Weight_type: 'kg', time: '2025-01-01T10:00:00' },
    { Garbage_id: 'G2', Garbage_name: 'Plastic', Garbage_Colour: '#ff0000', Garbage_Weight: '80', Garbage_Weight_type: 'kg', time: '2025-01-01T11:00:00' },
    { Garbage_id: 'G1', Garbage_name: 'Paper', Garbage_Colour: '#0000ff', Garbage_Weight: '150', Garbage_Weight_type: 'kg', time: '2025-01-02T10:00:00' },
];

// ── getChartData

describe('WasteCentreStrategy.getChartData', () => {
    let strategy: WasteCentreStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new WasteCentreStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('returns null when sensor has no data', () => {
        expect(strategy.getChartData(makeSensor(), 'G1')).toBeNull();
    });

    it('returns null for a garbage ID that does not exist in the data', () => {
        expect(strategy.getChartData(makeSensor({ data: wasteData }), 'G99')).toBeNull();
    });

    it('returns a dataset filtered to the requested garbage type', () => {
        const result = strategy.getChartData(makeSensor({ data: wasteData }), 'G1');
        expect(result).not.toBeNull();
        expect(result!.label).toBe('Paper');
        expect(result!.values).toEqual([120, 150]);
        expect(result!.times).toHaveLength(2);
    });

    it('uses the weight unit from the data', () => {
        const result = strategy.getChartData(makeSensor({ data: wasteData }), 'G2');
        expect(result!.unit).toBe('kg');
    });

    it('falls back to translated "kg" key when weight_type is missing', () => {
        const data = [{ Garbage_id: 'G3', Garbage_name: 'Glass', Garbage_Colour: '#00ff00', Garbage_Weight: '50', Garbage_Weight_type: '', time: '2025-01-01T10:00:00' }];
        const result = strategy.getChartData(makeSensor({ data }), 'G3');
        expect(result!.unit).toBe('kg'); // falls back to t('kg')
    });

    it('parses weight values as floats', () => {
        const data = [{ Garbage_id: 'G4', Garbage_name: 'Metal', Garbage_Colour: '#888', Garbage_Weight: '12.5', Garbage_Weight_type: 'kg', time: '2025-01-01' }];
        const result = strategy.getChartData(makeSensor({ data }), 'G4');
        expect(result!.values[0]).toBe(12.5);
    });
});

// ── renderCardContent

describe('WasteCentreStrategy.renderCardContent', () => {
    let strategy: WasteCentreStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new WasteCentreStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('appends image when additional_info.image is present', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const sensor = makeSensor({ additional_info: { image: 'http://img/waste.jpg' } });
        strategy.renderCardContent(container, sensor, 'pfx', vi.fn());
        const img = container.appendChild.mock.calls[0][0];
        expect(img.src).toBe('http://img/waste.jpg');
    });

    it('appends address as a data-row div with textContent (not HTML)', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const sensor = makeSensor({ additional_info: { address: 'ул. Демокрация 1' } });
        strategy.renderCardContent(container, sensor, 'pfx', vi.fn());

        const addrDiv = container.appendChild.mock.calls.find((c: any[]) => c[0].className === 'data-row')?.[0];
        expect(addrDiv).toBeDefined();
        expect(addrDiv.textContent).toBe('ул. Демокрация 1');
        expect(addrDiv.innerHTML).toBe('');
    });

    it('does not render malicious address as executable HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<img src=x onerror="alert(1)">';
        const sensor = makeSensor({ additional_info: { address: malicious } });
        strategy.renderCardContent(container, sensor, 'pfx', vi.fn());

        const addrDiv = container.appendChild.mock.calls.find((c: any[]) => c[0].className === 'data-row')?.[0];
        expect(addrDiv).toBeDefined();
        expect(addrDiv.innerHTML).toBe('');
        expect(addrDiv.textContent).toBe(malicious);
        expect(container.innerHTML).not.toContain('<img');
    });

    it('does not render malicious description as executable HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<script>alert(1)</script>';
        const sensor = makeSensor({ description: malicious });
        strategy.renderCardContent(container, sensor, 'pfx', vi.fn());

        const desc = container.appendChild.mock.calls.find((c: any[]) => c[0].className === 'sensor-description')?.[0];
        expect(desc).toBeDefined();
        expect(desc.innerHTML).toBe('');
        expect(desc.textContent).toBe(malicious);
    });

    it('escapes meta.name, weight, weight_unit, and time in the garbage row template', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        // toggleDiv in the strategy uses appendChild; our mock returns a fresh object with appendChild on every createElement
        const maliciousData = [{
            Garbage_id: 'G1',
            Garbage_name: '<script>alert(1)</script>',
            Garbage_Colour: '#abc',
            Garbage_Weight: '<img src=x>',
            Garbage_Weight_type: '"onmouseover="alert(1)',
            time: '<b>2025</b>',
        }];
        strategy.renderCardContent(container, makeSensor({ data: maliciousData }), 'pfx', vi.fn());

        // container.appendChild[0] is the toggleDiv; toggleDiv.appendChild[0] is the row
        const toggleDiv = container.appendChild.mock.calls.find((c: any[]) => c[0].className === 'property-toggles')?.[0];
        expect(toggleDiv).toBeDefined();
        const row = toggleDiv.appendChild.mock.calls[0][0];
        expect(row.innerHTML).not.toContain('<script>alert(1)</script>');
        expect(row.innerHTML).not.toContain('<img src=x>');
        expect(row.innerHTML).toContain('&lt;script&gt;');
        expect(row.innerHTML).toContain('&lt;img');
        expect(row.innerHTML).toContain('&quot;');
    });

    it('sanitizes meta.color via validateCssColor (rejects CSS injection)', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const maliciousData = [{
            Garbage_id: 'G1',
            Garbage_name: 'Paper',
            Garbage_Colour: 'red;background:url(x)',
            Garbage_Weight: '1',
            Garbage_Weight_type: 'kg',
            time: '2025-01-01',
        }];
        strategy.renderCardContent(container, makeSensor({ data: maliciousData }), 'pfx', vi.fn());

        const toggleDiv = container.appendChild.mock.calls.find((c: any[]) => c[0].className === 'property-toggles')?.[0];
        const row = toggleDiv.appendChild.mock.calls[0][0];
        expect(row.innerHTML).not.toContain('background:url(x)');
        // fallback color inserted instead
        expect(row.innerHTML).toContain('border-left: 3px solid #888');
    });

    it('has correct identity fields', () => {
        expect(strategy.name).toBe('waste_centre');
        expect(strategy.checkbox_id).toBe('toggle-waste');
        expect(strategy.layerOptions.color).toBe('#9b59b6');
        expect(strategy.getIconClass()).toBe('icon-recycle');
    });
});
