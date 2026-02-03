// src/strategies/IDetailsStrategy.ts
import { SensorProperties } from '../Types.js'

export interface IDetailsStrategy {
    /**
     * Renders data into the provided DOM elements.
     * @param contentContainer The DIV for text details
     * @param chartContainer The DIV for the chart (optional)
     * @param sensor The GeoJSON properties object
     */
    render(contentContainer: HTMLElement, chartContainer: HTMLElement, sensor: SensorProperties): void;

    /**
     * Renders the full screen chart.
     * @param properties Array of property keys to graph
     * @param sensor Sensor data
     */
    renderFull(properties: string[], sensor: SensorProperties): void;

    supports(name: string): boolean;
}