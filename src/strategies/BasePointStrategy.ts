// src/strategies/BasePointStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {
    ChartDataset,
    FilterGeometry,
    GeoFeature,
    GeoJSONInput,
    Position,
    SensorProperties,
    SupportedLanguage
} from '../Types.js';
import { Utils } from '../Utils.js';
import { t } from '../Translations.js';

declare const L: any;

/**
 * Abstract base class for all standard point-marker map strategies.
 *
 * Eliminates boilerplate shared across EVChargingStrategy, BillingMachineStrategy,
 * TaxiRankStrategy, SmartParkingStrategy, WasteCentreStrategy,
 * AirQualityTimeSensorStrategy, CCTVStrategy, and TrafficSensorStrategy.
 *
 * Subclasses must provide:
 *  - Static identity fields: name, checkbox_id, layerOptions
 *  - getApiUrl(lang): the endpoint to fetch from
 *  - getTimestampElementId(): the sidebar timestamp element to update
 *  - getIconClass(): the fontello icon class for the map pin
 *  - renderCardContent(): the sensor detail card
 *  - getChartData(): chart dataset extraction (return null if no chart)
 *
 * Subclasses may override:
 *  - buildMarkerHtml(): for custom marker DOM (e.g. CCTV cone)
 *  - getPopupText(): for a custom hover popup body
 *  - onLoadSuccess(): hook called after data is fetched and cached
 */
export abstract class BasePointStrategy implements IDetailsStrategy {
    abstract name: string;
    abstract checkbox_id: string;
    abstract layerOptions: { translate_name_key?: string; color: string };

    protected layer: any;
    protected onPin: ((sensor: SensorProperties) => void) | undefined;
    protected currentLang: SupportedLanguage = 'bg';
    protected cachedData: GeoFeature[] = [];

    // Abstract hooks

    /** The API path including any query params, e.g. `/api/ev-stations?lang=${lang}` */
    protected abstract getApiUrl(lang: string): string;

    /** DOM element ID for the "last updated" timestamp in the sidebar */
    protected abstract getTimestampElementId(): string;

    /** Fontello icon class for the map pin, e.g. `"icon-battery"` */
    protected abstract getIconClass(): string;

    abstract renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void;

    abstract getChartData(sensor: SensorProperties, property: string): ChartDataset | null;

    // Overridable hooks

    /**
     * Builds the inner HTML for the map marker div.
     * Override for non-standard markers (e.g. CCTV with a camera cone).
     */
    protected buildMarkerHtml(_feature: GeoFeature): string {
        return `
            <div class="custom-pin-marker" style="background-color: ${this.layerOptions.color};">
                <i class="${this.getIconClass()}"></i>
            </div>
        `;
    }

    /**
     * Text displayed in the hover popup body. Override for custom popup content.
     */
    protected getPopupText(_props: SensorProperties): string {
        return t('click_to_pin', this.currentLang);
    }

    /**
     * Called after data is fetched, tagged and cached, before applyRegionFilter.
     * Override to perform strategy-specific post-load setup.
     */
    protected onLoadSuccess(_data: GeoJSONInput): void {}

    // Concrete shared implementation

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.onPin = onPin;
        this.layer = L.layerGroup();
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string, options?: Record<string, any>): Promise<void> {
        if (!this.layer) {
            return;
        }

        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();
        Utils.updateTimestampUI(this.getTimestampElementId(), t('loading', this.currentLang));

        try {
            const res = await fetch(this.getApiUrl(lang));

            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI(
                this.getTimestampElementId(),
                new Date(res.headers.get('X-Last-Updated') || new Date())
            );

            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.cachedData = Array.isArray(data) ? data : data.features || [];

            this.onLoadSuccess(data);
            this.applyRegionFilter(null);
        } catch (err) {
            console.error(`${this.name} load error:`, err);
        }
    }

    applyRegionFilter(filterGeometry: FilterGeometry | null): void {
        if (!this.layer) {
            return;
        }

        this.layer.clearLayers();

        const filteredFeatures = this.cachedData.filter(feature => {
            if (!feature.geometry || !feature.geometry.coordinates) {
                return false;
            }
            let pt: Position = [0, 0];
            if (feature.geometry.type === 'Polygon') {
                const coords = feature.geometry.coordinates as Position[][];
                pt = coords[0][0];
            } else if (feature.geometry.type === 'MultiPolygon') {
                const coords = feature.geometry.coordinates as Position[][][];
                pt = coords[0][0][0];
            }
            return Utils.isPointInPolygon(pt, filterGeometry);
        });

        this.addGeoJsonToLayer(filteredFeatures);
    }

    protected addGeoJsonToLayer(inputData: GeoJSONInput | GeoFeature[]): void {
        const features: GeoFeature[] = Array.isArray(inputData) ? inputData : (inputData as any).features || [];

        L.geoJSON(features, {
            pointToLayer: (feature: GeoFeature, latlng: any) => {
                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'custom-pin-wrapper',
                        html: this.buildMarkerHtml(feature),
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -32]
                    })
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                const title = (props.name || props.publicname || this.name) as string;

                layer.bindPopup(
                    `<div class="marker-popup-hover"><h4>${title}</h4><p>${this.getPopupText(props)}</p></div>`,
                    { closeButton: false, offset: L.point(0, 0) }
                );

                layer.on('mouseover', (e: any) => { e.target.openPopup(); });
                layer.on('mouseout', (e: any) => { e.target.closePopup(); });
                layer.on('click', () => { this.onPin?.(props); });
            }
        }).addTo(this.layer);
    }
}
