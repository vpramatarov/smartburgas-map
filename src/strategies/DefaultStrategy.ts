import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js'

export class DefaultStrategy implements IDetailsStrategy {
    public name = 'default';

    renderCardContent(container: HTMLElement, sensor: SensorProperties, uniqueIdPrefix: string): void {
        let html = '';
        for (const key in sensor) {
            const val = sensor[key];
            if (typeof val !== 'object' && key !== 'name' && key !== 'data' && key !== 'strategy') {
                html += `
                <div class="data-row">
                    <p>${key.replace(/_/g, ' ')}</p>
                    <span>${val}</span>
                </div>`;
            }
        }
        container.innerHTML = html;
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        return null;
    }

    renderFull(properties: string[], sensors: SensorProperties[]): void {}
}