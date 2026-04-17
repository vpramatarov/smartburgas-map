// tests/CsvExporter.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CsvExporter } from '../src/CsvExporter.js';
import { ChartRenderer } from '../src/components/ChartRenderer.js';

vi.mock('../src/Translations.js', () => ({
    t: vi.fn((key) => key)
}));
vi.mock('../src/Utils.js', () => ({
    Utils: { formatDateTimeToLocal: vi.fn((ts) => new Date(ts).toISOString()) }
}));

// ── DOM / Blob setup

function setupDomMocks() {
    global.Blob = vi.fn(function (content, options) {}) as any;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.document = {
        createElement: vi.fn().mockReturnValue({
            style: {},
            setAttribute: vi.fn(),
            click: vi.fn(),
        }),
        body: {
            appendChild: vi.fn(),
            removeChild: vi.fn(),
        }
    } as any;
}

function getCsvContent(): string {
    // Each test call creates a fresh Blob — get the most recent call
    const calls = (global.Blob as any).mock.calls;
    return calls[calls.length - 1][0][0] as string;
}

function download(sensors: any[]) {
    CsvExporter.download(sensors as any, 'bg', 'test');
}

// ── test date range filtering

describe('CSV Exporter Filtering', () => {
    beforeEach(() => { vi.clearAllMocks(); setupDomMocks(); });

    it('should filter nested sensor data based on the chart date range before exporting', () => {
        vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue({
            start: new Date('2026-03-02T00:00:00Z'),
            end: new Date('2026-03-02T23:59:59Z')
        });

        download([{
            id: 'sensor-1', name: 'Test Sensor', strategy: 'test-strategy', additional_info: {},
            data: [
                { time: '2026-03-01T12:00:00Z', test_variable: 10 },
                { time: '2026-03-02T12:00:00Z', test_variable: 20 },
                { time: '2026-03-03T12:00:00Z', test_variable: 30 }
            ]
        }]);

        const csv = getCsvContent();
        expect(csv).toContain('"20"');
        expect(csv).not.toContain('"10"');
        expect(csv).not.toContain('"30"');
    });
});

// ── parseDate edge cases ─

describe('CsvExporter.parseDate', () => {
    beforeEach(() => { vi.clearAllMocks(); setupDomMocks(); vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue(null); });

    function exportAndGetCsv(timeValue: string): string {
        download([{ id: 'S1', name: 'Sensor', strategy: 'test', additional_info: {}, data: [{ time: timeValue, value: '99' }] }]);
        return getCsvContent();
    }

    function getTimestampCol(csv: string): string {
        const dataRow = csv.split('\n')[1];
        return dataRow.split(',')[4].replace(/"/g, '');
    }

    it('parses a standard ISO 8601 string and writes a non-empty timestamp column', () => {
        const ts = getTimestampCol(exportAndGetCsv('2025-03-15T10:30:00Z'));
        expect(Number(ts)).toBeGreaterThan(0);
    });

    it('parses the underscore-separated upstream format DD_MM_YYYY HH:MM', () => {
        const ts = getTimestampCol(exportAndGetCsv('15_03_2025 10:30'));
        expect(Number(ts)).toBeGreaterThan(0);
        expect(new Date(Number(ts)).getFullYear()).toBe(2025);
    });

    it('parses dot-separated format DD.MM.YYYY HH:MM', () => {
        const ts = getTimestampCol(exportAndGetCsv('15.03.2025 10:30'));
        expect(Number(ts)).toBeGreaterThan(0);
        expect(new Date(Number(ts)).getFullYear()).toBe(2025);
    });

    it('writes an empty timestamp column for completely unparseable strings', () => {
        expect(getTimestampCol(exportAndGetCsv('not-a-date'))).toBe('');
    });

    it('writes an empty timestamp column for an empty time string', () => {
        expect(getTimestampCol(exportAndGetCsv(''))).toBe('');
    });
});

// ── CSV structure 

describe('CsvExporter CSV structure', () => {
    beforeEach(() => { vi.clearAllMocks(); setupDomMocks(); vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue(null); });

    it('wraps all field values in double quotes', () => {
        download([{ id: 'S1', name: 'Test', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', pm10: '42' }] }]);
        const dataRow = getCsvContent().split('\n')[1];
        dataRow.split(',').forEach(col => {
            expect(col.startsWith('"')).toBe(true);
            expect(col.endsWith('"')).toBe(true);
        });
    });

    it('escapes double quotes inside field values by doubling them', () => {
        // The sensor name is the featureName column — test escaping via the strategy column
        // by using a strategy value containing quotes (via a sensor whose data contains quotes)
        download([{
            id: 'S1', name: 'Normal', strategy: 'st', additional_info: {},
            data: [{ time: '2025-01-01T00:00:00Z', note: 'say "hello"' }]
        }]);
        const csv = getCsvContent();
        // The note column value 'say "hello"' should be escaped as 'say ""hello""'
        expect(csv).toContain('"say ""hello"""');
    });

    it('skips _unit keys as data columns (they appear as unit column instead)', () => {
        download([{ id: 'S1', name: 'Sensor', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', pm10: '25', pm10_unit: 'μg/m³' }] }]);
        const csv = getCsvContent();
        const dataRows = csv.split('\n').slice(1);
        expect(dataRows.length).toBe(1);
        expect(dataRows[0]).toContain('"pm10"');
        expect(dataRows[0]).toContain('"μg/m³"');
    });

    it('skips sensors with no data without crashing', () => {
        download([
            { id: 'S1', name: 'Empty', strategy: 'st', additional_info: {}, data: [] },
            { id: 'S2', name: 'HasData', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', v: '7' }] }
        ]);
        const csv = getCsvContent();
        const dataRows = csv.split('\n').slice(1);
        expect(dataRows.length).toBe(1);
        expect(dataRows[0]).toContain('"S2"');
    });

    it('prefixes the BOM character for Excel UTF-8 compatibility', () => {
        download([{ id: 'S1', name: 'S', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', v: '1' }] }]);
        expect(getCsvContent().startsWith('\uFEFF')).toBe(true);
    });

    it('collapses newlines inside field values to spaces (prevents row breaks)', () => {
        download([{
            id: 'S1', name: 'S', strategy: 'st', additional_info: {},
            data: [{ time: '2025-01-01T00:00:00Z', note: 'first\nsecond\r\nthird\rlast' }],
        }]);
        const csv = getCsvContent();
        // Header line + exactly one data line (newlines inside fields must not split rows)
        const lines = csv.split('\n');
        expect(lines).toHaveLength(2);
        expect(csv).not.toContain('first\nsecond');
        expect(csv).toContain('"first second third last"');
    });
});
