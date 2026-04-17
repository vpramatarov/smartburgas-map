// src/strategies/TaxiRankStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import {ChartDataset, GeoFeature, SensorProperties} from '../Types.js';

export class TaxiRankStrategy extends BasePointStrategy {
    public name = 'taxi_rank';
    public checkbox_id = 'toggle-taxi';
    public layerOptions = { translate_name_key: 'layer_taxi_stands', color: '#f1c40f' };

    protected getApiUrl(lang: string): string {
        return `/api/taxi-ranks?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'taxi-time';
    }

    getIconClass(): string {
        return 'icon-taxi-sign_76588';
    }

    protected buildMarkerHtml(_feature: GeoFeature): string {
        return `
            <div class="custom-pin-marker dark-text" style="background-color: ${this.layerOptions.color};">
                <i class="${this.getIconClass()}"></i>
            </div>
        `;
    }

    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {
        if (sensor.pic_url) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.pic_url;
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.fontWeight = 'bold';
            desc.textContent = sensor.description;
            container.appendChild(desc);
        }

        if (sensor.name) {
            const loc = document.createElement('div') as HTMLDivElement;
            loc.style.fontSize = '1em';
            loc.style.color = '#666';
            loc.style.marginTop = '4px';
            loc.textContent = sensor.name;
            container.appendChild(loc);
        }
    }

    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null {
        return null;
    }
}
