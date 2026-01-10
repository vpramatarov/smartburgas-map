import { CsvExporter } from './CsvExporter.js';
// Declare L (Leaflet) as global since we load it via CDN
declare const L: any;
declare const Plotly: any; // Declare Plotly.js global

class SmartMap {
    private map: any;
    private airLayer: any;
    private airQualityTimeLayer: any;
    private trafficLayer: any;

    // Store when we last fetched the data (Client side timestamp)
    private lastAirFetch: number = 0;
    private lastAirQualityTimeFetch: number = 0;
    private lastTrafficFetch: number = 0;

    private currentSensorData: any = null;

    // 5 Minutes in milliseconds
    private readonly REFRESH_RATE = 5 * 60 * 1000;

    constructor() {
        this.initMap();
        this.initListeners();
        this.checkInitialStatus().then(() => {
            this.loadAirQuality();
            const airCheckbox = document.getElementById('toggle-air-quality') as HTMLInputElement;
            airCheckbox.checked = true;

            this.loadAirQualityTime();
            const airTimeCheckbox = document.getElementById('toggle-air-quality-time') as HTMLInputElement;
            airTimeCheckbox.checked = true;

            this.loadTraffic();
            const trafficCheckbox = document.getElementById('toggle-traffic') as HTMLInputElement;
            trafficCheckbox.checked = true;
        });
    }

    private initMap(): void {
        // Initialize map centered on Burgas
        this.map = L.map('map').setView([42.5048, 27.4626], 13);

        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        // Initialize Layer Groups (empty initially)
        this.airLayer = L.layerGroup([], {name: "airLayer"});
        this.airQualityTimeLayer = L.layerGroup([], {name: "airQualityTimeLayer"});
        this.trafficLayer = L.layerGroup([], {name: "trafficLayer"});
    }

