// src/components/ChartRenderer.ts
declare const Plotly: any;

export class ChartRenderer {

    public static render(containerId: string, labels: string[], values: number[]) {
        const trace = {
            x: labels,
            y: values,
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: '#3498db', size: 8 },
            line: { shape: 'spline', color: '#3498db', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(52, 152, 219, 0.1)'
        };

        const layout = {
            autosize: true,
            height: 250,
            margin: { l: 40, r: 20, t: 10, b: 80 },
            font: { family: 'Arial, sans-serif', size: 10 },
            xaxis: { tickangle: -45, automargin: true },
            yaxis: { gridcolor: '#eee', zerolinecolor: '#ccc' },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };

        const config = { responsive: true, displayModeBar: false };

        Plotly.newPlot(containerId, [trace], layout, config);
    }

    public static clear(containerId: string) {
        const container = document.getElementById(containerId) as HTMLElement;
        if (container) {
            Plotly.purge(container);
            container.innerHTML = '';
        }
    }
}