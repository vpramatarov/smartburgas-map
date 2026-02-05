import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import { ChartDataset, SensorProperties } from '../Types.js';

/**
 * Manages the Side Panel.
 * It can render a list of sensors from different strategies.
 */
export class CompositeDetailsStrategy {
    private strategies: Map<string, IDetailsStrategy> = new Map();

    constructor(strategies: IDetailsStrategy[]) {
        strategies.forEach(s => this.strategies.set(s.name, s));
    }

    getStrategies(): Map<string, IDetailsStrategy> {
        return this.strategies
    }

    /**
     * Main entry point called by Client.ts
     */
    render(
        contentContainer: HTMLElement,
        chartContainer: HTMLElement,
        sensors: SensorProperties[],
        onRemove: (s: SensorProperties) => void
    ): void {
        ChartRenderer.clear(chartContainer.id);
        const panel = document.getElementById('info-panel') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLButtonElement;
        const btnCsv = document.getElementById('btn-download-csv') as HTMLButtonElement;
        const noChartData = document.getElementById('no-chart-data') as HTMLElement;

        if (!panel) {
            return;
        }

        contentContainer.innerHTML = '';

        if (sensors.length === 0) {
            contentContainer.innerHTML = '<p style="text-align:center; color:#666; margin-top:20px;">No sensors pinned.<br>Click a map marker to add.</p>';
            chartContainer.style.display = 'none';
            btnCsv?.classList.add('hidden');
            btnFullChart?.classList.add('hidden');
            noChartData?.classList.add('hidden');
            return;
        }

        // Do not show button if only cctv strategies are pinned.
        if (sensors.filter(s => s.strategy === 'cctv').length === sensors.length) {
            btnCsv?.classList.add('hidden');
        } else {
            btnCsv?.classList.remove('hidden');
        }

        sensors.forEach((sensor, index) => {
            const strategyName = sensor.strategy || 'default';
            const strategy = this.strategies.get(strategyName);

            // Create Card Frame
            const card = document.createElement('div') as HTMLDivElement;
            card.className = 'sensor-card';

            // Header
            const header = document.createElement('div') as HTMLDivElement;
            header.className = 'sensor-header';
            header.innerHTML = `<h3>${sensor.name || 'Sensor'} <small style="font-weight:normal; font-size:10px; color:#888">(${strategyName})</small></h3>`;

            const removeBtn = document.createElement('button') as HTMLButtonElement;
            removeBtn.className = 'remove-sensor-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => onRemove(sensor);
            header.appendChild(removeBtn);
            card.appendChild(header);

            const body = document.createElement('div') as HTMLDivElement;

            if (strategy) {
                // Delegate content rendering to the specific strategy
                strategy.renderCardContent(
                    body,
                    sensor,
                    `sensor-${index}`,
                    () => this.updateChart(chartContainer, sensors, btnFullChart, noChartData)
                );
            } else {
                body.innerHTML = '<p>Unknown data type.</p>';
            }

            card.appendChild(body);
            contentContainer.appendChild(card);
        });

        // panel.classList.remove('off-screen');
        panel.classList.remove('hidden');

        // Re-draw chart if checkboxes were checked (state persistence handled by DOM existence here)
        this.updateChart(chartContainer, sensors, btnFullChart, noChartData);
    }

    private updateChart(
        chartContainer: HTMLElement,
        sensors: SensorProperties[],
        btnFullChart: HTMLElement | null,
        noChartText: HTMLElement | null
    ) {
        // Find all checked boxes across ALL cards
        const checkedBoxes = document.querySelectorAll('#info-panel .chart-toggle-checkbox:checked');

        if (checkedBoxes.length === 0) {
            ChartRenderer.clear(chartContainer.id);
            chartContainer.style.display = 'none';
            noChartText?.classList.remove('hidden');
            btnFullChart?.classList.add('hidden');
            return;
        }

        const datasets: ChartDataset[] = [];
        const selectedPropsGlobal: any[] = [];

        checkedBoxes.forEach((box: any) => {
            // We stored the sensor index in the DOM when we rendered the card
            const sensorIndex = parseInt(box.dataset.sensorIndex);
            const property = box.dataset.property;

            const sensor = sensors[sensorIndex];
            if (!sensor || !sensor.strategy) {
                return;
            }

            const strategy = this.strategies.get(sensor.strategy);
            if (strategy) {
                const ds = strategy.getChartData(sensor, property);
                if (ds) {
                    // Make label unique by prepending sensor name
                    ds.label = `${sensor.name} - ${ds.label}`;
                    datasets.push(ds);

                    selectedPropsGlobal.push({
                        sensorId: sensor.id || sensor.name,
                        property: property,
                        strategy: sensor.strategy
                    });
                }
            }
        });

        if (datasets.length > 0) {
            noChartText?.classList.add('hidden');
            chartContainer.style.display = 'block';
            ChartRenderer.render(chartContainer.id, [], datasets);

            if (btnFullChart) {
                btnFullChart.classList.remove('hidden');
                // For full screen, we now need a smarter way to pass state.
                // For now, let's just dump the intent structure.
                btnFullChart.dataset.chartConfig = JSON.stringify(selectedPropsGlobal);
            }
        }
    }

    /**
     * Handles Full Screen rendering for mixed strategies
     */
    renderFull(chartConfig: any[], sensors: SensorProperties[]) {
        const containerId = 'full-chart-container';
        const container = document.getElementById(containerId) as HTMLElement;

        if (!container) {
            return;
        }

        container.innerHTML = '';

        const datasets: ChartDataset[] = [];

        chartConfig.forEach(cfg => {
            const sensor = sensors.find(s => (s.id || s.name) === cfg.sensorId);
            if(sensor && sensor.strategy) {
                const strategy = this.strategies.get(sensor.strategy);
                if(strategy) {
                    const ds = strategy.getChartData(sensor, cfg.property);
                    if(ds) {
                        ds.label = `${sensor.name} - ${ds.label}`;
                        datasets.push(ds);
                    }
                }
            }
        });

        if (datasets.length > 0) {
            ChartRenderer.renderFull(containerId, "Combined Analysis", [], datasets);
        } else {
            container.innerHTML = '<p>No data</p>';
        }
    }
}