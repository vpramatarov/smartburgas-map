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
}