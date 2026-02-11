// src/strategies/WasteCentreStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {ChartDataset, DynamicDataPoint, GeoFeature, GeoJSONInput, SensorProperties} from '../Types.js';
import { Utils } from '../Utils.js';

declare const L: any;

export class WasteCentreStrategy implements IDetailsStrategy {
    public name = 'waste_centre';
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.onPin = onPin;
        this.layer = L.layerGroup();
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string): Promise<void> {
        if (!this.layer) {
            return;
        }

        this.layer.clearLayers();
        Utils.updateTimestampUI('waste-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/waste-mobile?lang=${lang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('waste-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);

            this.addGeoJsonToLayer(data, { color: "#9b59b6" });
        } catch (err) {
            console.error('Waste Centre load error:', err);
        }
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                return L.circleMarker(latlng, {
                    radius: 8,
                    fillColor: options.color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>${props.address}</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, -5)
                });

                layer.on('mouseover', (e: any) => {
                    e.target.openPopup();
                    e.target.setStyle({ weight: 3, radius: 9 });
                });

                layer.on('mouseout', (e: any) => {
                    e.target.closePopup();
                    e.target.setStyle({ weight: 1, radius: 7 });
                });

                layer.on('click', () => {
                    if (this.onPin) {
                        this.onPin(props);
                    }
                });
            }
        }).addTo(this.layer);
    }

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {

        if (sensor.image) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.image.trim();
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.address) {
            container.innerHTML += `<div class="data-row">${sensor.address}</div>`;
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.fontSize = '12px';
            desc.style.color = '#666';
            desc.style.marginBottom = '10px';
            if (sensor.description) {
                desc.innerHTML = sensor.description;
            }
            container.appendChild(desc);
        }

        // We scan the data history to find all unique garbage types available for this center
        if (sensor.data && Array.isArray(sensor.data)) {
            const uniqueTypes = new Map<string, {name: string, color: string, weight: string, weight_unit: string, time: string}>();

            sensor.data.forEach((d: DynamicDataPoint) => {
                if (!uniqueTypes.has(d.Garbage_id)) {
                    uniqueTypes.set(d.Garbage_id, {
                        name: d.Garbage_name,
                        color: d.Garbage_Colour,
                        weight: d.Garbage_Weight,
                        weight_unit: d.Garbage_Weight_type,
                        time: d.time
                    });
                }
            });

            if (uniqueTypes.size > 0) {
                const toggleDiv = document.createElement('div') as HTMLDivElement;
                toggleDiv.className = 'property-toggles';

                uniqueTypes.forEach((meta, id) => {
                    const uniqueId = `${uniqueIdPrefix}-${id}`;
                    // We use the Garbage_id as the property key for retrieval later

                    const row = document.createElement('div') as HTMLDivElement;
                    row.className = 'data-row toggle-row';
                    row.innerHTML = `
                        <div class="prop-label" style="border-left: 3px solid ${meta.color}; padding-left:5px; flex: 1;">
                            ${meta.name}
                        </div>
                        
                        <div class="prop-additional">
                            <div>${meta.weight} ${meta.weight_unit}</div>
                            <div><small>${meta.time}</small></div>
                        </div>
                       
                        <input type="checkbox" id="${uniqueId}" 
                               data-property="${id}" 
                               data-sensor-index="${uniqueIdPrefix.split('-')[1]}" 
                               class="chart-toggle-checkbox" />
                        <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
                    `;
                    toggleDiv.appendChild(row);
                });

                container.appendChild(toggleDiv);

                toggleDiv.querySelectorAll('input').forEach(box => {
                    box.addEventListener('change', onChartRequest);
                });
            }
        }
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        const data = sensor.data;
        if (!data) {
            return null;
        }

        // Filter data for the specific garbage type
        const points = data.filter(d => d.Garbage_id === property);

        if (points.length === 0) {
            return null;
        }

        // Sort by time
        // points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const values = points.map(d => parseFloat(d.Garbage_Weight));
        const times = points.map(d => d.time);

        // Metadata from first point
        const meta = points[0];

        return {
            label: meta.Garbage_name,
            values: values,
            times: times,
            unit: meta.Garbage_Weight_type || 'kg',
        };
    }
}