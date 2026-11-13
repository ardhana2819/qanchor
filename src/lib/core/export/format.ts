/** One output row: every value is a string, so leading zeros and long digit strings survive. */
export type ExportRecord = Readonly<Record<string, string>>;

export type ExportFormat = 'csv' | 'json';

export const EXPORT_FORMATS: readonly { value: ExportFormat; label: string; mime: string }[] = [
	{ value: 'csv', label: 'CSV', mime: 'text/csv' },
	{ value: 'json', label: 'JSON', mime: 'application/json' }
];

/**
 * RFC 4180 CSV (FR-083 AC-1): a header row, CRLF line breaks, and a field quoted when it holds a
 * comma, quote, CR, or LF, with quotes doubled. Values are written as text; nothing is coerced.
 */
export function toCsv(records: readonly ExportRecord[], fields: readonly string[]): string {
	const line = (values: readonly string[]) => values.map(quoteCsv).join(',');
	return [line(fields), ...records.map((record) => line(fields.map((f) => record[f] ?? '')))]
		.map((row) => `${row}\r\n`)
		.join('');
}

function quoteCsv(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** An array of objects with one key per field, in field order (FR-083 AC-2). */
export function toJson(records: readonly ExportRecord[], fields: readonly string[]): string {
	const objects = records.map((record) =>
		Object.fromEntries(fields.map((field) => [field, record[field] ?? '']))
	);
	return `${JSON.stringify(objects, null, 2)}\n`;
}

export function formatRecords(
	format: ExportFormat,
	records: readonly ExportRecord[],
	fields: readonly string[]
): string {
	return format === 'csv' ? toCsv(records, fields) : toJson(records, fields);
}
