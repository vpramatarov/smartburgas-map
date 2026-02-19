// src/strategies/TaxiRankStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, GeoFeature, GeoJSONInput, SensorProperties } from '../Types.js';
import { Utils } from '../Utils.js';

declare const L: any;

export class TaxiRankStrategy implements IDetailsStrategy {
    public name = 'taxi_rank';
    public checkbox_id = 'toggle-taxi';
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
        Utils.updateTimestampUI('taxi-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/taxi-ranks?lang=${lang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('taxi-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);

            this.addGeoJsonToLayer(data, { color: "#f1c40f" });
        } catch (err) {
            console.error('Taxi Rank load error:', err);
        }
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                const iconClass = "icon-taxi-sign_76588";

                const iconHtml = `
                    <div class="custom-pin-marker" style="background-color: ${options.color};">
                        <i class="${iconClass}" style="color: #000;"></i>
                    </div>
                `;

                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'custom-pin-wrapper',
                        html: iconHtml,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30], // Anchors the bottom tip of the pin to the coordinate
                        popupAnchor: [0, -32] // Opens the popup right above the pin
                    })
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>Click for details</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, 0)
                });

                layer.on('mouseover', (e: any) => { e.target.openPopup(); });
                layer.on('mouseout', (e: any) => { e.target.closePopup(); });

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

        if (sensor.pic_url) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.pic_url;
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.fontSize = '13px';
            desc.style.fontWeight = 'bold';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        }

        if (sensor.name) {
            const loc = document.createElement('div') as HTMLDivElement;
            loc.style.fontSize = '12px';
            loc.style.color = '#666';
            loc.style.marginTop = '4px';
            loc.innerHTML = sensor.name;
            container.appendChild(loc);
        }
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        return null;
    }
}