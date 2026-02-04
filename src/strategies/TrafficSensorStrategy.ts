import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js'

export class TrafficSensorStrategy implements IDetailsStrategy {
    public name = 'traffic_sensor';

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

        // Sort to get the "latest" value in the text card
        const sortedForDisplay = [...sensor.data].sort((a, b) => {
            return this.parseTrafficDate(a.time) - this.parseTrafficDate(b.time);
        });
        const lastItem = sortedForDisplay[sortedForDisplay.length - 1];

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

        // Helper fn to generate toggle HTML
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

        // Sort by Time
        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        const sortedValues = dataPoints.map(d => d.value);
        const sortedTimes = dataPoints.map(d => d.isoTime);

        const label = property === 'car_speed' ? 'Speed' : 'Car Count';
        const unit = property === 'car_speed' ? 'km/h' : 'cars';

        return { label: label, values: sortedValues, times: sortedTimes, unit: unit };
    }

    /**
     * Strictly parses traffic dates usually in format DD_MM_YYYY_HH_mm_ss or similar.
     * Replaces underscores and handles DD/MM order.
     */
    private parseTrafficDate(raw: string): number {
        if (!raw) {
            return 0;
        }

        // Replace underscores with spaces for easier regex
        const clean = raw.replace(/_/g, ' ').trim();

        // Try Regex for DD MM YYYY HH mm ss
        // Matches: 03 02 2025 10 30 (with optional seconds)
        const match = clean.match(/^(\d{1,2})[\s\.\-](\d{1,2})[\s\.\-](\d{4})\s+(\d{1,2})[:\s](\d{1,2})(?:[:\s](\d{1,2}))?/);

        if (match) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1; // JS months are 0-indexed
            const year = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);
            const second = match[6] ? parseInt(match[6]) : 0;

            return new Date(year, month, day, hour, minute, second).getTime();
        }

        // Fallback to standard parser if regex fails (e.g. if format is actually YYYY-MM-DD)
        return new Date(clean).getTime();
    }
}