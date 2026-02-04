import { CsvExporter } from './CsvExporter.js';
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { DefaultStrategy } from "./strategies/DefaultStrategy.js";
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import { CompositeDetailsStrategy } from "./strategies/CompositeDetailsStrategy.js";
import {
    GeoFeature, GeoJSONInput, LayerStyleOptions, SensorProperties, SupportedLanguage
} from './Types.js'
import { ChartRenderer } from './components/ChartRenderer.js';

declare const L: any;

class SmartMap {
    private compositeStrategy: CompositeDetailsStrategy;

    private map: any;
    private airQualityTimeLayer: any;
    private trafficLayer: any;
    private pinnedSensors: SensorProperties[] = [];

    // State for Language
    private currentLang: SupportedLanguage = 'bg';

    constructor() {
        const strategies = [
            new DefaultStrategy(),
            new AirQualityTimeSensorStrategy(),
            new TrafficSensorStrategy()
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

    private renderLanguageSwitcher() {
        const controls = document.getElementById('controls') as HTMLElement;
        if (!controls) return;

        const wrapper = document.createElement('div') as HTMLDivElement;
        wrapper.className = 'lang-switcher';
        wrapper.style.marginBottom = '15px';
        wrapper.style.display = 'flex';
        wrapper.style.gap = '10px';

        const createBtn = (lang: SupportedLanguage, label: string, flag: string) => {
            const btn = document.createElement('button');
            btn.innerHTML = `<span style="font-size:1.2em">${flag}</span> ${label}`;
            btn.style.flex = '1';
            btn.style.cursor = 'pointer';
            btn.style.padding = '5px';
            btn.style.border = '1px solid #ccc';
            btn.style.background = this.currentLang === lang ? '#e0e0e0' : '#fff';
            btn.style.fontWeight = this.currentLang === lang ? 'bold' : 'normal';

            btn.onclick = () => this.setLanguage(lang);
            return btn;
        };

        const btnBg = createBtn('bg', 'BG', '🇧🇬');
        const btnEn = createBtn('en', 'EN', '🇬🇧');

        wrapper.appendChild(btnBg);
        wrapper.appendChild(btnEn);

        // Insert at the top of controls (before the Filters)
        controls.insertBefore(wrapper, controls.firstChild);
    }

    private setLanguage(lang: SupportedLanguage) {
        if (this.currentLang === lang) return;

        this.currentLang = lang;
        localStorage.setItem('sb_lang', lang);

        console.log(`Language switched to ${lang}. Refreshing data...`);

        // Re-render buttons to update styling
        const controls = document.getElementById('controls') as HTMLElement;
        const existingSwitcher = controls.querySelector('.lang-switcher');
        if (existingSwitcher) {
            controls.removeChild(existingSwitcher);
        }
        this.renderLanguageSwitcher();

        // Refresh Data
        if ((document.getElementById('toggle-air-quality-time') as HTMLInputElement).checked) {
            this.loadAirQualityTime();
        }
        if ((document.getElementById('toggle-traffic') as HTMLInputElement).checked) {
            this.loadTraffic();
        }
    }

    private initListeners(): void {
        const airTimeCheckbox = document.getElementById('toggle-air-quality-time') as HTMLInputElement;
        const trafficCheckbox = document.getElementById('toggle-traffic') as HTMLInputElement;
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
                CsvExporter.download(this.pinnedSensors);
            } else {
                alert("Please pin at least one sensor to export data.");
            }
        });
    }

    private async loadAirQualityTime(): Promise<void> {
        this.airQualityTimeLayer.clearLayers();
        this.updateTimestampUI('air-quality-time', 'Refreshing...');

        try {
            // Updated to use currentLang
            const res = await fetch(`/api/air-quality-time?lang=${this.currentLang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            this.updateTimestampUI('air-quality-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
            this.tagDataWithStrategy(data, 'air_quality_time');

            this.addGeoJsonToLayer(data, this.airQualityTimeLayer, {color: "#008000"});
            this.airQualityTimeLayer.addTo(this.map);
        } catch (err) {
            console.error(err);
        }
    }

    private async loadTraffic(): Promise<void> {
        this.trafficLayer.clearLayers();
        this.updateTimestampUI('traffic-time', 'Refreshing...');

        try {
            // Updated to use currentLang
            const res = await fetch(`/api/traffic?lang=${this.currentLang}`);
            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            this.updateTimestampUI('traffic-time', new Date(res.headers.get('X-Last-Updated') || new Date()));

            const data = await res.json();
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
            this.compositeStrategy.render(content, chart, this.pinnedSensors, (s) => this.removeSensor(s));
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new SmartMap();
});