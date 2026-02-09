import { CsvExporter } from './CsvExporter.js';
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import { CompositeDetailsStrategy } from "./strategies/CompositeDetailsStrategy.js";
import { SensorProperties, SupportedLanguage } from './Types.js'
import { ChartRenderer } from './components/ChartRenderer.js';
import { CCTVStrategy } from "./strategies/CCTVStrategy.js";

declare const L: any;

class SmartMap {
    private compositeStrategy: CompositeDetailsStrategy;
    private map: any;
    private pinnedSensors: SensorProperties[] = [];
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

        this.compositeStrategy.getStrategies().forEach(strategy => {
            // Initialize: Strategy creates its layer and attaches click listeners
            strategy.initialize(this.map, (sensor) => this.pinSensor(sensor));
            strategy.loadData(this.currentLang);
        });

        // Note: The strategy layers are created but not added to map yet.
        // Trigger the checkboxes to add them.
        this.setInitialToggle('toggle-air-quality-time');
        this.setInitialToggle('toggle-traffic');
        this.setInitialToggle('toggle-cctv');
    }

    private initMap(): void {
        this.map = L.map('map').setView([42.5048, 27.4626], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(this.map);
    }

    private setInitialToggle(id: string) {
        const el = document.getElementById(id) as HTMLInputElement;
        if (el) {
            el.checked = true;
            // Trigger change event to run the logic in initListeners
            el.dispatchEvent(new Event('change'));
        }
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

        // Refreshes data for ALL strategies
        this.compositeStrategy.getStrategies().forEach(strategy => {
            strategy.loadData(this.currentLang);
        });
    }

    private initListeners(): void {
        const modal = document.getElementById('chart-modal') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLElement;
        const btnCloseModal = document.getElementById('close-modal') as HTMLElement;

        // --- Chart Modal Logic ---
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

        // --- Layer Toggles ---
        // We explicitly map the Checkbox ID to the Strategy Name
        const toggleMap: { [key: string]: string } = {
            'toggle-air-quality-time': 'air_quality_time',
            'toggle-traffic': 'traffic_sensor',
            'toggle-cctv': 'cctv'
        };

        for (const [elementId, strategyName] of Object.entries(toggleMap)) {
            const checkbox = document.getElementById(elementId) as HTMLInputElement;
            checkbox?.addEventListener('change', (e: Event) => {
                const strategy = this.compositeStrategy.getStrategies().get(strategyName);
                if (strategy) {
                    const layer = strategy.getLayer();
                    if ((e.target as HTMLInputElement).checked) {
                        // If data hasn't been loaded yet, we could trigger loadData here too
                        // But we load all on startup for now.
                        layer.addTo(this.map);
                    } else {
                        this.map.removeLayer(layer);
                    }
                }
            });
        }

        // --- Panel Actions ---
        document.getElementById('close-panel')?.addEventListener('click', () => {
            document.getElementById('info-panel')?.classList.add('hidden');
            const content = document.getElementById('info-content');
            if (content) content.innerHTML = '';

            this.pinnedSensors = [];
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

    private pinSensor(sensor: SensorProperties) {
        const exists = this.pinnedSensors.find(s => {
            if (s.id && sensor.id) return s.id === sensor.id;
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