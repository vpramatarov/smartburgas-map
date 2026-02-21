import {GeoJSONInput} from "./Types.js";

export class Utils {

    public static updateTimestampUI(elementId: string, dateOrMsg: Date | string) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerText = (typeof dateOrMsg === 'string') ? dateOrMsg : dateOrMsg.toLocaleTimeString();
        }
    }

    public static tagDataWithStrategy(data: GeoJSONInput, strategyName: string) {
        if(Array.isArray(data)) {
            data.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;

                    if (!f.properties.name || f.properties.name.length === 0) {
                        f.properties.name = strategyName + '_' + this.generateCustomId();
                    }
                }
            });
        } else {
            data.features.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;

                    if (!f.properties.name || f.properties.name.length === 0) {
                        f.properties.name = strategyName + '_' + this.generateCustomId();
                    }
                }
            });
        }
    }

    // Helper: Format to YYYY-MM-DD using LOCAL time, not UTC
    public static formatDateToLocal(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    public static generateCustomId(): string {
        return Math.random().toString(36).substring(2, 9);
    }
}