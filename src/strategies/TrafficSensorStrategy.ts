import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, GeoFeature, GeoJSONInput, SensorProperties } from '../Types.js';
import { Utils } from '../Utils.js';

declare const L: any;

export class TrafficSensorStrategy implements IDetailsStrategy {
    public name = 'traffic_sensor';
    private layer: any; // L.LayerGroup
    private map: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.map = map;
        this.onPin = onPin;
        this.layer = L.layerGroup();
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string, options?: { start_date?: string, end_date?: string }): Promise<void> {
        if (!this.layer) {
            return;
        }

        const dateParams = this.resolveDateParams(options);

        if (dateParams.error) {
            alert(`Traffic Data Error: ${dateParams.error}`);
            console.error(dateParams.error);
            return;
        }

        this.layer.clearLayers();
        Utils.updateTimestampUI('traffic-time', 'Refreshing...');

        try {
            const query = `?lang=${lang}&start_date=${dateParams.start}&end_date=${dateParams.end}`;
            const res = await fetch(`/api/traffic${query}`);

            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('traffic-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);
            this.addGeoJsonToLayer(data, { color: "#e74c3c" });
        } catch (err) {
            console.error('Traffic load error:', err);
        }
    }

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {
        if (!sensor.data || sensor.data.length === 0) {
            container.innerHTML = '<p>No data</p>';
            return;
        }

        const sortedForDisplay = [...sensor.data].sort((a, b) => {
            return this.parseTrafficDate(a.time) - this.parseTrafficDate(b.time);
        });
        const lastItem = sortedForDisplay[sortedForDisplay.length - 1];

        // const lastItem = sensor.data[sensor.data.length - 1];

        if (lastItem) {
            container.innerHTML = `
                <div class="data-row">
                    <span class="prop-label">Car Count:</span> 
                    <span class="prop-value">${lastItem.car_count}</span>
                </div>
                <div class="data-row">
                    <span class="prop-label">Car Speed:</span> 
                    <span class="prop-value">${typeof lastItem.car_speed === 'undefined' ? 'N/A' : lastItem.car_speed + ' km/h'} </span>
                </div>
                <div class="data-row">
                    <span class="timestamp">${lastItem.time}</span>
                </div>
            `;
        }

        const toggleDiv = document.createElement('div') as HTMLDivElement;
        toggleDiv.className = 'property-toggles';

        const createToggleHtml = (key: string, label: string) => {
            const uniqueId = `${uniqueIdPrefix}-${key}`;
            return `
            <div class="data-row toggle-row">
                <span class="prop-label">${label}</span>
                <input type="checkbox" id="${uniqueId}" 
                       data-property="${key}" 
                       data-sensor-index="${uniqueIdPrefix.split('-')[1]}" 
                       class="chart-toggle-checkbox" />
                <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
            </div>
            `;
        };

        toggleDiv.innerHTML = createToggleHtml('car_count', 'Car Count') + createToggleHtml('car_speed', 'Car Speed');
        container.appendChild(toggleDiv);
        const boxes = toggleDiv.querySelectorAll('input');
        boxes.forEach(box => box.addEventListener('change', onChartRequest));
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (!sensor.data || (property !== 'car_count' && property !== 'car_speed')) {
            return null;
        }

        const dataPoints = sensor.data.map(item => {
            const timestamp = this.parseTrafficDate(item.time);
            const rawValue = property === 'car_speed' ? item.car_speed : item.car_count;

            return {
                timestamp: timestamp,
                isoTime: new Date(timestamp).toISOString(),
                value: parseFloat(rawValue || '0')
            };
        });

        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        const sortedValues = dataPoints.map(d => d.value);
        const sortedTimes = dataPoints.map(d => d.isoTime);
        const label = property === 'car_speed' ? 'Speed' : 'Car Count';
        const unit = property === 'car_speed' ? 'km/h' : 'cars';

        return { label: label, values: sortedValues, times: sortedTimes, unit: unit };
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
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>Click to Pin</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, -10)
                });

                layer.on('mouseover', (e: any) => {
                    e.target.openPopup();
                    e.target.setStyle({ weight: 3, radius: 10 });
                });
                layer.on('mouseout', (e: any) => {
                    e.target.closePopup();
                    e.target.setStyle({ weight: 1, radius: 8 });
                });
                layer.on('click', () => {
                    if (this.onPin) {
                        this.onPin(props);
                    }
                });
            }
        }).addTo(this.layer);
    }

    /**
     * Handles default logic and validation constraints
     */
    private resolveDateParams(options?: { start_date?: string, end_date?: string }): { start?: string, end?: string, error?: string } {
        const now = new Date();
        let start: Date;
        let end: Date;

        // Default End: Current Date
        if (options?.end_date) {
            end = new Date(options.end_date);
        } else {
            end = now;
        }

        // Default Start: First day of previous month
        if (options?.start_date) {
            start = new Date(options.start_date);
        } else {
            start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        }

        // Validate Valid Dates
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { error: "Invalid date format provided." };
        }

        // Validate Logic: Range Check
        const diffTime = Math.abs(end.getTime() - start.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const approximateMonths = diffDays / 30;

        if (diffDays < 2) {
            return { error: "Date range must be at least 2 days." };
        }
        if (approximateMonths > 6) {
            return { error: "Date range cannot exceed 6 months." };
        }
        if (start > end) {
            return { error: "Start date cannot be after end date." };
        }

        return { start: Utils.formatDateToLocal(start), end: Utils.formatDateToLocal(end) };
    }

    private parseTrafficDate(raw: string): number {
        if (!raw) {
            return 0;
        }

        const clean = raw.replace(/_/g, ' ').trim();
        const match = clean.match(/^(\d{1,2})[\s\.\-](\d{1,2})[\s\.\-](\d{4})\s+(\d{1,2})[:\s](\d{1,2})(?:[:\s](\d{1,2}))?/);

        if (match) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);
            const second = match[6] ? parseInt(match[6]) : 0;
            return new Date(year, month, day, hour, minute, second).getTime();
        }

        return new Date(clean).getTime();
    }
}