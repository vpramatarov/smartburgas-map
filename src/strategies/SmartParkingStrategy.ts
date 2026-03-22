// src/strategies/SmartParkingStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js';
import { Utils } from '../Utils.js';
import { t } from '../Translations.js';

export class SmartParkingStrategy extends BasePointStrategy {
    public name = 'smart_parking';
    public checkbox_id = 'toggle-smart-parking';
    public layerOptions = { translate_name_key: 'layer_smart_parking', color: '#2c3e50' };

    protected getApiUrl(lang: string): string {
        return `/api/smart-parking?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'smart-car-parking-time';
    }

    protected getIconClass(): string {
        return 'icon-car-parking';
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
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        const free = parseInt(sensor.additional_info.total_free_lots || '0');
        const total = parseInt(sensor.additional_info.total_lots || '0');
        const usage = total > 0 ? Math.round(((total - free) / total) * 100) : 0;
        const last_sync = (sensor.data && sensor.data.length > 0) ? sensor.data[0].time : '';

        const stats = document.createElement('div') as HTMLDivElement;
        stats.innerHTML = `
            <div class="data-row flex">
                <div>
                    <span>
                        <span class="prop-label">${t('capacity', this.currentLang)}:</span>
                        <span class="prop-value">${free} ${t('free', this.currentLang)} / ${total} ${t('total', this.currentLang)}</span>
                    </span>
                    <span class="prop-additional">${last_sync}</span>
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
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        }

        if (sensor.data && sensor.data.length > 0) {
            const sensorId = Utils.getSensorId(sensor);
            const toggleDiv = document.createElement('div') as HTMLDivElement;
            toggleDiv.className = 'property-toggles';

            const uniqueId = `${uniqueIdPrefix}-free_lots`;
            toggleDiv.innerHTML = `
                <div class="data-row toggle-row">
                    <span class="prop-label">${t('free_spots_history', this.currentLang)}</span>
                    <input type="checkbox" id="${uniqueId}"
                           data-property="free_lots"
                           data-sensor-id="${sensorId}"
                           class="chart-toggle-checkbox" />
                    <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
                </div>
            `;

            container.appendChild(toggleDiv);
            toggleDiv.querySelector('input')?.addEventListener('change', onChartRequest);
        }
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (property !== 'free_lots' || !sensor.data || sensor.data.length === 0) {
            return null;
        }

        const points = [...sensor.data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());

        return {
            label: t('free_spots', this.currentLang),
            values: points.map(d => parseInt(d.free_lots)),
            times: points.map(d => d.time),
            unit: t('spots', this.currentLang)
        };
    }

    private getUsageColor(percentage: number): string {
        if (percentage < 50) return '#27ae60';
        if (percentage < 85) return '#f39c12';
        return '#c0392b';
    }
}
