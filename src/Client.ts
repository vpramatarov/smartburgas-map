
import {FilterGeometry, Position, SensorProperties, SupportedLanguage} from './Types.js'
import { t } from './Translations.js';
import { TranslationKeys } from './locales/bg.js';
import { CsvExporter } from './CsvExporter.js';
import { CompositeDetailsStrategy } from "./strategies/CompositeDetailsStrategy.js";
import { TrafficSensorStrategy } from './strategies/TrafficSensorStrategy.js';
import { AirQualityTimeSensorStrategy } from "./strategies/AirQualityTimeSensorStrategy.js";
import { CCTVStrategy } from "./strategies/CCTVStrategy.js";
import { BillingMachineStrategy } from './strategies/BillingMachineStrategy.js';
import { EVChargingStrategy } from './strategies/EVChargingStrategy.js';
import { WasteCentreStrategy } from './strategies/WasteCentreStrategy.js';
import { SmartParkingStrategy } from './strategies/SmartParkingStrategy.js';
import { TaxiRankStrategy } from './strategies/TaxiRankStrategy.js';
import { AdministrativeRegionStrategy } from './strategies/AdministrativeRegionStrategy.js';
import {PaidParkingZonesStrategy} from "./strategies/PaidParkingZonesStrategy.js";
import { ChartRenderer } from './components/ChartRenderer.js';
import {ISpatialFilterStrategy} from "./strategies/ISpatialFilterStrategy.js";
import {Utils} from "./Utils.js";
import * as Sentry from "@sentry/browser";
import {BasePointStrategy} from "./strategies/BasePointStrategy.js";

declare const L: typeof import('leaflet');

class SmartMap {
    private config: {sentryDsn: string|null, allowFrameUrl: string} = {sentryDsn: null, allowFrameUrl: '*'};
    // private allowedOrigin: string = '*'; // Default to allow all until config loads
    private compositeStrategy: CompositeDetailsStrategy;
    private map!: L.Map;
    private pinnedSensors: SensorProperties[] = [];
    private previewSensor: SensorProperties | null = null;
    private currentLang: SupportedLanguage = 'bg';
    private readonly spatialStrategies: ISpatialFilterStrategy[] = [];

