// src/strategies/PaidParkingZonesStrategy.ts
import { ISpatialFilterStrategy } from './ISpatialFilterStrategy.js';
import { ChartDataset, FilterGeometry, GeoFeature, Position, SensorProperties, SupportedLanguage } from '../Types.js';
import { t } from '../Translations.js';
import { Utils } from '../Utils.js';

declare const L: typeof import('leaflet');
import type * as GeoJSON from 'geojson';

export class PaidParkingZonesStrategy implements ISpatialFilterStrategy {
    public parentStrategy?: ISpatialFilterStrategy;
    public childStrategies?: ISpatialFilterStrategy[];
    public name = 'paid_parking_zones';
    public checkbox_id = 'toggle-paid-parking-zones';
    public layerOptions: { translate_name_key: string; color: string } = {
        translate_name_key: 'layer_paid_parking_zones',
        color: '#3498db'
    };

    private map!: L.Map;
    private layer!: L.LayerGroup;
    private currentLang: SupportedLanguage = 'bg';
    private onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: GeoFeature) => void;
    private currentSelection: { name: string; layer: L.Path } | null = null;
    private featureMap: Map<string, L.Path> = new Map();
    private cachedData: GeoFeature[] = [];
    private geoJsonLayer!: L.GeoJSON;

    constructor(onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: GeoFeature) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: L.Map, _onPin: (sensor: SensorProperties) => void): void {
        this.map = map;
        this.layer = L.layerGroup();
        this.layer.addTo(map);
    }

    getLayer(): L.LayerGroup {
        return this.layer;
    }

    async loadData(lang: string): Promise<void> {
        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();

        try {
            const res = await fetch('/api/paid-parking-zones');
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const data = await res.json();
            this.cachedData = data.features || [];
            this.applyRegionFilter(null);
        } catch (err) {
            console.error('Error loading paid parking zones:', err);
        }
    }

    applyRegionFilter(geometry: FilterGeometry | null): void {
        if (!this.layer) {
            return;
        }

        // If the geometry being passed is a Paid Parking Zone itself, don't filter —
        // keep all zones visible so the user can switch between them.
        if (geometry && this.cachedData.some(f => f.geometry === geometry)) {
            return;
        }

        this.layer.clearLayers();
        this.featureMap.clear();

        let filteredFeatures = this.cachedData;

        if (geometry) {
            filteredFeatures = this.cachedData.filter(feature => {
                if (!feature.geometry?.coordinates) {
                    return false;
                }

                let point: Position;

                if (feature.geometry.type === 'Polygon') {
                    point = (feature.geometry.coordinates as Position[][])[0][0];
                } else if (feature.geometry.type === 'MultiPolygon') {
                    point = (feature.geometry.coordinates as Position[][][])[0][0][0];
                } else {
                    return false;
                }

                return Utils.isPointInPolygon(point, geometry);
            });
        }

        this.addGeoJsonToLayer(filteredFeatures);
    }

    public clearSelection(triggerFilter: boolean = true): void {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            const prevName = this.currentSelection.name;

            this.currentSelection = null;

            if (prevLayer && this.geoJsonLayer) {
                this.geoJsonLayer.resetStyle(prevLayer);
            }

            const prevCb = document.getElementById(this.getSafeId(prevName)) as HTMLInputElement | null;
            if (prevCb) {
                prevCb.checked = false;
            }

            if (window.innerWidth <= 991 && this.map) {
                this.map.closePopup();
            }
        }

        if (triggerFilter) {
            this.onFilterChange(null, this);
        }
    }

    renderCardContent(_container: HTMLElement, _sensor: SensorProperties): void {}
    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null { return null; }

    public selectRegionByPoint(point: Position, triggerFilter: boolean = true): void {
        const feature = this.cachedData.find(f => Utils.isPointInPolygon(point, f.geometry as FilterGeometry));
        if (feature) {
            const name: string = this.currentLang === 'en' && feature.properties?.NameEn
                ? feature.properties.NameEn
                : feature.properties?.Name;
            const layer = this.featureMap.get(name);
            if (name && layer) {
                this.toggleSelection(name, layer, feature, false, triggerFilter);
            }
        } else {
            this.clearSelection(triggerFilter);
        }
    }

    public getCurrentGeometry(): FilterGeometry | null {
        if (this.currentSelection) {
            return (this.currentSelection.layer as any).feature?.geometry ?? null;
        }
        return null;
    }

    private addGeoJsonToLayer(features: GeoFeature[]): void {
        if (this.geoJsonLayer) {
            this.layer.removeLayer(this.geoJsonLayer);
        }

        this.geoJsonLayer = L.geoJSON(features as any, {
            style: (feature?: GeoJSON.Feature): L.PathOptions => {
                const props = (feature as unknown as GeoFeature)?.properties;
                const isGreen = props?.ZoneType === 1;
                const color = isGreen ? '#2ecc71' : '#3498db';
                const name: string = this.currentLang === 'en' && props?.NameEn ? props.NameEn : props?.Name;

                if (this.currentSelection?.name === name) {
                    return { color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' };
                }

                return { color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.2, dashArray: '3, 6' };
            },
            onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer): void => {
                const geoFeature = feature as unknown as GeoFeature;
                const props = geoFeature.properties;
                if (!props) return;

                const name: string = this.currentLang === 'en' && props.NameEn ? props.NameEn : props.Name;
                const path = layer as L.Path;

                this.featureMap.set(name, path);

                if (this.currentSelection?.name === name) {
                    path.setStyle({ color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' });
                    this.currentSelection.layer = path;
                }

                const formatTime = (timeStr: string): string => {
                    if (!timeStr) return '';
                    const match = timeStr.match(/\s(\d{2}:\d{2})/);
                    return match ? match[1] : timeStr;
                };

                const start = formatTime(props.StartTime);
                const end = formatTime(props.EndTime);
                const hoursStr = start && end ? `${start} - ${end}` : t('status_unknown', this.currentLang);

                const popupHtml = `
                    <div class="marker-popup-hover" style="min-width: 160px;">
                        <h4 style="margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:4px;">${name}</h4>
                        <p style="margin:4px 0;"><strong>${t('price_per_hour', this.currentLang)}:</strong> ${props.PricePerHo} ${t('bgn', this.currentLang)}</p>
                        <p style="margin:4px 0;"><strong>${t('sms_number', this.currentLang)}:</strong> ${props.SmsNumber}</p>
                        <p style="margin:4px 0;"><strong>${t('working_hours', this.currentLang)}:</strong> ${hoursStr}</p>
                        <p style="margin:8px 0 0 0; font-size: 0.85em; color: #666; font-style: italic;">${t('click_to_filter', this.currentLang)}</p>
                    </div>
                `;

                (path as any).bindTooltip(popupHtml, { sticky: true });

                layer.on('click', (e: L.LeafletEvent): void => {
                    const mouseEvent = e as L.LeafletMouseEvent;
                    if (window.innerWidth <= 991) {
                        (path as any).closeTooltip();
                    }

                    this.toggleSelection(name, path, geoFeature);

                    if (window.innerWidth <= 991) {
                        if (this.currentSelection?.name === name) {
                            L.popup()
                                .setLatLng(mouseEvent.latlng)
                                .setContent(popupHtml)
                                .openOn(this.map);
                        } else {
                            this.map.closePopup();
                        }
                    }
                });

                layer.on('mouseover', (): void => {
                    if (this.currentSelection?.name !== name) {
                        path.setStyle({ fillOpacity: 0.4, weight: 3 });
                    }
                });

                layer.on('mouseout', (): void => {
                    if (this.currentSelection?.name !== name) {
                        this.geoJsonLayer.resetStyle(path);
                    }
                });
            }
        });

        this.layer.addLayer(this.geoJsonLayer);
        this.renderSidebarControls(features);
    }

    private renderSidebarControls(features: GeoFeature[]): void {
        const container = document.getElementById('paid-parking-zones-wrapper') as HTMLDivElement | null;
        if (!container) return;

        container.innerHTML = '';

        const zoneNames = Array.from(new Set(
            features.map(f => this.currentLang === 'en' && f.properties.NameEn
                ? f.properties.NameEn as string
                : f.properties.Name as string)
        )).sort();

        zoneNames.forEach(name => {
            if (!name) return;

            const div = document.createElement('div');
            div.className = 'paid-zone-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = this.getSafeId(name);
            checkbox.value = name;

            if (this.currentSelection?.name === name) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);
                const feature = features.find(f =>
                    (this.currentLang === 'en' && f.properties.NameEn
                        ? f.properties.NameEn
                        : f.properties.Name) === name
                );

                if (target.checked && feature && layer) {
                    this.toggleSelection(name, layer, feature, true);
                } else {
                    this.clearSelection();
                }
            });

            const label = document.createElement('label');
            label.htmlFor = this.getSafeId(name);
            label.innerText = name;

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    private toggleSelection(name: string, layer: L.Path, feature: GeoFeature, forceCheck: boolean = false, triggerFilter: boolean = true): void {
        if (this.currentSelection?.name === name && !forceCheck) {
            this.clearSelection();
        } else {
            if (this.currentSelection) {
                const prevLayer = this.currentSelection.layer;
                const prevName = this.currentSelection.name;

                this.currentSelection = null;

                if (prevLayer && this.geoJsonLayer) {
                    this.geoJsonLayer.resetStyle(prevLayer);
                }

                const prevCb = document.getElementById(this.getSafeId(prevName)) as HTMLInputElement | null;
                if (prevCb) prevCb.checked = false;
            }

            this.currentSelection = { name, layer };
            layer.setStyle({ color: '#e74c3c', weight: 3, fillOpacity: 0.4, dashArray: '' });

            const newCb = document.getElementById(this.getSafeId(name)) as HTMLInputElement | null;
            if (newCb) newCb.checked = true;

            if (triggerFilter) {
                this.onFilterChange(feature.geometry as FilterGeometry, this, feature);
            }
        }
    }

    private getSafeId(name: string): string {
        return `paid-zone-${name.replace(/\s+/g, '-')}`;
    }
}

