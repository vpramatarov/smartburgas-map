// tests/EVChargingStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EVChargingStrategy } from '../src/strategies/EVChargingStrategy.js';
import { SensorProperties } from '../src/Types.js';

const mockLayerGroup = { addTo: vi.fn(), clearLayers: vi.fn() };
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => mockLayerGroup),
    markerClusterGroup: vi.fn(() => mockLayerGroup),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

vi.stubGlobal('document', {
    getElementById: vi.fn().mockReturnValue({ innerText: '' }),
    createElement: vi.fn((tag: string) => ({
        className: '', style: {}, innerHTML: '', src: '', alt: '',
        appendChild: vi.fn(),
        onerror: null as (() => void) | null,
    })),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return { name: 'EV-01', strategy: 'ev_station', additional_info: {}, ...overrides };
}

describe('EVChargingStrategy', () => {
    let strategy: EVChargingStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new EVChargingStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('has correct identity fields', () => {
        expect(strategy.name).toBe('ev_station');
        expect(strategy.checkbox_id).toBe('toggle-ev-stations');
        expect(strategy.layerOptions.color).toBe('#f39c12');
        expect(strategy.getIconClass()).toBe('icon-battery');
    });

    it('getChartData always returns null', () => {
        expect(strategy.getChartData(makeSensor(), 'anything')).toBeNull();
    });

    it('renderCardContent appends image when pic_url is present', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ pic_url: 'http://img/ev.jpg', name: 'Charger A' }), '', vi.fn());
        const img = container.appendChild.mock.calls[0][0];
        expect(img.src).toBe('http://img/ev.jpg');
        expect(img.alt).toBe('Charger A');
    });

    it('renderCardContent appends description when present', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ description: 'Fast charger' }), '', vi.fn());
        const desc = container.appendChild.mock.calls[0][0];
        expect(desc.className).toBe('sensor-description');
        expect(desc.innerHTML).toBe('Fast charger');
    });

    it('renderCardContent image onerror hides the image', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ pic_url: 'http://broken' }), '', vi.fn());
        const img = container.appendChild.mock.calls[0][0];
        expect(img.onerror).toBeTypeOf('function');
        img.onerror!();
        expect(img.style.display).toBe('none');
    });

    it('renderCardContent renders nothing for a sensor with no pic_url and no description', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor(), '', vi.fn());
        expect(container.appendChild).not.toHaveBeenCalled();
    });
});
