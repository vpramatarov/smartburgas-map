// tests/BillingMachineStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingMachineStrategy } from '../src/strategies/BillingMachineStrategy.js';
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
    createElement: vi.fn(() => ({
        className: '', style: {}, innerHTML: '',
        appendChild: vi.fn(),
    })),
});

function makeSensor(overrides: Partial<SensorProperties> = {}): SensorProperties {
    return { name: 'ATM-01', strategy: 'billing_machine', additional_info: {}, ...overrides };
}

describe('BillingMachineStrategy', () => {
    let strategy: BillingMachineStrategy;

    beforeEach(() => {
        vi.clearAllMocks();
        strategy = new BillingMachineStrategy();
        strategy.initialize({} as any, vi.fn());
    });

    it('has correct identity fields', () => {
        expect(strategy.name).toBe('billing_machine');
        expect(strategy.checkbox_id).toBe('toggle-billing-machines');
        expect(strategy.layerOptions.color).toBe('#3498db');
        expect(strategy.getIconClass()).toBe('icon-dollar');
    });

    it('getChartData always returns null', () => {
        expect(strategy.getChartData(makeSensor(), 'anything')).toBeNull();
    });

    it('renderCardContent shows description when present', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ description: '<p>Test ATM</p>' }), '', vi.fn());
        const appended = container.appendChild.mock.calls[0][0];
        expect(appended.className).toBe('sensor-description');
        expect(appended.innerHTML).toBe('<p>Test ATM</p>');
    });

    it('renderCardContent shows fallback when no description', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor(), '', vi.fn());
        expect(container.innerHTML).toContain('No description available');
    });
});
