// src/strategies/PaidParkingZonesStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {ChartDataset, FilterGeometry, GeoFeature, SensorProperties, SupportedLanguage} from '../Types.js';
import {t} from "../Translations.js";

declare const L: any;

export class PaidParkingZonesStrategy implements IDetailsStrategy {
    public name = 'paid_parking_zones';
    public checkbox_id = 'toggle-paid-parking-zones';
    public layerOptions: { translate_name_key: string, color: string } = { translate_name_key: 'layer_paid_parking_zones', color: "#3498db" };
    private layer: any;
    private currentLang: SupportedLanguage = 'bg'; // Default fallback
    private onFilterChange: (geometry: FilterGeometry | null) => void;
    // State to track the currently active paind zone
    private currentSelection: { name: string, layer: any } | null = null;
    // Cache the features to link sidebar buttons to map layers
    private featureMap: Map<string, any> = new Map();

    // We pass a callback specifically for the filter action
    constructor(onFilterChange: (geometry: FilterGeometry | null) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.layer = L.layerGroup();
        this.layer.addTo(map); // Ensure it's added immediately
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string): Promise<void> {
        this.layer.clearLayers();
        this.currentLang = lang as SupportedLanguage;

        try {
            const res = await fetch('/api/paid-parking-zones');

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const data = await res.json();

            const geoJsonLayer = L.geoJSON(data, {
                style: (feature: any) => {
                    // ZoneType 1 = Green Zone, ZoneType 2 = Blue Zone
                    const isGreen = feature.properties?.ZoneType === 1;
                    const color = isGreen ? '#2ecc71' : '#3498db';
                    return {
                        color: color,
                        weight: 2,
                        opacity: 0.8,
                        fillColor: color,
                        fillOpacity: 0.2,
                        dashArray: '3, 6'
                    };
                },
                onEachFeature: (feature: any, layer: any) => {
                    const props = feature.properties;
                    if (!props) {
                        return;
                    }

                    const name = this.currentLang === 'en' && props.NameEn ? props.NameEn : props.Name;

                    this.featureMap.set(name, layer);

                    // Cleanup time format from "2000/01/01 07:00:00.000" to "07:00"
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

                    layer.bindPopup(popupHtml, { closeButton: false });

                    layer.on('click', () => {
                        this.selectRegion(name, layer, feature.geometry);
                    });

                    layer.on('mouseover', (e: any) => {
                        if (this.currentSelection?.name !== name) {
                            layer.setStyle({ fillOpacity: 0.4, weight: 3 });
                        }

                        e.target.openPopup();
                    });

                    layer.on('mouseout', (e: any) => {
                        if (this.currentSelection?.name !== name) {
                            geoJsonLayer.resetStyle(layer);
                        }

                        e.target.closePopup();
                    });
                }
            });

            this.layer.addLayer(geoJsonLayer);
            this.renderSidebarControls(data.features);
        } catch (err) {
            console.error('Error loading regions:', err);
        }
    }

    /**
     * Generates the checkboxes in the sidebar based on the unique names.
     */
    private renderSidebarControls(features: GeoFeature[]) {
        const container = document.getElementById('paid-parking-zones-wrapper') as HTMLDivElement;
        if (!container) {
            return;
        }

        container.innerHTML = '';

        // Extract unique names and sort them
        const zoneNames = Array.from(new Set(features.map(f => this.currentLang === 'en' && f.properties.NameEn ? f.properties.NameEn : f.properties.Name))).sort();

        zoneNames.forEach(name => {
            if (!name) {
                return;
            }

            const div = document.createElement('div') as HTMLDivElement;
            div.className = 'paid-zone-item';

            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = `paid-zone-${name}`;
            checkbox.value = name;

            // Handle Sidebar Click
            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);

                if (target.checked) {
                    // Extract geometry from the Leaflet layer
                    // (Leaflet stores GeoJSON geometry in layer.feature.geometry)
                    const geometry = layer.feature.geometry;
                    this.selectRegion(name, layer, geometry);
                } else {
                    // Deselect
                    this.clearSelection();
                }
            });

            const label = document.createElement('label') as HTMLLabelElement;
            label.htmlFor = `paid-zone-${name}`;
            label.innerText = name;
            label.style.cursor = 'pointer';

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    /**
     * Centralized Logic for Selecting a Region
     * Handles: Unchecking others, Highlighting Map, Triggering Filter
     */
    private selectRegion(name: string, layer: any, geometry: FilterGeometry) {
        // If clicking the already selected one, do nothing (or deselect if logic requires)
        if (this.currentSelection?.name === name) {
            return;
        }

        // Reset previous selection (Visuals + Checkbox)
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            // Reset style (using default logic from geoJSON layer would be cleaner, but manual reset works for now)
            prevLayer.setStyle({
                color: this.layerOptions.color,
                weight: 1,
                fillOpacity: 0.05,
                dashArray: '4, 4'
            });

            // Uncheck previous checkbox
            const prevCheckbox = document.getElementById(`paid-zone-${this.currentSelection.name}`) as HTMLInputElement;
            if (prevCheckbox) {
                prevCheckbox.checked = false;
            }
        }

        // Set New Selection
        this.currentSelection = { name, layer };

        // Highlight Map
        layer.setStyle({
            color: '#e74c3c',
            weight: 3,
            fillOpacity: 0.15,
            dashArray: ''
        });

        // Check New Checkbox
        const newCheckbox = document.getElementById(`paid-zone-${name}`) as HTMLInputElement;
        if (newCheckbox) {
            newCheckbox.checked = true;
        }

        // Trigger Global Filter
        this.onFilterChange(geometry);
    }

    private clearSelection() {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({
                color: this.layerOptions.color,
                weight: 1,
                fillOpacity: 0.05,
                dashArray: '4, 4'
            });
            this.currentSelection = null;
        }
        this.onFilterChange(null);
    }

    // This layer itself is not filtered by other polygons
    applyRegionFilter(geometry: FilterGeometry | null): void {}

    // No side panel content for regions
    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {}
    getChartData(sensor: SensorProperties): ChartDataset | null { return null; }
}