import { err, ok, type Result } from '../result.ts';
import type { ExportRecord } from './format.ts';

// Generic SQL INSERT export (FR-083 AC-3, AC-4): one statement per row, every value a string
// literal, identifiers quoted in the chosen dialect. One statement per row runs on PostgreSQL,
// MySQL, and SQLite alike and never hits a statement-size limit.

export type SqlDialect = 'postgresql' | 'mysql';

export const SQL_DIALECTS: readonly { value: SqlDialect; label: string }[] = [
	{ value: 'postgresql', label: 'PostgreSQL' },
	{ value: 'mysql', label: 'MySQL' }
];

/** PostgreSQL truncates identifiers longer than 63 bytes; MySQL rejects more than 64 characters. */
export const MAX_TABLE_NAME = 63;

export type TableNameError = 'empty' | 'characters' | 'too-long';

/** Letters, digits, and underscore only (FR-083 AC-4), so the name needs no escaping. */
export function parseTableName(input: string): Result<string, TableNameError> {
	const name = input.trim();
	if (name === '') return err('empty');
	if (!/^[A-Za-z0-9_]+$/.test(name)) return err('characters');
	if (name.length > MAX_TABLE_NAME) return err('too-long');
	return ok(name);
}

export interface SqlOptions {
	/** A name accepted by `parseTableName`. */
	readonly table: string;
	readonly dialect: SqlDialect;
	/** Written as `--` comment lines before the statements. */
	readonly comments?: readonly string[];
}

export function toSql(
	records: readonly ExportRecord[],
	fields: readonly string[],
	{ table, dialect, comments = [] }: SqlOptions
): string {
	const quote = (name: string) => quoteIdentifier(name, dialect);
	const head = `INSERT INTO ${quote(table)} (${fields.map(quote).join(', ')}) VALUES (`;
	const header = comments.map((line) => `-- ${line.replace(/[\r\n]+/g, ' ')}\n`);
	const statements = records.map(
		(record) => `${head}${fields.map((f) => quoteString(record[f] ?? '', dialect)).join(', ')});\n`
	);
	return [...header, ...statements].join('');
}

function quoteIdentifier(name: string, dialect: SqlDialect): string {
	const mark = dialect === 'mysql' ? '`' : '"';
	return `${mark}${name.replaceAll(mark, mark + mark)}${mark}`;
}

/**
 * A single quote is doubled in both dialects. MySQL also reads a backslash as an escape character
 * unless NO_BACKSLASH_ESCAPES is set, so it is doubled there too; PostgreSQL's standard strings
 * take it literally.
 */
function quoteString(value: string, dialect: SqlDialect): string {
	const escaped = dialect === 'mysql' ? value.replaceAll('\\', '\\\\') : value;
	return `'${escaped.replaceAll("'", "''")}'`;
}
