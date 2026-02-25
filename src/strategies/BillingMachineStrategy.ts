// src/strategies/BillingMachineStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {ChartDataset, GeoFeature, GeoJSONInput, SensorProperties, SupportedLanguage} from '../Types.js';
import { Utils } from '../Utils.js';
import { t } from '../Translations.js';

declare const L: any;

export class BillingMachineStrategy implements IDetailsStrategy {
    public name = 'billing_machine';
    public checkbox_id = 'toggle-billing-machines';
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;
    private currentLang: SupportedLanguage = 'bg'; // Default fallback
    private cachedData: any[] = [];
    private layerOptions: { color: string } = { color: "#3498db" };

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

        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();
        Utils.updateTimestampUI('billing-time', t('loading', this.currentLang));

        try {
            const res = await fetch(`/api/billing-machines?lang=${lang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('billing-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.cachedData = Array.isArray(data) ? data : data.features || [];
            this.applyRegionFilter(null); // Initially with no filter
            this.addGeoJsonToLayer(data, this.layerOptions);
        } catch (err) {
            console.error('Billing Machines load error:', err);
        }
    }

    applyRegionFilter(filterGeometry: any | null): void {
        if (!this.layer) {
            return;
        }

        this.layer.clearLayers();

        // Filter the cached data
        const filteredFeatures = this.cachedData.filter(feature => {
            // Ensure the feature has geometry
            if (!feature.geometry || !feature.geometry.coordinates) {
                return false;
            }

            return Utils.isPointInPolygon(feature.geometry.coordinates, filterGeometry);
        });

        // Re-use the existing addGeoJsonToLayer logic
        this.addGeoJsonToLayer(filteredFeatures, this.layerOptions);
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                const iconClass = "icon-dollar";

                const iconHtml = `
                    <div class="custom-pin-marker" style="background-color: ${options.color};">
                        <i class="${iconClass}"></i>
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
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>${t('click_for_details', this.currentLang)}</p></div>`, {
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