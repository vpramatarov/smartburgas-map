// src/components/ChartRenderer.ts
import {ChartDataset, SupportedLanguage} from "../Types.js";
import {Utils} from "../Utils.js";
import {t} from "../Translations.js";

declare const Plotly: any;

export class ChartRenderer {

    private static palette = [
        '#3498db', // Blue
        '#e74c3c', // Red
        '#2ecc71', // Green
        '#f1c40f', // Yellow
        '#9b59b6', // Purple
        '#e67e22', // Orange
        '#1abc9c', // Teal
        '#34495e'  // Pickled Bluewood
    ];

    private static currentExportRange: { start: Date; end: Date } | null = null;

    public static getCurrentExportRange() {
        return ChartRenderer.currentExportRange;
    }

    public static resetExportRange() {
        ChartRenderer.currentExportRange = null;
    }

    /**
     * Renders chart. Now supports individual time arrays per dataset.
     * @param containerId DOM ID
     * @param defaultLabels Fallback X-axis labels (can be empty if datasets have times)
     * @param datasets Data to render
     */
    public static render(containerId: string, defaultLabels: string[], datasets: ChartDataset[]) {
        const setup = this.setupChartContainer(containerId, datasets);
        if (!setup) {
            return;
        }

        const { canvasId, fromInput, toInput, bounds } = setup;

        const traces = datasets.map((ds, index) => {
            const color = this.palette[index % this.palette.length];
            const xValues = (ds.times && ds.times.length > 0) ? ds.times : defaultLabels;

            return {
                x: xValues,
                y: ds.values,
                name: ds.label + (ds.unit ? ` (${ds.unit})` : ''),
                type: 'scatter',
                mode: 'lines+markers',
                connectgaps: true,
                marker: { color: color, size: 6 },
                line: { shape: 'spline', color: color, width: 2 },
                fill: datasets.length === 1 ? 'tozeroy' : 'none',
                fillcolor: datasets.length === 1 ? `rgba(${this.hexToRgb(color)}, 0.1)` : undefined
            };
        });

        const layout = {
            autosize: true,
            height: 300,
            margin: { l: 40, r: 20, t: 10, b: 60 },
            font: { family: 'Arial, sans-serif', size: 10, color: '#fff' },
            xaxis: this.getXAxisConfig(),
            yaxis: { gridcolor: '#eee', zerolinecolor: '#ccc' },
            paper_bgcolor: 'rgba(0,0,0,0.9)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            showlegend: datasets.length > 1,
            legend: { x: 0, y: 1.1, orientation: 'h' }
        };

        const config = { responsive: true, displayModeBar: true };

        Plotly.newPlot(canvasId, traces, layout, config).then((chartDiv: any) => {
            chartDiv.removeAllListeners('plotly_relayout');

            chartDiv.on('plotly_relayout', (eventData: any) => {
                if (!eventData) {
                    return;
                }

                let startStr = null;
                let endStr = null;

                if (eventData['xaxis.range[0]'] !== undefined && eventData['xaxis.range[1]'] !== undefined) {
                    startStr = eventData['xaxis.range[0]'];
                    endStr = eventData['xaxis.range[1]'];
                } else if (Array.isArray(eventData['xaxis.range']) && eventData['xaxis.range'].length === 2) {
                    startStr = eventData['xaxis.range'][0];
                    endStr = eventData['xaxis.range'][1];
                }

                if (startStr && endStr) {
                    const startD = new Date(startStr);
                    const endD = new Date(endStr);
                    ChartRenderer.currentExportRange = { start: startD, end: endD };

                    // Sync Plotly -> Inputs
                    if (fromInput) {
                        fromInput.value = Utils.formatDateToLocal(startD);
                    }
                    if (toInput) {
                        toInput.value = Utils.formatDateToLocal(endD);
                    }

                } else if (eventData['xaxis.autorange'] === true) {
                    ChartRenderer.resetExportRange();
                    // Reset Plotly -> Inputs
                    if (fromInput) {
                        fromInput.value = bounds.minDate;
                    }
                    if (toInput) {
                        toInput.value = bounds.maxDate;
                    }
                }
            });
        });
    }

