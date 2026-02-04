import { ChartDataset, SensorProperties } from '../Types.js'

export interface IDetailsStrategy {
    /**
     * Unique name to identify the strategy (e.g. 'traffic', 'air_quality')
     */
    name: string;

    /**
     * Renders the specific content (stats, toggles) inside a sensor card.
     *
     * @param container The DOM element of the card body
     * @param sensor The sensor data
     * @param uniqueIdPrefix A unique prefix (e.g. "sensor-0") to ensure HTML IDs don't collide
     * @param onChartRequest Callback when user toggles a property.
     */
    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void;

    /**
     * Extracts a chart dataset for a specific property.
     */
    getChartData(sensor: SensorProperties, property: string): ChartDataset | null;
}