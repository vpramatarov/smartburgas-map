import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartRenderer } from '../components/ChartRenderer.js';
import {ChartDataset, SensorProperties, SupportedLanguage} from '../Types.js';
import { t } from '../Translations.js';
import {TranslationKeys} from "../locales/bg.js";

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

    toggleMap(): { [key: string]: string } {
        let toggleMap: { [key: string]: string } = {};
        this.getStrategies().forEach(strategy => {
            toggleMap[strategy.checkbox_id] = strategy.name
        });

        return toggleMap;
    }

    /**
     * Renders the Side Panel content
     * @param container DOM element for the list of cards
     * @param chartContainer DOM element for the chart
     * @param items All items to display (Pinned + Preview)
     * @param pinnedItems Just the pinned items (to determine icon state)
     * @param onTogglePin Callback
     * @param onClose Callback
     * @param lang The current active language
     */
    render(
        container: HTMLElement,
        chartContainer: HTMLElement,
        items: SensorProperties[],
        pinnedItems: SensorProperties[],
        onTogglePin: (s: SensorProperties) => void,
        onClose: (s: SensorProperties) => void,
        lang: SupportedLanguage
    ) {
        ChartRenderer.clear(chartContainer.id);
        const panel = document.getElementById('info-panel') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLButtonElement;
        const btnCsvs = Array.from(document.querySelectorAll('.btn-download-csv') as NodeListOf<HTMLButtonElement>);
        const noChartData = document.getElementById('no-chart-data') as HTMLElement;

        if (!panel) {
            return;
        }

        container.innerHTML = '';

        if (items.length === 0) {
            container.innerHTML = `<p style="text-align:center; color:#666; margin-top:20px;">${t('no_sensors_pinned', lang)}.<br>${t('click_map_marker_to_add', lang)}.</p>`;
            chartContainer.style.display = 'none';
            btnCsvs.forEach(btn => btn.classList.add('hidden'));
            btnFullChart?.classList.add('hidden');
            noChartData?.classList.add('hidden');
            return;
        }

        // Do not show download csv button for strategies that does not have data.
        if (items.filter(s => !s.data).length === items.length) {
            btnCsvs.forEach(btn => btn.classList.add('hidden'));
        } else {
            btnCsvs.forEach(btn => btn.classList.remove('hidden'));
        }

        items.forEach((sensor, index) => {
            const strategyName = sensor.strategy || '';
            const strategy = this.strategies.get(strategyName);
            if (!strategy) {
                return;
            }

            const isPinned = pinnedItems.some(p => this.idsMatch(p, sensor));
            const uniqueIdPrefix = `sensor-${index}`;

            const card = document.createElement('div') as HTMLDivElement;
            card.className = `sensor-card ${isPinned ? 'card-pinned' : 'card-preview'}`;

            const header = document.createElement('div') as HTMLDivElement;
            header.className = 'sensor-card-header';

            const title = document.createElement('h3') as HTMLHeadingElement;
            title.innerText = sensor.name || sensor.publicname || t('unknown_sensor', lang);

            if (strategyName === 'traffic_sensor' && sensor.id) {
                title.innerText += ` | ID: ${sensor.id}`
            }

            let filter: HTMLHeadingElement | null = null;

            if (strategy.layerOptions.translate_name_key) {
                filter = document.createElement('h2') as HTMLHeadingElement;
                const translation_key = strategy.layerOptions.translate_name_key as keyof TranslationKeys;
                filter.innerText = t(translation_key, lang);
            }

            const actions = document.createElement('div') as HTMLDivElement;
            actions.className = 'card-actions';

            const btnPin = document.createElement('button') as HTMLButtonElement;
            btnPin.className = isPinned ? 'btn-icon active' : 'btn-icon';
            btnPin.title = isPinned ? t('unpin_location', lang) : t('pin_location', lang);
            btnPin.innerHTML = '<span class="icon-pin"></span>';
            btnPin.onclick = () => onTogglePin(sensor);

            const btnClose = document.createElement('button') as HTMLButtonElement;
            btnClose.className = 'btn-icon';
            btnClose.innerHTML = '<span class="icon-cancel"></span>';
            btnClose.onclick = () => onClose(sensor);

            if (filter) {
                card.appendChild(filter)
            }

            actions.appendChild(btnPin);
            actions.appendChild(btnClose);
            header.appendChild(title);
            header.appendChild(actions);
            card.appendChild(header);

            const body = document.createElement('div') as HTMLDivElement;
            body.className = 'sensor-card-body';

            // Delegate content rendering to the specific strategy
            strategy.renderCardContent(body, sensor, uniqueIdPrefix, () => {
                this.updateChart(chartContainer, items, btnFullChart, noChartData);
            });

            card.appendChild(body);
            container.appendChild(card);
        });

        // Render Chart (Combined logic)
        this.updateChart(chartContainer, items, btnFullChart, noChartData);
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
        } else {
            // clear the chart if datasets are suddenly empty
            ChartRenderer.clear(chartContainer.id);
            chartContainer.style.display = 'none';
            noChartText?.classList.remove('hidden');
            btnFullChart?.classList.add('hidden');
        }
    }

    /**
     * Handles Full Screen rendering for mixed strategies
     */
    renderFull(chartConfig: any[], sensors: SensorProperties[], lang: SupportedLanguage) {
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
            ChartRenderer.renderFull(containerId, t('combined_analysis', lang), [], datasets);
        } else {
            container.innerHTML = `<p>${t('no_data', lang)}</p>`;
        }
    }

    private idsMatch(a: SensorProperties, b: SensorProperties): boolean {
        const idA = a.id || a.name || a.publicname;
        const idB = b.id || b.name || b.publicname;
        return idA === idB;
    }
}