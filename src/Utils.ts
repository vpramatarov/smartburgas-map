import {FilterGeometry, GeoJSONInput, Position, SensorProperties} from "./Types.js";

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

    /**
     * Helper: Format to YYYY-MM-DD using LOCAL time, not UTC
     * @param d
     */
    public static formatDateToLocal(d: Date): string {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    public static formatDateTimeToLocal(d: Date | number): string {
        const date = typeof d === 'number' ? new Date(d) : d;
        const pad = (n: number) => String(n).padStart(2, '0');

        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());

        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }

    public static generateCustomId(): string {
        return Math.random().toString(36).substring(2, 9);
    }

    /**
     * Standard Ray-Casting algorithm to check if a point is inside a polygon.
     * Supports GeoJSON Polygon and MultiPolygon.
     */
    public static isPointInPolygon(point: Position, geometry: FilterGeometry|null): boolean {
        if (!geometry) {
            return true;  // No filter = inside
        }

        const x = point[0], y = point[1];

        // Helper: Check single polygon ring
        const insidePoly = (rings: Position[][]) => {
            let inside = false;
            // The first ring is the outer boundary
            const coords = rings[0];
            for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
                const xi = coords[i][0], yi = coords[i][1];
                const xj = coords[j][0], yj = coords[j][1];

                const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi); // magic
                if (intersect) {
                    inside = !inside;
                }
            }
            return inside; // We ignore holes (inner rings) for simplicity, or add generic logic if needed
        };

        if (geometry.type === 'Polygon') {
            return insidePoly(geometry.coordinates);
        }

        if (geometry.type === 'MultiPolygon') {
            // Check if point is inside ANY of the polygons in the MultiPolygon
            for (const polyCoords of geometry.coordinates) {
                if (insidePoly(polyCoords)) {
                    return true;
                }
            }
            return false;
        }

        return false;
    }

    /**
     * Helper to get a unique ID regardless of data source quirks
     */
    public static getSensorId(s: SensorProperties): string {
        return s.id || s.name || s.publicname || 'unknown';
    }

    public static getSafeId(prefix: string, name: string): string {
        // Strips spaces, quotes, and special characters to ensure a valid HTML5 ID
        return `${prefix}-${name.replace(/[^a-z0-9а-яё]+/gi, '-')}`;
    }
}