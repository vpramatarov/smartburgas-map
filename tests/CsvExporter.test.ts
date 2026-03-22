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

// ── DOM/Blob setup shared across all tests 

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
    return (global.Blob as any).mock.calls[0][0][0] as string;
}

// ── test date range filtering

describe('CSV Exporter Filtering', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupDomMocks();
    });

    it('should filter nested sensor data based on the chart date range before exporting', () => {
        vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue({
            start: new Date('2026-03-02T00:00:00Z'),
            end: new Date('2026-03-02T23:59:59Z')
        });

        const mockSensors = [{
            id: 'sensor-1',
            name: 'Test Sensor',
            strategy: 'test-strategy',
            additional_info: {},
            data: [
                { time: '2026-03-01T12:00:00Z', test_variable: 10 },
                { time: '2026-03-02T12:00:00Z', test_variable: 20 },
                { time: '2026-03-03T12:00:00Z', test_variable: 30 }
            ]
        }];

        CsvExporter.download(mockSensors as any, 'bg', 'test');

        const csv = getCsvContent();
        expect(csv).toContain('"20"');
        expect(csv).not.toContain('"10"');
        expect(csv).not.toContain('"30"');
    });
});

// ── parseDate edge cases

describe('CsvExporter.parseDate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupDomMocks();
        // No active range — all rows pass through so we can inspect dates
        vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue(null);
    });

    function exportAndGetCsv(timeValue: string): string {
        const sensors = [{
            id: 'S1',
            name: 'Sensor',
            strategy: 'test',
            additional_info: {},
            data: [{ time: timeValue, value: '99' }]
        }];
        CsvExporter.download(sensors as any, 'bg', 'test');
        return getCsvContent();
    }

    it('parses a standard ISO 8601 string and writes a non-empty timestamp column', () => {
        const csv = exportAndGetCsv('2025-03-15T10:30:00Z');
        const rows = csv.split('\n');
        // Row 1 is header, row 2 is the data row
        const dataRow = rows[1];
        const cols = dataRow.split(',');
        // Column 5 (index 4) is the Unix timestamp — should be a number
        const ts = cols[4].replace(/"/g, '');
        expect(Number(ts)).toBeGreaterThan(0);
    });

    it('parses the underscore-separated upstream format DD_MM_YYYY HH:MM', () => {
        const csv = exportAndGetCsv('15_03_2025 10:30');
        const rows = csv.split('\n');
        const dataRow = rows[1];
        const cols = dataRow.split(',');
        const ts = Number(cols[4].replace(/"/g, ''));
        // Should resolve to a valid timestamp
        expect(ts).toBeGreaterThan(0);
        // And should correspond to 2025 (year check)
        expect(new Date(ts).getFullYear()).toBe(2025);
    });

    it('parses dot-separated format DD.MM.YYYY HH:MM', () => {
        const csv = exportAndGetCsv('15.03.2025 10:30');
        const rows = csv.split('\n');
        const dataRow = rows[1];
        const cols = dataRow.split(',');
        const ts = Number(cols[4].replace(/"/g, ''));
        expect(ts).toBeGreaterThan(0);
        expect(new Date(ts).getFullYear()).toBe(2025);
    });

    it('writes an empty timestamp column for completely unparseable strings', () => {
        const csv = exportAndGetCsv('not-a-date');
        const rows = csv.split('\n');
        const dataRow = rows[1];
        const cols = dataRow.split(',');
        const ts = cols[4].replace(/"/g, '');
        expect(ts).toBe('');
    });

    it('writes an empty timestamp column for an empty time string', () => {
        const csv = exportAndGetCsv('');
        const rows = csv.split('\n');
        const dataRow = rows[1];
        const cols = dataRow.split(',');
        const ts = cols[4].replace(/"/g, '');
        expect(ts).toBe('');
    });
});

// ── escape / CSV structure

describe('CsvExporter CSV structure', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setupDomMocks();
        vi.spyOn(ChartRenderer, 'getCurrentExportRange').mockReturnValue(null);
    });

    it('wraps all field values in double quotes', () => {
        const sensors = [{
            id: 'sensor-1',
            name: 'Test',
            strategy: 'st',
            additional_info: {},
            data: [{ time: '2025-01-01T00:00:00Z', pm10: '42' }]
        }];
        CsvExporter.download(sensors as any, 'bg');
        const csv = getCsvContent();
        // Every field should be quoted
        const dataRow = csv.split('\n')[1];
        dataRow.split(',').forEach(col => {
            expect(col.startsWith('"')).toBe(true);
            expect(col.endsWith('"')).toBe(true);
        });
    });

    it('escapes double quotes inside field values by doubling them', () => {
        const sensors = [{
            id: 'S1',
            name: 'He said "hello"',
            strategy: 'st',
            additional_info: {},
            data: [{ time: '2025-01-01T00:00:00Z', v: '1' }]
        }];
        CsvExporter.download(sensors as any, 'bg');
        const csv = getCsvContent();
        expect(csv).toContain('"He said ""hello"""');
    });

    it('skips _unit keys as data columns (they appear as unit column instead)', () => {
        const sensors = [{
            id: 'S1',
            name: 'Sensor',
            strategy: 'st',
            additional_info: {},
            data: [{ time: '2025-01-01T00:00:00Z', pm10: '25', pm10_unit: 'μg/m³' }]
        }];
        CsvExporter.download(sensors as any, 'bg');
        const csv = getCsvContent();
        // pm10_unit should not appear as a row variable, but its value should appear in the unit column
        const dataRows = csv.split('\n').slice(1);
        expect(dataRows.length).toBe(1); // Only one data row for pm10
        expect(dataRows[0]).toContain('"pm10"');
        expect(dataRows[0]).toContain('"μg/m³"');
    });

    it('skips sensors with no data without crashing', () => {
        const sensors = [
            { id: 'S1', name: 'Empty', strategy: 'st', additional_info: {}, data: [] },
            { id: 'S2', name: 'HasData', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', v: '7' }] }
        ];
        CsvExporter.download(sensors as any, 'bg');
        const csv = getCsvContent();
        const dataRows = csv.split('\n').slice(1);
        expect(dataRows.length).toBe(1);
        expect(dataRows[0]).toContain('"S2"');
    });

    it('prefixes the BOM character for Excel UTF-8 compatibility', () => {
        const sensors = [{ id: 'S1', name: 'S', strategy: 'st', additional_info: {}, data: [{ time: '2025-01-01T00:00:00Z', v: '1' }] }];
        CsvExporter.download(sensors as any, 'bg');
        const rawContent = (global.Blob as any).mock.calls[0][0][0] as string;
        expect(rawContent.startsWith('\uFEFF')).toBe(true);
    });
});
