// src/strategies/AdministrativeRegionStrategy.ts
import { ChartDataset, FilterGeometry, GeoFeature, Position, SensorProperties, SupportedLanguage } from '../Types.js';
import { t } from '../Translations.js';
import { Utils } from '../Utils.js';
import { ISpatialFilterStrategy } from './ISpatialFilterStrategy.js';

declare const L: typeof import('leaflet');
import type * as GeoJSON from 'geojson';

export class AdministrativeRegionStrategy implements ISpatialFilterStrategy {
    public parentStrategy?: ISpatialFilterStrategy;
    public childStrategies?: ISpatialFilterStrategy[];
    public name = 'admin_regions';
    public checkbox_id = 'toggle-admin-regions';
    public layerOptions: { color: string } = { color: '#3498db' };

    private layer!: L.LayerGroup;
    private currentLang: SupportedLanguage = 'bg';
    private onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy) => void;
    private currentSelection: { name: string; layer: L.Path } | null = null;
    private featureMap: Map<string, L.Path> = new Map();
    private cachedData: GeoFeature[] = [];

    constructor(onFilterChange: (geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy) => void) {
        this.onFilterChange = onFilterChange;
    }

    initialize(map: L.Map, _onPin: (sensor: SensorProperties) => void): void {
        this.layer = L.layerGroup();
        this.layer.addTo(map);
    }

    getLayer(): L.LayerGroup {
        return this.layer;
    }

    async loadData(lang: string): Promise<void> {
        // Remember selection before reload (CAU name is language-independent)
        const selectedName = this.currentSelection?.name ?? null;
        this.currentSelection = null;

        this.layer.clearLayers();
        this.currentLang = lang as SupportedLanguage;

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
            onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer): void => {
                const geoFeature = feature as unknown as GeoFeature;
                const props = geoFeature.properties;
                const regionName: string = props?.CAU || t('status_unknown', this.currentLang);
                const path = layer as L.Path;
                const geometry = geoFeature.geometry as FilterGeometry;

                this.featureMap.set(regionName, path);

                layer.on('click', () => {
                    this.selectRegion(regionName, path, geometry);
                });

                layer.on('mouseover', () => {
                    if (this.currentSelection?.name !== regionName) {
                        path.setStyle({ fillOpacity: 0.2, weight: 2 });
                    }
                });

                layer.on('mouseout', () => {
                    if (this.currentSelection?.name !== regionName) {
                        geoJsonLayer.resetStyle(path);
                    }
                });

                if (props?.Name) {
                    (layer as L.Path & { bindTooltip: (s: string, o: object) => void })
                        .bindTooltip(props.Name, { sticky: true });
                }
            }
        });

        this.layer.addLayer(geoJsonLayer);
        this.renderSidebarControls(data.features);

        // Re-apply selection if one was active before the reload
        if (selectedName) {
            const layer = this.featureMap.get(selectedName);
            if (layer) {
                const geometry = (layer as any).feature?.geometry as FilterGeometry;
                this.selectRegion(selectedName, layer, geometry, false);
            }
        }
    }

    public selectRegionByPoint(point: Position, triggerFilter: boolean = true): void {
        const feature = this.cachedData.find(f => Utils.isPointInPolygon(point, f.geometry as FilterGeometry));
        if (feature) {
            const name: string = feature.properties?.CAU;
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
            // The layer retains the original GeoJSON feature via Leaflet internals
            return (this.currentSelection.layer as any).feature?.geometry ?? null;
        }
        return null;
    }

    public clearSelection(triggerFilter: boolean = true): void {
        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({ color: this.layerOptions.color, weight: 1, fillOpacity: 0.05, dashArray: '4, 4' });
            const prevCheckbox = document.getElementById(`region-${this.currentSelection.name}`) as HTMLInputElement | null;
            if (prevCheckbox) {
                prevCheckbox.checked = false;
            }
            this.currentSelection = null;
        }
        if (triggerFilter) {
            this.onFilterChange(null, this);
        }
    }

    applyRegionFilter(_geometry: FilterGeometry | null): void {}
    renderCardContent(_container: HTMLElement, _sensor: SensorProperties): void {}
    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null { return null; }

    private renderSidebarControls(features: GeoFeature[]): void {
        const container = document.getElementById('region-filters-wrapper') as HTMLDivElement | null;
        if (!container) {
            return;
        }

        container.innerHTML = '';
        const regionNames = Array.from(new Set(features.map(f => f.properties?.CAU as string))).sort();

        regionNames.forEach(name => {
            if (!name) {
                return;
            }

            const div = document.createElement('div');
            div.className = 'region-item';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = Utils.getSafeId('region', name);
            checkbox.value = name;

            checkbox.addEventListener('change', (e) => {
                const target = e.target as HTMLInputElement;
                const layer = this.featureMap.get(name);
                if (!layer) return;

                if (target.checked) {
                    const geometry = (layer as any).feature?.geometry as FilterGeometry;
                    this.selectRegion(name, layer, geometry);
                } else {
                    this.clearSelection();
                }
            });

            const label = document.createElement('label');
            label.htmlFor = Utils.getSafeId('region', name);
            label.innerText = name;

            div.appendChild(checkbox);
            div.appendChild(label);
            container.appendChild(div);
        });
    }

    private selectRegion(name: string, layer: L.Path, geometry: FilterGeometry, triggerFilter: boolean = true): void {
        if (this.currentSelection?.name === name) {
            return;
        }

        if (this.currentSelection) {
            const prevLayer = this.currentSelection.layer;
            prevLayer.setStyle({ color: this.layerOptions.color, weight: 1, fillOpacity: 0.05, dashArray: '4, 4' });
            const prevCheckbox = document.getElementById(Utils.getSafeId('region', this.currentSelection.name)) as HTMLInputElement | null;
            if (prevCheckbox) {
                prevCheckbox.checked = false;
            }
        }

        this.currentSelection = { name, layer };
        layer.setStyle({ color: '#e74c3c', weight: 3, fillOpacity: 0.15, dashArray: '' });

        const newCheckbox = document.getElementById(Utils.getSafeId('region', name)) as HTMLInputElement | null;
        if (newCheckbox) {
            newCheckbox.checked = true;
        }

        if (triggerFilter) {
            this.onFilterChange(geometry, this);
        }
    }
}


