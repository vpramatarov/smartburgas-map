import { CsvExporter } from './CsvExporter.js';
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { DefaultStrategy } from "./strategies/DefaultStrategy.js";
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import { CompositeDetailsStrategy } from "./strategies/CompositeDetailsStrategy.js";
import {
    GeoFeature, GeoJSONInput, LayerStyleOptions, SensorProperties
} from './Types.js'
import { ChartRenderer } from './components/ChartRenderer.js';

declare const L: any;

class SmartMap {
    private compositeStrategy: CompositeDetailsStrategy;

    private map: any;
    private airQualityTimeLayer: any;
    private trafficLayer: any;
    private pinnedSensors: SensorProperties[] = [];

    constructor() {
        const strategies = [
            new DefaultStrategy(),
            new AirQualityTimeSensorStrategy(),
            new TrafficSensorStrategy()
        ];
        this.compositeStrategy = new CompositeDetailsStrategy(strategies);

        this.initMap();
        this.initListeners();
        this.loadAirQualityTime();
        this.loadTraffic();

        (document.getElementById('toggle-air-quality-time') as HTMLInputElement).checked = true;
        (document.getElementById('toggle-traffic') as HTMLInputElement).checked = true;
    }

    private initMap(): void {
        this.map = L.map('map').setView([42.5048, 27.4626], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.airQualityTimeLayer = L.layerGroup();
        this.trafficLayer = L.layerGroup();
    }

    private initListeners(): void {
        const airTimeCheckbox = document.getElementById('toggle-air-quality-time') as HTMLInputElement;
        const trafficCheckbox = document.getElementById('toggle-traffic') as HTMLInputElement;
        const modal = document.getElementById('chart-modal') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLElement;
        const btnCloseModal = document.getElementById('close-modal') as HTMLElement;

        // Full Screen Chart
        btnFullChart?.addEventListener('click', () => {
            if (this.pinnedSensors.length > 0 && modal) {
                modal.classList.remove('hidden');

                const configRaw = btnFullChart.dataset.chartConfig || '[]';
                try {
                    const config = JSON.parse(configRaw);
                    this.compositeStrategy.renderFull(config, this.pinnedSensors);
                } catch (e) {
                    console.error("Failed to parse chart config", e);
                }
            }
        });

        btnCloseModal?.addEventListener('click', () => {
            modal?.classList.add('hidden');
            ChartRenderer.clear('full-chart-container');
        });

        window.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.add('hidden');
                ChartRenderer.clear('full-chart-container');
            }
        });

        airTimeCheckbox.addEventListener('change', (e: Event) => {
            if ((e.target as HTMLInputElement).checked) {
                this.loadAirQualityTime();
            }
            else this.map.removeLayer(this.airQualityTimeLayer);
        });

        trafficCheckbox.addEventListener('change', (e: Event) => {
            if ((e.target as HTMLInputElement).checked) {
                this.loadTraffic();
            }
            else this.map.removeLayer(this.trafficLayer);
        });

        document.getElementById('close-panel')?.addEventListener('click', () => {
            document.getElementById('info-panel')?.classList.add('off-screen');
        });

        document.getElementById('btn-download-csv')?.addEventListener('click', () => {
            if (this.pinnedSensors.length > 0) {
                // Pass all pinned sensors to the exporter
                CsvExporter.download(this.pinnedSensors);
            } else {
                alert("Please pin at least one sensor to export data.");
            }
        });
    }

    private async loadAirQualityTime(): Promise<void> {
        if (this.airQualityTimeLayer.getLayers().length > 0) {
            this.airQualityTimeLayer.addTo(this.map);
            return;
        }

        this.airQualityTimeLayer.clearLayers();
        this.updateTimestampUI('air-quality-time', 'Refreshing...');

        try {
            const res = await fetch('/api/air-quality-time');
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            this.updateTimestampUI('air-quality-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            // IMPORTANT: Tag data with strategy name
            this.tagDataWithStrategy(data, 'air_quality_time');

            this.addGeoJsonToLayer(data, this.airQualityTimeLayer, {color: "#008000"});
            this.airQualityTimeLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
        }
    }

    private async loadTraffic(): Promise<void> {
        if (this.trafficLayer.getLayers().length > 0) {
            this.trafficLayer.addTo(this.map);
            return;
        }

        this.trafficLayer.clearLayers();
        this.updateTimestampUI('traffic-time', 'Refreshing...');

        try {
            const res = await fetch('/api/traffic');
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            this.updateTimestampUI('traffic-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            // IMPORTANT: Tag data with strategy name
            this.tagDataWithStrategy(data, 'traffic_sensor');

            this.addGeoJsonToLayer(data, this.trafficLayer, {color: "#e74c3c"});
            this.trafficLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
        }
    }

    private tagDataWithStrategy(data: GeoJSONInput, strategyName: string) {
        if(Array.isArray(data)) {
            data.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;
                }
            });
        } else {
            data.features.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;
                }
            });
        }
    }

    private updateTimestampUI(elementId: string, dateOrMsg: Date | string) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerText = (typeof dateOrMsg === 'string') ? dateOrMsg : "Updated: " + dateOrMsg.toLocaleTimeString();
        }
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, targetLayer: any, options: LayerStyleOptions) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (feature: GeoFeature, latlng: any) => {
                return L.circleMarker(latlng, {
                    radius: options.radius || 8,
                    fillColor: options.fillColor || options.color,
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name}</h4><p>Click to Pin</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, -10)
                });

                layer.on('mouseover', (e: any) => {
                    e.target.openPopup();
                    e.target.setStyle({ weight: 3, radius: 10 });
                });
                layer.on('mouseout', (e: any) => {
                    e.target.closePopup();
                    e.target.setStyle({ weight: 1, radius: 8 });
                });
                layer.on('click', () => {
                    this.pinSensor(props);
                });
            }
        }).addTo(targetLayer);
    }

    private pinSensor(sensor: SensorProperties) {
        // do not clear list on strategy change. Mixed strategies are allowed.
        const exists = this.pinnedSensors.find(s => {
            if (s.id && sensor.id) {
                return s.id === sensor.id;
            }
            return s.name === sensor.name;
        });

        if (!exists) {
            this.pinnedSensors.push(sensor);
        }
        this.refreshPanel();
    }

    private removeSensor(sensor: SensorProperties) {
        this.pinnedSensors = this.pinnedSensors.filter(s => s !== sensor);
        this.refreshPanel();
    }

    private refreshPanel() {
        const content = document.getElementById('info-content') as HTMLElement;
        const chart = document.getElementById('chart-container') as HTMLElement;

        if (content && chart) {
            // Delegate all rendering to composite strategy
            this.compositeStrategy.render(content, chart, this.pinnedSensors, (s) => this.removeSensor(s));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SmartMap();
});