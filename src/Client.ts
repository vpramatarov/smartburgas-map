import { CsvExporter } from './CsvExporter.js';
import { IDetailsStrategy } from './strategies/IDetailsStrategy.js';
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { DefaultStrategy } from "./strategies/DefaultStrategy.js";
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import {
    GeoFeature, GeoJSONInput, LayerStyleOptions, SensorProperties
} from './Types.js'


// Declare L (Leaflet) as global since we load it via CDN
declare const L: any;

class SmartMap {
    private trafficSensorStrategy = new TrafficSensorStrategy();
    private airQualityTimeSensorStrategy = new AirQualityTimeSensorStrategy();
    private defaultSensorStrategy = new DefaultStrategy();
    private map: any;
    private airLayer: any;
    private airQualityTimeLayer: any;
    private trafficLayer: any;

    // Store when we last fetched the data (Client side timestamp)
    private lastAirFetch: number = 0;
    private lastAirQualityTimeFetch: number = 0;
    private lastTrafficFetch: number = 0;

    /** @var SensorProperties|null */
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
        this.airLayer = L.layerGroup();
        this.airQualityTimeLayer = L.layerGroup();
        this.trafficLayer = L.layerGroup();
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

            this.addGeoJsonToLayer(
                data,
                this.airLayer,
                {color: "#3498db", radius: 8},
                this.defaultSensorStrategy
            );
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
            this.addGeoJsonToLayer(
                data,
                this.airQualityTimeLayer,
                {color: "#008000", radius: 8},
                this.airQualityTimeSensorStrategy
            );
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
            this.addGeoJsonToLayer(
                data,
                this.trafficLayer,
                {color: "#e74c3c", radius: 8},
                this.trafficSensorStrategy
            );
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
     * @param detailStrategy - Show details panel based on layer
     */
    private addGeoJsonToLayer(inputData: GeoJSONInput, targetLayer: any, options: LayerStyleOptions, detailStrategy: IDetailsStrategy) {
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

                const props = feature.properties;
                const name = props.name || 'Sensor';
                const description = props.description || "No description available.";
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
                    this.currentSensorData = props;
                    this.executeStrategy(detailStrategy, props);

                    document.getElementById('info-panel')?.classList.remove('off-screen');
                });
            }
        }).addTo(targetLayer);
    }

    private executeStrategy(strategy: IDetailsStrategy, data: SensorProperties) {
        const content = document.getElementById('info-content') as HTMLElement;
        const chart = document.getElementById('chart-container') as HTMLElement;

        if (content && chart) {
            strategy.render(content, chart, data);
        }
    }
}


// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    new SmartMap();
});