export type Target = {
    key: string,
    endpoint: string,
    ttl: number
    cacheFile: string
}

export type Config = {
    appUrl?: string,
    port: number,
    airQuality: Target,
    airQualityTime: Target,
    traffic: Target
}

export interface Geometry {
    type: string;
    coordinates: number[];
}

export interface DynamicDataPoint {
    [key: string]: any;
}

export interface SensorProperties {
    name?: string;
    description?: string;
    data?: DynamicDataPoint[];
    [key: string]: any;
}

export interface GeoFeature {
    type: "Feature";
    properties: SensorProperties;
    geometry: Geometry;
}

export interface GeoFeatureCollection {
    type: "FeatureCollection";
    features: GeoFeature[];
}

export type GeoJSONInput = GeoFeatureCollection | GeoFeature[];

export interface LayerStyleOptions {
    color: string;
    fillColor?: string;
    radius?: number;
    weight?: number;
    opacity?: number;
    fillOpacity?: number;
}