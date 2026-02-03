// src/strategies/TrafficSensorStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { ChartDataset, SensorProperties } from '../Types.js'

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

        if (labels.length > 0 && values.length > 0) {
            chartContainer.style.display = 'block';

            const datasets: ChartDataset[] = [{
                label: 'Car Count',
                values: values,
                unit: 'count'
            }];

            ChartRenderer.render(chartContainer.id, labels, datasets);

            btnFullChart.classList.remove('hidden');
            btnFullChart.dataset.strategy = this._name;
            // Traffic implies 'car_count', strictly pass it as array
            btnFullChart.dataset.properties = JSON.stringify(['car_count']);
        } else {
            const noChartData = document.getElementById('no-chart-data') as HTMLElement;
            noChartData?.classList.add('hidden');
            ChartRenderer.clear(chartContainer.id);
            btnFullChart.classList.add('hidden');
        }
    }

    renderFull(properties: string[], sensor: SensorProperties) {
        const name = sensor.name || 'Sensor Data';
        document.getElementById('modal-title')!.innerText = name;
        const containerId = 'full-chart-container';
        document.getElementById(containerId)!.innerHTML = '';

        if (!sensor.data) {
            document.getElementById(containerId)!.innerHTML = '<p style="color:#eee">No chart data.</p>';
            return;
        }

        const labels: string[] = [];
        const values: number[] = [];

        // Note: Traffic strategy ignores the 'properties' arg because it only has one metric, but we can respect it if passed.
        const targetProp = properties.length > 0 ? properties[0] : 'car_count';

        sensor.data.forEach((item) => {
            Object.keys(item).forEach(key => {
                let value = item[key];
                if (key === targetProp) {
                    values.push(value);
                } else if (key === 'time') {
                    let timeData = value.replace(/_/g, ' ').split(' ');
                    labels.push(timeData[1]);
                }
            });
        });

        if (labels.length > 0) {
            const datasets: ChartDataset[] = [{
                label: 'Car Count',
                values: values,
                unit: 'count'
            }];
            ChartRenderer.renderFull(containerId, name, labels, datasets);
        } else {
            document.getElementById(containerId)!.innerHTML = '<p style="color:#eee">No chart data.</p>';
        }
    }

    supports(name: string): boolean {
        return this._name === name;
    }
}