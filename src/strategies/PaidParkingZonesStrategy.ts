// src/strategies/PaidParkingZonesStrategy.ts
import { ISpatialFilterStrategy } from './ISpatialFilterStrategy.js';
import {ChartDataset, FilterGeometry, GeoFeature, Position, SensorProperties, SupportedLanguage} from '../Types.js';
import {t} from "../Translations.js";
import {Utils} from "../Utils.js";

declare const L: any;

export class PaidParkingZonesStrategy implements ISpatialFilterStrategy {
    public parentStrategy?: ISpatialFilterStrategy;
    public childStrategies?: ISpatialFilterStrategy[];
    public name = 'paid_parking_zones';
    public checkbox_id = 'toggle-paid-parking-zones';
    public layerOptions: { translate_name_key: string, color: string } = { translate_name_key: 'layer_paid_parking_zones', color: "#3498db" };
    private map: any;
    private layer: any;
    private currentLang: SupportedLanguage = 'bg';
    private onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: any) => void;
    private currentSelection: { name: string, layer: any } | null = null;
    private featureMap: Map<string, any> = new Map();
    private cachedData: GeoFeature[] = [];
    private geoJsonLayer: any;

    constructor(onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: any) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.map = map;
        this.layer = L.layerGroup();
        this.layer.addTo(map);
    }

    getLayer(): any {
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

        /**
         * @note: If the geometry being passed in is actually a Paid Parking Zone itself, we DO NOT want to filter out the other parking zones!
         *  We want them to remain on the map and in the sidebar so the user can switch between them.
         */
        if (geometry && this.cachedData.some(f => f.geometry === geometry)) {
            return;
        }

        this.layer.clearLayers();
        this.featureMap.clear();

        // Default to all features if no admin region is selected
        let filteredFeatures = this.cachedData;

        // If an Admin Region is selected, filter the zones to only those inside the region
        if (geometry) {
            filteredFeatures = this.cachedData.filter(feature => {
                if (!feature.geometry || !feature.geometry.coordinates) {
                    return false;
                }

                let point: Position;

                if (feature.geometry.type === 'Polygon') {
                    const coords = feature.geometry.coordinates as Position[][];
                    point = coords[0][0];
                } else if (feature.geometry.type === 'MultiPolygon') {
                    const coords = feature.geometry.coordinates as Position[][][];
                    point = coords[0][0][0];
                } else {
                    return false;
                }

                return Utils.isPointInPolygon(point, geometry);
            });
        }

        this.addGeoJsonToLayer(filteredFeatures);
    }

    public clearSelection(triggerFilter: boolean = true) {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            const prevName = this.currentSelection.name;

            // Clear state before resetting styles
            this.currentSelection = null;

            if (prevLayer && this.geoJsonLayer) {
                this.geoJsonLayer.resetStyle(prevLayer);
            }

            const prevCb = document.getElementById(this.getSafeId(prevName)) as HTMLInputElement;

            if(prevCb) {
                prevCb.checked = false;
            }

            // Close the mobile popup if the selection is cleared
            if (window.innerWidth <= 991 && this.map) {
                this.map.closePopup();
            }

            this.currentSelection = null;
        }
        if (triggerFilter) {
            this.onFilterChange(null, this);
        }
    }

    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {}
    getChartData(sensor: SensorProperties): ChartDataset | null { return null; }

    public selectRegionByPoint(point: Position, triggerFilter: boolean = true) {
        const feature = this.cachedData.find(f => Utils.isPointInPolygon(point, f.geometry as FilterGeometry));
        if (feature) {
            const name = this.currentLang === 'en' && feature.properties?.NameEn ? feature.properties.NameEn : feature.properties?.Name;
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
            return this.currentSelection.layer.feature.geometry;
        }
        return null;
    }

    private addGeoJsonToLayer(features: GeoFeature[]) {
        if (this.geoJsonLayer) {
            this.layer.removeLayer(this.geoJsonLayer);
        }

        this.geoJsonLayer = L.geoJSON(features, {
            style: (feature: any) => {
                const isGreen = feature.properties?.ZoneType === 1;
                const color = isGreen ? '#2ecc71' : '#3498db';

                const name = this.currentLang === 'en' && feature.properties.NameEn ? feature.properties.NameEn : feature.properties.Name;

                if (this.currentSelection && this.currentSelection.name === name) {
                    return { color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' };
                }

                return { color: color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.2, dashArray: '3, 6' };
            },
            onEachFeature: (feature: any, layer: any) => {
                const props = feature.properties;
                if (!props) {
                    return;
                }

                const name = this.currentLang === 'en' && props.NameEn ? props.NameEn : props.Name;
                this.featureMap.set(name, layer);

                if (this.currentSelection && this.currentSelection.name === name) {
                    layer.setStyle({ color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' });
                    this.currentSelection.layer = layer;
                }

                const formatTime = (timeStr: string) => {
                    if (!timeStr) {
                        return '';
                    }
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

                layer.bindTooltip(popupHtml, { sticky: true });

                layer.on('click', (e: any) => {
                    // Prevent the hover tooltip from sticking around on touch screens
                    if (window.innerWidth <= 991) {
                        layer.closeTooltip();
                    }

                    this.toggleSelection(name, layer, feature);

                    // On Mobile: Explicitly open a native popup where the user tapped
                    if (window.innerWidth <= 991) {
                        if (this.currentSelection?.name === name) {
                            L.popup()
                                .setLatLng(e.latlng)
                                .setContent(popupHtml)
                                .openOn(this.map);
                        } else {
                            this.map.closePopup();
                        }
                    }
                });

                layer.on('mouseover', () => {
                    if (this.currentSelection?.name !== name) {
                        layer.setStyle({ fillOpacity: 0.4, weight: 3 });
                    }
                });

                layer.on('mouseout', () => {
                    if (this.currentSelection?.name !== name) {
                        this.geoJsonLayer.resetStyle(layer);
                    }
                });
            }
        });

        this.layer.addLayer(this.geoJsonLayer);

        // Render the sidebar using ONLY the features that survived the region filter
        this.renderSidebarControls(features);
    }

    private renderSidebarControls(features: GeoFeature[]) {
        const container = document.getElementById('paid-parking-zones-wrapper') as HTMLDivElement;
        if (!container) {
            return;
        }

        container.innerHTML = '';

        const zoneNames = Array.from(new Set(features.map(f => this.currentLang === 'en' && f.properties.NameEn ? f.properties.NameEn : f.properties.Name))).sort();

        zoneNames.forEach(name => {
            if (!name) {
                return;
            }

            const div = document.createElement('div') as HTMLDivElement;
            div.className = 'paid-zone-item';

            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = this.getSafeId(name);
            checkbox.value = name;

            if (this.currentSelection?.name === name) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);
                const feature = features.find(f => (this.currentLang === 'en' && f.properties.NameEn ? f.properties.NameEn : f.properties.Name) === name);

                if (target.checked && feature) {
                    this.toggleSelection(name, layer, feature, true);
                } else {
                    this.clearSelection();
                }
            });

            const label = document.createElement('label') as HTMLLabelElement;
            label.htmlFor = this.getSafeId(name);
            label.innerText = name;

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    private toggleSelection(name: string, layer: any, feature: any, forceCheck: boolean = false, triggerFilter: boolean = true) {
        if (this.currentSelection?.name === name && !forceCheck) {
            this.clearSelection();
        } else {
            if (this.currentSelection) {
                const prevLayer = this.currentSelection.layer;
                const prevName = this.currentSelection.name;

                // clear the state BEFORE calling resetStyle.
                this.currentSelection = null;

                if (prevLayer && this.geoJsonLayer) {
                    this.geoJsonLayer.resetStyle(prevLayer);
                }
                const prevCb = document.getElementById(this.getSafeId(prevName)) as HTMLInputElement;
                if(prevCb) {
                    prevCb.checked = false;
                }
            }

            this.currentSelection = { name, layer };

            if (layer) {
                layer.setStyle({ color: '#e74c3c', weight: 3, fillOpacity: 0.4, dashArray: '' });
            }

            const newCb = document.getElementById(this.getSafeId(name)) as HTMLInputElement;

            if(newCb) {
                newCb.checked = true;
            }

            // Only notify Client.ts if we want to trigger a map update
            if (triggerFilter) {
                this.onFilterChange(feature.geometry, this, feature);
            }
        }
    }

    private getSafeId(name: string): string {
        return `paid-zone-${name.replace(/\s+/g, '-')}`;
    }
}