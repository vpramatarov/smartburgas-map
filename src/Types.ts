export type SupportedLanguage = 'bg' | 'en';

export type Target = {
    key: string;
    endpoint: string;
}

export type Config = {
    appUrl?: string;
    port: number;
    airQualityTime: Target;
    traffic: Target;
    cctv: Target;
    billingMachines: Target;
    evStations: Target;
    wasteCentres: Target;
    smartParking: Target;
    taxiRanks: Target;
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
    id?: string | number;
    strategy?: string;
    additional_info: DynamicDataPoint
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

export interface ChartDataset {
    label: string;
    values: number[];
    times?: string[];
    unit?: string;
}