    private initListeners(): void {
        const airCheckbox = document.getElementById('toggle-air-quality') as HTMLInputElement;
        const airTimeCheckbox = document.getElementById('toggle-air-quality-time') as HTMLInputElement;
        const trafficCheckbox = document.getElementById('toggle-traffic') as HTMLInputElement;

        airCheckbox.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                this.loadAirQuality();
            } else {
                this.map.removeLayer(this.airLayer);
            }
        });

        airTimeCheckbox.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                this.loadAirQualityTime();
            } else {
                this.map.removeLayer(this.airQualityTimeLayer);
            }
        });

        trafficCheckbox.addEventListener('change', (e: Event) => {
            const target = e.target as HTMLInputElement;
            if (target.checked) {
                this.loadTraffic();
            } else {
                this.map.removeLayer(this.trafficLayer);
            }
        });

        const closePanel = document.getElementById('close-panel') as HTMLInputElement;
        // Close button for the panel
        closePanel.addEventListener('click', () => {
            document.getElementById('info-panel')?.classList.add('off-screen');
        });

        const csvDownloadBtn = document.getElementById('btn-download-csv') as HTMLInputElement;
        csvDownloadBtn.addEventListener('click', () => {
            if (this.currentSensorData) {
                // Use the new class
                CsvExporter.download(
                    this.currentSensorData,
                    this.currentSensorData.name || 'sensor_data'
                );
            }
        });
    }

    private async checkInitialStatus(): Promise<void> {
        try {
            const res = await fetch('/api/status');
            const status = await res.json();

            if (status.airQuality.exists) {
                this.lastAirFetch = status.airQuality.lastUpdated;
                this.updateTimestampUI('air-quality', new Date(status.airQuality.lastUpdated));
            }

            if (status.airQualityTime.exists) {
                this.lastAirQualityTimeFetch = status.airQualityTime.lastUpdated;
                this.updateTimestampUI('air-quality-time', new Date(status.airQualityTime.lastUpdated));
            }

            if (status.traffic.exists) {
                this.lastTrafficFetch = status.traffic.lastUpdated;
                this.updateTimestampUI('traffic-time', new Date(status.traffic.lastUpdated));
            }
        } catch (err) {
            console.error("Could not fetch initial status", err);
        }
    }

    private async loadAirQuality(): Promise<void> {
        const isDataFresh = (Date.now() - this.lastAirFetch) < this.REFRESH_RATE;

        // If data is already loaded, just add to map
        if (this.airLayer.getLayers().length > 0 && isDataFresh) {
            console.log("Using valid client-side cache for Air Quality.");
            this.airLayer.addTo(this.map);
            return;
        }

        // If stale or empty, clear and fetch
        this.airLayer.clearLayers();
        this.updateTimestampUI('air-time', 'Refreshing...');

        try {
            const res = await fetch('/api/air-quality');

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            // Get Server-Side Timestamp from Header
            const serverDateStr = res.headers.get('X-Last-Updated');
            const lastUpdateDate = serverDateStr ? new Date(serverDateStr) : new Date();
            this.lastAirFetch = lastUpdateDate.getTime();
            this.updateTimestampUI('air-time', lastUpdateDate);

            const data = await res.json();

            // --- DEBUGGING: Print the data structure to browser console ---
            console.log("Air Quality API Response:", data);

            this.addGeoJsonToLayer(data, this.airLayer, {
                color: "#3498db",
                radius: 8
            });
            this.airLayer.addTo(this.map);
        } catch (err) {
            console.error("Failed to load air data", err);
            this.updateTimestampUI('air-time', 'Error loading data.');
            alert("Error loading Air Quality data");
        }
    }

    private async loadAirQualityTime(): Promise<void> {
        const isDataFresh = (Date.now() - this.lastTrafficFetch) < this.REFRESH_RATE;

        // Prevent duplicate loading
        if (this.airQualityTimeLayer.getLayers().length > 0 && isDataFresh) {
            console.log("Using valid client-side cache for Air Quality Time.");
            this.airQualityTimeLayer.addTo(this.map);
            return;
        }

        this.airQualityTimeLayer.clearLayers();
        this.updateTimestampUI('air-quality-time', 'Refreshing...');

        try {
            const res = await fetch('/api/air-quality-time');

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const serverDateStr = res.headers.get('X-Last-Updated');
            const lastUpdateDate = serverDateStr ? new Date(serverDateStr) : new Date();
            this.lastAirQualityTimeFetch = lastUpdateDate.getTime();
            this.updateTimestampUI('air-quality-time', lastUpdateDate);

            const data = await res.json();

            // --- DEBUGGING: Print the data structure to browser console ---
            console.log("Air Quality Time API Response:", data);

            // Create GeoJSON layer with custom styles and popups
            this.addGeoJsonToLayer(data, this.airQualityTimeLayer, {
                color: "#008000",
                radius: 8
            });
            this.airQualityTimeLayer.addTo(this.map);
        } catch (err) {
            console.error("Failed to load Air Quality Time data", err);
            alert("Error loading Air Quality Time data. Check console for details.");
        }
    }

    private async loadTraffic(): Promise<void> {
        const isDataFresh = (Date.now() - this.lastTrafficFetch) < this.REFRESH_RATE;

        // Prevent duplicate loading
        if (this.trafficLayer.getLayers().length > 0 && isDataFresh) {
            console.log("Using valid client-side cache for Traffic.");
            this.trafficLayer.addTo(this.map);
            return;
        }

        this.trafficLayer.clearLayers();
        this.updateTimestampUI('traffic-time', 'Refreshing...');

        try {
            const res = await fetch('/api/traffic');

            if (!res.ok) {
                throw new Error(`Server returned ${res.status}`);
            }

            const serverDateStr = res.headers.get('X-Last-Updated');
            const lastUpdateDate = serverDateStr ? new Date(serverDateStr) : new Date();
            this.lastTrafficFetch = lastUpdateDate.getTime();
            this.updateTimestampUI('traffic-time', lastUpdateDate);

            const data = await res.json();

            // --- DEBUGGING: Print the data structure to browser console ---
            console.log("Traffic API Response:", data);

            // Create GeoJSON layer with custom styles and popups
            this.addGeoJsonToLayer(data, this.trafficLayer, {
                color: "#e74c3c",
                radius: 8
            });
            this.trafficLayer.addTo(this.map);
        } catch (err) {
            console.error("Failed to load traffic data", err);
            alert("Error loading Traffic data. Check console for details.");
        }
    }

    // Helper: Update the timestamp text on screen
    private updateTimestampUI(elementId: string, dateOrMsg: Date | string) {
        const el = document.getElementById(elementId);
        if (el) {
            if (typeof dateOrMsg === 'string') {
                el.innerText = dateOrMsg;
            } else {
                el.innerText = "Updated: " + dateOrMsg.toLocaleTimeString();
            }
        }
    }

    /**
     * Generic method to add GeoJSON data to a Leaflet layer.
     * @param inputData - The typed GeoJSON data (Collection or Array)
     * @param targetLayer - The Leaflet LayerGroup to add markers to
     * @param options - Styling configuration
     */
    private addGeoJsonToLayer(inputData: GeoJSONInput, targetLayer: any, options: LayerStyleOptions) {
        let features: GeoFeature[] = [];

        if (Array.isArray(inputData)) {
            features = inputData;
        } else if (inputData.features && Array.isArray(inputData.features)) {
            features = inputData.features;
        } else {
            console.log('GeoJSON data is empty, invalid, missing `features` key or data is not array.');
            return; // Invalid data
        }

        L.geoJSON(features, {
            pointToLayer: (feature: GeoFeature, latlng: any) => {
                return L.circleMarker(latlng, {
                    radius: options.radius || 8,
                    fillColor: options.fillColor || options.color, // Fallback to outline color
                    color: "#fff", // White border usually looks best
                    weight: options.weight || 1,
                    opacity: options.opacity || 1,
                    fillOpacity: options.fillOpacity || 0.8
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                if (!feature.properties) {
                    console.log ('Data does not contain `properties`.');
                    return;
                }

                const name = feature.properties.name || 'Sensor';
                const description = feature.properties.description || "No description available.";

                const popupContent = `
                    <div class="marker-popup-hover">
                        <h4>${name}</h4>
                        <p>${description}</p>
                    </div>
                `;

                // Bind the popup with specific settings for hover
                layer.bindPopup(popupContent, {
                    closeButton: false,
                    offset: L.point(0, -10)
                });

                // --- HOVER EVENTS ---
                layer.on('mouseover', function (e: any) {
                    const m = e.target;
                    m.openPopup();

                    // enlarge the marker on hover
                    m.setStyle({
                        weight: 3,
                        radius: 10
                    });
                });

                layer.on('mouseout', function (e: any) {
                    const m = e.target;
                    m.closePopup();

                    // Reset style
                    m.setStyle({
                        weight: 1,
                        radius: 8
                    });
                });

                layer.on('click', () => {
                    this.showDetailsInPanel(feature.properties, targetLayer.options.name);
                });
            }
        }).addTo(targetLayer);
    }

    private showDetailsInPanel(props: SensorProperties, layerName: string) {
        const panel = document.getElementById('info-panel');
        const content = document.getElementById('info-content');
        if (!panel || !content) return;

        this.currentSensorData = props;
        let html = `<h2>${props.name || 'Details'}</h2>`;

        // data for chart
        const labels: string[] = [];
        const values: number[] = [];

        let date = '';

        if (props.data) {
            let obj = props.data[0];
            if (obj.hasOwnProperty('car_count')) {
                props.data.forEach((item) => {
                    // Since we don't know the keys, we can loop through them
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
            } else {
                console.log(obj);
                for (const p in obj) {
                    let value = obj[p];
                    if (p.endsWith('_unit')) {
                        continue;
                    }

                    if (!value) {
                        continue;
                    }

                    html += `
                        <div class="data-row">
                            <p>${p}</p>
                            <span>${value} ${p !== 'time' ? obj[p+'_unit'] : ''}</span>
                        </div>`;
                }
            }
        }

        for (const key in props) {
            const val = props[key];
            if (typeof val !== 'object' && key !== 'name' && key !== 'data') {
                html += `
                <div class="data-row">
                    <p>${date.length ? date : key.replace(/_/g, ' ')}</p>
                    <span>${val}</span>
                </div>`;
            }
        }

        content.innerHTML = html;
        panel.classList.remove('off-screen');

        // Render chart using Plotly
        this.renderChart(labels, values);
    }

    private renderChart(labels: string[], values: number[]) {
        const noChartData = document.getElementById('no-chart-data');
        noChartData?.classList.add('hidden');

        if (labels.length === 0 || values.length === 0) {
            Plotly.purge('chart-container');
            noChartData?.classList.remove('hidden');
            return;
        }

        const trace = {
            x: labels,
            y: values,
            type: 'scatter', // 'scatter' with 'lines+markers' creates a line chart
            mode: 'lines+markers',
            marker: { color: '#3498db', size: 8 },
            line: { shape: 'spline', color: '#3498db', width: 2 },
            fill: 'tozeroy',
            fillcolor: 'rgba(52, 152, 219, 0.1)'
        };

        const layout = {
            autosize: true,
            height: 250,
            margin: { l: 40, r: 20, t: 10, b: 80 }, // Tighter margins
            font: { family: 'Arial, sans-serif', size: 10 },
            xaxis: {
                tickangle: -45,
                automargin: true
            },
            yaxis: {
                gridcolor: '#eee',
                zerolinecolor: '#ccc'
            },
            paper_bgcolor: 'rgba(0,0,0,0)',
            plot_bgcolor: 'rgba(0,0,0,0)'
        };

        const config = {
            responsive: true,
            displayModeBar: false // shows tools on hover
        };

        Plotly.newPlot('chart-container', [trace], layout, config);
    }
}


// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    new SmartMap();
});
