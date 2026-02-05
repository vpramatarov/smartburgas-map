import { IDetailsStrategy } from './IDetailsStrategy.js';
import { ChartDataset, SensorProperties } from '../Types.js';

declare const Hls: any;

interface ActivePlayer {
    hls: any;
    videoElement: HTMLVideoElement;
}

export class CCTVStrategy implements IDetailsStrategy {
    public name = 'cctv';

    private static activePlayers: Map<string, ActivePlayer> = new Map();

    renderCardContent(
        container: HTMLElement,
        sensor: SensorProperties,
        uniqueIdPrefix: string,
        onChartRequest: () => void
    ): void {
        // Run Garbage Collection: Clean up any players whose video elements were removed from DOM
        CCTVStrategy.garbageCollect();
        container.innerHTML = '';
        const streamUrl = sensor.video_url2 || '';

        if (!streamUrl) {
            container.innerHTML = '<p>No video feed available.</p>';
            return;
        }

        // const sensorId = uniqueIdPrefix + '_' + (sensor.publicname || 'cam').replace(/\s/g, "_");
        const sensorId = (sensor.publicname || 'cam').replace(/[^a-zA-Z0-9]/g, "_");
        const posterUrl = sensor.pic_url || null;

        // Cleanup existing player for THIS specific sensor (in case of re-render)
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

    /**
     * Checks all active players. If their video element is no longer in the DOM, destroy the HLS instance.
     */
    public static garbageCollect(): void {
        CCTVStrategy.activePlayers.forEach((player, id) => {
            if (!player.videoElement.isConnected) {
                // Element is detached from DOM -> Destroy HLS
                player.hls.stopLoad();
                player.hls.destroy();
                CCTVStrategy.activePlayers.delete(id);
            }
        });
    }

    /**
     * Specific cleanup for a single ID
     */
    public static destroyPlayer(id: string): void {
        const player = CCTVStrategy.activePlayers.get(id);

        if (player) {
            player.hls.stopLoad();
            player.hls.destroy();
            CCTVStrategy.activePlayers.delete(id);
        }
    }

    /**
     * Force stop EVERYTHING (Used when closing the sidebar)
     */
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
                // lowLatencyMode: true,
                // debug: true,
                lowLatencyMode: false, // Disabled for better stability on Docker/Localhost
                backBufferLength: 30,  // Keep memory usage low
                liveSyncDuration: 10,
                liveMaxLatencyDuration: 30
            });

            // hls.loadSource(url);
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

            // Register active player
            CCTVStrategy.activePlayers.set(sensorId, { hls, videoElement: video });

        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari Native
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
                video.play().catch(() => {});
            });
            // Note: Native players don't need manual destruction, the browser handles it when DOM is removed.
        }
    }
}