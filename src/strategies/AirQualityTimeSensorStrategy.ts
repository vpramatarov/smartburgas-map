import {IDetailsStrategy} from "./IDetailsStrategy.js";
import {ChartDataset, SensorProperties} from "../Types.js";

export class AirQualityTimeSensorStrategy implements IDetailsStrategy {
    public name = 'air_quality_time';

    // 1. Render just the specific content
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
            // IMPORTANT: Extract the index from prefix (e.g. sensor-0 -> 0) to help Composite strategy
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

    // Extract Data
    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (!sensor.data || sensor.data.length === 0) {
            return null;
        }

        // Create a temporary array of objects to keep time & value linked
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

        // Sort by timestamp (Oldest -> Newest)
        dataPoints.sort((a, b) => a.timestamp - b.timestamp);
        const sortedValues = dataPoints.map(d => d.value);
        const sortedTimes = dataPoints.map(d => d.isoTime);
        // Find unit (using the last valid unit found or empty)
        const unitFound = dataPoints.find(d => d.unit)?.unit || '';

        return {label: property, values: sortedValues, times: sortedTimes, unit: unitFound};
    }

    // Legacy/Unused direct call
    renderFull(properties: string[], sensors: SensorProperties[]): void {}

    /**
     * Robust date parser for Air Quality data.
     * Handles standard ISO or custom formats.
     */
    private parseDate(raw: string): number {
        if (!raw) {
            return 0;
        }

        // Try Standard
        const std = new Date(raw).getTime();

        if (!isNaN(std)) {
            return std;
        }

        // Try fixing common separators
        const clean = raw.replace(/_/g, ' ').replace(/\./g, '-');
        const cleanDate = new Date(clean).getTime();

        if (!isNaN(cleanDate)) {
            return cleanDate;
        }

        return 0; // Invalid
    }
}