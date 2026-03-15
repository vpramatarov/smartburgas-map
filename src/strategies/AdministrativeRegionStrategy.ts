// src/strategies/AdministrativeRegionStrategy.ts
import {ChartDataset, FilterGeometry, GeoFeature, Position, SensorProperties, SupportedLanguage} from '../Types.js';
import {t} from "../Translations.js";
import {Utils} from "../Utils.js";
import {ISpatialFilterStrategy} from "./ISpatialFilterStrategy.js";

declare const L: any;

export class AdministrativeRegionStrategy implements ISpatialFilterStrategy {
    public parentStrategy?: ISpatialFilterStrategy;
    public childStrategies?: ISpatialFilterStrategy[];
    public name = 'admin_regions';
    public checkbox_id = 'toggle-admin-regions';
    public layerOptions: { color: string } = { color: "#3498db" };
    private layer: any;
    private currentLang: SupportedLanguage = 'bg';
    private onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy) => void;
    private currentSelection: { name: string, layer: any } | null = null;
    private featureMap: Map<string, any> = new Map();
    private cachedData: GeoFeature[] = [];

    constructor(onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.layer = L.layerGroup();
        this.layer.addTo(map);
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
            this.cachedData = data.features || [];

            const geoJsonLayer = L.geoJSON(data, {
                style: {
                    color: this.layerOptions.color,
                    weight: 1,
                    opacity: 0.5,
                    fillColor: this.layerOptions.color,
                    fillOpacity: 0.05,
                    dashArray: '4, 4'
                },
                onEachFeature: (feature: any, layer: any) => {
                    const regionName = feature.properties?.CAU || t('status_unknown', this.currentLang);
                    this.featureMap.set(regionName, layer);

                    layer.on('click', () => {
                        this.selectRegion(regionName, layer, feature.geometry);
                    });

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

    public selectRegionByPoint(point: Position, triggerFilter: boolean = true) {
        const feature = this.cachedData.find(f => Utils.isPointInPolygon(point, f.geometry as FilterGeometry));
        if (feature) {
            const name = feature.properties?.CAU;
            const layer = this.featureMap.get(name);
            if (name && layer) {
                this.selectRegion(name, layer, feature.geometry as FilterGeometry, triggerFilter);
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

    public clearSelection(triggerFilter: boolean = true) {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({ color: this.layerOptions.color, weight: 1, fillOpacity: 0.05, dashArray: '4, 4' });
            const prevCheckbox = document.getElementById(`region-${this.currentSelection.name}`) as HTMLInputElement;
            if (prevCheckbox) {
                prevCheckbox.checked = false;
            }
            this.currentSelection = null;
        }
        if (triggerFilter) {
            this.onFilterChange(null, this);
        }
    }

    applyRegionFilter(geometry: FilterGeometry | null): void {}
    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {}
    getChartData(sensor: SensorProperties): ChartDataset | null { return null; }

    private renderSidebarControls(features: GeoFeature[]) {
        const container = document.getElementById('region-filters-wrapper') as HTMLDivElement;
        if (!container) {
            return;
        }

        container.innerHTML = '';
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

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);

                if (target.checked) {
                    const geometry = layer.feature.geometry;
                    this.selectRegion(name, layer, geometry);
                } else {
                    this.clearSelection();
                }
            });

            const label = document.createElement('label') as HTMLLabelElement;
            label.htmlFor = `region-${name}`;
            label.innerText = name;

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    private selectRegion(name: string, layer: any, geometry: FilterGeometry, triggerFilter: boolean = true) {
        if (this.currentSelection?.name === name) {
            return;
        }

        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({ color: this.layerOptions.color, weight: 1, fillOpacity: 0.05, dashArray: '4, 4' });
            const prevCheckbox = document.getElementById(`region-${this.currentSelection.name}`) as HTMLInputElement;
            if (prevCheckbox) {
                prevCheckbox.checked = false;
            }
        }

        this.currentSelection = { name, layer };
        layer.setStyle({ color: '#e74c3c', weight: 3, fillOpacity: 0.15, dashArray: '' });

        const newCheckbox = document.getElementById(`region-${name}`) as HTMLInputElement;
        if (newCheckbox) {
            newCheckbox.checked = true;
        }

        if (triggerFilter) {
            this.onFilterChange(geometry, this);
        }
    }
}