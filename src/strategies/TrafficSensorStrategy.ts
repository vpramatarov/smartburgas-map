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
        if (!sensor.data) {
            container.innerHTML = '<p>No data</p>';
            return;
        }

        // Sort locally just to show the true "latest" value in the text card
        const sortedForDisplay = [...sensor.data].sort((a, b) => {
            return this.parseTrafficDate(a.time) - this.parseTrafficDate(b.time);
        });
        const lastItem = sortedForDisplay[sortedForDisplay.length - 1];

        if(lastItem) {
            container.innerHTML = `
                <div class="data-row">
                    <span class="prop-label">Car Count:</span> 
                    <span class="prop-value">${lastItem.car_count}</span>
                </div>
                <div class="data-row">
                    <span class="timestamp">${lastItem.time}</span>
                </div>
            `;
        }

        const toggleDiv = document.createElement('div') as HTMLDivElement;
        toggleDiv.className = 'property-toggles';
        const uniqueId = `${uniqueIdPrefix}-car_count`;

        toggleDiv.innerHTML = `
            <div class="data-row toggle-row">
                <span class="prop-label">Show Chart</span>
                <input type="checkbox" id="${uniqueId}" 
                       data-property="car_count" 
                       data-sensor-index="${uniqueIdPrefix.split('-')[1]}" 
                       class="chart-toggle-checkbox" />
                <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
            </div>
        `;

        container.appendChild(toggleDiv);

        const box = toggleDiv.querySelector('input') as HTMLElementTagNameMap["input"] | null;
        box?.addEventListener('change', onChartRequest);
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (property !== 'car_count' || !sensor.data) {
            return null;
        }

        // Create mapped array
        const dataPoints = sensor.data.map(item => {
            // Use custom parser
            const timestamp = this.parseTrafficDate(item.time);
            return {
                timestamp: timestamp,
                isoTime: new Date(timestamp).toISOString(),
                value: parseFloat(item.car_count)
            };
        });

        // Sort by Time
        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        const sortedValues = dataPoints.map(d => d.value);
        const sortedTimes = dataPoints.map(d => d.isoTime);

        return {label: 'Car Count', values: sortedValues, times: sortedTimes, unit: 'cars'};
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