import {FilterGeometry, GeoJSONInput, Position, SensorProperties, SupportedLanguage} from "./Types.js";

export class Utils {

    private static bboxCache = new WeakMap<FilterGeometry, [number, number, number, number]>();
    private static ringBBoxCache = new WeakMap<Position[], [number, number, number, number]>();

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
        return crypto.randomUUID().substring(0, 8);
    }

    public static escapeHtml(str: string): string {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    public static validateCssColor(color: string): string {
        if (/^#[0-9a-fA-F]{3,8}$/.test(color)) {
            return color;
        }
        if (/^[a-zA-Z]+$/.test(color)) {
            return color;
        }
        return '#888';
    }

    /**
     * Standard Ray-Casting algorithm to check if a point is inside a polygon.
     * Supports GeoJSON Polygon and MultiPolygon.
     * Uses bounding-box pre-checks to skip expensive ray-casting for distant points.
     */
    public static isPointInPolygon(point: Position, geometry: FilterGeometry|null): boolean {
        if (!geometry) {
            return true;  // No filter = inside
        }

        const x = point[0], y = point[1];

        // Early exit: check overall bounding box
        const [minX, minY, maxX, maxY] = this.computeBBox(geometry);
        if (x < minX || x > maxX || y < minY || y > maxY) {
            return false;
        }

        // Ray-cast a single ring (no bbox check)
        const rayCast = (ring: Position[]) => {
            let inside = false;
            for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                const xi = ring[i][0], yi = ring[i][1];
                const xj = ring[j][0], yj = ring[j][1];

                const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
                if (intersect) {
                    inside = !inside;
                }
            }
            return inside;
        };

        // Check a polygon (outer ring + holes)
        const insidePoly = (rings: Position[][]) => {
            const outerRing = rings[0];

            // Per-ring bounding box check (useful for MultiPolygon with separated sub-polygons)
            const [rMinX, rMinY, rMaxX, rMaxY] = this.computeRingBBox(outerRing);
            if (x < rMinX || x > rMaxX || y < rMinY || y > rMaxY) {
                return false;
            }

            if (!rayCast(outerRing)) {
                return false;
            }

            // Check holes: if inside any hole, the point is outside the polygon
            for (let h = 1; h < rings.length; h++) {
                const hole = rings[h];
                const [hMinX, hMinY, hMaxX, hMaxY] = this.computeRingBBox(hole);
                if (x < hMinX || x > hMaxX || y < hMinY || y > hMaxY) {
                    continue;
                }
                if (rayCast(hole)) {
                    return false;
                }
            }

            return true;
        };

        if (geometry.type === 'Polygon') {
            return insidePoly(geometry.coordinates);
        }

        if (geometry.type === 'MultiPolygon') {
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
        // 1. Strips spaces, quotes, and special characters to ensure a valid HTML5 ID
        // 2. Remove hyphens at the very beginning or end
        return `${prefix}-${name.replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '')}`;
    }

    public static formatTime(timeStr: string): string  {
        if (!timeStr) {
            return '';
        }
        const match = timeStr.match(/\s(\d{2}:\d{2})/);
        return match ? match[1] : timeStr;
    }

    public static extractFormattedPeriods(rawHtml: string): string[] {
        // normalize
        const cleanText = rawHtml
            // Remove physical line breaks from the raw HTML source
            .replace(/\r?\n|\r/g, ' ')
            // Insert logical line breaks ONLY at block-level HTML elements
            .replace(/<\/?(p|div|br|tr|td|li)[^>]*>/gi, '\n')
            // Strip out all remaining inline tags (<span>, <strong>)
            .replace(/<[^>]+>/g, '')
            // Convert HTML non-breaking spaces to standard spaces
            .replace(/&nbsp;/gi, ' ')
            // Collapse multiple spaces into one (leaving our \n intact)
            .replace(/[ \t]+/g, ' ');

        const regex = /от\s+(\d{2}:\d{2})\s+до\s+(\d{2}:\d{2})(?:[^\n]*?(\d{2}\.\d{2})\s+до\s+(\d{2}\.\d{2}))?/gi;

        const results: string[] = [];

        // Iterate over matches and format based on whether dates were found
        for (const match of cleanText.matchAll(regex)) {
            const startTime = match[1];
            const endTime = match[2];
            const startDate = match[3]; // Will be undefined if period is missing
            const endDate = match[4];   // Will be undefined if period is missing

            if (startDate && endDate) {
                results.push(`${startDate} - ${endDate}: ${startTime} - ${endTime}`);
            } else {
                results.push(`${startTime} - ${endTime}`);
            }
        }

        return results;
    }

    public static buildWorkingHoursUI(periodsArray: string[], locale: SupportedLanguage): string[] {
        return periodsArray.map(item => {
            // Check if there is a colon, which means dates are present
            if (item.includes('.')) {
                // Split the string into the date part and the time part
                const [periodPart, timePart] = item.split(': ').map(str => str.trim());

                if (!timePart) {
                    return `${item.trim()}`;
                }

                // Split the date part into start and end dates
                const [rawStartDate, rawEndDate] = periodPart.split('-').map(str => str.trim());

                const startText = this.formatReadableDate(rawStartDate, locale);
                const endText = this.formatReadableDate(rawEndDate, locale);

                return `${startText} - ${endText}: ${timePart}`;
            } else {
                // No colon means it's just the time
                return `${item.trim()}`;
            }
        });
    }

    /**
     * Compute and cache the overall axis-aligned bounding box for a FilterGeometry.
     */
    private static computeBBox(geometry: FilterGeometry): [number, number, number, number] {
        const cached = this.bboxCache.get(geometry);
        if (cached) {
            return cached;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        const updateFromRing = (ring: Position[]) => {
            for (let i = 0; i < ring.length; i++) {
                const x = ring[i][0], y = ring[i][1];

                if (x < minX) {
                    minX = x;
                }

                if (y < minY) {
                    minY = y;
                }

                if (x > maxX) {
                    maxX = x;
                }

                if (y > maxY) {
                    maxY = y;
                }
            }
        };

        if (geometry.type === 'Polygon') {
            updateFromRing(geometry.coordinates[0]);
        } else if (geometry.type === 'MultiPolygon') {
            for (const poly of geometry.coordinates) {
                updateFromRing(poly[0]);
            }
        }

        const bbox: [number, number, number, number] = [minX, minY, maxX, maxY];
        this.bboxCache.set(geometry, bbox);
        return bbox;
    }

    /**
     * Compute and cache the bounding box for a single coordinate ring.
     */
    private static computeRingBBox(ring: Position[]): [number, number, number, number] {
        const cached = this.ringBBoxCache.get(ring);
        if (cached) {
            return cached;
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (let i = 0; i < ring.length; i++) {
            const x = ring[i][0], y = ring[i][1];

            if (x < minX) {
                minX = x;
            }

            if (y < minY) {
                minY = y;
            }

            if (x > maxX) {
                maxX = x;
            }

            if (y > maxY) {
                maxY = y;
            }
        }

        const bbox: [number, number, number, number] = [minX, minY, maxX, maxY];
        this.ringBBoxCache.set(ring, bbox);
        return bbox;
    }

    // Helper to convert "01.05" -> "01 Май" (BG) or "1 May" (EN) using Native Intl API
    private static formatReadableDate(dateStr: string, lang: SupportedLanguage): string {
        // SAFEGUARD: If the string is missing or doesn't have a period, return it as-is to prevent crashes
        if (!dateStr || !dateStr.includes('.')) {
            return dateStr || '';
        }

        const [dayStr, monthStr] = dateStr.split('.');

        // Create a dummy date (Year doesn't matter, just the month index)
        const monthIndex = parseInt(monthStr, 10) - 1;

        // SAFEGUARD: If the month isn't a valid number somehow, return the raw string
        if (isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
            return dateStr;
        }

        const localizedMonths = {
            bg: ["Яну", "Фев", "Мар", "Апр", "Май", "Юни", "Юли", "Авг", "Сеп", "Окт", "Ное", "Дек"],
            en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        };

        const monthName = localizedMonths[lang][monthIndex];

        if (lang === 'en') {
            // English format: Strip leading zero (01 -> 1)
            const day = parseInt(dayStr, 10);
            return `${day} ${monthName}`;
        } else {
            // Bulgarian format: Keep leading zero as requested (01)
            return `${dayStr} ${monthName}`;
        }
    }
}