    constructor(config: {sentryDsn: string|null, allowFrameUrl: string}) {
        this.config = config;

        const adminStrategy = new AdministrativeRegionStrategy((geometry, sourceStrategy) => {
            this.onRegionFilterChange(geometry, sourceStrategy);
        });

        const paidStrategy = new PaidParkingZonesStrategy((geometry, sourceStrategy, feature) => {
            this.onRegionFilterChange(geometry, sourceStrategy, feature);
        });

        // --- define the Tree Hierarchy ---
        adminStrategy.childStrategies = [paidStrategy];
        paidStrategy.parentStrategy = adminStrategy;

        this.spatialStrategies = [adminStrategy, paidStrategy];

        const strategies = [
            new AirQualityTimeSensorStrategy(),
            new TrafficSensorStrategy(),
            new CCTVStrategy(),
            new BillingMachineStrategy(),
            new EVChargingStrategy(),
            new WasteCentreStrategy(),
            new SmartParkingStrategy(),
            new TaxiRankStrategy(),
            adminStrategy,
            paidStrategy
        ];
        this.compositeStrategy = new CompositeDetailsStrategy(strategies);

        let savedLang: SupportedLanguage | null = null;
        try {
            savedLang = localStorage.getItem('sb_lang') as SupportedLanguage;
        } catch (e) {
            console.warn("Iframe Storage Access Blocked. Defaulting language.");
        }

        if (savedLang === 'bg' || savedLang === 'en') {
            this.currentLang = savedLang;
        }

        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n') as keyof TranslationKeys;
            if (key) {
                element.textContent = t(key, this.currentLang);
            }
        });

        this.initMap();
        this.initListeners();
        this.renderLanguageSwitcher();
        this.initIframeBridge();

        this.compositeStrategy.getStrategies().forEach(strategy => {
            strategy.initialize(this.map, (sensor) => this.onSensorSelect(sensor));
            strategy.loadData(this.currentLang);
            // Note: The strategy layers are created but not added to map yet. Trigger the checkboxes to add them.
            this.setInitialToggle(strategy.checkbox_id);
        });
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

        const radioButtons = document.querySelectorAll('input[name="lang"]') as NodeListOf<HTMLInputElement>;

        radioButtons?.forEach(radio => {
            if (radio.value === this.currentLang as string) {
                radio.checked = true;
            }

            radio.addEventListener('change', (e) => {
                const $currentInputEl = e.target as HTMLInputElement;
                const lang = $currentInputEl.value as SupportedLanguage;
                this.setLanguage(lang);
                console.log(`Language changed to: ${lang}`);
            });
        });
    }

    private setLanguage(lang: SupportedLanguage) {
        if (this.currentLang === lang) {
            return;
        }

        this.currentLang = lang;

        try {
            localStorage.setItem('sb_lang', lang);
        } catch (e) {
            console.warn("Cannot save language preference in Iframe.");
        }

        document.querySelectorAll('[data-i18n]').forEach((element) => {
            const key = element.getAttribute('data-i18n') as keyof TranslationKeys;
            if (key) {
                element.textContent = t(key, this.currentLang);
            }
        });

        this.clearSidePanel();

        console.log(`Language switched to ${lang}. Refreshing data...`);

        // Refreshes data for ALL strategies
        this.compositeStrategy.getStrategies().forEach(strategy => {
            strategy.loadData(this.currentLang);
        });
    }

    private clearSidePanel() {
        this.pinnedSensors = [];
        this.previewSensor = null;
        CCTVStrategy.stopAll();

        // Hide the panel visually
        const panel = document.getElementById('info-panel') as HTMLElement;
        if (panel) {
            panel.classList.add('hidden');
        }

        // Tell the composite strategy to render the now-empty arrays, which clears the DOM inside the panel cleanly.
        const panelContainer = document.getElementById('info-content') as HTMLElement;
        const chartContainer = document.getElementById('chart-container') as HTMLElement;
        this.compositeStrategy.render(
            panelContainer,
            chartContainer,
            [], // Empty items
            this.pinnedSensors,
            (s) => this.togglePin(s),
            (s) => this.closeSensor(s),
            this.currentLang
        );
    }

    private initListeners(): void {
        const modal = document.getElementById('chart-modal') as HTMLElement;
        const btnFullChart = document.getElementById('btn-full-chart') as HTMLElement;
        const btnCloseModal = document.getElementById('close-modal') as HTMLElement;
        const btnSelectAll = document.getElementById('btn-select-all') as HTMLLinkElement;
        const btnDeselectAll = document.getElementById('btn-deselect-all') as HTMLLinkElement;
        const mobileFilterBtn = document.getElementById('mobile-filter-btn') as HTMLButtonElement;
        const closeControlsBtn = document.getElementById('close-controls') as HTMLButtonElement;
        const controlsPanel = document.getElementById('controls') as HTMLDivElement;
        const infoPanelEl = document.getElementById('info-panel') as HTMLElement;
        const infoContentEl = document.getElementById('info-content') as HTMLDivElement;
        const minimizedBar = document.getElementById('panel-minimized-bar') as HTMLElement;
        const minimizeBtn = document.getElementById('minimize-panel') as HTMLButtonElement;
        const btnFullChartMin = document.getElementById('btn-full-chart-min') as HTMLButtonElement;

        // --- Chart Modal Logic ---
        btnFullChart?.addEventListener('click', () => {
            if ((this.previewSensor || this.pinnedSensors.length > 0) && modal) {
                const data = [...this.pinnedSensors];

                if (this.previewSensor) {
                    data.push(this.previewSensor);
                }

                modal.classList.remove('hidden');
                const configRaw = btnFullChart.dataset.chartConfig || '[]';
                const config = JSON.parse(configRaw);
                this.compositeStrategy.renderFull(config, data, this.currentLang);
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

        const batchUpdate = (check: boolean) => {
            const checkboxes = document.querySelectorAll('#controls input[type="checkbox"]') as NodeListOf<HTMLInputElement>;

            checkboxes.forEach(box => {
                if (box.checked !== check) {
                    box.checked = check;
                    // Note: Manually trigger the 'change' event so the map listeners know to add/remove the layer
                    box.dispatchEvent(new Event('change'));
                }
            });
        };

        // Helper to swap the active class
        const setBulkActive = (isSelectAllActive: boolean) => {
            if (isSelectAllActive) {
                btnSelectAll?.classList.add('active');
                btnDeselectAll?.classList.remove('active');
            } else {
                btnSelectAll?.classList.remove('active');
                btnDeselectAll?.classList.add('active');
            }
        };

        btnSelectAll?.addEventListener('click', (e) => {
            e.preventDefault(); // Stop jump to top
            batchUpdate(true);
            setBulkActive(true); // Set Select All as active
        });

        btnDeselectAll?.addEventListener('click', (e) => {
            e.preventDefault();
            batchUpdate(false);
            setBulkActive(false); // Set Deselect All as active
        });

        // --- Layer Toggles ---
        for (const [elementId, strategyName] of Object.entries(this.compositeStrategy.toggleMap())) {
            const checkbox = document.getElementById(elementId) as HTMLInputElement;
            checkbox?.addEventListener('change', (e: Event) => {
                const strategy = this.compositeStrategy.getStrategies().get(strategyName);
                if (strategy) {
                    const layer = strategy.getLayer();
                    if ((e.target as HTMLInputElement).checked) {
                        // If data hasn't been loaded yet, we could trigger loadData here too
                        // But we load all on startup for now.
                        strategy.loadData(this.currentLang)
                        layer.addTo(this.map);

                        // Un-mark any sensors from this strategy that were hidden
                        [this.previewSensor, ...this.pinnedSensors].forEach(s => {
                            if (s && s.strategy === strategyName) {
                                s._hidden = false;
                            }
                        });
                    } else {
                        this.map.removeLayer(layer);

                        // Mark any pinned/preview sensors from this strategy as hidden
                        // so the side panel can show a warning banner instead of disappearing
                        [this.previewSensor, ...this.pinnedSensors].forEach(s => {
                            if (s && s.strategy === strategyName) {
                                s._hidden = true;
                            }
                        });
                    }

                    // Refresh the panel to show/hide the warning banner
                    const hasAffectedSensors = [this.previewSensor, ...this.pinnedSensors]
                        .some(s => s && s.strategy === strategyName);
                    if (hasAffectedSensors) {
                        this.refreshPanel();
                    }
                }
            });
        }

        // --- Panel Actions ---
        document.getElementById('close-panel')?.addEventListener('click', () => {
            infoPanelEl?.classList.add('hidden');
            if (infoContentEl) {
                infoContentEl.innerHTML = '';
            }

            this.pinnedSensors = [];
            CCTVStrategy.stopAll();
        });

        const downloadButtons = Array.from(document.querySelectorAll('.btn-download-csv') as NodeListOf<HTMLButtonElement>);
        downloadButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const data = [...this.pinnedSensors];

                if (this.previewSensor) {
                    data.push(this.previewSensor);
                }

                if (data.length > 0) {
                    CsvExporter.download(data, this.currentLang);
                }
            });
        });

        mobileFilterBtn?.addEventListener('click', () => {
            controlsPanel?.classList.toggle('open');
            mobileFilterBtn.classList.toggle('open');
        });

        closeControlsBtn?.addEventListener('click', () => {
            controlsPanel?.classList.remove('open');
            mobileFilterBtn?.classList.remove('open');
        });

        // --- Minimize/Compact Info Panel view ---
        const setMinimized = (minimized: boolean) => {
            if (minimized) {
                infoPanelEl.classList.add('panel-minimized');
                minimizedBar.classList.remove('hidden');
                this.syncMinimizedBar();
            } else {
                infoPanelEl.classList.remove('panel-minimized');
                minimizedBar.classList.add('hidden');
            }
        };

        const isMobile = () => window.innerWidth <= 991;

        minimizeBtn?.addEventListener('click', () => {
            if (isMobile()) {
                const isCurrentlyMinimized = infoPanelEl.classList.contains('panel-minimized');
                setMinimized(!isCurrentlyMinimized);

                const icon = minimizeBtn.querySelector('span');
                if (icon) {
                    icon.className = isCurrentlyMinimized ? 'icon-resize-small' : 'icon-resize-full';
                }
            }
        });

        // Full-chart button in minimized bar mirrors the main one
        btnFullChartMin?.addEventListener('click', () => {
            btnFullChart?.click();
        });
    }

    /**
     * Called when a user clicks a marker on the map.
     * Sets the sensor as 'Preview' unless it is already pinned.
     */
    private onSensorSelect(sensor: SensorProperties) {
        const isAlreadyPinned = this.pinnedSensors.some(s => Utils.getSensorId(s) === Utils.getSensorId(sensor));

        if (isAlreadyPinned) {
            console.log('Sensor already pinned');
            return;
        }

        ChartRenderer.resetExportRange();

        this.previewSensor = sensor;
        this.refreshPanel();

        const infoPanelEl = document.getElementById('info-panel') as HTMLElement;
        const isMobile = () => window.innerWidth <= 991;

        if (isMobile() && infoPanelEl.classList.contains('panel-minimized')) {
            infoPanelEl.classList.remove('panel-minimized');
            document.getElementById('panel-minimized-bar')?.classList.add('hidden');
        }

        this.postToParent({
            event: 'SENSOR_SELECTED',
            payload: {
                id: Utils.getSensorId(sensor),
                name: sensor.name,
                strategy: sensor.strategy
            }
        });
    }

    /**
     * Called when user clicks the "Pin" icon in the panel.
     */
    private togglePin(sensor: SensorProperties) {
        const id = Utils.getSensorId(sensor);
        const existingIndex = this.pinnedSensors.findIndex(s => Utils.getSensorId(s) === id);

        if (existingIndex >= 0) {
            // UNPIN: Remove from list
            this.pinnedSensors.splice(existingIndex, 1);
            this.previewSensor = sensor;
        } else {
            // PIN: Move from Preview to Pinned
            this.pinnedSensors.push(sensor);
            if (this.previewSensor && Utils.getSensorId(this.previewSensor) === id) {
                this.previewSensor = null; // Clear preview slot
            }
        }

        // Clear CCTV if no sensors left
        if (this.pinnedSensors.length === 0 && !this.previewSensor) {
            CCTVStrategy.stopAll();
        }

        this.refreshPanel();
        CCTVStrategy.garbageCollect();
    }

    /**
     * Called when user clicks "X" (Close).
     */
    private closeSensor(sensor: SensorProperties) {
        const id = Utils.getSensorId(sensor);

        // Remove from Pinned
        this.pinnedSensors = this.pinnedSensors.filter(s => Utils.getSensorId(s) !== id);

        // Remove from Preview
        if (this.previewSensor && Utils.getSensorId(this.previewSensor) === id) {
            this.previewSensor = null;
        }

        if (this.pinnedSensors.length === 0 && !this.previewSensor) {
            CCTVStrategy.stopAll();
        }

        this.refreshPanel();
        CCTVStrategy.garbageCollect();
    }

    private refreshPanel() {
        const content = document.getElementById('info-content') as HTMLElement;
        const chart = document.getElementById('chart-container') as HTMLElement;
        const panel = document.getElementById('info-panel') as HTMLElement;

        // Combine lists for rendering
        const itemsToShow = [...this.pinnedSensors];
        if (this.previewSensor) {
            itemsToShow.push(this.previewSensor);
        }

        if (itemsToShow.length > 0) {
            panel?.classList.remove('hidden');
            this.compositeStrategy.render(
                content,
                chart,
                itemsToShow,
                this.pinnedSensors, // Pass pinned list to know which icon to show
                (s) => this.togglePin(s),
                (s) => this.closeSensor(s),
                this.currentLang
            );
        } else {
            panel?.classList.add('hidden');

            if(content) {
                content.innerHTML = '';
            }

            ChartRenderer.clear('chart-container');
        }

        if (panel.classList.contains('panel-minimized')) {
            this.syncMinimizedBar();
        }
    }

    // --- Iframe Communication Bridge ---
    private async initIframeBridge() {
        // Listen for commands FROM the parent website
        window.addEventListener('message', (event) => {
            // SECURITY CHECK: Verify origin
            // If allowedOrigin is '*', we accept all (local dev only).
            // Otherwise, block any requests that don't match the .env url.
            if (this.config.allowFrameUrl !== '*' && event.origin !== this.config.allowFrameUrl) {
                console.warn(`Blocked message from unauthorized origin: ${event.origin}`);
                return;
            }

            const msg = event.data;

            if (!msg || typeof msg !== 'object') {
                return;
            }

            switch (msg.action) {
                case 'SET_LANGUAGE':
                    if (msg.payload === 'bg' || msg.payload === 'en') {
                        // Manually trigger the language UI update
                        const targetFlag = document.querySelector(`.lang-switcher span[data-flag="${msg.payload}"]`) as HTMLSpanElement;
                        if (targetFlag) {
                            targetFlag.click();
                        }
                    }
                    break;

                case 'SET_LAYER':
                    // payload expected: { layerId: 'toggle-traffic', visible: true }
                    const checkbox = document.getElementById(msg.payload.layerId) as HTMLInputElement;
                    if (checkbox && checkbox.checked !== msg.payload.visible) {
                        checkbox.checked = msg.payload.visible;
                        checkbox.dispatchEvent(new Event('change'));
                    }
                    break;
            }
        });

        // Tell the parent the map is fully loaded and ready to receive commands
        this.postToParent({ event: 'MAP_READY' });
    }

    // Helper to send messages TO the parent website
    private postToParent(message: object) {
        // We only post if we are actually inside an iframe
        if (window.parent !== window) {
            window.parent.postMessage(message, this.config.allowFrameUrl);
        }
    }

    private onRegionFilterChange(geometry: FilterGeometry | null, sourceStrategy: ISpatialFilterStrategy, feature?: any) {
        // Find the index by exact object reference
        if (!this.spatialStrategies.includes(sourceStrategy)) {
            return;
        }

        // CASCADE UP
        if (geometry && feature) {
            let pt: Position = [0, 0];
            if (feature.geometry.type === 'Polygon') {
                const coords = feature.geometry.coordinates as Position[][];
                pt = coords[0][0];
            } else if (feature.geometry.type === 'MultiPolygon') {
                const coords = feature.geometry.coordinates as Position[][][];
                pt = coords[0][0][0];
            }

            let currentParent = sourceStrategy.parentStrategy;
            while (currentParent) {
                if (currentParent.selectRegionByPoint) {
                    currentParent.selectRegionByPoint(pt, false);
                }
                currentParent = currentParent.parentStrategy;
            }
        }

        // Determine the "Effective Geometry"
        let effectiveGeometry = geometry;
        if (!geometry && sourceStrategy.parentStrategy) {
            if (sourceStrategy.parentStrategy.getCurrentGeometry) {
                effectiveGeometry = sourceStrategy.parentStrategy.getCurrentGeometry();
            }
        }

        // CASCADE DOWN
        const clearAndFilterChildren = (strategy: ISpatialFilterStrategy, geom: FilterGeometry | null) => {
            if (strategy.childStrategies) {
                strategy.childStrategies.forEach(child => {
                    if (child.clearSelection) {
                        child.clearSelection(false);
                    }
                    if (child.applyRegionFilter) {
                        child.applyRegionFilter(geom);
                    }
                    // Traverse deeper if we ever add 3+ layer depths
                    clearAndFilterChildren(child, geom);
                });
            }
        };

        clearAndFilterChildren(sourceStrategy, effectiveGeometry);

        // Apply the parent's geometry to the source strategy so sibling items in the sidebar are filtered out
        if (sourceStrategy.parentStrategy && sourceStrategy.parentStrategy.getCurrentGeometry) {
            const parentGeom = sourceStrategy.parentStrategy.getCurrentGeometry();
            if (sourceStrategy.applyRegionFilter) {
                sourceStrategy.applyRegionFilter(parentGeom);
            }
        }

        // Apply geometry directly to all non-spatial strategies
        this.compositeStrategy.getStrategies().forEach(strategy => {
            if (!this.spatialStrategies.includes(strategy as ISpatialFilterStrategy)) {
                strategy.applyRegionFilter(effectiveGeometry);
            }
        });

        // Clear the preview sensor (transient) but keep pinned sensors
        this.previewSensor = null;
        if (this.pinnedSensors.length === 0) {
            CCTVStrategy.stopAll();
        }
        this.refreshPanel();
        CCTVStrategy.garbageCollect();
    }

    private syncMinimizedBar(): void {
        const itemsContainer = document.getElementById('panel-minimized-items') as HTMLElement;

        if (!itemsContainer) {
            return;
        }

        const btnFullChartMin = document.getElementById('btn-full-chart-min') as HTMLButtonElement;
        itemsContainer.innerHTML = '';

        const allItems = [...this.pinnedSensors];
        if (this.previewSensor) {
            allItems.push(this.previewSensor);
        }

        allItems.forEach(sensor => {
            const item = document.createElement('div') as HTMLDivElement;
            item.className = 'minimized-row';
            const chip = document.createElement('span') as HTMLSpanElement;
            const isPinned = this.pinnedSensors.some(p => Utils.getSensorId(p) === Utils.getSensorId(sensor));
            chip.className = `minimized-sensor-chip ${isPinned ? 'chip-pinned' : ''}`;
            chip.title = sensor.name || sensor.publicname || '';
            chip.textContent = sensor.name || sensor.publicname || '—';

            const strategy = this.compositeStrategy.getStrategies().get(sensor.strategy || '') as BasePointStrategy;

            if (strategy && typeof strategy.getIconClass === 'function') {
                const icon = document.createElement('span') as HTMLSpanElement;
                icon.className = `${strategy.getIconClass()} sensor-icon`;
                icon.style.backgroundColor = strategy.layerOptions.color;
                item.appendChild(icon);
            }

            item.appendChild(chip);
            itemsContainer.appendChild(item);
        });

        // Mirror the full-chart button visibility in the minimized bar
        const mainFullChart = document.getElementById('btn-full-chart') as HTMLButtonElement;
        if (mainFullChart && !mainFullChart.classList.contains('hidden')) {
            btnFullChartMin?.classList.remove('hidden');
        } else {
            btnFullChartMin?.classList.add('hidden');
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            if (config.sentryDsn) {
                Sentry.init({
                    dsn: config.sentryDsn,
                    // Setting this option to true will send default PII data to Sentry.
                    // For example, automatic IP address collection on events
                    //sendDefaultPii: true,
                    integrations: [
                        Sentry.browserTracingIntegration(),
                        Sentry.replayIntegration()
                    ],
                    // Tracing
                    tracesSampleRate: 1.0, //  Capture 100% of the transactions
                    // Set 'tracePropagationTargets' to control for which URLs distributed tracing should be enabled
                    tracePropagationTargets: ["localhost", /^https:\/\/smartburgas\.eu\/general-map/],
                    // Session Replay
                    replaysSessionSampleRate: 0.1, // This sets the sample rate at 10%. You may want to change it to 100% while in development and then sample at a lower rate in production.
                    replaysOnErrorSampleRate: 1.0 // If not already sampling the entire session, change the sample rate to 100% when sampling sessions where errors occur.
                });
                console.log("Sentry initialized for this environment.");
            }

            new SmartMap(config);
        }).catch(err => {
            console.error('Failed to load configuration', err);
        });
});



