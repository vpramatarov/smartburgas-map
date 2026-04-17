// src/strategies/TrafficSensorStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, SensorProperties, SupportedLanguage } from '../Types.js';
import { Utils } from '../Utils.js';
import { t } from '../Translations.js';

export class TrafficSensorStrategy extends BasePointStrategy {
    public name = 'traffic_sensor';
    public checkbox_id = 'toggle-traffic';
    public layerOptions = { translate_name_key: 'layer_traffic', color: '#e74c3c' };

    protected getApiUrl(lang: string): string {
        // Fallback — used by BasePointStrategy.loadData only when no options are passed.
        // For the date-range variant, loadData is overridden below.
        const { start, end } = this.defaultDateRange();
        return `/api/traffic?lang=${lang}&start_date=${start}&end_date=${end}`;
    }

    protected getTimestampElementId(): string {
        return 'traffic-time';
    }

    getIconClass(): string {
        return 'icon-car';
    }

    // ── Custom loadData: validates date params before fetching

    override async loadData(lang: string, options?: { start_date?: string; end_date?: string }): Promise<void> {
        if (!this.layer) {
            return;
        }

        const dateParams = this.resolveDateParams(options);

        if (dateParams.error) {
            console.error('Traffic date validation error:', dateParams.error);
            Utils.updateTimestampUI(this.getTimestampElementId(), `! ${dateParams.error}`);
            return;
        }

        this.currentLang = lang as SupportedLanguage;
        this.layer.clearLayers();
        Utils.updateTimestampUI(this.getTimestampElementId(), t('loading', this.currentLang));

        const url = `/api/traffic?lang=${lang}&start_date=${dateParams.start}&end_date=${dateParams.end}`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`${res.status}`);
        }

        Utils.updateTimestampUI(
            this.getTimestampElementId(),
            new Date(res.headers.get('X-Last-Updated') || new Date())
        );

        const data = await res.json();
        Utils.tagDataWithStrategy(data, this.name);
        this.cachedData = Array.isArray(data) ? data : data.features || [];
        this.applyRegionFilter(this.currentFilterGeometry);
    }

    // Card

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {
        if (!sensor.data || sensor.data.length === 0) {
            container.innerHTML = `<p>${t('no_data', this.currentLang)}</p>`;
            return;
        }

        const sorted = [...sensor.data].sort((a, b) =>
            this.parseTrafficDate(a.time) - this.parseTrafficDate(b.time)
        );
        const lastItem = sorted[sorted.length - 1];

        if (lastItem) {
            container.innerHTML = `
                <div class="data-row">
                    <span class="prop-label">${t('car_count', this.currentLang)}:</span>
                    <span class="prop-value">${Utils.escapeHtml(String(lastItem.car_count))}</span>
                </div>
                <div class="data-row">
                    <span class="prop-label">${t('car_speed', this.currentLang)}:</span>
                    <span class="prop-value">${
                        typeof lastItem.car_speed === 'undefined'
                            ? t('no_data', this.currentLang)
                            : Utils.escapeHtml(String(lastItem.car_speed)) + ' ' + t('km_h', this.currentLang)
                    }</span>
                </div>
                <div class="data-row">
                    <span class="timestamp">${Utils.escapeHtml(String(lastItem.time))}</span>
                </div>
            `;
        }

        const sensorId = Utils.getSensorId(sensor);
        const toggleDiv = document.createElement('div') as HTMLDivElement;
        toggleDiv.className = 'property-toggles';

        const createToggleHtml = (key: string, label: string) => {
            const uniqueId = `${uniqueIdPrefix}-${key}`;
            return `
                <div class="data-row toggle-row">
                    <span class="prop-label">${label}</span>
                    <input type="checkbox" id="${uniqueId}"
                           data-property="${key}"
                           data-sensor-id="${sensorId}"
                           class="chart-toggle-checkbox" />
                    <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
                </div>
            `;
        };

        toggleDiv.innerHTML =
            createToggleHtml('car_count', t('car_count', this.currentLang)) +
            createToggleHtml('car_speed', t('car_speed', this.currentLang));

        container.appendChild(toggleDiv);
        toggleDiv.querySelectorAll('input').forEach(box =>
            box.addEventListener('change', onChartRequest)
        );
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        if (!sensor.data || sensor.data.length === 0 || (property !== 'car_count' && property !== 'car_speed')) {
            return null;
        }

        const dataPoints = sensor.data
            .map(item => {
                const timestamp = this.parseTrafficDate(item.time);
                if (isNaN(timestamp)) {
                    return null;
                }
                return {
                    timestamp,
                    isoTime: new Date(timestamp).toISOString(),
                    value: parseFloat(
                        (property === 'car_speed' ? item.car_speed : item.car_count) || '0'
                    )
                };
            })
            .filter((d): d is { timestamp: number; isoTime: string; value: number } => d !== null)
            .sort((a, b) => a.timestamp - b.timestamp);

        return {
            label: property === 'car_speed' ? t('speed', this.currentLang) : t('car_count', this.currentLang),
            values: dataPoints.map(d => d.value),
            times: dataPoints.map(d => d.isoTime),
            unit: property === 'car_speed' ? t('km_h', this.currentLang) : t('cars', this.currentLang)
        };
    }

    // ── Date helpers

    private defaultDateRange(): { start: string; end: string } {
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return {
            start: Utils.formatDateToLocal(start),
            end: Utils.formatDateToLocal(now)
        };
    }

    private resolveDateParams(
        options?: { start_date?: string; end_date?: string }
    ): { start?: string; end?: string; error?: string } {
        const now = new Date();
        const end = options?.end_date ? new Date(options.end_date) : now;
        const start = options?.start_date ? new Date(options.start_date) : new Date(now.getFullYear(), now.getMonth() - 1, 1);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { error: t('invalid_date_format', this.currentLang) };
        }

        const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86_400_000);

        if (diffDays < 2) {
            return {error: t('min_date_range', this.currentLang)};
        }
        if (diffDays / 30 > 6) {
            return {error: t('max_date_range', this.currentLang)};
        }
        if (start > end) {
            return {error: t('start_date_after_end_date', this.currentLang)};
        }

        return { start: Utils.formatDateToLocal(start), end: Utils.formatDateToLocal(end) };
    }

    private parseTrafficDate(raw: string): number {
        if (!raw) {
            return NaN;
        }
        const clean = raw.replace(/_/g, ' ').trim();
        const match = clean.match(
            /^(\d{1,2})[\s.\-](\d{1,2})[\s.\-](\d{4})\s+(\d{1,2})[:\s](\d{1,2})(?:[:\s](\d{1,2}))?/
        );
        if (match) {
            const [, d, m, y, h, min, s] = match;
            return new Date(+y, +m - 1, +d, +h, +min, s ? +s : 0).getTime();
        }
        const fallback = new Date(clean).getTime();
        return isNaN(fallback) ? NaN : fallback;
    }
}

