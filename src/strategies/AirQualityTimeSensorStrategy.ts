import { IDetailsStrategy } from "./IDetailsStrategy.js";
import { ChartDataset, SensorProperties } from "../Types.js";
import { ChartRenderer } from '../components/ChartRenderer.js';

export class AirQualityTimeSensorStrategy implements IDetailsStrategy {
    private _name = 'air_quality_time';

    render(contentContainer: HTMLElement, chartContainer: HTMLElement, sensor: SensorProperties): void {
        ChartRenderer.clear(chartContainer.id); // clear previous chart
        chartContainer.style.display = 'none';

        const panel = document.getElementById('info-panel');
        const noChartData = document.getElementById('no-chart-data');
        const btnFullChart = document.getElementById('btn-full-chart');

        if (!panel || !sensor.data || sensor.data.length === 0) {
            return;
        }

        btnFullChart?.classList.add('hidden');
        contentContainer.innerHTML = `<h2>${sensor.name || 'Sensor'}</h2>`;

        const latestData = sensor.data[0];

        const toggleContainer = document.createElement('div');
        toggleContainer.className = 'property-toggles';
        contentContainer.appendChild(toggleContainer);

        for (const p in latestData) {
            if (p.endsWith('_unit') || p === 'time') {
                continue;
            }

            let value = latestData[p];
            if (value === undefined || value === null) {
                continue;
            }

            const unit = latestData[p + '_unit'] || '';
            const rowId = `toggle-${p}`;

            const rowDiv = document.createElement('div');
            rowDiv.classList.add('data-row', 'toggle-row');

            const textDiv = document.createElement('div');
            textDiv.innerHTML = `<span class="prop-label">${p}:</span> <span class="prop-value">${value} ${unit}</span>`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = rowId;
            checkbox.dataset.property = p;
            checkbox.dataset.unit = unit;
            checkbox.className = 'chart-toggle-checkbox';

            const labelBtn = document.createElement('label');
            labelBtn.htmlFor = rowId;
            labelBtn.className = 'chart-toggle-btn';
            labelBtn.innerHTML = '<span class="icon-chart-bar"></span>';
            labelBtn.title = "Add to chart";

            checkbox.addEventListener('change', () => {
                this.updateChart(chartContainer, sensor, btnFullChart, noChartData);
            });

            rowDiv.appendChild(textDiv);
            rowDiv.appendChild(checkbox);
            rowDiv.appendChild(labelBtn);

            toggleContainer.appendChild(rowDiv);
        }

        panel.classList.remove('off-screen');
    }

    private updateChart(
        chartContainer: HTMLElement,
        sensor: SensorProperties,
        btnFullChart: HTMLElement | null,
        noChartText: HTMLElement | null
    ) {
        const checkedBoxes = document.querySelectorAll('#info-panel .chart-toggle-checkbox:checked');

        if (checkedBoxes.length === 0) {
            ChartRenderer.clear(chartContainer.id);
            chartContainer.style.display = 'none';
            noChartText?.classList.remove('hidden');
            btnFullChart?.classList.add('hidden');
            return;
        }

        const selectedProperties: string[] = [];
        const datasets: ChartDataset[] = [];
        const labels: string[] = [];

        if (sensor.data) {
            sensor.data.forEach(item => {
                labels.push(item['time']);
            });
        }

        checkedBoxes.forEach((box: any) => {
            const prop = box.dataset.property;
            const unit = box.dataset.unit;
            const values: number[] = [];
            selectedProperties.push(prop);

            sensor.data?.forEach(item => {
                const val = parseFloat(item[prop]);
                values.push(isNaN(val) ? 0 : val);
            });

            datasets.push({
                label: prop,
                values: values,
                unit: unit
            });
        });

        if (datasets.length > 0 && labels.length > 0) {
            noChartText?.classList.add('hidden');
            chartContainer.style.display = 'block';

            ChartRenderer.render(chartContainer.id, labels, datasets);

            btnFullChart?.classList.remove('hidden');
            if (btnFullChart) {
                btnFullChart.dataset.strategy = this._name;
                btnFullChart.dataset.properties = JSON.stringify(selectedProperties);
            }
        } else {
            ChartRenderer.clear(chartContainer.id);
            chartContainer.style.display = 'none';
            noChartText?.classList.remove('hidden');
            btnFullChart?.classList.add('hidden');
        }
    }

    renderFull(properties: string[], sensor: SensorProperties) {
        const name = sensor.name || 'Sensor Data';
        const titleEl = document.getElementById('modal-title');
        if (titleEl) {
            titleEl.innerText = name;
        }

        const containerId = 'full-chart-container';
        const container = document.getElementById(containerId);
        if (!container) {
            return;
        }

        container.innerHTML = '';

        if (!sensor.data || properties.length === 0) {
            container.innerHTML = '<p style="color:#eee">No chart data selected.</p>';
            return;
        }

        const labels: string[] = [];
        const datasets: ChartDataset[] = [];

        properties.forEach(prop => {
            datasets.push({ label: prop, values: [] });
        });

        sensor.data.forEach((item) => {
            labels.push(item['time']);
            properties.forEach((prop, index) => {
                const val = parseFloat(item[prop]);
                datasets[index].values.push(isNaN(val) ? 0 : val);
                const unitKey = prop + '_unit';
                if (item[unitKey] && !datasets[index].unit) {
                    datasets[index].unit = item[unitKey];
                }
            });
        });

        if (labels.length > 0) {
            ChartRenderer.renderFull(containerId, name, labels, datasets);
        } else {
            container.innerHTML = '<p style="color:#eee">No chart data.</p>';
        }
    }

    supports(name: string): boolean {
        return this._name === name;
    }
}