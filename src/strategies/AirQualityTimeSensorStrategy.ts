// src/strategies/AirQualityTimeSensorStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js';
import { Utils } from '../Utils.js';

export class AirQualityTimeSensorStrategy extends BasePointStrategy {
    public name = 'air_quality_time';
    public checkbox_id = 'toggle-air-quality-time';
    public layerOptions = { translate_name_key: 'layer_air_quality', color: '#008000' };

    protected getApiUrl(lang: string): string {
        return `/api/air-quality-time?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'air-quality-time';
    }

    getIconClass(): string {
        return 'icon-air';
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

            const value = latestData[p];

            if (value === undefined || value === null || String(value).length < 1) {
                continue;
            }

            const unit = latestData[p + '_unit'] || '';
            const uniqueId = `${uniqueIdPrefix}-${p}`;
            const sensorId = Utils.getSensorId(sensor);

            const rowDiv = document.createElement('div') as HTMLDivElement;
            rowDiv.classList.add('data-row', 'toggle-row', 'flex');

            const textDiv = document.createElement('div') as HTMLDivElement;
            let innerHtml = `<span><span class="prop-label">${Utils.escapeHtml(p)}:</span> <span class="prop-value">${Utils.escapeHtml(String(value))} ${Utils.escapeHtml(unit)}</span></span>`;
            if (time) {
                innerHtml += `<span class="prop-additional">${Utils.escapeHtml(time)}</span>`;
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

        const dataPoints = sensor.data
            .map(item => {
                const val = parseFloat(item[property]);
                const timestamp = this.parseDate(item['time']);
                if (isNaN(timestamp)) {
                    return null;
                }
                return {
                    timestamp,
                    isoTime: new Date(timestamp).toISOString(),
                    value: isNaN(val) ? 0 : val,
                    unit: item[property + '_unit']
                };
            })
            .filter((d): d is { timestamp: number; isoTime: string; value: number; unit: string } => d !== null);

        dataPoints.sort((a, b) => a.timestamp - b.timestamp);

        return {
            label: property,
            values: dataPoints.map(d => d.value),
            times: dataPoints.map(d => d.isoTime),
            unit: dataPoints.find(d => d.unit)?.unit || ''
        };
    }

    private parseDate(raw: string): number {
        if (!raw) {
            return NaN;
        }

        const direct = new Date(raw).getTime();
        if (!isNaN(direct)) {
            return direct;
        }

        const cleaned = new Date(raw.replace(/_/g, ' ').replace(/\./g, '-')).getTime();
        return isNaN(cleaned) ? NaN : cleaned;
    }
}
