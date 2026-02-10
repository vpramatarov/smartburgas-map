// src/strategies/BillingMachineStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, GeoFeature, GeoJSONInput, SensorProperties } from '../Types.js';
import { Utils } from '../Utils.js';

declare const L: any;

export class BillingMachineStrategy implements IDetailsStrategy {
    public name = 'billing_machine';
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
        Utils.updateTimestampUI('billing-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/billing-machines?lang=${lang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('billing-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);

            this.addGeoJsonToLayer(data, { color: "#3498db" });
        } catch (err) {
            console.error('Billing Machines load error:', err);
        }
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                return L.circleMarker(latlng, {
                    radius: 6,
                    fillColor: options.color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>Click for details</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, -5)
                });

                layer.on('mouseover', (e: any) => {
                    e.target.openPopup();
                    e.target.setStyle({ weight: 3, radius: 8 });
                });

                layer.on('mouseout', (e: any) => {
                    e.target.closePopup();
                    e.target.setStyle({ weight: 1, radius: 6 });
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

        // if (sensor.pic_url) {
        //     const img = document.createElement('img') as HTMLImageElement;
        //     img.src = sensor.pic_url;
        //     img.style.width = '100%';
        //     img.style.borderRadius = '4px';
        //     img.style.marginBottom = '10px';
        //     if (sensor.name) {
        //         img.alt = sensor.name;
        //     }
        //     container.appendChild(img);
        // }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.fontSize = '13px';
            desc.style.color = '#555';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        } else {
            container.innerHTML += '<p>No description available.</p>';
        }
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        return null;
    }
}