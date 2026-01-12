// src/strategies/SensorStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { SensorProperties } from '../Types.js'

export class TrafficSensorStrategy implements IDetailsStrategy {
    render(contentContainer: HTMLElement, chartContainer: HTMLElement, sensor: SensorProperties): void {
        ChartRenderer.clear(chartContainer.id); // clear previous chart
        const panel = document.getElementById('info-panel') as HTMLElement;

        if (!panel || !sensor.data) {
            return;
        }

        let html = `<h2>${sensor.name || 'Sensor'}</h2>`;
        const labels: string[] = [];
        const values: number[] = [];

        let date = '';
        sensor.data.forEach((item) => {
            Object.keys(item).forEach(key => {
                let value = item[key];
                if (key === 'car_count') {
                    values.push(value);
                } else if (key === 'time') {
                    let timeData = value.replace(/_/g, ' ').split(' ');
                    if (!date.length) {
                        date = timeData[0];
                    }

                    labels.push(timeData[1]);
                }
            });
        });

        if (date.length) {
            html += `
                <div class="data-row">
                    <p>${date}</p>
                </div>`;
        }

        contentContainer.innerHTML = html;
        panel.classList.remove('off-screen');

        if (labels.length > 0 && values.length > 0) {
            chartContainer.style.display = 'block';
            ChartRenderer.render(chartContainer.id, labels, values);
        } else {
            const noChartData = document.getElementById('no-chart-data') as HTMLElement;
            noChartData?.classList.add('hidden');
            ChartRenderer.clear(chartContainer.id);
        }
    }
}