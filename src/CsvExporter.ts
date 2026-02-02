import { SensorProperties } from './Types.js'

export class CsvExporter {

    /**
     * Downloads data as a CSV file with full UTF-8 support (BOM).
     * @param data - The data object or array to export
     * @param defaultName - (Optional) Filename base
     */
    public static download(data: SensorProperties, defaultName: string = "export") {
        if (!data) {
            return;
        }

        const filename = `${defaultName.replace(/\s+/g, '_')}.csv`;
        let csvBody = "";

        // Data is an Array of Objects (Table)
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const headers = Object.keys(data.data[0]);
            csvBody += headers.join(",") + "\n";

            data.data.forEach((row: any) => {
                const rowStr = headers.map(header => {
                    return this.escapeCsvValue(row[header]);
                }).join(",");
                csvBody += rowStr + "\n";
            });
        } else {
            // Data is a simple Object (Key-Value)
            csvBody += "Property,Value\n";
            for (const key in data) {
                if (typeof data[key] !== 'object' && key !== 'data') {
                    csvBody += `"${key}",${this.escapeCsvValue(data[key])}\n`;
                }
            }
        }

        this.triggerBrowserDownload(csvBody, filename);
    }

    private static escapeCsvValue(val: any): string {
        if (val === undefined || val === null) return '""';
        const stringVal = String(val);
        // Escape quotes and handle commas/newlines
        if (stringVal.search(/("|,|\n)/g) >= 0) {
            return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return `"${stringVal}"`;
    }

    /**
     * Uses a Blob with a BOM to ensure Excel reads UTF-8 correctly.
     */
    private static triggerBrowserDownload(content: string, filename: string) {
        // Add the Byte Order Mark (BOM) for UTF-8
        const BOM = "\uFEFF";

        // Create a Blob with the correct type and encoding
        const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8;' });

        // Create a temporary download link using the Blob URL
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}