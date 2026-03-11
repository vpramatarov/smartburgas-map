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

// Standard GeoJSON Coordinate [longitude, latitude]
export type Position = number[];

export interface Geometry {
    type: string;
    coordinates: Position;
}

// GeoJSON Polygon Geometry
export interface PolygonGeometry {
    type: 'Polygon';
    coordinates: Position[][];
}

// GeoJSON MultiPolygon Geometry
export interface MultiPolygonGeometry {
    type: 'MultiPolygon';
    coordinates: Position[][][]; // Array of Polygons
}

// The union type
export type FilterGeometry = PolygonGeometry | MultiPolygonGeometry;

export interface DynamicDataPoint {
    [key: string]: any;
}

export interface SensorProperties {
    name?: string;
    description?: string;
    data?: DynamicDataPoint[];
    id?: string | number | null;
    strategy?: string;
    additional_info: DynamicDataPoint
    [key: string]: any;
}

export interface GeoFeature {
    type: "Feature";
    properties: SensorProperties;
    geometry: Geometry|FilterGeometry;
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
