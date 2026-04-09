// tests/CCTVStrategy.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CCTVStrategy } from '../src/strategies/CCTVStrategy.js';
import { SensorProperties } from '../src/Types.js';

// Mock Leaflet (CCTVStrategy extends BasePointStrategy which uses markerClusterGroup)
vi.stubGlobal('L', {
    layerGroup: vi.fn(() => ({ addTo: vi.fn(), clearLayers: vi.fn() })),
    markerClusterGroup: vi.fn(() => ({ addTo: vi.fn(), clearLayers: vi.fn() })),
    divIcon: vi.fn(() => ({})),
    point: vi.fn(() => ({})),
});

// Mock the Browser DOM
vi.stubGlobal('document', {
    createElement: vi.fn((tag) => {
        if (tag === 'div') {
            return { className: '', appendChild: vi.fn(), innerHTML: '' };
        }
        if (tag === 'video') {
            return {
                id: '', controls: false, muted: false, autoplay: false, playsInline: false,
                canPlayType: vi.fn(),
                addEventListener: vi.fn(),
                play: vi.fn().mockResolvedValue(undefined),
                isConnected: true // Pretend it's attached to the DOM
            };
        }
        return {};
    })
});

// Mock the global Hls.js Library
const mockHlsInstance = {
    attachMedia: vi.fn(),
    on: vi.fn(),
    loadSource: vi.fn(),
    stopLoad: vi.fn(),
    destroy: vi.fn(),
};

class MockHls {
    static isSupported = vi.fn(() => true);
    static Events = {
        MEDIA_ATTACHED: 'hlsMediaAttached',
        MANIFEST_PARSED: 'hlsManifestParsed',
        ERROR: 'hlsError'
    };

    constructor() {
        return mockHlsInstance;
    }
}
vi.stubGlobal('Hls', MockHls);

describe('CCTVStrategy Video Player Garbage Collection', () => {
    let strategy: CCTVStrategy;
    let mockContainer: any;

    beforeEach(() => {
        // Reset the static state before every test
        CCTVStrategy.stopAll();

        vi.clearAllMocks();

        strategy = new CCTVStrategy();
        mockContainer = { innerHTML: '', appendChild: vi.fn() };
    });

    it('should track active players when renderCardContent is called', () => {
        const sensor1: SensorProperties = { publicname: 'camera_1', video_url2: 'http://test/1.m3u8', additional_info: {} };
        const sensor2: SensorProperties = { publicname: 'camera_2', video_url2: 'http://test/2.m3u8', additional_info: {} };

        // Render two different cameras
        strategy.renderCardContent(mockContainer, sensor1, 'prefix-1', vi.fn());
        strategy.renderCardContent(mockContainer, sensor2, 'prefix-2', vi.fn());

        // Cast to 'any' to inspect the private static map
        const activePlayers = (CCTVStrategy as any).activePlayers;

        expect(activePlayers.size).toBe(2);
        expect(activePlayers.has('camera_1')).toBe(true);
        expect(activePlayers.has('camera_2')).toBe(true);
    });

    it('should destroy all players and clear the map when stopAll is called', () => {
        const sensor1: SensorProperties = { publicname: 'camera_1', video_url2: 'http://test/1.m3u8', additional_info: {} };
        const sensor2: SensorProperties = { publicname: 'camera_2', video_url2: 'http://test/2.m3u8', additional_info: {} };

        strategy.renderCardContent(mockContainer, sensor1, 'prefix-1', vi.fn());
        strategy.renderCardContent(mockContainer, sensor2, 'prefix-2', vi.fn());

        // Verify they were added
        const activePlayers = (CCTVStrategy as any).activePlayers;
        expect(activePlayers.size).toBe(2);

        // Act: Call the cleanup function
        CCTVStrategy.stopAll();

        // Assert: HLS methods were called to kill the network requests and decode buffers
        expect(mockHlsInstance.stopLoad).toHaveBeenCalledTimes(2);
        expect(mockHlsInstance.destroy).toHaveBeenCalledTimes(2);

        // Assert: The map is empty
        expect(activePlayers.size).toBe(0);
    });

    it('should destroy existing player if renderCardContent is called again for the same sensor', () => {
        const sensor: SensorProperties = { publicname: 'camera_1', video_url2: 'http://test/1.m3u8', additional_info: {} };

        // Render the camera for the first time
        strategy.renderCardContent(mockContainer, sensor, 'prefix-1', vi.fn());

        // Render the EXACT same camera again
        strategy.renderCardContent(mockContainer, sensor, 'prefix-2', vi.fn());

        // It should have destroyed the first instance before creating the second one
        expect(mockHlsInstance.stopLoad).toHaveBeenCalledTimes(1);
        expect(mockHlsInstance.destroy).toHaveBeenCalledTimes(1);

        // There should still only be 1 active player tracked
        const activePlayers = (CCTVStrategy as any).activePlayers;
        expect(activePlayers.size).toBe(1);
    });
});