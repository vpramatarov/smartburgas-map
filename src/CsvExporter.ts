import {SensorProperties, SupportedLanguage} from './Types.js';
import {t} from "./Translations.js";
import {Utils} from "./Utils.js";
import {ChartRenderer} from "./components/ChartRenderer.js";

export class CsvExporter {

    /**
     * Downloads the CSV file for the given list of sensors.
     * Columns: FeatureName, DataType, Variable, Date, TimeStamp, Value, Unit
     */
    public static download(sensors: SensorProperties[], lang: SupportedLanguage, filename: string = 'export_data') {
        if (!sensors || sensors.length === 0) {
            console.warn("No sensors to export.");
            return;
        }

        const range = ChartRenderer.getCurrentExportRange();
        const rangeStartMs = range ? range.start.getTime() : null;
        const rangeEndMs = range ? range.end.getTime() : null;

        const headers = [
            t('feature_id_or_name', lang),
            t('data_type', lang),
            t('variable', lang),
            t('date', lang),
            t('timestamp', lang),
            t('value', lang),
            t('unit', lang)
        ];
        const rows: string[] = [];
        rows.push(headers.map(h => `"${h}"`).join(','));

        sensors.forEach(sensor => {
            if (!sensor.data || sensor.data.length === 0) {
                return;
            }

            const featureName = String(sensor.id || sensor.name || "");
            const dataType = sensor.strategy || "";

            sensor.data.forEach(item => {
                const timeRaw = item['time'];
                const timestamp = this.parseDate(timeRaw);

                if (rangeStartMs !== null && rangeEndMs !== null && timestamp > 0) {
                    if (timestamp < rangeStartMs || timestamp > rangeEndMs) {
                        return; // Skips to the next item in the loop
                    }
                }

                let dateStr = timeRaw;
                if (timestamp > 0) {
                    dateStr = Utils.formatDateTimeToLocal(timestamp);
                }

                const timeStampStr = timestamp > 0 ? timestamp.toString() : "";

                Object.keys(item).forEach(key => {
                    // Skip Metadata keys
                    if (key === 'time' || key.endsWith('_unit')) {
                        return;
                    }

                    const value = item[key];

                    if (value === undefined || value === null) {
                        return;
                    }

                    const unit = item[key + '_unit'] || "";

                    // Construct CSV Row
                    const row = [
                        this.escape(featureName),
                        this.escape(dataType),
                        this.escape(key),
                        this.escape(dateStr),
                        this.escape(timeStampStr),
                        this.escape(String(value)),
                        this.escape(unit)
                    ];

                    rows.push(row.join(','));
                });
            });
        });

        const csvContent = rows.join('\n');

        // FIX: Add Byte Order Mark (\uFEFF) for UTF-8 compatibility with Excel
        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a") as HTMLAnchorElement;
        link.setAttribute("href", url);
        link.setAttribute("download", `${filename}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    private static escape(str: string): string {
        if (str === null || str === undefined) {
            return "";
        }
        // Convert to string in case of numbers, then escape double quotes
        const stringVal = String(str);
        return `"${stringVal.replace(/"/g, '""')}"`;
    }

    private static parseDate(raw: string): number {
        if (!raw) {
            return 0;
        }

        const time = new Date(raw).getTime();

        if (!isNaN(time)) {
            return time;
        }

        const clean = raw.replace(/_/g, ' ').trim();
        const match = clean.match(/^(\d{1,2})[\s\.\-](\d{1,2})[\s\.\-](\d{4})\s+(\d{1,2})[:\s](\d{1,2})(?:[:\s](\d{1,2}))?/);

        if (match) {
            const day = parseInt(match[1]);
            const month = parseInt(match[2]) - 1;
            const year = parseInt(match[3]);
            const hour = parseInt(match[4]);
            const minute = parseInt(match[5]);
            const second = match[6] ? parseInt(match[6]) : 0;
            return new Date(year, month, day, hour, minute, second).getTime();
        }

        return 0; // Invalid
    }
}