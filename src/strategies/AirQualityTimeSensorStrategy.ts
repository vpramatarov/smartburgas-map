import {IDetailsStrategy} from "./IDetailsStrategy.js";
import {SensorProperties} from "../Types.js";
import { ChartRenderer } from '../components/ChartRenderer.js';


export class AirQualityTimeSensorStrategy implements IDetailsStrategy {
    render(contentContainer: HTMLElement, chartContainer: HTMLElement, sensor: SensorProperties): void {
        ChartRenderer.clear(chartContainer.id);
        chartContainer.style.display = 'none';
        const panel = document.getElementById('info-panel') as HTMLElement;

        if (!panel || !sensor.data) {
            return;
        }

        contentContainer.innerHTML = `<h2>${sensor.name || 'Sensor'}</h2>`;
        const obj = sensor.data[0];

        for (const p in obj) {
            let value = obj[p];
            if (p.endsWith('_unit')) {
                continue;
            }

            if (!value) {
                continue;
            }

            let rowDiv = document.createElement('div') as HTMLElement;
            rowDiv.classList.add('data-row');

            let pTag = document.createElement('span') as HTMLElement;
            pTag.innerText = p + ': ';

            let spanTag = document.createElement('span') as HTMLElement;
            spanTag.innerText = `${value} ${p !== 'time' ? obj[p+'_unit'] + ' ' : ''}`

            rowDiv.appendChild(pTag);
            rowDiv.appendChild(spanTag)

            if (p !== 'time') {
                let btn = document.createElement('button') as HTMLButtonElement;
                btn.classList.add('view-chart', 'action-btn');
                btn.setAttribute('data-property', p);
                let spanIcon = document.createElement('span') as HTMLElement;
                spanIcon.classList.add('icon-chart-bar');
                btn.appendChild(spanIcon);

                btn.addEventListener('click', () => {
                    const labels: string[] = [];
                    const values: number[] = [];
                    ChartRenderer.clear(chartContainer.id);
                    let property = btn.dataset.property;
                    console.log(property);
                    sensor.data?.forEach((item) => {
                        Object.keys(item).forEach(key => {
                            let value = item[key];
                            if (key === property) {
                                values.push(value);
                            } else if (key === 'time') {
                                labels.push(value);
                            }
                        });
                    });
                    // render chart

                    if (labels.length > 0 && values.length > 0) {
                        chartContainer.style.display = 'block';
                        ChartRenderer.render(chartContainer.id, labels, values);
                    } else {
                        const noChartData = document.getElementById('no-chart-data') as HTMLElement;
                        noChartData?.classList.add('hidden');
                        ChartRenderer.clear(chartContainer.id);
                    }
                });

                rowDiv.appendChild(btn)
            }

            contentContainer.appendChild(rowDiv)
        }

        panel.classList.remove('off-screen');
    }
}

