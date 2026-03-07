import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CsvExporter } from '../src/CsvExporter.js';
import { ChartRenderer } from '../src/components/ChartRenderer.js';

// Mock translations and utils to prevent import errors in the test environment
vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key) => key) // Just return the translation key
}));
vi.mock('../src/Utils.js', () => ({
    Utils: { formatDateTimeToLocal: vi.fn((ts) => new Date(ts).toISOString()) }
}));

describe('CSV Exporter Filtering', () => {
    beforeEach(() => {
        global.Blob = vi.fn(function (content, options) {}) as any;
        global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
        global.document = {
            createElement: vi.fn().mockReturnValue({
                style: {},
                setAttribute: vi.fn(),
                click: vi.fn(),
                remove: vi.fn()
            }),
            body: {
                appendChild: vi.fn(),
                removeChild: vi.fn()
            }
        } as any;
        document.createElement = vi.fn().mockReturnValue({
            style: {}, setAttribute: vi.fn(), click: vi.fn(), remove: vi.fn()
        });
        document.body.appendChild = vi.fn();
        document.body.removeChild = vi.fn();
    });

    it('should filter nested sensor data based on the chart date range before exporting', () => {
        // Mock the chart's current zoom state
        vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue({
            start: new Date('2026-03-02T00:00:00Z'),
            end: new Date('2026-03-02T23:59:59Z')
        });

        const mockSensors = [{
            id: 'sensor-1',
            name: 'Test Sensor',
            strategy: 'test-strategy',
            data: [
                { time: '2026-03-01T12:00:00Z', test_variable: 10 }, // Out of range (Before)
                { time: '2026-03-02T12:00:00Z', test_variable: 20 }, // In range
                { time: '2026-03-03T12:00:00Z', test_variable: 30 }  // Out of range (After)
            ]
        }];

        // Execute download
        CsvExporter.download(mockSensors as any, 'bg', 'test');

        // Extract the generated CSV string from the Blob mock
        const blobCall = (global.Blob as any).mock.calls[0][0][0];

        // Assert the CSV contains the value "20" (from the valid date)
        expect(blobCall).toContain('"20"');

        // Assert the CSV does NOT contain "10" or "30" (from the invalid dates)
        expect(blobCall).not.toContain('"10"');
        expect(blobCall).not.toContain('"30"');
    });
});