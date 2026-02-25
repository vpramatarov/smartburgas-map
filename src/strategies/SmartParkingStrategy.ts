// src/strategies/SmartParkingStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {ChartDataset, FilterGeometry, GeoFeature, GeoJSONInput, SensorProperties, SupportedLanguage} from '../Types.js';
import { Utils } from '../Utils.js';
import { t } from '../Translations.js';

declare const L: any;

export class SmartParkingStrategy implements IDetailsStrategy {
    public name = 'smart_parking';
    public checkbox_id = 'toggle-smart-parking';
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;
    private currentLang: SupportedLanguage = 'bg'; // Default fallback
    private cachedData: any[] = [];
    private layerOptions: { color: string } = { color: "#2c3e50" };

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
        Utils.updateTimestampUI('smart-car-parking-time', t('loading', this.currentLang));

        try {
            const res = await fetch(`/api/smart-parking?lang=${lang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('smart-car-parking-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.cachedData = Array.isArray(data) ? data : data.features || [];
            this.applyRegionFilter(null); // Initially with no filter
            this.addGeoJsonToLayer(data, this.layerOptions);
        } catch (err) {
            console.error('Parking load error:', err);
        }
    }

    applyRegionFilter(filterGeometry: FilterGeometry | null): void {
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
                const iconClass = "icon-car-parking";

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
                const popupContent = `
                    <div class="marker-popup-hover">
                        <h4>${props.name}</h4>
                        <p><span>${t('free', this.currentLang)}</span>: <strong>${props.additional_info.total_free_lots}</strong> / ${props.additional_info.total_lots}</p>
                    </div>`;

                layer.bindPopup(popupContent, {
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

        if (sensor.additional_info.image) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.additional_info.image;
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        // Statistics
        const free = parseInt(sensor.additional_info.total_free_lots || '0');
        const total = parseInt(sensor.additional_info.total_lots || '0');
        // Calculate usage if load is missing or weird
        const usage = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
        const last_sync = (sensor.data && sensor.data.length > 0) ? sensor.data[0].time : '';

        // Progress bar for occupancy
        const stats = document.createElement('div') as HTMLDivElement;
        stats.innerHTML = `
            <div class="data-row smart-parking">
                <div>
                    <span>
                        <span class="prop-label">${t('capacity', this.currentLang)}:</span> 
                        <span class="prop-value">${free} ${t('free', this.currentLang)} / ${total} ${t('total', this.currentLang)}</span>
                    </span>
                    <span class="prop-additional" style="font-size: 12px;">${last_sync}</span>
                </div>
            </div>
            <div class="data-row smart-parking-progress">
                 <div class="progress">
                    <div style="background:${this.getUsageColor(usage)}; height:100%; width:${usage}%"></div>
                 </div>
                 <div class="occupied">${usage}% ${t('occupied', this.currentLang)}</div>
            </div>
        `;
        container.appendChild(stats);

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.marginTop = '10px';
            desc.style.fontSize = '12px';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        }

        if (sensor.data && sensor.data.length > 0) {
            const toggleDiv = document.createElement('div') as HTMLDivElement;
            toggleDiv.className = 'property-toggles';

            const uniqueId = `${uniqueIdPrefix}-free_lots`;
            toggleDiv.innerHTML = `
                <div class="data-row toggle-row">
                    <span class="prop-label">${t('free_spots_history', this.currentLang)}</span>
                    <input type="checkbox" id="${uniqueId}" 
                           data-property="free_lots" 
                           data-sensor-index="${uniqueIdPrefix.split('-')[1]}" 
                           class="chart-toggle-checkbox" />
                    <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
                </div>
            `;

            container.appendChild(toggleDiv);
            toggleDiv.querySelector('input')?.addEventListener('change', onChartRequest);
        }
    }

    private getUsageColor(percentage: number): string {
        if (percentage < 50) {
            return '#27ae60'; // Green (Plenty of space)
        }

        if (percentage < 85) {
            return '#f39c12'; // Orange (Getting full)
        }

        return '#c0392b'; // Red (Full)
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (property !== 'free_lots') {
            return null;
        }

        if (!sensor.data || sensor.data.length === 0) {
            return null;
        }

        const points = [...sensor.data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const values = points.map(d => parseInt(d.free_lots));
        const times = points.map(d => d.time);

        return {label: t('free_spots', this.currentLang), values: values, times: times, unit: t('spots', this.currentLang)};
    }
}