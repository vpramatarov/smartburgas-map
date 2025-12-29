type Target = {
    key: string,
    endpoint: string,
    ttl: number
    cacheFile: string
}

type Config = {
    appUrl?: string,
    port: number,
    airQuality: Target,
    airQualityTime: Target,
    traffic: Target
}

interface Geometry {
    type: string;
    coordinates: number[];
}

interface DynamicDataPoint {
    [key: string]: any;
}

interface SensorProperties {
    name?: string;
    description?: string;
    data?: DynamicDataPoint[];
    [key: string]: any;
}

interface GeoFeature {
    type: "Feature";
    properties: SensorProperties;
    geometry: Geometry;
}

interface GeoFeatureCollection {
    type: "FeatureCollection";
    features: GeoFeature[];
}

type GeoJSONInput = GeoFeatureCollection | GeoFeature[];

interface LayerStyleOptions {
    color: string;
    fillColor?: string;
    radius?: number;
    weight?: number;
    opacity?: number;
    fillOpacity?: number;
}