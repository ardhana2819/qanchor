import { describe, expect, it } from 'vitest';
import { loadRegions } from './data/regions.ts';
import { daysFromCivil, type CivilDate } from './dates.ts';
import { nationalPhone } from './fields.ts';
import { seedKey } from './random.ts';
import { generateRow, type DummyRow } from './rows.ts';
import {
	ADULT_AGES,
	birthDateRange,
	defaultSettings,
	FIELD_IDS,
	MAX_ROWS,
	PRESETS,
	settingsErrors,
	UNDERAGE_AGES,
	type Scenario,
	type Settings
} from './settings.ts';

const regions = await loadRegions();
const AS_OF: CivilDate = { year: 2026, month: 11, day: 16 };
const BASE = defaultSettings(AS_OF);
const preset = (id: Scenario) => PRESETS.find((p) => p.id === id)!;
const withPreset = (id: Scenario, changes: Partial<Settings> = {}) => ({
	...preset(id).apply(BASE),
	...changes
});

function rows(settings: Settings, count = settings.count, seed = 'rows'): DummyRow[] {
	const key = seedKey(seed);
	return Array.from({ length: count }, (_, i) => generateRow(key, i, regions, settings));
}

/** Whole years between a `YYYY-MM-DD` birth date and `asOf`. */
function age(birthDate: string, asOf: CivilDate): number {
	const [year, month, day] = birthDate.split('-').map(Number);
	const hadBirthday = asOf.month > month || (asOf.month === month && asOf.day >= day);
	return asOf.year - year - (hadBirthday ? 0 : 1);
}

describe('birthDateRange', () => {
	it('spans exactly the people aged min to max on the as-of date', () => {
		expect(birthDateRange(AS_OF, { min: 17, max: 70 })).toEqual({
			from: { year: 1955, month: 11, day: 17 },
			to: { year: 2009, month: 11, day: 16 }
		});
		expect(age('1955-11-17', AS_OF)).toBe(70);
		expect(age('1955-11-16', AS_OF)).toBe(71);
		expect(age('2009-11-16', AS_OF)).toBe(17);
		expect(age('2009-11-17', AS_OF)).toBe(16);
	});

	it('counts from 28 February when the as-of date is 29 February and the year is common', () => {
		const leapDay = { year: 2028, month: 2, day: 29 };
		expect(birthDateRange(leapDay, { min: 17, max: 17 })).toEqual({
			from: { year: 2010, month: 3, day: 1 },
			to: { year: 2011, month: 2, day: 28 }
		});
		// 2000 is a leap year (divisible by 400), so 29 February stays.
		expect(birthDateRange(leapDay, { min: 28, max: 28 }).to).toEqual({
			year: 2000,
			month: 2,
			day: 29
		});
	});
});

describe('settingsErrors (FR-080 AC-2, FR-084 AC-5)', () => {
	it('accepts the defaults and every preset with enough rows', () => {
		expect(settingsErrors(BASE)).toEqual([]);
		for (const { id } of PRESETS) expect(settingsErrors(withPreset(id, { count: 2 }))).toEqual([]);
	});

	it('rejects a row count outside 1 to 10,000 or not a whole number', () => {
		for (const count of [0, -1, 1.5, MAX_ROWS + 1, Number.NaN]) {
			expect(settingsErrors({ ...BASE, count })).toEqual([{ code: 'count' }]);
		}
		expect(settingsErrors({ ...BASE, count: 1 })).toEqual([]);
		expect(settingsErrors({ ...BASE, count: MAX_ROWS })).toEqual([]);
	});

	it('rejects no fields, a bad age range, and a date that does not exist', () => {
		expect(settingsErrors({ ...BASE, fields: [] })).toEqual([{ code: 'no-fields' }]);
		for (const ages of [
			{ min: 20, max: 19 },
			{ min: -1, max: 5 },
			{ min: 0, max: 121 },
			{ min: 1.5, max: 5 }
		]) {
			expect(settingsErrors({ ...BASE, ages })).toEqual([{ code: 'ages' }]);
		}
		expect(settingsErrors({ ...BASE, ages: { min: 0, max: 120 } })).toEqual([]);
		expect(settingsErrors({ ...BASE, asOf: { year: 2026, month: 2, day: 29 } })).toEqual([
			{ code: 'as-of' }
		]);
	});

	it('AC-5: the duplicate NIK preset needs at least 2 rows and the NIK field', () => {
		expect(settingsErrors(withPreset('duplicate-nik', { count: 1 }))).toEqual([
			{ code: 'needs-two-rows' }
		]);
		expect(settingsErrors(withPreset('duplicate-nik', { count: 2, fields: ['name'] }))).toEqual([
			{ code: 'needs-field', fields: ['nik'] }
		]);
	});

	it('presets that change a field need that field selected', () => {
		expect(settingsErrors(withPreset('invalid-formats', { fields: ['name'] }))).toEqual([
			{ code: 'needs-field', fields: ['nik', 'phone'] }
		]);
		expect(settingsErrors(withPreset('invalid-formats', { fields: ['phone'] }))).toEqual([]);
		expect(settingsErrors(withPreset('name-edge-cases', { fields: ['nik'] }))).toEqual([
			{ code: 'needs-field', fields: ['name'] }
		]);
	});
});

