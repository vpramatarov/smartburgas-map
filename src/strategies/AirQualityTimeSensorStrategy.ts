import { IDetailsStrategy } from "./IDetailsStrategy.js";
import { ChartDataset, GeoFeature, GeoJSONInput, SensorProperties } from "../Types.js";
import { Utils } from "../Utils.js";

declare const L: any;

export class AirQualityTimeSensorStrategy implements IDetailsStrategy {
    public name = 'air_quality_time';
    public checkbox_id = 'toggle-air-quality-time';
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;

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

        this.layer.clearLayers();
        Utils.updateTimestampUI('air-quality-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/air-quality-time?lang=${lang}`);

            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('air-quality-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.addGeoJsonToLayer(data, { color: "#008000" });
        } catch (err) {
            console.error('Air Quality load error:', err);
        }
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
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>Click to Pin</p></div>`, {
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
        if (!sensor.data || sensor.data.length === 0) {
            container.innerHTML = '<p>No data available</p>';
            return;
        }

        const latestData = sensor.data[sensor.data.length - 1];
        const toggleContainer = document.createElement('div') as HTMLDivElement;
        toggleContainer.className = 'property-toggles';

        for (const p in latestData) {
            if (p.endsWith('_unit') || p === 'time') {
                continue;
            }

            let value = latestData[p];

            if (value === undefined || value === null) {
                continue;
            }

            const unit = latestData[p + '_unit'] || '';
            const uniqueId = `${uniqueIdPrefix}-${p}`;
            const rowDiv = document.createElement('div') as HTMLDivElement;
            rowDiv.classList.add('data-row', 'toggle-row');
            const textDiv = document.createElement('div') as HTMLDivElement;
            textDiv.innerHTML = `<span class="prop-label">${p}:</span> <span class="prop-value">${value} ${unit}</span>`;
            const checkbox = document.createElement('input') as HTMLInputElement;
            checkbox.type = 'checkbox';
            checkbox.id = uniqueId;
            checkbox.dataset.property = p;
            checkbox.dataset.unit = unit;
            checkbox.dataset.sensorIndex = uniqueIdPrefix.split('-')[1];
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