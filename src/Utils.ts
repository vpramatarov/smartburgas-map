import {GeoJSONInput} from "./Types.js";

export class Utils {

    public static updateTimestampUI(elementId: string, dateOrMsg: Date | string) {
        const el = document.getElementById(elementId);
        if (el) {
            el.innerText = (typeof dateOrMsg === 'string') ? dateOrMsg : "Updated: " + dateOrMsg.toLocaleTimeString();
        }
    }

    public static tagDataWithStrategy(data: GeoJSONInput, strategyName: string) {
        if(Array.isArray(data)) {
            data.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;

                    if (f.properties.name?.length === 0) {
                        f.properties.name = strategyName + '_' + Math.random().toString(36).substring(2, 9);
                    }
                }
            });
        } else {
            data.features.forEach(f => {
                if (f.properties) {
                    f.properties.strategy = strategyName;

                    if (f.properties.name?.length === 0) {
                        f.properties.name = strategyName + '_' + Math.random().toString(36).substring(2, 9);
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
}