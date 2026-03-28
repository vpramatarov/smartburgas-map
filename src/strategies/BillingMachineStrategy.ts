// src/strategies/BillingMachineStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js';

export class BillingMachineStrategy extends BasePointStrategy {
    public name = 'billing_machine';
    public checkbox_id = 'toggle-billing-machines';
    public layerOptions = { translate_name_key: 'layer_billing_machines', color: '#3498db' };

    protected getApiUrl(lang: string): string {
        return `/api/billing-machines?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'billing-time';
    }

    getIconClass(): string {
        return 'icon-dollar';
    }

    renderCardContent(container: HTMLElement, sensor: SensorProperties): void {
        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.color = '#555';
            desc.innerHTML = sensor.description;
            container.appendChild(desc);
        } else {
            container.innerHTML += '<p>No description available.</p>';
        }
    }

    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null {
        return null;
    }
}
