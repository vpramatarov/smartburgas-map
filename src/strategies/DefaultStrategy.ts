// src/strategies/DefaultStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { SensorProperties } from '../Types.js'

export class DefaultStrategy implements IDetailsStrategy {
    render(contentContainer: HTMLElement, chartContainer: HTMLElement, sensor: SensorProperties): void {
        // This strategy doesn't use chart
        ChartRenderer.clear(chartContainer.id);
        chartContainer.style.display = 'none';
        const panel = document.getElementById('info-panel') as HTMLElement;

        if (!panel) {
            return;
        }

        let date = '';

        let html = `<h2>${sensor.name || 'Details'}</h2>`;
        for (const key in sensor) {
            const val = sensor[key];
            if (typeof val !== 'object' && key !== 'name' && key !== 'data') {
                html += `
                <div class="data-row">
                    <p>${date.length ? date : key.replace(/_/g, ' ')}</p>
                    <span>${val}</span>
                </div>`;
            }
        }
        contentContainer.innerHTML = html;
        panel.classList.remove('off-screen');
    }
}