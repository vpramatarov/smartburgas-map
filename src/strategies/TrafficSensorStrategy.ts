// src/strategies/SensorStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { SensorProperties } from '../Types.js'

export class TrafficSensorStrategy implements IDetailsStrategy {
    private _name = 'traffic_sensor';

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
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLInputElement;
        btnFullChart.classList.add('hidden');

        if (labels.length > 0 && values.length > 0) {
            chartContainer.style.display = 'block';
            ChartRenderer.render(chartContainer.id, labels, values);
            btnFullChart.setAttribute('data-property', 'car_count');
            btnFullChart.setAttribute('data-strategy', this._name);
            btnFullChart.classList.remove('hidden');
        } else {
            const noChartData = document.getElementById('no-chart-data') as HTMLElement;
            noChartData?.classList.add('hidden');
            ChartRenderer.clear(chartContainer.id);
        }
    }

    // get name(): string {
    //     return this._name;
    // }
    renderFull(property: string, sensor: SensorProperties) {
        const name = sensor.name || 'Sensor Data';
        document.getElementById('modal-title')!.innerText = name;
        document.getElementById('full-chart-container')!.innerHTML = '';

        if (!sensor.data) {
            document.getElementById('full-chart-container')!.innerHTML = '<p style="color:#eee">No chart data.</p>';
            return;
        }

        const labels: string[] = [];
        const values: number[] = [];

        let date = '';
        sensor.data.forEach((item) => {
            Object.keys(item).forEach(key => {
                let value = item[key];
                if (key === property) {
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

        if (labels.length > 0) {
            ChartRenderer.renderFull('full-chart-container', name, labels, values);
        } else {
            document.getElementById('full-chart-container')!.innerHTML = '<p style="color:#eee">No chart data.</p>';
        }
    }

    supports(name: string): boolean {
        return this._name === name;
    }
}