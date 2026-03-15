// src/strategies/ISpatialFilterStrategy.ts
import { IDetailsStrategy } from './IDetailsStrategy.js';
import {FilterGeometry, Position} from '../Types.js';

export interface ISpatialFilterStrategy extends IDetailsStrategy {
    /** Explicitly defines the parent strategy in the spatial hierarchy */
    parentStrategy?: ISpatialFilterStrategy;

    /** Explicitly defines the child strategies in the spatial hierarchy */
    childStrategies?: ISpatialFilterStrategy[];

    /** Clears the current visual selection and unchecks the sidebar box. */
    clearSelection(triggerFilter?: boolean): void;

    /** Programmatically selects a region based on a coordinate point (used for auto-selecting parents). */
    selectRegionByPoint(point: Position, triggerFilter?: boolean): void;

    /** Returns the exact geometry of whatever zone is currently clicked/active. */
    getCurrentGeometry(): FilterGeometry | null;
}