import {ChartDataset, FilterGeometry, SensorProperties} from '../Types.js'

export interface IDetailsStrategy {
    /**
     * Unique name to identify the strategy (e.g. 'traffic', 'air_quality')
     */
    name: string;

    /**
     * Unique name to identify the checkbox
     */
    checkbox_id: string

    layerOptions: { translate_name_key?: string, color: string }

    /**
     * Initializes the strategy with the map instance.
     * Should create the Leaflet layer but NOT add it to the map yet (unless default).
     * @param map The Leaflet map instance
     * @param onPin Callback when a marker is clicked (to pin it to the panel)
     */
    initialize(map: any, onPin: (sensor: SensorProperties) => void): void;

    /**
     * Fetches data from the API and populates the layer.
     * @param lang 'bg' or 'en'
     * @param options Optional filter parameters (e.g. { start_date, end_date })
     */
    loadData(lang: string, options?: Record<string, any>): Promise<void>;

    // Filter the currently loaded data by a geographic shape
    applyRegionFilter(geometry: FilterGeometry | null): void;

    /**
     * Returns the Leaflet layer group for this strategy.
     * Used by the Client to toggle visibility.
     */
    getLayer(): any;

    /**
     * Renders the specific content (stats, toggles) inside a sensor card.
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