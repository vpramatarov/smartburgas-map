// tests/CompositeDetailsStrategy.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CompositeDetailsStrategy } from '../src/strategies/CompositeDetailsStrategy.js';
import { IDetailsStrategy } from '../src/strategies/IDetailsStrategy.js';
import { SensorProperties } from '../src/Types.js';

// Mock ChartRenderer to prevent Plotly DOM errors
vi.mock('../src/components/ChartRenderer.js', () => ({
    ChartRenderer: {
        clear: vi.fn(),
        render: vi.fn(),
        renderFull: vi.fn()
    }
}));

// Mock Translations
vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key) => key)
}));

class MockStrategy implements IDetailsStrategy {
    name = 'mock_strategy';
    checkbox_id = 'toggle-mock';
    layerOptions = { color: 'blue' };
    initialize = vi.fn();
    loadData = vi.fn();
    applyRegionFilter = vi.fn();
    getLayer = vi.fn();
    getChartData = vi.fn().mockReturnValue({ label: 'test', values: [1], times: ['1'] });

    renderCardContent(container: HTMLElement, sensor: SensorProperties, prefix: string, onChartRequest: () => void) {
        // Just a dummy implementation for the test
        container.innerHTML = 'mocked';
    }
}

describe('CompositeDetailsStrategy - Chart Updates', () => {
    // We will dynamically control what querySelectorAll returns using this array
    let mockCheckedBoxes: any[] = [];

    beforeEach(() => {
        vi.clearAllMocks();
        mockCheckedBoxes = [];

        // Manually mock the minimal Document API required by the Node environment
        vi.stubGlobal('document', {
            createElement: vi.fn((tag) => ({
                id: '',
                style: {},
                classList: { add: vi.fn(), remove: vi.fn() },
                appendChild: vi.fn(),
                querySelector: vi.fn()
            })),
            getElementById: vi.fn((id) => ({
                appendChild: vi.fn(),
                classList: { add: vi.fn(), remove: vi.fn() },
                style: {}
            })),
            querySelectorAll: vi.fn((selector) => {
                if (selector === '#info-panel .chart-toggle-checkbox:checked') {
                    return mockCheckedBoxes;
                }
                return [];
            })
        });
    });

    it('should retrieve sensor data based on a stable sensor ID, not array index', () => {
        const mockStrategy = new MockStrategy();
        const composite = new CompositeDetailsStrategy([mockStrategy]);

        // Use our fake document functions to create containers
        const container = document.createElement('div') as HTMLDivElement;
        const chartContainer = document.createElement('div') as HTMLDivElement;
        chartContainer.id = 'chart-container';

        // Setup 2 sensors
        const sensorA: SensorProperties = { id: 'A', name: 'Sensor A', strategy: 'mock_strategy', additional_info: {} };
        const sensorB: SensorProperties = { id: 'B', name: 'Sensor B', strategy: 'mock_strategy', additional_info: {} };

        const currentSensors = [sensorA, sensorB];

        // Render cards
        composite.render(container as any, chartContainer as any, currentSensors, [], vi.fn(), vi.fn(), 'bg');

        // Simulate a background state mutation: Reverse the array BEFORE the chart is generated
        currentSensors.reverse(); // Now B is at index 0, A is at index 1.

        // Fake the user clicking the checkbox for "Sensor A".
        // We do this by populating our mock array with an object that mimics the HTML element's dataset attribute!
        mockCheckedBoxes = [
            {
                dataset: {
                    sensorId: 'A',
                    property: 'test_prop'
                }
            }
        ];

        // Trigger the internal updateChart logic
        (composite as any).updateChart(chartContainer, currentSensors, null, null);

        // getChartData should be called for Sensor A.
        // If it fails, it means the app blindly grabbed array index [0], which is now Sensor B!
        expect(mockStrategy.getChartData).toHaveBeenCalledWith(sensorA, 'test_prop');
    });
});