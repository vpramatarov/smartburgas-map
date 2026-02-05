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
}