// src/components/ChartRenderer.ts
import { ChartDataset } from "../Types.js";

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

    /**
     * Renders chart. Now supports individual time arrays per dataset.
     * @param containerId DOM ID
     * @param defaultLabels Fallback X-axis labels (can be empty if datasets have times)
     * @param datasets Data to render
     */
    public static render(containerId: string, defaultLabels: string[], datasets: ChartDataset[]) {
        const container = document.getElementById(containerId);

        if (!container) {
            return;
        }

        const traces = datasets.map((ds, index) => {
            const color = this.palette[index % this.palette.length];
            // Use dataset-specific time or fall back to defaultLabels
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
                fill: datasets.length === 1 ? 'tozeroy' : 'none', // Fill only if it's the solitary dataset
                fillcolor: datasets.length === 1 ? `rgba(${this.hexToRgb(color)}, 0.1)` : undefined
            };
        });

        const layout = {
            autosize: true,
            height: 250,
            margin: { l: 40, r: 20, t: 10, b: 60 },
            font: { family: 'Arial, sans-serif', size: 10 },
            xaxis: { type: 'date', tickangle: -45, automargin: true },
            yaxis: { gridcolor: '#eee', zerolinecolor: '#ccc' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)',
            showlegend: datasets.length > 1,
            legend: { x: 0, y: 1.1, orientation: 'h' } // Legend on top
        };

        const config = { responsive: true, displayModeBar: true };

        Plotly.newPlot(containerId, traces, layout, config);
    }

    /**
     * Renders a full-screen version of the chart in the modal.
     */
    public static renderFull(containerId: string, title: string, defaultLabels: string[], datasets: ChartDataset[]) {
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

        const layout = {
            title: { text: title, font: { color: '#eee' } },
            autosize: true,
            font: { family: 'Arial, sans-serif', size: 12, color: '#eee' },
            xaxis: {
                type: 'date',
                tickangle: -45,
                automargin: true,
                gridcolor: '#444',
                zerolinecolor: '#666'
            },
            yaxis: {
                gridcolor: '#444',
                zerolinecolor: '#666'
            },
            paper_bgcolor: '#222',
            plot_bgcolor: '#222',
            showlegend: true,
            legend: { font: { color: '#eee' }, orientation: 'h', y: 1.1 }
        };

        const config = { responsive: true, displayModeBar: true };

        Plotly.newPlot(containerId, traces, layout, config);
    }

    public static clear(containerId: string) {
        const container = document.getElementById(containerId) as HTMLElement;
        if (container) {
            Plotly.purge(container);
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
}