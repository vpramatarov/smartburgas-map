// src/strategies/WasteCentreStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, DynamicDataPoint, SensorProperties } from '../Types.js';
import { t } from '../Translations.js';

export class WasteCentreStrategy extends BasePointStrategy {
    public name = 'waste_centre';
    public checkbox_id = 'toggle-waste';
    public layerOptions = { translate_name_key: 'layer_mobile_waste', color: '#9b59b6' };

    protected getApiUrl(lang: string): string {
        return `/api/waste-mobile?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'waste-time';
    }

    protected getIconClass(): string {
        return 'icon-recycle';
    }

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        _uniqueIdPrefix: string,
        _onChartRequest: () => void
    ): void {
        if (sensor.additional_info.image) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.additional_info.image.trim();
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.additional_info.address) {
            container.innerHTML += `<div class="data-row">${sensor.additional_info.address}</div>`;
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.color = '#666';
            desc.style.marginBottom = '10px';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        }

        if (sensor.data && Array.isArray(sensor.data)) {
            const uniqueTypes = new Map<string, { name: string; color: string; weight: string; weight_unit: string; time: string }>();

            sensor.data.forEach((d: DynamicDataPoint) => {
                uniqueTypes.set(d.Garbage_id, {
                    name: d.Garbage_name,
                    color: d.Garbage_Colour,
                    weight: d.Weight,
                    weight_unit: d.Weight_unit,
                    time: d.time
                });
            });

            uniqueTypes.forEach((info) => {
                const row = document.createElement('div') as HTMLDivElement;
                row.className = 'data-row';
                row.innerHTML = `
                    <span class="waste-dot" style="background:${info.color}"></span>
                    <span class="prop-label">${info.name}:</span>
                    <span class="prop-value">${info.weight} ${info.weight_unit}</span>
                    <span class="prop-additional">${info.time}</span>
                `;
                container.appendChild(row);
            });
        }
    }

    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null {
        return null;
    }
}
