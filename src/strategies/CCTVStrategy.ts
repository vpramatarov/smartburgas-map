// src/strategies/CCTVStrategy.ts
import { BasePointStrategy } from './BasePointStrategy.js';
import {ChartDataset, GeoFeature, GeoJSONInput, SensorProperties} from '../Types.js';
import { Utils } from '../Utils.js';
declare const L: typeof import('leaflet');
import type * as GeoJSON from 'geojson'

declare const Hls: any;

interface ActivePlayer {
    hls: any;
    videoElement: HTMLVideoElement;
}

export class CCTVStrategy extends BasePointStrategy {
    public name = 'cctv';
    public checkbox_id = 'toggle-cctv';
    public layerOptions = { translate_name_key: 'layer_camera', color: '#2ecc71' };

    private static activePlayers: Map<string, ActivePlayer> = new Map();

    protected getApiUrl(lang: string): string {
        return `/api/cctv?lang=${lang}`;
    }

    protected getTimestampElementId(): string {
        return 'cctv-time';
    }

    getIconClass(): string {
        return 'icon-videocam';
    }

    // ── Custom zoom-scale setup 

    private static gcIntervalStarted = false;

    override initialize(map: L.Map, onPin: (sensor: SensorProperties) => void): void {
        super.initialize(map, onPin);

        // Periodically reap HLS players whose video elements have been detached from the DOM
        if (!CCTVStrategy.gcIntervalStarted) {
            setInterval(() => CCTVStrategy.garbageCollect(), 30_000);
            CCTVStrategy.gcIntervalStarted = true;
        }

        const updateZoomScale = () => {
            const zoom = map.getZoom();
            let scale = Math.pow(1.4, zoom - 15);
            scale = Math.max(0.1, Math.min(scale, 3.0));

            const container = map.getContainer();
            container.style.setProperty('--cctv-zoom-scale', scale.toString());

            if (zoom < 15) {
                container.classList.add('cctv-lod-low');
            } else {
                container.classList.remove('cctv-lod-low');
            }
        };

        map.on('zoomend', updateZoomScale);
        updateZoomScale();
    }

    // ── Custom marker: camera dot + directional cone 

    protected override buildMarkerHtml(feature: GeoFeature): string {
        const position = feature.properties.position || 0;
        return `
            <div class="cctv-root custom-pin-wrapper">
                <div class="cctv-cone-scaler">
                    <div class="cctv-rotator" style="transform: rotate(${position}deg)">
                        <svg class="cctv-cone-svg" viewBox="0 0 100 100">
                             <path d="M 50 50 L 30 15 A 40 40 0 0 1 70 15 Z" />
                        </svg>
                    </div>
                </div>
                <div class="custom-pin-marker cctv-dot" style="background-color: ${this.layerOptions.color}">
                    <i class="icon-videocam"></i>
                </div>
            </div>
        `;
    }

    // The CCTV marker uses a div wrapper class of its own, so override the layer icon too
    protected override addGeoJsonToLayer(inputData: GeoJSONInput | GeoFeature[]): void {
        const features: GeoFeature[] = Array.isArray(inputData) ? (inputData as GeoFeature[]) : (inputData as { features: GeoFeature[] }).features || [];

        L.geoJSON(features, {
            pointToLayer: (feature: GeoJSON.Feature, latlng: L.LatLng): L.Layer => {
                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'cctv-icon-wrapper',
                        html: this.buildMarkerHtml(feature as GeoFeature),
                        iconSize: [20, 20],
                        iconAnchor: [10, 10]
                    })
                });
            },
            onEachFeature: (feature: GeoJSON.Feature, layer: L.Layer): void => {
                const props = (feature as GeoFeature).properties;
                const title = props.publicname || props.name || 'Camera';

                (layer as L.Marker).bindPopup(
                    `<div class="marker-popup-hover"><h4>${Utils.escapeHtml(title)}</h4><p>${this.getPopupText(props)}</p></div>`,
                    { closeButton: false, offset: L.point(0, 0) }
                );
                layer.on('mouseover', (e: L.LeafletEvent) => {
                    (e.target as L.Marker).openPopup();
                });
                layer.on('mouseout', (e: L.LeafletEvent) => {
                    (e.target as L.Marker).closePopup();
                });
                layer.on('click', () => {
                    this.onPin?.(props);
                });
            }
        }).addTo(this.layer);
    }

    // ── Card rendering: HLS video player 

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        _onChartRequest: () => void
    ): void {
        CCTVStrategy.garbageCollect();
        container.innerHTML = '';

        const streamUrl = sensor.video_url2 || '';
        if (!streamUrl) {
            container.innerHTML = '<p>No video feed available.</p>';
            return;
        }

        const sensorId = (sensor.id || sensor.publicname || `cam_${uniqueIdPrefix}`).toString().replace(/[^a-zA-Z0-9]/g, '_');
        const posterUrl = sensor.pic_url || null;
        CCTVStrategy.destroyPlayer(sensorId);

        container.innerHTML = `
            <div class="data-row">
                <strong>${Utils.escapeHtml(sensor.description || sensor.publicname || '')}</strong>
            </div>
        `;

        const { videoWrapper, video } = this.createVideo(sensorId, posterUrl);
        videoWrapper.appendChild(video);
        container.appendChild(videoWrapper);

        this.initPlayer(video, streamUrl, sensorId);
    }

    getChartData(_sensor: SensorProperties, _property: string): ChartDataset | null {
        return null;
    }

    // ── Static player lifecycle management 

    public static garbageCollect(): void {
        CCTVStrategy.activePlayers.forEach((player, id) => {
            if (!player.videoElement.isConnected) {
                player.hls.stopLoad();
                player.hls.destroy();
                CCTVStrategy.activePlayers.delete(id);
            }
        });
    }

    public static destroyPlayer(id: string): void {
        const player = CCTVStrategy.activePlayers.get(id);
        if (player) {
            player.hls.stopLoad();
            player.hls.destroy();
            CCTVStrategy.activePlayers.delete(id);
        }
    }

    public static stopAll(): void {
        CCTVStrategy.activePlayers.forEach((player) => {
            player.hls.stopLoad();
            player.hls.destroy();
        });
        CCTVStrategy.activePlayers.clear();
    }

    // ── Private video helpers ─

    private createVideo(sensorId: string, posterUrl: string | null) {
        const videoWrapper = document.createElement('div') as HTMLDivElement;
        videoWrapper.className = 'cctv-video-wrapper';

        const video = document.createElement('video') as HTMLVideoElement;
        video.id = `video-${sensorId}-${Date.now()}`;
        video.controls = true;
        video.muted = true;
        video.autoplay = true;
        video.playsInline = true;
        if (posterUrl) {
            video.poster = posterUrl;
        }

        return { videoWrapper, video };
    }

    private initPlayer(video: HTMLVideoElement, url: string, sensorId: string): void {
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: false,
                backBufferLength: 30,
                liveSyncDuration: 10,
                liveMaxLatencyDuration: 30
            });

            hls.attachMedia(video);
            hls.on(Hls.Events.MEDIA_ATTACHED, () => { hls.loadSource(url); });
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => console.log('Autoplay prevented.'));
            });
            hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
                if (data.fatal) {
                    CCTVStrategy.destroyPlayer(sensorId);
                }
            });

            CCTVStrategy.activePlayers.set(sensorId, { hls, videoElement: video });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.addEventListener('loadedmetadata', () => { video.play().catch(() => {}); });
        }
    }
}
