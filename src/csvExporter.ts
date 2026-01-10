export class CsvExporter {

    /**
     * Downloads data as a CSV file.
     * @param data - The data object or array to export
     * @param defaultName - (Optional) Filename base
     */
    public static download(data: any, defaultName: string = "export") {
        if (!data) return;

        const filename = `${defaultName.replace(/\s+/g, '_')}.csv`;
        let csvContent = "data:text/csv;charset=utf-8,";

        // Strategy A: Data is an Array of Objects (Table)
        // e.g., { data: [ {time: 1, val: 20}, {time: 2, val: 22} ] }
        if (data.data && Array.isArray(data.data) && data.data.length > 0) {
            const headers = Object.keys(data.data[0]);
            csvContent += headers.join(",") + "\n";

            data.data.forEach((row: any) => {
                const rowStr = headers.map(header => {
                    return this.escapeCsvValue(row[header]);
                }).join(",");
                csvContent += rowStr + "\n";
            });
        }
        // Strategy B: Data is a simple Object (Key-Value)
        else {
            csvContent += "Property,Value\n";
            for (const key in data) {
                // Ignore nested objects or the 'data' key if it was empty/malformed
                if (typeof data[key] !== 'object' && key !== 'data') {
                    csvContent += `"${key}",${this.escapeCsvValue(data[key])}\n`;
                }
            }
        }

        this.triggerBrowserDownload(csvContent, filename);
    }

    /**
     * Helper to safely format values for CSV (handling commas/quotes)
     */
    private static escapeCsvValue(val: any): string {
        if (val === undefined || val === null) return '""';
        const stringVal = String(val);
        // If value contains comma, quotes or newline, wrap in quotes and escape inner quotes
        if (stringVal.search(/("|,|\n)/g) >= 0) {
            return `"${stringVal.replace(/"/g, '""')}"`;
        }
        return `"${stringVal}"`;
    }

    /**
     * Helper to create the link and click it
     */
    private static triggerBrowserDownload(csvContent: string, filename: string) {
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
}