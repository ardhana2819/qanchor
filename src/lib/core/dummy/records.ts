import type { ExportRecord } from '../export/format.ts';
import { isoDate, type CivilDate } from './dates.ts';
import type { Person } from './fields.ts';
import { GENERATOR_VERSION } from './random.ts';
import type { DummyRow } from './rows.ts';
import { FIELD_IDS, type FieldId, type Scenario } from './settings.ts';

// Dummy rows as export columns (FR-083). The address is one full line plus its parts, and the bank
// account is split into name, code, and number, so each part can fill its own form field
// (decisions 2026-11-16). Column names are snake_case so they work as SQL columns unquoted.

const COLUMNS: Readonly<Record<FieldId, readonly [string, (person: Person) => string][]>> = {
	name: [['name', (p) => p.name]],
	gender: [['gender', (p) => p.gender]],
	birthDate: [['birth_date', (p) => p.birthDate]],
	nik: [['nik', (p) => p.nik]],
	npwp: [['npwp', (p) => p.npwp]],
	phone: [['phone', (p) => p.phone]],
	address: [
		['address', (p) => p.address.full],
		['address_street', (p) => p.address.street],
		['address_rt', (p) => p.address.rt],
		['address_rw', (p) => p.address.rw],
		['address_village', (p) => p.address.village],
		['address_district', (p) => p.address.district],
		['address_regency', (p) => p.address.regency],
		['address_province', (p) => p.address.province],
		['address_postal_code', (p) => p.address.postalCode]
	],
	bank: [
		['bank_name', (p) => p.bank.name],
		['bank_code', (p) => p.bank.code],
		['bank_account', (p) => p.bank.account]
	]
};

/** Presets whose rows carry a note: the edge case, the reason a row is invalid, or the duplicated row. */
const NOTED_SCENARIOS: readonly Scenario[] = [
	'name-edge-cases',
	'invalid-formats',
	'duplicate-nik'
];

export interface DummyExport {
	readonly columns: readonly string[];
	readonly records: readonly ExportRecord[];
}

/** Selected fields in preview order, then `note` when the preset labels its rows. */
export function dummyExport(
	rows: readonly DummyRow[],
	fields: readonly FieldId[],
	scenario: Scenario | null
): DummyExport {
	const getters = FIELD_IDS.filter((id) => fields.includes(id)).flatMap((id) => COLUMNS[id]);
	const withNote = scenario !== null && NOTED_SCENARIOS.includes(scenario);
	const columns = [...getters.map(([column]) => column), ...(withNote ? ['note'] : [])];
	const records = rows.map((row) => {
		const values = getters.map(([column, get]) => [column, get(row.person)]);
		if (withNote) values.push(['note', row.note ?? '']);
		return Object.fromEntries(values) as ExportRecord;
	});
	return { columns, records };
}

export interface RunInfo {
	readonly seed: string;
	readonly asOf: CivilDate;
}

/** What reproduces the run (FR-082): written as comments at the top of a SQL export. */
export function runInfoLines({ seed, asOf }: RunInfo): string[] {
	return [
		`QAnchor dummy data: fake, for testing only. Generator version ${GENERATOR_VERSION}.`,
		`Seed: ${seed}`,
		`Ages as of: ${isoDate(asOf)}`
	];
}

/** `qanchor-dummy-v1-<seed>`: the seed kept to letters, digits, `-`, and `_`, at most 32 characters. */
export function exportBaseName(seed: string): string {
	const safe = seed
		.replace(/[^A-Za-z0-9_-]+/g, '-')
		.slice(0, 32)
		.replace(/^-+|-+$/g, '');
	return `qanchor-dummy-v${GENERATOR_VERSION}${safe === '' ? '' : `-${safe}`}`;
}
