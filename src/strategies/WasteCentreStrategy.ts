// src/strategies/WasteCentreStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import { ChartDataset, DynamicDataPoint, SensorProperties } from '../Types.js';
import { t } from '../Translations.js';
import {Utils} from "../Utils.js";

export class WasteCentreStrategy extends BasePointStrategy {
    public name = 'waste_centre';
    public checkbox_id = 'toggle-waste';
    public layerOptions = { translate_name_key: 'layer_mobile_waste', color: '#9b59b6' };

    protected getApiUrl(lang: string): string {
        return `/api/waste-mobile?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'waste-time';
    }

    getIconClass(): string {
        return 'icon-recycle';
    }

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {

        if (sensor.additional_info.image) {
            const img = document.createElement('img') as HTMLImageElement;
            img.src = sensor.additional_info.image.trim();
            img.style.width = '100%';
            img.style.borderRadius = '4px';
            img.style.marginBottom = '10px';
            if (sensor.name) {
                img.alt = sensor.name;
            }
            img.onerror = () => { img.style.display = 'none'; };
            container.appendChild(img);
        }

        if (sensor.additional_info.address) {
            container.innerHTML += `<div class="data-row">${sensor.additional_info.address}</div>`;
        }

        if (sensor.description) {
            const desc = document.createElement('div') as HTMLDivElement;
            desc.className = 'sensor-description';
            desc.style.color = '#666';
            desc.style.marginBottom = '10px';
            if (sensor.description) {
                desc.innerHTML = sensor.description;
            }
            container.appendChild(desc);
        }

        // We scan the data history to find all unique garbage types available for this center
        if (sensor.data && Array.isArray(sensor.data)) {
            const uniqueTypes = new Map<string, {name: string, color: string, weight: string, weight_unit: string, time: string}>();

            sensor.data.forEach((d: DynamicDataPoint) => {
                uniqueTypes.set(d.Garbage_id, {
                    name: d.Garbage_name,
                    color: d.Garbage_Colour,
                    weight: d.Garbage_Weight,
                    weight_unit: d.Garbage_Weight_type,
                    time: d.time
                });
            });

            if (uniqueTypes.size > 0) {
                const sensorId = Utils.getSensorId(sensor);
                const toggleDiv = document.createElement('div') as HTMLDivElement;
                toggleDiv.className = 'property-toggles';

                uniqueTypes.forEach((meta, id) => {
                    const uniqueId = `${uniqueIdPrefix}-${id}`;
                    // We use the Garbage_id as the property key for retrieval later

                    const row = document.createElement('div') as HTMLDivElement;
                    row.className = 'data-row toggle-row';
                    row.innerHTML = `
                        <div class="prop-label" style="border-left: 3px solid ${meta.color}; padding-left:5px; flex: 1;">
                            ${meta.name}
                        </div>
                        
                        <div class="prop-additional">
                            <div>${meta.weight} ${meta.weight_unit}</div>
                            <div><small>${meta.time}</small></div>
                        </div>
                       
                        <input type="checkbox" id="${uniqueId}" 
                               data-property="${id}" 
                               data-sensor-id="${sensorId}" 
                               class="chart-toggle-checkbox" />
                        <label for="${uniqueId}" class="chart-toggle-btn"><span class="icon-chart-bar"></span></label>
                    `;
                    toggleDiv.appendChild(row);
                });

                container.appendChild(toggleDiv);

                toggleDiv.querySelectorAll('input').forEach(box => {
                    box.addEventListener('change', onChartRequest);
                });
            }
        }
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        const data = sensor.data;
        if (!data) {
            return null;
        }

        // Filter data for the specific garbage type
        const points = data.filter(d => d.Garbage_id === property);

        if (points.length === 0) {
            return null;
        }

        // Sort by time
        // points.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
        const values = points.map(d => parseFloat(d.Garbage_Weight));
        const times = points.map(d => d.time);

        // Metadata from first point
        const meta = points[0];

        return {
            label: meta.Garbage_name,
            values: values,
            times: times,
            unit: meta.Garbage_Weight_type || t('kg', this.currentLang),
        };
    }
}
