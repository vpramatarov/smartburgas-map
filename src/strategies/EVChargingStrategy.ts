// src/strategies/EVChargingStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js';

export class EVChargingStrategy extends BasePointStrategy {
    public name = 'ev_station';
    public checkbox_id = 'toggle-ev-stations';
    public layerOptions = { translate_name_key: 'layer_ev_charging', color: '#f39c12' };

    protected getApiUrl(lang: string): string {
        return `/api/ev-stations?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'ev-time';
    }

    getIconClass(): string {
        return 'icon-battery';
    }

    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {
        if (sensor.pic_url) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.pic_url;
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name != null) {
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.color = '#555';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        }
    }

    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null {
        return null;
    }
}
