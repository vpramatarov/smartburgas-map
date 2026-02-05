import { CsvExporter } from './CsvExporter.js';
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import { CompositeDetailsStrategy } from "./strategies/CompositeDetailsStrategy.js";
import {
    GeoFeature, GeoJSONInput, LayerStyleOptions, SensorProperties, SupportedLanguage
} from './Types.js'
import { ChartRenderer } from './components/ChartRenderer.js';
import {CCTVStrategy} from "./strategies/CCTVStrategy.js";
import {Utils} from "./Utils.js";

declare const L: any;

class SmartMap {
    private compositeStrategy: CompositeDetailsStrategy;

    private map: any;
    private airQualityTimeLayer: any;
    private trafficLayer: any;
    private cameraLayer: any;
    private pinnedSensors: SensorProperties[] = [];

    // State for Language
    private currentLang: SupportedLanguage = 'bg';

    constructor() {
        const strategies = [
            new AirQualityTimeSensorStrategy(),
            new TrafficSensorStrategy(),
            new CCTVStrategy()
        ];
        this.compositeStrategy = new CompositeDetailsStrategy(strategies);

        const savedLang = localStorage.getItem('sb_lang') as SupportedLanguage;
        if (savedLang === 'bg' || savedLang === 'en') {
            this.currentLang = savedLang;
        }

        this.initMap();
        this.initListeners();
        this.renderLanguageSwitcher();
        this.loadAirQualityTime();
        this.loadTraffic();
        this.loadCameraData();

        (document.getElementById('toggle-air-quality-time') as HTMLInputElement).checked = true;
        (document.getElementById('toggle-traffic') as HTMLInputElement).checked = true;
        (document.getElementById('toggle-cctv') as HTMLInputElement).checked = true;
    }

    private initMap(): void {
        this.map = L.map('map').setView([42.5048, 27.4626], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);

        this.airQualityTimeLayer = L.layerGroup();
        this.trafficLayer = L.layerGroup();
        this.cameraLayer = L.layerGroup();
    }

    private renderLanguageSwitcher() {
        const controls = document.getElementById('controls') as HTMLElement;
        if (!controls) {
            return;
        }

        const flagElements = document.querySelectorAll('.lang-switcher span') as NodeListOf<HTMLSpanElement>;
        flagElements?.forEach((flagEl) => {
            const flagLang = flagEl.dataset.flag as SupportedLanguage;
            if (this.currentLang === flagLang) {
                flagEl.classList.add('active');
            }

            flagEl.addEventListener('click', (e) => {
                e.preventDefault();
                flagEl.nextElementSibling?.classList.remove('active');
                flagEl.previousElementSibling?.classList.remove('active');
                flagEl.classList.add('active');
                this.setLanguage(flagLang);
            })
        });
    }

    private setLanguage(lang: SupportedLanguage) {
        if (this.currentLang === lang) {
            return;
        }

        this.currentLang = lang;
        localStorage.setItem('sb_lang', lang);

        console.log(`Language switched to ${lang}. Refreshing data...`);

        // Refresh Data
        if ((document.getElementById('toggle-air-quality-time') as HTMLInputElement).checked) {
            this.loadAirQualityTime();
        }
        if ((document.getElementById('toggle-traffic') as HTMLInputElement).checked) {
            this.loadTraffic();
        }

        if ((document.getElementById('toggle-cctv') as HTMLInputElement).checked) {
            this.loadCameraData();
        }
    }

    private initListeners(): void {
        const airTimeCheckbox = document.getElementById('toggle-air-quality-time') as HTMLInputElement;
        const trafficCheckbox = document.getElementById('toggle-traffic') as HTMLInputElement;
        const cameraCheckbox = document.getElementById('toggle-cctv') as HTMLInputElement;
        const modal = document.getElementById('chart-modal') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLElement;
        const btnCloseModal = document.getElementById('close-modal') as HTMLElement;

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
            } else {
                this.map.removeLayer(this.airQualityTimeLayer);
            }
        });

        trafficCheckbox.addEventListener('change', (e: Event) => {
            if ((e.target as HTMLInputElement).checked) {
                this.loadTraffic();
            } else {
                this.map.removeLayer(this.trafficLayer);
            }
        });

        cameraCheckbox.addEventListener('change', (e: Event) => {
            if ((e.target as HTMLInputElement).checked) {
                this.loadCameraData();
            } else {
                this.map.removeLayer(this.cameraLayer);
            }
        });

        document.getElementById('close-panel')?.addEventListener('click', () => {
            // document.getElementById('info-panel')?.classList.add('off-screen');
            document.getElementById('info-panel')?.classList.add('hidden');
            // Clear the DOM content
            // This also ensures video elements are removed, stopping native playback
            const content = document.getElementById('info-content');
            if (content) {
                content.innerHTML = '';
            }

            this.pinnedSensors = [];

            // Force stop all HLS streams
            // This also kills the background network requests
            CCTVStrategy.stopAll();
        });

        document.getElementById('btn-download-csv')?.addEventListener('click', () => {
            if (this.pinnedSensors.length > 0) {
                CsvExporter.download(this.pinnedSensors);
            } else {
                alert("Please pin at least one sensor to export data.");
            }
        });
    }

    private async loadAirQualityTime(): Promise<void> {
        this.airQualityTimeLayer.clearLayers();
        Utils.updateTimestampUI('air-quality-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/air-quality-time?lang=${this.currentLang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('air-quality-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, 'air_quality_time');

            this.addGeoJsonToLayer(data, this.airQualityTimeLayer, {color: "#008000"});
            this.airQualityTimeLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
        }
    }

    private async loadTraffic(): Promise<void> {
        this.trafficLayer.clearLayers();
        Utils.updateTimestampUI('traffic-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/traffic?lang=${this.currentLang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('traffic-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, 'traffic_sensor');

            this.addGeoJsonToLayer(data, this.trafficLayer, {color: "#e74c3c"});
            this.trafficLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
        }
    }

    private async loadCameraData(): Promise<void> {
        this.cameraLayer.clearLayers();
        Utils.updateTimestampUI('cctv-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/cctv?lang=${this.currentLang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('cctv-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            Utils.tagDataWithStrategy(data, 'cctv');

            this.addGeoJsonToLayer(data, this.cameraLayer, {color: "#2ecc71"});
            this.cameraLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
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
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.name || props.publicname}</h4><p>Click to Pin</p></div>`, {
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
        const exists = this.pinnedSensors.find(s => {
            if (s.id && sensor.id) {
                return s.id === sensor.id;
            }
            const sName = s.name || s.publicname;
            const sensorName = sensor.name || sensor.publicname;
            return sName === sensorName;
        });

        if (!exists) {
            this.pinnedSensors.push(sensor);
        }
        this.refreshPanel();
    }

    private removeSensor(sensor: SensorProperties) {
        this.pinnedSensors = this.pinnedSensors.filter(s => s !== sensor);
        // Force stop all HLS streams
        // This also kills the background network requests
        CCTVStrategy.stopAll();
        this.refreshPanel();
    }

    private refreshPanel() {
        const content = document.getElementById('info-content') as HTMLElement;
        const chart = document.getElementById('chart-container') as HTMLElement;

        if (content && chart) {
            this.compositeStrategy.render(content, chart, this.pinnedSensors, (s) => this.removeSensor(s));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SmartMap();
});