// src/strategies/AdministrativeRegionStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {ChartDataset, FilterGeometry, GeoFeature, SensorProperties, SupportedLanguage} from '../Types.js';
import {t} from "../Translations.js";

declare const L: any;

export class AdministrativeRegionStrategy implements IDetailsStrategy {
    public name = 'admin_regions';
    public checkbox_id = 'toggle-admin-regions';
    private layer: any;
    private currentLang: SupportedLanguage = 'bg'; // Default fallback
    private onFilterChange: (geometry: FilterGeometry | null) => void;
    // State to track the currently active region
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
            const res = await fetch('/api/admin-regions');

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const data = await res.json();

            const geoJsonLayer = L.geoJSON(data, {
                style: {
                    color: '#3498db',
                    weight: 1,
                    opacity: 0.5,
                    fillColor: '#3498db',
                    fillOpacity: 0.05, // Very transparent
                    dashArray: '4, 4'
                },
                onEachFeature: (feature: any, layer: any) => {
                    const regionName = feature.properties?.CAU || t('status_unknown', this.currentLang);

                    // Store reference for the sidebar to use later
                    this.featureMap.set(regionName, layer);

                    // Click to Filter
                    layer.on('click', () => {
                        this.selectRegion(regionName, layer, feature.geometry);
                    });

                    // Hover effects
                    layer.on('mouseover', () => {
                        if (this.currentSelection?.name !== regionName) {
                            layer.setStyle({ fillOpacity: 0.2, weight: 2 });
                        }
                    });
                    layer.on('mouseout', () => {
                        if (this.currentSelection?.name !== regionName) {
                            geoJsonLayer.resetStyle(layer);
                        }
                    });

                    // Simple tooltip with region name (assuming property exists, e.g., 'Name')
                    if (feature.properties && feature.properties.Name) {
                        layer.bindTooltip(feature.properties.Name, { sticky: true });
                    }
                }
            });

            this.layer.addLayer(geoJsonLayer);
            this.renderSidebarControls(data.features);
        } catch (err) {
            console.error('Error loading regions:', err);
        }
    }

    /**
     * Generates the checkboxes in the sidebar based on the unique CAU names.
     */
    private renderSidebarControls(features: GeoFeature[]) {
        const container = document.getElementById('region-filters-wrapper') as HTMLDivElement;
        if (!container) {
            return;
        }

        container.innerHTML = '';

        // Extract unique names and sort them
        const regionNames = Array.from(new Set(features.map(f => f.properties?.CAU))).sort();

        regionNames.forEach(name => {
            if (!name) {
                return;
            }

            const div = document.createElement('div') as HTMLDivElement;
            div.className = 'region-item';

            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = `region-${name}`;
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
            label.htmlFor = `region-${name}`;
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
                color: '#3498db',
                weight: 1,
                fillOpacity: 0.05,
                dashArray: '4, 4'
            });

            // Uncheck previous checkbox
            const prevCheckbox = document.getElementById(`region-${this.currentSelection.name}`) as HTMLInputElement;
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
        const newCheckbox = document.getElementById(`region-${name}`) as HTMLInputElement;
        if (newCheckbox) {
            newCheckbox.checked = true;
        }

        // 4. Trigger Global Filter
        this.onFilterChange(geometry);
    }

    private clearSelection() {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({
                color: '#3498db',
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