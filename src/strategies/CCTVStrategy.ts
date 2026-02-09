import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, GeoFeature, GeoJSONInput, SensorProperties } from '../Types.js';
import { Utils } from "../Utils.js";

declare const Hls: any;
declare const L: any;

interface ActivePlayer {
    hls: any;
    videoElement: HTMLVideoElement;
}

export class CCTVStrategy implements IDetailsStrategy {
    public name = 'cctv';
    private layer: any;
    private onPin: ((sensor: SensorProperties) => void) | undefined;
    private static activePlayers: Map<string, ActivePlayer> = new Map();

    initialize(map: any, onPin: (sensor: SensorProperties) => void): void {
        this.onPin = onPin;
        this.layer = L.layerGroup();

        // Scaling function
        const updateZoomScale = () => {
            const zoom = map.getZoom();

            // Calculate Scale
            // At zoom 15 it's 1.0. At zoom 18 it's ~2.7.
            let scale = Math.pow(1.4, zoom - 15);
            scale = Math.max(0.1, Math.min(scale, 3.0));

            const container = map.getContainer();
            container.style.setProperty('--cctv-zoom-scale', scale.toString());

            // Level of Detail (LOD) Threshold
            // If zoom is less than 15, we hide the cones to prevent clutter.
            if (zoom < 15) {
                container.classList.add('cctv-lod-low');
            } else {
                container.classList.remove('cctv-lod-low');
            }
        };

        // Attach listener to map
        map.on('zoomend', updateZoomScale);

        // Initial call to set correct size on load
        updateZoomScale();
    }

    getLayer(): any {
        return this.layer;
    }

    async loadData(lang: string, options?: any): Promise<void> {
        if (!this.layer) {
            return;
        }

        this.layer.clearLayers();
        Utils.updateTimestampUI('cctv-time', 'Refreshing...');

        try {
            const res = await fetch(`/api/cctv?lang=${lang}`);

            if (!res.ok) {
                throw new Error(`${res.status}`);
            }

            Utils.updateTimestampUI('cctv-time', new Date(res.headers.get('X-Last-Updated') || new Date()));
            const data = await res.json();
            Utils.tagDataWithStrategy(data, this.name);

            this.addGeoJsonToLayer(data, { color: "#2ecc71" });
        } catch (err) {
            console.error('CCTV load error:', err);
        }
    }

    private addGeoJsonToLayer(inputData: GeoJSONInput, options: { color: string }) {
        let features: GeoFeature[] = Array.isArray(inputData) ? inputData : inputData.features || [];

        L.geoJSON(features, {
            pointToLayer: (_feature: GeoFeature, latlng: any) => {
                const position = _feature.properties.position || 0;

                // .cctv-zoom-wrapper wrapper reads the --cctv-zoom-scale variable.
                // The inner .cctv-container handles the rotation.
                const html = `
                    <div class="cctv-root">
                        <div class="cctv-cone-scaler">
                            <div class="cctv-rotator" style="transform: rotate(${position}deg)">
                                <svg class="cctv-cone-svg" viewBox="0 0 100 100">
                                     <path d="M 50 50 L 30 15 A 40 40 0 0 1 70 15 Z" />
                                </svg>
                            </div>
                        </div>
                        
                        <div class="cctv-dot"></div>
                    </div>
                `;

                return L.marker(latlng, {
                    icon: L.divIcon({
                        className: 'cctv-icon-wrapper',
                        html: html,
                        iconSize: [20, 20],
                        iconAnchor: [10, 10] // Center it ([width/2, height/2])
                    })
                });
            },
            onEachFeature: (feature: GeoFeature, layer: any) => {
                const props = feature.properties;
                layer.bindPopup(`<div class="marker-popup-hover"><h4>${props.publicname || 'Camera'}</h4><p>Click to Pin</p></div>`, {
                    closeButton: false,
                    offset: L.point(0, -10)
                });

                layer.on('mouseover', (e: any) => {
                    e.target.openPopup();
                    const path = e.target.getElement()?.querySelector('path');
                    if (path) {
                        path.style.fillOpacity = '0.4'; // Darker on hover
                    }
                });

                layer.on('mouseout', (e: any) => {
                    e.target.closePopup();
                    const path = e.target.getElement()?.querySelector('path');

                    if (path) {
                        path.style.fillOpacity = ''; // Reset
                    }
                });

                layer.on('click', () => {
                    if (this.onPin) {
                        this.onPin(props);
                    }
                });
            }
        }).addTo(this.layer);
    }

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {
        CCTVStrategy.garbageCollect();
        container.innerHTML = '';
        const streamUrl = sensor.video_url2 || '';

        if (!streamUrl) {
            container.innerHTML = '<p>No video feed available.</p>';
            return;
        }

        const sensorId = (sensor.publicname || 'cam').replace(/[^a-zA-Z0-9]/g, "_");
        const posterUrl = sensor.pic_url || null;

        CCTVStrategy.destroyPlayer(sensorId);

        container.innerHTML = `
            <div class="data-row">
                <strong>${sensor.description || sensor.publicname}</strong>
            </div>
        `;

        const {videoWrapper, video} = this.createVideo(sensorId, posterUrl);
        videoWrapper.appendChild(video);
        container.appendChild(videoWrapper);

        this.initPlayer(video, streamUrl, sensorId);
    }

    getChartData(sensor: SensorProperties, property: string): ChartDataset | null {
        return null;
    }

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

    private createVideo(sensorId: string, posterUrl: string|null) {
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

        return {videoWrapper, video};
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
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(url);
            });

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