    /**
     * Renders a full-screen version of the chart in the modal.
     */
    public static renderFull(containerId: string, title: string, defaultLabels: string[], datasets: ChartDataset[]) {
        const setup = this.setupChartContainer(containerId, datasets);
        if (!setup) {
            return;
        }

        const { canvasId, fromInput, toInput, bounds } = setup;

        const traces = datasets.map((ds, index) => {
            const color = this.palette[index % this.palette.length];
            const xValues = (ds.times && ds.times.length > 0) ? ds.times : defaultLabels;

            return {
                x: xValues,
                y: ds.values,
                name: ds.label + (ds.unit ? ` (${ds.unit})` : ''),
                type: 'scatter',
                mode: 'lines+markers',
                marker: { color: color, size: 8 },
                line: { shape: 'spline', color: color, width: 3 },
                fill: datasets.length === 1 ? 'tozeroy' : 'none',
                fillcolor: datasets.length === 1 ? `rgba(${this.hexToRgb(color)}, 0.2)` : undefined
            };
        });

        const fullXAxisConfig = {
            ...this.getXAxisConfig(),
            gridcolor: '#444',
            zerolinecolor: '#666'
        };

        const layout = {
            title: { text: title, font: { color: '#eee' } },
            autosize: true,
            font: { family: 'Arial, sans-serif', size: 12, color: '#eee' },
            xaxis: fullXAxisConfig,
            yaxis: { gridcolor: '#444', zerolinecolor: '#666' },
            paper_bgcolor: '#222',
            plot_bgcolor: '#222',
            showlegend: true,
            legend: { font: { color: '#eee' }, orientation: 'h', y: 1.1 }
        };

        const config = { responsive: true, displayModeBar: true };

        Plotly.newPlot(canvasId, traces, layout, config).then((chartDiv: any) => {
            chartDiv.removeAllListeners('plotly_relayout');

            chartDiv.on('plotly_relayout', (eventData: any) => {
                if (!eventData) {
                    return;
                }

                let startStr = null;
                let endStr = null;

                if (eventData['xaxis.range[0]'] !== undefined && eventData['xaxis.range[1]'] !== undefined) {
                    startStr = eventData['xaxis.range[0]'];
                    endStr = eventData['xaxis.range[1]'];
                } else if (Array.isArray(eventData['xaxis.range']) && eventData['xaxis.range'].length === 2) {
                    startStr = eventData['xaxis.range'][0];
                    endStr = eventData['xaxis.range'][1];
                }

                if (startStr && endStr) {
                    const startD = new Date(startStr);
                    const endD = new Date(endStr);
                    ChartRenderer.currentExportRange = { start: startD, end: endD };

                    // Sync Plotly -> Inputs
                    if (fromInput) {
                        fromInput.value = Utils.formatDateToLocal(startD);
                    }
                    if (toInput) {
                        toInput.value = Utils.formatDateToLocal(endD);
                    }

                } else if (eventData['xaxis.autorange'] === true) {
                    ChartRenderer.resetExportRange();
                    // Reset Plotly -> Inputs
                    if (fromInput) {
                        fromInput.value = bounds.minDate;
                    }
                    if (toInput) {
                        toInput.value = bounds.maxDate;
                    }
                }
            });
        });
    }

    public static clear(containerId: string) {
        const container = document.getElementById(containerId) as HTMLElement;
        if (container) {
            // Target the actual sub-canvas we created for Plotly purge
            const canvas = document.getElementById(`${containerId}-canvas`) as HTMLElement;
            if (canvas) {
                Plotly.purge(canvas);
            }
            container.innerHTML = '';
        }
    }