describe('FR-084 AC-1: presets set fields and options, which stay editable', () => {
	it('each preset sets its scenario, fields, and ages', () => {
		expect(withPreset('kyc')).toMatchObject({
			scenario: 'kyc',
			fields: FIELD_IDS,
			realism: 'realistic',
			ages: ADULT_AGES
		});
		expect(withPreset('underage')).toMatchObject({ scenario: 'underage', ages: UNDERAGE_AGES });
		expect(withPreset('name-edge-cases').fields).toEqual(['name', 'gender']);
		expect(withPreset('invalid-formats').fields).toEqual(['name', 'nik', 'phone']);
		expect(withPreset('duplicate-nik').fields).toEqual(['name', 'birthDate', 'nik', 'address']);
		expect(PRESETS.filter((p) => p.negative).map((p) => p.id)).toEqual(['invalid-formats']);
	});

	it('keeps the options it does not own, and a later change wins', () => {
		const custom = { ...BASE, phoneFormat: 'plus62' as const, count: 42 };
		const applied = preset('underage').apply(custom);
		expect(applied).toMatchObject({ phoneFormat: 'plus62', count: 42 });
		const edited = { ...applied, ages: { min: 15, max: 15 } };
		for (const row of rows(edited, 30)) expect(age(row.person.birthDate, AS_OF)).toBe(15);
	});
});

describe('age presets', () => {
	it('KYC happy path: adults 17 to 70 with a consistent NIK and no note', () => {
		for (const { person, note, duplicateOf } of rows(withPreset('kyc'), 500)) {
			const years = age(person.birthDate, AS_OF);
			expect(years).toBeGreaterThanOrEqual(17);
			expect(years).toBeLessThanOrEqual(70);
			expect(person.nik).toMatch(/^\d{16}$/);
			expect([note, duplicateOf]).toEqual([null, null]);
		}
	});

	it('Underage: everyone is 10 to 16 on the as-of date', () => {
		const ages = rows(withPreset('underage'), 500).map(({ person }) =>
			age(person.birthDate, AS_OF)
		);
		expect(Math.min(...ages)).toBe(10);
		expect(Math.max(...ages)).toBe(16);
	});
});

describe('Name edge cases', () => {
	const sample = rows(withPreset('name-edge-cases'), 400);

	it('produces all four cases, each with a note', () => {
		const notes = new Set(
			sample.map(({ note }) => note!.replace(/\(\d+ characters\)/, '(n characters)'))
		);
		expect([...notes].sort()).toEqual([
			'Name with an apostrophe.',
			'Name with titles before and after it.',
			'Single-word name.',
			'Very long name (n characters).'
		]);
	});

	it('each name matches its case', () => {
		for (const { person, note } of sample) {
			if (note === 'Single-word name.') expect(person.name).not.toContain(' ');
			if (note === 'Name with an apostrophe.') expect(person.name).toContain("'");
			if (note!.startsWith('Very long name')) {
				expect(person.name.length).toBeGreaterThanOrEqual(60);
				expect(note).toBe(`Very long name (${person.name.length} characters).`);
				const parts = person.name.split(' ');
				expect(new Set(parts).size).toBe(parts.length);
			}
			if (note === 'Name with titles before and after it.') {
				expect(person.name).toMatch(
					/^(Dr\.|Ir\.|Prof\. Dr\.|H\.|Hj\.) .+, S\.|^(Dr\.|Ir\.|Prof\. Dr\.|H\.|Hj\.) .+, M\./
				);
				expect(person.name.startsWith(person.gender === 'male' ? 'Hj.' : 'H. ')).toBe(false);
			}
		}
	});
});

