import { IDetailsStrategy } from "./IDetailsStrategy.js";
import {ChartDataset, FilterGeometry, GeoFeature, GeoJSONInput, SensorProperties, SupportedLanguage} from "../Types.js";
import { Utils } from "../Utils.js";
import { t } from '../Translations.js';

declare const L: any;

export class AirQualityTimeSensorStrategy implements IDetailsStrategy {
    public name = 'air_quality_time';
    public checkbox_id = 'toggle-air-quality-time';
    public layerOptions: { translate_name_key: string, color: string } = { translate_name_key: 'layer_air_quality', color: "#008000" };
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;
    private currentLang: SupportedLanguage = 'bg'; // Default fallback
    private cachedData: any[] = [];

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.onPin = onPin;
        this.layer = L.layerGroup();
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string, options?: any): Promise<void> {
        if (!this.layer) {
            return;
        }

        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();
        Utils.updateTimestampUI('air-quality-time', t('loading', this.currentLang));

        try {
            const res = await fetch(`/api/air-quality-time?lang=${lang}`);

            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('air-quality-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.cachedData = Array.isArray(data) ? data : data.features || [];
            this.applyRegionFilter(null); // Initially with no filter
            this.addGeoJsonToLayer(data, this.layerOptions);
        } catch (err) {
            console.error('Air Quality load error:', err);
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

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {
        if (!sensor.data || sensor.data.length === 0) {
            container.innerHTML = '<p>No data available</p>';
            return;
        }

        const latestData = sensor.data[0];
        const toggleContainer = document.createElement('div') as HTMLDivElement;
        toggleContainer.className = 'property-toggles';
        const time = latestData['time'] || '';

        for (const p in latestData) {
            if (p.endsWith('_unit') || p === 'time') {
                continue;
            }

            let value = latestData[p];

            if (value === undefined || value === null || value.length < 1) {
                continue;
            }

            const unit = latestData[p + '_unit'] || '';
            const uniqueId = `${uniqueIdPrefix}-${p}`;
            const sensorId = Utils.getSensorId(sensor);
            const rowDiv = document.createElement('div') as HTMLDivElement;
            rowDiv.classList.add('data-row', 'toggle-row', 'flex');
            const textDiv = document.createElement('div') as HTMLDivElement;
            let innerHtml = `<span><span class="prop-label">${p}:</span> <span class="prop-value">${value} ${unit}</span></span>`;

            if (time) {
                innerHtml += `<span class="prop-additional">${time}</span>`;
            }

            textDiv.innerHTML = innerHtml;
            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = uniqueId;
            checkbox.dataset.property = p;
            checkbox.dataset.unit = unit;
            checkbox.dataset.sensorId = sensorId;
            checkbox.className = 'chart-toggle-checkbox';

            const labelBtn = document.createElement('label') as HTMLLabelElement;
            labelBtn.htmlFor = uniqueId;
            labelBtn.className = 'chart-toggle-btn';
            labelBtn.innerHTML = '<span class="icon-chart-bar"></span>';

            checkbox.addEventListener('change', onChartRequest);

            rowDiv.appendChild(textDiv);
            rowDiv.appendChild(checkbox);
            rowDiv.appendChild(labelBtn);
            toggleContainer.appendChild(rowDiv);
        }
        container.appendChild(toggleContainer);
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (!sensor.data || sensor.data.length === 0) {
            return null;
        }

        const dataPoints = sensor.data.map(item => {
            const val = parseFloat(item[property]);
            const timestamp = this.parseDate(item['time']);
            return {
                timestamp: timestamp,
                isoTime: new Date(timestamp).toISOString(),
                value: isNaN(val) ? 0 : val,
                unit: item[property + '_unit']
            };
        });

        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        const sortedValues = dataPoints.map(d => d.value);
        const sortedTimes = dataPoints.map(d => d.isoTime);
        const unitFound = dataPoints.find(d => d.unit)?.unit || '';

        return {label: property, values: sortedValues, times: sortedTimes, unit: unitFound};
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                const iconClass = "icon-air";

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
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>${t('click_to_pin', this.currentLang)}</p></div>`, {
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

    private parseDate(raw: string): number {
        if (!raw) {
            return 0;
        }

        const time = new Date(raw).getTime();

        if (!isNaN(time)) {
            return time;
        }

        const clean = raw.replace(/_/g, ' ').replace(/\./g, '-');
        const cleanDate = new Date(clean).getTime();

        if (!isNaN(cleanDate)) {
            return cleanDate;
        }

        return 0;
    }
}