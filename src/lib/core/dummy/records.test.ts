import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { toCsv, toJson, type ExportRecord } from '../export/format.ts';
import { toSql } from '../export/sql.ts';
import { loadRegions } from './data/regions.ts';
import { seedKey } from './random.ts';
import { dummyExport, exportBaseName, runInfoLines } from './records.ts';
import { generateRow, type DummyRow } from './rows.ts';
import { defaultSettings, FIELD_IDS, PRESETS, type Settings } from './settings.ts';

const regions = await loadRegions();
const AS_OF = { year: 2026, month: 11, day: 16 };
const BASE = defaultSettings(AS_OF);

function rows(settings: Settings, count: number): DummyRow[] {
	const key = seedKey('records');
	return Array.from({ length: count }, (_, i) => generateRow(key, i, regions, settings));
}

const ALL_COLUMNS = [
	'name',
	'gender',
	'birth_date',
	'nik',
	'npwp',
	'phone',
	'address',
	'address_street',
	'address_rt',
	'address_rw',
	'address_village',
	'address_district',
	'address_regency',
	'address_province',
	'address_postal_code',
	'bank_name',
	'bank_code',
	'bank_account'
];

/** RFC 4180 reader: enough to prove the CSV round-trips (quoted commas, quotes, and newlines). */
function parseCsv(csv: string): string[][] {
	const out: string[][] = [];
	let row: string[] = [];
	let field = '';
	let i = 0;
	while (i < csv.length) {
		if (csv[i] === '"') {
			i++;
			while (!(csv[i] === '"' && csv[i + 1] !== '"')) {
				field += csv[i];
				i += csv[i] === '"' ? 2 : 1;
			}
			i++;
		} else if (csv[i] === ',') [row, field, i] = [[...row, field], '', i + 1];
		else if (csv.startsWith('\r\n', i))
			[out[out.length], row, field, i] = [[...row, field], [], '', i + 2];
		else [field, i] = [field + csv[i], i + 1];
	}
	return out;
}

describe('dummyExport columns', () => {
	it('all fields: one column per value, address and bank split into their parts', () => {
		const sample = rows(BASE, 3);
		const { columns, records } = dummyExport(sample, FIELD_IDS, null);
		expect(columns).toEqual(ALL_COLUMNS);
		const [record] = records;
		const { person } = sample[0];
		expect(record).toEqual({
			name: person.name,
			gender: person.gender,
			birth_date: person.birthDate,
			nik: person.nik,
			npwp: person.npwp,
			phone: person.phone,
			address: person.address.full,
			address_street: person.address.street,
			address_rt: person.address.rt,
			address_rw: person.address.rw,
			address_village: person.address.village,
			address_district: person.address.district,
			address_regency: person.address.regency,
			address_province: person.address.province,
			address_postal_code: person.address.postalCode,
			bank_name: person.bank.name,
			bank_code: person.bank.code,
			bank_account: person.bank.account
		});
		expect(Object.keys(record)).toEqual(columns);
	});

	it('keeps preview order whatever order the fields were selected in', () => {
		const { columns } = dummyExport(rows(BASE, 1), ['bank', 'phone', 'name'], null);
		expect(columns).toEqual(['name', 'phone', 'bank_name', 'bank_code', 'bank_account']);
	});

	it('adds a note column only for presets that label their rows', () => {
		const noted = new Set(['name-edge-cases', 'invalid-formats', 'duplicate-nik']);
		for (const preset of PRESETS) {
			const settings = preset.apply(BASE);
			const { columns, records } = dummyExport(
				rows(settings, 4),
				settings.fields,
				settings.scenario
			);
			expect(columns.at(-1) === 'note').toBe(noted.has(preset.id));
			if (preset.id === 'duplicate-nik') {
				expect(records.map((r) => r.note)).toEqual([
					'',
					'Same NIK as row 1.',
					'',
					'Same NIK as row 3.'
				]);
			}
		}
		expect(dummyExport(rows(BASE, 1), ['name'], null).columns).toEqual(['name']);
	});

	it('no rows give the columns and no records', () => {
		expect(dummyExport([], ['nik'], 'invalid-formats')).toEqual({
			columns: ['nik', 'note'],
			records: []
		});
	});
});

describe('exports of edge-case rows stay valid (FR-083, EC-017, EC-018)', () => {
	const settings = PRESETS.find((p) => p.id === 'name-edge-cases')!.apply({
		...BASE,
		fields: FIELD_IDS
	});
	const sample = rows(settings, 200);
	const { columns, records } = dummyExport(sample, FIELD_IDS, settings.scenario);
	const withNewline: ExportRecord = {
		...records[0],
		address: `${records[0].address}\nBlok "C", lantai 2`
	};
	const all = [withNewline, ...records];

	it('the sample includes an apostrophe name and commas in every address', () => {
		expect(records.some((r) => r.name.includes("'"))).toBe(true);
		expect(records.every((r) => r.address.includes(','))).toBe(true);
	});

	it('CSV reads back to the same values, leading zeros kept', () => {
		const parsed = parseCsv(toCsv(all, columns));
		expect(parsed[0]).toEqual(columns);
		expect(parsed.slice(1)).toEqual(all.map((r) => columns.map((c) => r[c])));
		expect(parsed.slice(1).some((r) => /^0/.test(r[columns.indexOf('bank_account')]))).toBe(true);
	});

	it('JSON is an array of objects with string identifiers', () => {
		const parsed = JSON.parse(toJson(all, columns)) as Record<string, unknown>[];
		expect(parsed).toEqual(all);
		for (const row of parsed) {
			for (const key of ['nik', 'npwp', 'phone', 'bank_account'])
				expect(typeof row[key]).toBe('string');
		}
	});

	it('SQL runs on a SQL engine and stores the same values', () => {
		const sql = toSql(all, columns, {
			table: 'people',
			dialect: 'postgresql',
			comments: runInfoLines({ seed: 'records', asOf: AS_OF })
		});
		const db = new DatabaseSync(':memory:');
		db.exec(`CREATE TABLE people (${columns.map((c) => `${c} TEXT`).join(', ')})`);
		db.exec(sql);
		const stored = db
			.prepare('SELECT * FROM people ORDER BY rowid')
			.all()
			.map((row) => ({ ...row }));
		expect(stored).toEqual(all);
	});
});

describe('run info', () => {
	it('names the generator version, seed, and as-of date', () => {
		expect(runInfoLines({ seed: 'abc 123', asOf: { year: 2026, month: 2, day: 3 } })).toEqual([
			'QAnchor dummy data: fake, for testing only. Generator version 1.',
			'Seed: abc 123',
			'Ages as of: 2026-02-03'
		]);
	});

	it('file names carry the version and a filename-safe seed', () => {
		expect(exportBaseName('9f2c4a1b3d5e6f70')).toBe('qanchor-dummy-v1-9f2c4a1b3d5e6f70');
		expect(exportBaseName('my seed/../€ 1')).toBe('qanchor-dummy-v1-my-seed-1');
		expect(exportBaseName('***')).toBe('qanchor-dummy-v1');
		expect(exportBaseName(`${'a'.repeat(31)} b`)).toBe(`qanchor-dummy-v1-${'a'.repeat(31)}`);
		expect(exportBaseName('x'.repeat(50))).toHaveLength('qanchor-dummy-v1-'.length + 32);
	});
});
