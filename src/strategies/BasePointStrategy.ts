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

declare const L: typeof import('leaflet');
/// <reference types="leaflet.markercluster" />
import type * as GeoJSON from 'geojson';

/**
 * Abstract base class for all standard point-marker map strategies.
 *
 * Subclasses must provide:
 *  - Identity fields: name, checkbox_id, layerOptions
 *  - getApiUrl(lang): endpoint to fetch from
 *  - getTimestampElementId(): sidebar timestamp DOM element ID
 *  - getIconClass(): fontello icon class for the map pin
 *  - renderCardContent(): sensor detail card rendering
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
    abstract getIconClass(): string;

    protected layer!: InstanceType<typeof L.MarkerClusterGroup>;
    protected onPin: ((sensor: SensorProperties) => void) | undefined;
    protected currentLang: SupportedLanguage = 'bg';
    protected cachedData: GeoFeature[] = [];
    protected currentFilterGeometry: FilterGeometry | null = null;

    // Abstract hooks

    protected abstract getApiUrl(lang: string): string;
    protected abstract getTimestampElementId(): string;

    abstract renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void;

    abstract getChartData(sensor: SensorProperties, property: string): ChartDataset | null;

    // Overridable hooks

    protected buildMarkerHtml(_feature: GeoFeature): string {
        return `
            <div class="custom-pin-marker" style="background-color: ${this.layerOptions.color};">
                <i class="${this.getIconClass()}"></i>
            </div>
        `;
    }

    protected getPopupText(_props: SensorProperties): string {
        return t('click_to_pin', this.currentLang);
    }

    protected onLoadSuccess(_data: GeoJSONInput): void {}

    // Concrete shared implementation

    initialize(map: L.Map, onPin: (sensor: SensorProperties) => void): void {
        this.onPin = onPin;
        this.layer = L.markerClusterGroup({
            maxClusterRadius: 50,
            iconCreateFunction: (cluster) => {
                const count = cluster.getChildCount();
                let sizeClass = 'marker-cluster-small';
                let size = 40;
                if (count >= 50) {
                    sizeClass = 'marker-cluster-large'; size = 60;
                } else if (count >= 10) {
                    sizeClass = 'marker-cluster-medium'; size = 50;
                }

                let colorClass = '';

                if (this.name === 'taxi_rank') {
                    colorClass += 'dark-text'
                }

                return L.divIcon({
                    html: `<div style="background-color: ${this.layerOptions.color}"><i class="${this.getIconClass()}"></i><span>${count}</span></div>`,
                    className: `marker-cluster ${sizeClass} ${colorClass}`,
                    iconSize: L.point(size, size)
                });
            }
        });
    }

    getLayer(): L.LayerGroup {
        return this.layer;
    }

    async loadData(lang: string, options?: Record<string, string>): Promise<void> {
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
            this.applyRegionFilter(this.currentFilterGeometry);
        } catch (err) {
            console.error(`[${this.name}] loadData failed:`, err);
            Utils.updateTimestampUI(this.getTimestampElementId(), 'Error');
        }
    }

    applyRegionFilter(filterGeometry: FilterGeometry | null): void {
        if (!this.layer) {
            return;
        }

        this.currentFilterGeometry = filterGeometry;
        this.layer.clearLayers();

        const filteredFeatures = this.cachedData.filter(feature => {
            if (!feature.geometry || !feature.geometry.coordinates) {
                return false;
            }
            let pt: Position;
            if (feature.geometry.type === 'Point') {
                pt = feature.geometry.coordinates as Position;
            } else if (feature.geometry.type === 'Polygon') {
                const coords = feature.geometry.coordinates as Position[][];
                pt = coords[0][0];
            } else if (feature.geometry.type === 'MultiPolygon') {
                const coords = feature.geometry.coordinates as Position[][][];
                pt = coords[0][0][0];
            } else {
                return false;
            }

            return Utils.isPointInPolygon(pt, filterGeometry);
        });

        this.addGeoJsonToLayer(filteredFeatures);
    }

    protected addGeoJsonToLayer(inputData: GeoJSONInput | GeoFeature[]): void {
        const features: GeoFeature[] = Array.isArray(inputData) ? (inputData as GeoFeature[]) : (inputData as { features: GeoFeature[] }).features || [];

        L.geoJSON(features as any, {
            pointToLayer: (feature: GeoJSON.Feature, latlng: L.LatLng): L.Layer => {
                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'custom-pin-wrapper',
                        html: this.buildMarkerHtml(feature as GeoFeature),
                        iconSize: [30, 30],
                        iconAnchor: [15, 30],
                        popupAnchor: [0, -32]
                    })
                });
            },
            onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer): void => {
                const props = (feature as GeoFeature).properties;
                const title = String(props.name || props.publicname || this.name);

                (layer as L.Marker).bindPopup(
                    `<div class="marker-popup-hover"><h4>${Utils.escapeHtml(title)}</h4><p>${this.getPopupText(props)}</p></div>`,
                    { closeButton: false, offset: L.point(0, 0) }
                );

                layer.on('mouseover', (e: L.LeafletEvent) => {
                    (e.target as L.Marker).openPopup();
                });
                layer.on('mouseout', (e: L.LeafletEvent) => {
                    (e.target as L.Marker).closePopup();
                });
                layer.on('click', () => {
                    this.onPin?.(props);
                });
            }
        }).addTo(this.layer);
    }
}