    private static hexToRgb(hex: string): string {
        hex = hex.replace(/^#/, '');
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `${r},${g},${b}`;
    }

    /**
     * Reusable X-Axis configuration containing the range slider and selectors
     */
    private static getXAxisConfig() {
        return {
            type: 'date',
            tickangle: -45,
            automargin: true,
            rangeselector: {
                buttons: [
                    { count: 1, label: '1d', step: 'day', stepmode: 'backward' },
                    { count: 7, label: '1w', step: 'day', stepmode: 'backward' },
                    { count: 1, label: '1m', step: 'month', stepmode: 'backward' },
                    { step: 'all', label: 'All' }
                ],
                bgcolor: '#444',
                activecolor: '#666',
                font: { color: '#fff' }
            },
            rangeslider: {
                visible: true,
                thickness: 0.1 // Keeps the slider from taking up too much vertical space
            }
        };
    }

    // --- HELPER: Scan datasets for oldest and newest timestamps ---
    private static getDatasetBounds(datasets: ChartDataset[]) {
        let minTime = Infinity;
        let maxTime = -Infinity;

        datasets.forEach(ds => {
            if (ds.times) {
                ds.times.forEach(t => {
                    const timeMs = new Date(t).getTime();
                    if (!isNaN(timeMs)) {
                        if (timeMs < minTime) {
                            minTime = timeMs;
                        }
                        if (timeMs > maxTime) {
                            maxTime = timeMs;
                        }
                    }
                });
            }
        });

        // Fallback to today if no valid dates are found
        if (minTime === Infinity || maxTime === -Infinity) {
            const today = new Date();
            minTime = today.getTime();
            maxTime = today.getTime();
        }

        return {
            minDate: Utils.formatDateToLocal(new Date(minTime)),
            maxDate: Utils.formatDateToLocal(new Date(maxTime))
        };
    }

    // --- HELPER: Inject the Datepickers and Sub-Canvas ---
    private static setupChartContainer(containerId: string, datasets: ChartDataset[]) {
        const container = document.getElementById(containerId) as HTMLDivElement;
        if (!container) {
            return null;
        }

        const bounds = this.getDatasetBounds(datasets);
        const canvasId = `${containerId}-canvas`; // The new sub-container for Plotly
        let savedLang: SupportedLanguage = 'bg'; // Default to Bulgarian
        if (typeof localStorage !== 'undefined') {
            const stored = localStorage.getItem('sb_lang');
            if (stored === 'bg' || stored === 'en') {
                savedLang = stored;
            }
        }

        // Inject the custom UI bar and the canvas wrapper using Flexbox
        container.innerHTML = `
            <div class="chart-datepickers">
                <div class="chart-date-controls">
                    <div>
                        <label for="${containerId}-from">${t('from_date', savedLang)}:</label>
                        <input type="date" id="${containerId}-from" min="${bounds.minDate}" max="${bounds.maxDate}" value="${bounds.minDate}">
                    </div>
                    <div>
                        <label for="${containerId}-to">${t('to_date', savedLang)}:</label>
                        <input type="date" id="${containerId}-to" min="${bounds.minDate}" max="${bounds.maxDate}" value="${bounds.maxDate}">
                    </div>
                </div>
                <div id="${canvasId}" style="flex-grow:1; width:100%;"></div>
            </div>
        `;

        const fromInput = document.getElementById(`${containerId}-from`) as HTMLInputElement;
        const toInput = document.getElementById(`${containerId}-to`) as HTMLInputElement;

        // Sync inputs -> Plotly
        const syncChart = () => {
            if (!fromInput || !toInput) {
                return;
            }
            const fromDate = new Date(fromInput.value);
            const toDate = new Date(toInput.value);

            // Validation: Prevent 'To' date from being before 'From' date
            if (fromDate > toDate) {
                toInput.value = fromInput.value;
            }

            // Tell Plotly to physically zoom the graph
            Plotly.relayout(canvasId, {
                'xaxis.range': [fromInput.value, toInput.value]
            });
        };

        fromInput?.addEventListener('change', syncChart);
        toInput?.addEventListener('change', syncChart);

        return { canvasId, fromInput, toInput, bounds };
    }
}