describe('FR-084 AC-3: invalid formats', () => {
	const sample = rows(withPreset('invalid-formats'), 600);

	it('every row has exactly one reason, and every defect kind appears', () => {
		const kinds = new Set(sample.map(({ note }) => note!.split(' ').slice(0, 4).join(' ')));
		expect(kinds.size).toBe(7);
		expect(sample.every(({ note }) => note !== null && note.length > 0)).toBe(true);
	});

	it('each reason describes the value in its row', () => {
		for (const { person, note } of sample) {
			const national = nationalPhone(person.phone);
			if (note === 'NIK has 15 digits instead of 16.') expect(person.nik).toMatch(/^\d{15}$/);
			else if (note === 'NIK has 17 digits instead of 16.') expect(person.nik).toMatch(/^\d{17}$/);
			else if (note!.startsWith('NIK birth date is 31 February')) {
				expect(person.nik.slice(6, 10)).toBe(person.gender === 'female' ? '7102' : '3102');
			} else if (note!.startsWith('NIK region code')) expect(person.nik).toMatch(/^99\d{14}$/);
			else if (note!.startsWith('Phone prefix 0800')) expect(national).toMatch(/^0800\d{6,9}$/);
			else if (note!.startsWith('Phone number has 9 digits')) expect(national).toMatch(/^08\d{7}$/);
			else if (note!.startsWith('Phone number has 14 digits'))
				expect(national).toMatch(/^08\d{13}$/);
			else throw new Error(`unexpected note: ${note}`);
			// The other field stays valid.
			if (note!.startsWith('NIK')) expect(national).toMatch(/^08[1235789]\d{7,10}$/);
			else expect(person.nik).toMatch(/^\d{16}$/);
		}
	});

	it('only uses defects in the selected fields, written in the chosen phone format', () => {
		const phoneOnly = rows(
			withPreset('invalid-formats', { fields: ['phone'], phoneFormat: 'plus62' }),
			100
		);
		for (const { person, note } of phoneOnly) {
			expect(note).toMatch(/^Phone/);
			expect(person.phone.startsWith('+62')).toBe(true);
		}
		const nikOnly = rows(withPreset('invalid-formats', { fields: ['nik'] }), 100);
		for (const { note } of nikOnly) expect(note).toMatch(/^NIK/);
	});
});

describe('FR-084 AC-4: duplicate NIK', () => {
	const sample = rows(withPreset('duplicate-nik'), 21);

	it('every second row reuses the NIK of the row before it and says which', () => {
		for (const [i, row] of sample.entries()) {
			if (i % 2 === 0) {
				expect([row.note, row.duplicateOf]).toEqual([null, null]);
				continue;
			}
			const original = sample[i - 1];
			expect(row.person.nik).toBe(original.person.nik);
			expect(row.duplicateOf).toBe(original.number);
			expect(row.note).toBe(`Same NIK as row ${original.number}.`);
			expect(
				row.person.name === original.person.name &&
					row.person.address.full === original.person.address.full
			).toBe(false);
		}
	});

	it('an NPWP equal to the NIK is duplicated with it', () => {
		const sameNpwp = rows(withPreset('duplicate-nik', { npwpFormat: 'nik' }), 4);
		expect(sameNpwp[1].person.npwp).toBe(sameNpwp[0].person.nik);
	});

	it('N = 2 already contains a duplicate', () => {
		const two = rows(withPreset('duplicate-nik'), 2);
		expect(two[0].person.nik).toBe(two[1].person.nik);
	});
});

describe('determinism with presets (FR-082, FR-084 AC-2)', () => {
	it('the same seed and settings give the same rows; more rows keep the earlier ones', () => {
		for (const { id } of PRESETS) {
			const settings = withPreset(id);
			const ten = rows(settings, 10);
			expect(rows(settings, 10)).toEqual(ten);
			expect(rows(settings, 20).slice(0, 10)).toEqual(ten);
			expect(rows(settings, 10, 'other')).not.toEqual(ten);
		}
	});

	it('the as-of date is part of the settings: another date shifts birth dates, the same date does not', () => {
		const later = { ...BASE, asOf: { year: 2027, month: 11, day: 16 } };
		const a = rows(BASE, 5);
		expect(rows({ ...BASE }, 5)).toEqual(a);
		const b = rows(later, 5);
		a.forEach((row, i) => {
			const shift =
				daysFromCivil(toCivil(b[i].person.birthDate)) -
				daysFromCivil(toCivil(row.person.birthDate));
			expect(shift).not.toBe(0);
		});
	});
});

function toCivil(iso: string): CivilDate {
	const [year, month, day] = iso.split('-').map(Number);
	return { year, month, day };
}
