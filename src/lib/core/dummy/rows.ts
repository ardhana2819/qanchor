import {
	APOSTROPHE_NAMES,
	FEMALE_GIVEN_NAMES,
	MALE_GIVEN_NAMES,
	SECOND_NAMES,
	TITLES
} from './data/names.ts';
import type { Regions } from './data/regions.ts';
import {
	digits,
	formatPhone,
	generatePerson,
	nationalPhone,
	type Gender,
	type Person
} from './fields.ts';
import { rowRng, type Rng } from './random.ts';
import { birthDateRange, type Settings } from './settings.ts';

// One dummy row: a person from the field rules (FR-081), then the preset's row rule (FR-084). A row
// depends only on the seed key, its index, and the settings, never on the row count, so asking for
// more rows keeps the earlier ones (FR-082 AC-4).

export interface DummyRow {
	/** 1-based, as shown in the preview and used in notes. */
	readonly number: number;
	readonly person: Person;
	/** Why the row is invalid, or which edge case it is; null for ordinary rows. */
	readonly note: string | null;
	/** The row whose NIK this row reuses (duplicate NIK preset, FR-084 AC-4). */
	readonly duplicateOf: number | null;
}

export function generateRow(
	key: Uint8Array,
	index: number,
	regions: Regions,
	settings: Settings
): DummyRow {
	const rng = rowRng(key, index);
	const person = personFor(rng, regions, settings);
	const row: DummyRow = { number: index + 1, person, note: null, duplicateOf: null };

	switch (settings.scenario) {
		case 'name-edge-cases':
			return { ...row, ...nameEdgeCase(rng, person) };
		case 'invalid-formats':
			return { ...row, ...invalidFormat(rng, person, settings) };
		case 'duplicate-nik':
			return index % 2 === 1 ? duplicateNik(row, key, index, regions, settings) : row;
		default:
			return row;
	}
}

function personFor(rng: Rng, regions: Regions, settings: Settings): Person {
	return generatePerson(rng, regions, {
		phoneFormat: settings.phoneFormat,
		npwpFormat: settings.npwpFormat,
		realism: settings.realism,
		birthDates: birthDateRange(settings.asOf, settings.ages)
	});
}

/** Row 2k + 2 reuses the NIK of row 2k + 1; the rest of the person is its own (FR-084 AC-4). */
function duplicateNik(
	row: DummyRow,
	key: Uint8Array,
	index: number,
	regions: Regions,
	settings: Settings
): DummyRow {
	const { nik } = personFor(rowRng(key, index - 1), regions, settings);
	const npwp = settings.npwpFormat === 'nik' ? nik : row.person.npwp;
	return {
		...row,
		person: { ...row.person, nik, npwp },
		note: `Same NIK as row ${index}.`,
		duplicateOf: index
	};
}

type Change = Pick<DummyRow, 'person' | 'note'>;

const NAME_CASES: readonly ((rng: Rng, person: Person) => Change)[] = [
	(rng, person) => ({
		person: { ...person, name: givenName(rng, person.gender) },
		note: 'Single-word name.'
	}),
	(rng, person) => ({
		person: {
			...person,
			name: `${givenName(rng, person.gender)} ${rng.pick(APOSTROPHE_NAMES[person.gender])}`
		},
		note: 'Name with an apostrophe.'
	}),
	(rng, person) => {
		const name = longName(rng, person.gender);
		return { person: { ...person, name }, note: `Very long name (${name.length} characters).` };
	},
	(rng, person) => {
		const name = `${rng.pick(TITLES.before[person.gender])} ${person.name}, ${rng.pick(TITLES.after)}`;
		return { person: { ...person, name }, note: 'Name with titles before and after it.' };
	}
];

function nameEdgeCase(rng: Rng, person: Person): Change {
	return rng.pick(NAME_CASES)(rng, person);
}

function givenName(rng: Rng, gender: Gender): string {
	return rng.pick(gender === 'male' ? MALE_GIVEN_NAMES : FEMALE_GIVEN_NAMES);
}

/** At least 60 characters from distinct given and second names. */
function longName(rng: Rng, gender: Gender): string {
	const pool: string[] = [
		...(gender === 'male' ? MALE_GIVEN_NAMES : FEMALE_GIVEN_NAMES),
		...SECOND_NAMES
	];
	const parts: string[] = [];
	while (parts.join(' ').length < 60) {
		const part = rng.pick(pool.filter((name) => !parts.includes(name)));
		parts.push(part);
	}
	return parts.join(' ');
}

interface InvalidCase {
	readonly field: 'nik' | 'phone';
	readonly apply: (rng: Rng, person: Person, settings: Settings) => Change;
}

/** Province codes run from 11 to 96 (Kepmendagri 300.2.2-2430 Tahun 2025), so 99 is not assigned. */
const UNASSIGNED_PROVINCE = '99';

const INVALID_CASES: readonly InvalidCase[] = [
	{
		field: 'nik',
		apply: (_, person) => ({
			person: { ...person, nik: person.nik.slice(0, 15) },
			note: 'NIK has 15 digits instead of 16.'
		})
	},
	{
		field: 'nik',
		apply: (rng, person) => ({
			person: { ...person, nik: person.nik + digits(rng, 1) },
			note: 'NIK has 17 digits instead of 16.'
		})
	},
	{
		field: 'nik',
		apply: (_, person) => {
			const day = person.gender === 'female' ? '71' : '31';
			return {
				person: { ...person, nik: `${person.nik.slice(0, 6)}${day}02${person.nik.slice(10)}` },
				note: `NIK birth date is 31 February${person.gender === 'female' ? ' (written 71 for a woman)' : ''}, which does not exist.`
			};
		}
	},
	{
		field: 'nik',
		apply: (_, person) => ({
			person: { ...person, nik: UNASSIGNED_PROVINCE + person.nik.slice(2) },
			note: `NIK region code starts with ${UNASSIGNED_PROVINCE}, which is not an assigned province.`
		})
	},
	{
		field: 'phone',
		apply: (_, person, settings) => ({
			person: {
				...person,
				phone: formatPhone(`0800${nationalPhone(person.phone).slice(4)}`, settings.phoneFormat)
			},
			note: 'Phone prefix 0800 is a toll-free service code, not a mobile network.'
		})
	},
	{
		field: 'phone',
		apply: (_, person, settings) => ({
			person: {
				...person,
				phone: formatPhone(nationalPhone(person.phone).slice(0, 9), settings.phoneFormat)
			},
			note: 'Phone number has 9 digits in the 08… form; mobile numbers have 10 to 13.'
		})
	},
	{
		field: 'phone',
		apply: (rng, person, settings) => {
			const national = nationalPhone(person.phone);
			const long = national + digits(rng, 15 - national.length);
			return {
				person: { ...person, phone: formatPhone(long, settings.phoneFormat) },
				note: 'Phone number has 14 digits after 62; the maximum is 13.'
			};
		}
	}
];

/** One defect per row, in a field the user selected (FR-084 AC-3). */
function invalidFormat(rng: Rng, person: Person, settings: Settings): Change {
	const cases = INVALID_CASES.filter(({ field }) => settings.fields.includes(field));
	return rng.pick(cases).apply(rng, person, settings);
}
