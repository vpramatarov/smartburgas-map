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
    public layerOptions: { translate_name_key: string; color: string } = {translate_name_key: 'layer_paid_parking_zones', color: '#3498db'};

    private map!: L.Map;
    private layer!: L.LayerGroup;
    private currentLang: SupportedLanguage = 'bg';
    private onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: GeoFeature) => void;
    private currentSelection: { name: string; layer: L.Path } | null = null;
    private featureMap: Map<string, L.Path> = new Map();
    private cachedData: GeoFeature[] = [];
    private geoJsonLayer!: L.GeoJSON;
    // Persistent popup shown after a click (desktop & mobile)
    private activePopup: L.Popup | null = null;
    private tooltipHtmlMap: Map<string, string> = new Map();
    private currentFilterGeometry: FilterGeometry | null = null;

    constructor(onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: GeoFeature) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: L.Map, _onPin: (sensor: SensorProperties) => void): void {
        this.map = map;
        this.layer = L.layerGroup();
        this.layer.addTo(map);

        // Close popup + clear selection when user clicks on the map background (i.e. not on a paid zone polygon)
        this.map.on('click', () => {
            if (this.currentSelection) {
                this.clearSelection();
            }
        });
    }

    getLayer(): L.LayerGroup {
        return this.layer;
    }

    async loadData(lang: string): Promise<void> {
        // Save the selected zone's BG Name before reload (display name changes with language, but Name is stable)
        let reSelectName: string | null = null;
        if (this.currentSelection) {
            const geom = this.getCurrentGeometry();
            const feature = this.cachedData.find(f => f.geometry === geom);
            if (feature) {
                reSelectName = feature.properties?.Name ?? null;
            }
        }
        this.currentSelection = null;
        this.closeActivePopup();

        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();

        const res = await fetch('/api/paid-parking-zones');
        if (!res.ok) {
            throw new Error(`Server returned ${res.status}`);
        }

        const data = await res.json();
        this.cachedData = data.features || [];
        this.applyRegionFilter(this.currentFilterGeometry);

        // Re-apply selection if one was active before the reload
        if (reSelectName) {
            const feature = this.cachedData.find(f => f.properties?.Name === reSelectName);
            if (feature) {
                const displayName = this.currentLang === 'en' && feature.properties?.NameEn
                    ? feature.properties.NameEn : feature.properties?.Name;
                const layer = this.featureMap.get(displayName);
                if (displayName && layer) {
                    this.toggleSelection(displayName, layer, feature, false, false);
                }
            }
        }
    }

    applyRegionFilter(geometry: FilterGeometry | null): void {
        if (!this.layer) {
            return;
        }

        // If the geometry being passed is a Paid Parking Zone itself, don't filter — keep all zones visible so the user can switch between them.
        if (geometry && this.cachedData.some(f => f.geometry === geometry)) {
            return;
        }

        this.currentFilterGeometry = geometry;
        this.layer.clearLayers();
        this.featureMap.clear();
        this.tooltipHtmlMap.clear();

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

            // Rebind tooltip now that it's no longer selected
            const prevHtml = this.tooltipHtmlMap.get(prevName);
            if (prevHtml && prevLayer.bindTooltip) {
                prevLayer.bindTooltip(prevHtml, { sticky: true });
            }

            const prevCb = document.getElementById(Utils.getSafeId('paid-zone', prevName)) as HTMLInputElement | null;
            if (prevCb) {
                prevCb.checked = false;
            }

            // Close the persistent popup on ALL platforms
            this.closeActivePopup();
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
            const name: string = this.currentLang === 'en' && feature.properties?.NameEn ? feature.properties.NameEn : feature.properties?.Name;
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

    /** Closes and removes any currently open persistent popup */
    private closeActivePopup(): void {
        if (this.activePopup) {
            this.activePopup.remove();
            this.activePopup = null;
        }
    }

    /** Returns the visual center (centroid) of a GeoJSON polygon feature for popup placement */
    private getFeatureCenter(feature: GeoFeature): L.LatLng {
        // Use Leaflet's built-in bounds center for polygons
        try {
            const tempLayer = L.geoJSON(feature as any);
            return tempLayer.getBounds().getCenter();
        } catch {
            // Fallback: first coordinate
            if (feature.geometry.type === 'Polygon') {
                const coords = (feature.geometry.coordinates as Position[][])[0][0];
                return L.latLng(coords[1], coords[0]);
            }
            if (feature.geometry.type === 'MultiPolygon') {
                const coords = (feature.geometry.coordinates as Position[][][])[0][0][0];
                return L.latLng(coords[1], coords[0]);
            }
            return this.map.getCenter();
        }
    }

    private addGeoJsonToLayer(features: GeoFeature[]): void {
        if (this.geoJsonLayer) {
            this.layer.removeLayer(this.geoJsonLayer);
        }

        this.geoJsonLayer = L.geoJSON(features as any, {
            style: (feature?: GeoJSON.Feature): L.PathOptions => {
                const props = (feature as GeoFeature)?.properties;
                const isGreen = props?.ZoneType === 1;
                const color = isGreen ? '#2ecc71' : '#3498db';
                const name: string = this.currentLang === 'en' && props?.NameEn ? props.NameEn : props?.Name;

                if (this.currentSelection?.name === name) {
                    return { color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' };
                }

                return { color, weight: 2, opacity: 0.8, fillColor: color, fillOpacity: 0.2, dashArray: '3, 6' };
            },
            onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer): void => {
                const geoFeature = feature as GeoFeature;
                const props = geoFeature.properties;
                if (!props) {
                    return;
                }

                const name: string = this.currentLang === 'en' && props.NameEn ? props.NameEn : props.Name;
                const path = layer as L.Path;

                this.featureMap.set(name, path);

                if (this.currentSelection?.name === name) {
                    path.setStyle({ color: '#e74c3c', weight: 3, opacity: 0.8, fillColor: '#e74c3c', fillOpacity: 0.4, dashArray: '' });
                    this.currentSelection.layer = path;
                }

                let workingHours = props.parsedWorkingHours || null;

                if (!workingHours) {
                    const start = Utils.formatTime(props.StartTime);
                    const end = Utils.formatTime(props.EndTime);
                    workingHours = start && end ? [`${start} - ${end}`] : [t('status_unknown', this.currentLang)];
                } else {
                    workingHours = Utils.buildWorkingHoursUI(workingHours, this.currentLang);
                }

                const price =  props.parsedPrice || '1 \u20AC / 1.96'; // ${props.PricePerHo} - 2
                const zoneInfoUrl = props.zoneInfoUrl || null;
                let zoneInfo = '';

                if (zoneInfoUrl) {
                    zoneInfo += `<p style="margin:4px 0;"><a href="${zoneInfoUrl}" target="_blank"><strong>${t('paid_zone_info', this.currentLang)}</strong></a></p>`
                }

                const popupHtml = `
                    <div class="marker-popup-hover" style="min-width: 160px;">
                        <h4 style="margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:4px;">${Utils.escapeHtml(name)}</h4>
                        <p style="margin:4px 0;"><strong>${t('price_per_hour', this.currentLang)}:</strong> ${Utils.escapeHtml(price)} ${t('bgn', this.currentLang)}</p>
                        <p style="margin:4px 0;"><strong>${t('sms_number', this.currentLang)}:</strong> ${Utils.escapeHtml(String(props.SmsNumber))}</p>
                        <p style="margin:4px 0;"><strong>${t('working_hours', this.currentLang)}:</strong> ${workingHours.join('<br>')}</p>
                        ${zoneInfo}
                        <p style="margin:8px 0 0 0; font-size: 0.85em; color: #666; font-style: italic;">${t('click_to_filter', this.currentLang)}</p>
                    </div>
                `;

                this.tooltipHtmlMap.set(name, popupHtml);

                // Desktop-only: tooltip on hover (only for non-selected zones)
                const isMobile = () => window.innerWidth <= 991;

                layer.on('click', (e: L.LeafletEvent): void => {
                    // Stop propagation so the map background 'click' handler doesn't immediately trigger clearSelection after we just set the new selection.
                    L.DomEvent.stopPropagation(e as L.LeafletMouseEvent);

                    const wasSelected = this.currentSelection?.name === name;

                    // Close any existing tooltip on this path to avoid overlap with the popup
                    if (path.closeTooltip) {
                        path.closeTooltip();
                    }

                    if (wasSelected) {
                        // Clicking the already-selected zone toggles it off
                        this.clearSelection();
                    } else {
                        // Select new zone, show persistent popup
                        this.toggleSelection(name, path, geoFeature);

                        // Place popup at the visual center of the polygon
                        const center = this.getFeatureCenter(geoFeature);
                        this.closeActivePopup();
                        this.activePopup = L.popup({ closeButton: true, autoClose: false, closeOnClick: false })
                            .setLatLng(center)
                            .setContent(popupHtml)
                            .openOn(this.map);
                    }
                });

                // Desktop hover: highlight non-selected zones; do NOT disturb active popup
                layer.on('mouseover', (): void => {
                    if (!isMobile() && this.currentSelection?.name !== name) {
                        path.setStyle({ fillOpacity: 0.4, weight: 3 });
                    }
                });

                layer.on('mouseout', (): void => {
                    if (!isMobile() && this.currentSelection?.name !== name) {
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
        if (!container) {
            return;
        }

        container.innerHTML = '';

        const zoneNames = Array.from(new Set(
            features.map(f => this.currentLang === 'en' && f.properties.NameEn ? f.properties.NameEn as string : f.properties.Name as string)
        )).sort();

        zoneNames.forEach(name => {
            if (!name) {
                return;
            }

            const div = document.createElement('div') as HTMLDivElement;
            div.className = 'paid-zone-item';

            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = Utils.getSafeId('paid-zone', name);
            checkbox.value = name;

            if (this.currentSelection?.name === name) {
                checkbox.checked = true;
            }

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);
                const feature = features.find(f => (this.currentLang === 'en' && f.properties.NameEn ? f.properties.NameEn : f.properties.Name) === name);

                if (target.checked && feature && layer) {
                    this.toggleSelection(name, layer, feature, true);

                    // Show popup when selecting from sidebar too
                    const center = this.getFeatureCenter(feature);
                    this.closeActivePopup();

                    let workingHours = feature.properties.parsedWorkingHours || null;

                    if (!workingHours) {
                        const start = Utils.formatTime(feature.properties.StartTime);
                        const end = Utils.formatTime(feature.properties.EndTime);
                        workingHours = start && end ? [`${start} - ${end}`] : [t('status_unknown', this.currentLang)];
                    } else {
                        workingHours = Utils.buildWorkingHoursUI(workingHours, this.currentLang);
                    }

                    const price =  feature.properties.parsedPrice || '1 \u20AC / 1.96';
                    const zoneInfoUrl = feature.properties.zoneInfoUrl || null;
                    let zoneInfo = '';

                    if (zoneInfoUrl) {
                        zoneInfo += `<p style="margin:4px 0;"><a href="${zoneInfoUrl}" target="_blank"><strong>${t('paid_zone_info', this.currentLang)}</strong></a></p>`
                    }

                    const popupHtml = `
                        <div class="marker-popup-hover" style="min-width: 160px;">
                            <h4 style="margin-bottom:8px; border-bottom:1px solid #ccc; padding-bottom:4px;">${Utils.escapeHtml(name)}</h4>
                            <p style="margin:4px 0;"><strong>${t('price_per_hour', this.currentLang)}:</strong> ${Utils.escapeHtml(price)} ${t('bgn', this.currentLang)}</p>
                            <p style="margin:4px 0;"><strong>${t('sms_number', this.currentLang)}:</strong> ${Utils.escapeHtml(String(feature.properties.SmsNumber))}</p>
                            <p style="margin:4px 0;"><strong>${t('working_hours', this.currentLang)}:</strong> ${workingHours.join('<br>')}</p>
                            ${zoneInfo}
                            <p style="margin:8px 0 0 0; font-size: 0.85em; color: #666; font-style: italic;">${t('click_to_filter', this.currentLang)}</p>
                        </div>
                    `;
                    this.activePopup = L.popup({ closeButton: true, autoClose: false, closeOnClick: false })
                        .setLatLng(center)
                        .setContent(popupHtml)
                        .openOn(this.map);
                } else {
                    this.clearSelection();
                }
            });

            const label = document.createElement('label') as HTMLLabelElement;
            label.htmlFor = Utils.getSafeId('paid-zone', name);
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

                // Rebind tooltip for the zone being deselected
                const prevHtml = this.tooltipHtmlMap.get(prevName);
                if (prevHtml && prevLayer.bindTooltip) {
                    prevLayer.bindTooltip(prevHtml, { sticky: true });
                }

                const prevCb = document.getElementById(Utils.getSafeId('paid-zone', prevName)) as HTMLInputElement | null;
                if (prevCb) {
                    prevCb.checked = false;
                }

                // Close previous popup when switching zones
                this.closeActivePopup();
            }

            this.currentSelection = { name, layer };
            layer.setStyle({ color: '#e74c3c', weight: 3, fillOpacity: 0.4, dashArray: '' });
            layer.unbindTooltip?.();

            const newCb = document.getElementById(Utils.getSafeId('paid-zone', name)) as HTMLInputElement | null;
            if (newCb) {
                newCb.checked = true;
            }

            if (triggerFilter) {
                this.onFilterChange(feature.geometry as FilterGeometry, this, feature);
            }
        }
    }
}