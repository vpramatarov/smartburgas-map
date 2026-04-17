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

    it('renderCardContent shows description as text (not HTML) to prevent XSS', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor({ description: '<p>Test ATM</p>' }));
        const appended = container.appendChild.mock.calls[0][0];
        expect(appended.className).toBe('sensor-description');
        expect(appended.textContent).toBe('<p>Test ATM</p>');
        expect(appended.innerHTML).toBe('');
    });

    it('does not render malicious description as executable HTML', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        const malicious = '<img src=x onerror="alert(1)">';
        strategy.renderCardContent(container, makeSensor({ description: malicious }));
        const appended = container.appendChild.mock.calls[0][0];
        expect(appended.innerHTML).toBe('');
        expect(appended.textContent).toBe(malicious);
    });

    it('renderCardContent shows fallback when no description', () => {
        const container = { innerHTML: '', appendChild: vi.fn() } as any;
        strategy.renderCardContent(container, makeSensor());
        expect(container.innerHTML).toContain('No description available');
    });
});
