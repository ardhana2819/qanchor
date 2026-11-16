import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import type { ExportRecord } from './format.ts';
import { MAX_TABLE_NAME, parseTableName, toSql, type SqlDialect } from './sql.ts';

const fields = ['name', 'address', 'nik'];
const tricky: ExportRecord[] = [
	{
		name: "Ma'ruf",
		address: 'Jl. Mawar No. 1, RT 001/RW 002,\nKota "Lama"',
		nik: '0012345678901234'
	},
	{ name: "O''Neil \\ back\\'slash", address: 'tab\there; DROP TABLE x; --', nik: '' },
	{ name: '`tick` "dq" ’curly’ 😀', address: '\r\n', nik: '9' }
];

/** Runs PostgreSQL-dialect output on a real SQL engine: SQLite uses the same quoting rules. */
function runOnSqlite(sql: string, table: string, columns: readonly string[]) {
	const db = new DatabaseSync(':memory:');
	db.exec(`CREATE TABLE "${table}" (${columns.map((c) => `"${c}" TEXT`).join(', ')})`);
	db.exec(sql);
	return db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all();
}

/**
 * Reads MySQL-dialect INSERT statements back with MySQL's default string rules: `''` and `\x` are
 * escapes inside a single-quoted literal. Throws on anything else, so malformed output fails.
 */
function parseMysqlInserts(sql: string): { table: string; columns: string[]; values: string[] }[] {
	const statements: { table: string; columns: string[]; values: string[] }[] = [];
	let i = 0;
	const expect = (text: string) => {
		if (!sql.startsWith(text, i)) throw new Error(`expected ${JSON.stringify(text)} at ${i}`);
		i += text.length;
	};
	const identifier = () => {
		expect('`');
		let name = '';
		while (!sql.startsWith('`', i) || sql.startsWith('``', i)) {
			if (i >= sql.length) throw new Error('unterminated identifier');
			name += sql[i];
			i += sql.startsWith('``', i) ? 2 : 1;
		}
		expect('`');
		return name;
	};
	const literal = () => {
		expect("'");
		let value = '';
		for (;;) {
			if (i >= sql.length) throw new Error('unterminated string');
			if (sql.startsWith("''", i)) [value, i] = [value + "'", i + 2];
			else if (sql[i] === "'") break;
			else if (sql[i] === '\\') [value, i] = [value + sql[i + 1], i + 2];
			else [value, i] = [value + sql[i], i + 1];
		}
		expect("'");
		return value;
	};
	while (sql.startsWith('--', i)) i = sql.indexOf('\n', i) + 1;
	while (i < sql.length) {
		expect('INSERT INTO ');
		const table = identifier();
		expect(' (');
		const columns = [identifier()];
		while (sql.startsWith(', ', i)) {
			i += 2;
			columns.push(identifier());
		}
		expect(') VALUES (');
		const values = [literal()];
		while (sql.startsWith(', ', i)) {
			i += 2;
			values.push(literal());
		}
		expect(');\n');
		statements.push({ table, columns, values });
	}
	return statements;
}

describe('parseTableName (FR-083 AC-4)', () => {
	it('accepts letters, digits, and underscore, trimmed', () => {
		expect(parseTableName('users')).toEqual({ ok: true, value: 'users' });
		expect(parseTableName('  kyc_2026_Test ')).toEqual({ ok: true, value: 'kyc_2026_Test' });
		expect(parseTableName('a'.repeat(MAX_TABLE_NAME))).toEqual({ ok: true, value: 'a'.repeat(63) });
	});

	it('blocks an empty name, any other character, and a name longer than 63', () => {
		for (const name of ['', '   '])
			expect(parseTableName(name)).toEqual({ ok: false, error: 'empty' });
		for (const name of [
			'my-table',
			'users;',
			'a b',
			'schema.users',
			'na"me',
			'na`me',
			"x'",
			'tabél',
			'ｕsers'
		]) {
			expect(parseTableName(name)).toEqual({ ok: false, error: 'characters' });
		}
		expect(parseTableName('a'.repeat(MAX_TABLE_NAME + 1))).toEqual({
			ok: false,
			error: 'too-long'
		});
	});
});

describe('toSql (FR-083 AC-3, EC-017)', () => {
	it('writes one INSERT per row with quoted identifiers and string literals', () => {
		const record = { name: 'Budi', address: 'x', nik: '1' };
		expect(toSql([record], fields, { table: 'people', dialect: 'postgresql' })).toBe(
			`INSERT INTO "people" ("name", "address", "nik") VALUES ('Budi', 'x', '1');\n`
		);
		expect(toSql([record], fields, { table: 'people', dialect: 'mysql' })).toBe(
			"INSERT INTO `people` (`name`, `address`, `nik`) VALUES ('Budi', 'x', '1');\n"
		);
	});

	it("doubles single quotes: Ma'ruf becomes 'Ma''ruf'", () => {
		const sql = toSql([{ name: "Ma'ruf" }], ['name'], { table: 't', dialect: 'postgresql' });
		expect(sql).toContain("VALUES ('Ma''ruf');");
	});

	it('PostgreSQL output runs on a SQL engine and stores every value exactly', () => {
		const sql = toSql(tricky, fields, {
			table: 'people',
			dialect: 'postgresql',
			comments: ['run']
		});
		const rows = runOnSqlite(sql, 'people', fields);
		expect(rows.map((row) => ({ ...row }))).toEqual(tricky);
	});

	it('MySQL output reads back exactly under MySQL string rules, backslashes included', () => {
		const sql = toSql(tricky, fields, { table: 'people', dialect: 'mysql' });
		const parsed = parseMysqlInserts(sql);
		expect(parsed.map((s) => s.table)).toEqual(['people', 'people', 'people']);
		expect(parsed[0].columns).toEqual(fields);
		expect(parsed.map((s) => Object.fromEntries(fields.map((f, i) => [f, s.values[i]])))).toEqual(
			tricky
		);
		expect(sql).toContain("'O''''Neil \\\\ back\\\\''slash'");
	});

	it('doubles a quote character inside an identifier', () => {
		expect(toSql([{ 'a"b': 'x' }], ['a"b'], { table: 't', dialect: 'postgresql' })).toContain(
			'("a""b")'
		);
		expect(toSql([{ 'a`b': 'x' }], ['a`b'], { table: 't', dialect: 'mysql' })).toContain(
			'(`a``b`)'
		);
	});

	it('writes empty text for a missing value and nothing but comments for no rows', () => {
		const sql = toSql([{ name: 'a' }], fields, { table: 't', dialect: 'postgresql' });
		expect(sql).toBe(`INSERT INTO "t" ("name", "address", "nik") VALUES ('a', '', '');\n`);
		expect(toSql([], fields, { table: 't', dialect: 'mysql', comments: ['only'] })).toBe(
			'-- only\n'
		);
	});

	it('keeps each comment on one line, so a seed with a newline cannot start a statement', () => {
		const comments = ['Seed: x\nDROP TABLE people;\r\n--', 'two'];
		for (const dialect of ['postgresql', 'mysql'] as SqlDialect[]) {
			const sql = toSql([{ name: 'a', address: 'b', nik: 'c' }], fields, {
				table: 'people',
				dialect,
				comments
			});
			expect(sql.split('\n').slice(0, 2)).toEqual(['-- Seed: x DROP TABLE people; --', '-- two']);
			if (dialect === 'postgresql') expect(runOnSqlite(sql, 'people', fields)).toHaveLength(1);
			else expect(parseMysqlInserts(sql)).toHaveLength(1);
		}
	});
});
