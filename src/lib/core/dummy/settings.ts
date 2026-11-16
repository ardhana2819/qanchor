import { civilFromDays, daysFromCivil, type CivilDate } from './dates.ts';
import type { NpwpFormat, PhoneFormat, Realism } from './fields.ts';

// What a dummy-data run is generated from (FR-080, FR-082, FR-084). The same settings and seed on
// the same GENERATOR_VERSION always give the same rows.

export const MAX_ROWS = 10_000;
export const MAX_AGE = 120;

export type FieldId =
	'name' | 'gender' | 'birthDate' | 'phone' | 'address' | 'nik' | 'npwp' | 'bank';

/** Column order in the preview and exports. */
export const FIELD_IDS: readonly FieldId[] = [
	'name',
	'gender',
	'birthDate',
	'nik',
	'npwp',
	'phone',
	'address',
	'bank'
];

export type Scenario = 'kyc' | 'underage' | 'name-edge-cases' | 'invalid-formats' | 'duplicate-nik';

export interface AgeRange {
	readonly min: number;
	readonly max: number;
}

export interface Settings {
	readonly fields: readonly FieldId[];
	readonly count: number;
	readonly phoneFormat: PhoneFormat;
	readonly npwpFormat: NpwpFormat;
	readonly realism: Realism;
	/** Ages in whole years on `asOf`, both ends inclusive. */
	readonly ages: AgeRange;
	/**
	 * The date ages are counted from. Part of the settings, so a seed reproduces the same rows on
	 * any later day (FR-082 AC-1); the UI defaults it to today (decisions 2026-11-16).
	 */
	readonly asOf: CivilDate;
	/** The preset whose row rules apply, if any (FR-084). */
	readonly scenario: Scenario | null;
}

/** 17 is the age for a KTP; 10 to 16 is underage but old enough to try signing up (owner, 2026-11-16). */
export const ADULT_AGES: AgeRange = { min: 17, max: 70 };
export const UNDERAGE_AGES: AgeRange = { min: 10, max: 16 };

export function defaultSettings(asOf: CivilDate): Settings {
	return {
		fields: FIELD_IDS,
		count: 10,
		phoneFormat: 'national',
		npwpFormat: 'legacy',
		realism: 'realistic',
		ages: ADULT_AGES,
		asOf,
		scenario: null
	};
}

export interface Preset {
	readonly id: Scenario;
	readonly label: string;
	readonly description: string;
	/** Rows are deliberately invalid and the output is marked as negative-test data (FR-084 AC-3). */
	readonly negative: boolean;
	/** Sets fields and options; the user can still change them before generating (FR-084 AC-1). */
	readonly apply: (settings: Settings) => Settings;
}

export const PRESETS: readonly Preset[] = [
	{
		id: 'kyc',
		label: 'KYC happy path',
		description: 'Adults whose NIK agrees with their address, birth date, and gender.',
		negative: false,
		apply: (s) => ({
			...s,
			scenario: 'kyc',
			fields: FIELD_IDS,
			realism: 'realistic',
			ages: ADULT_AGES
		})
	},
	{
		id: 'underage',
		label: 'Underage',
		description: `People aged ${UNDERAGE_AGES.min} to ${UNDERAGE_AGES.max}, below the KTP age of 17.`,
		negative: false,
		apply: (s) => ({ ...s, scenario: 'underage', fields: FIELD_IDS, ages: UNDERAGE_AGES })
	},
	{
		id: 'name-edge-cases',
		label: 'Name edge cases',
		description: 'Single-word names, apostrophes, very long names, and names with titles.',
		negative: false,
		apply: (s) => ({ ...s, scenario: 'name-edge-cases', fields: ['name', 'gender'] })
	},
	{
		id: 'invalid-formats',
		label: 'Invalid formats',
		description: 'One wrong NIK or phone number per row, with the reason, for negative tests.',
		negative: true,
		apply: (s) => ({ ...s, scenario: 'invalid-formats', fields: ['name', 'nik', 'phone'] })
	},
	{
		id: 'duplicate-nik',
		label: 'Duplicate NIK',
		description:
			'Every second row reuses the NIK of the row before it, for unique-constraint tests.',
		negative: false,
		apply: (s) => ({
			...s,
			scenario: 'duplicate-nik',
			fields: ['name', 'birthDate', 'nik', 'address']
		})
	}
];

export type SettingsError =
	| { readonly code: 'count' }
	| { readonly code: 'no-fields' }
	| { readonly code: 'ages' }
	| { readonly code: 'as-of' }
	| { readonly code: 'needs-two-rows' }
	| { readonly code: 'needs-field'; readonly fields: readonly FieldId[] };

/** Every reason the settings cannot generate (FR-080 AC-2, FR-084 AC-5); empty when they can. */
export function settingsErrors(settings: Settings): SettingsError[] {
	const errors: SettingsError[] = [];
	const { count, fields, ages, scenario } = settings;
	if (!Number.isInteger(count) || count < 1 || count > MAX_ROWS) errors.push({ code: 'count' });
	if (fields.length === 0) errors.push({ code: 'no-fields' });
	const agesValid =
		Number.isInteger(ages.min) &&
		Number.isInteger(ages.max) &&
		ages.min >= 0 &&
		ages.min <= ages.max &&
		ages.max <= MAX_AGE;
	if (!agesValid) errors.push({ code: 'ages' });
	if (!isRealDate(settings.asOf)) errors.push({ code: 'as-of' });

	const needs = (required: readonly FieldId[]) => {
		if (!required.some((field) => fields.includes(field)))
			errors.push({ code: 'needs-field', fields: required });
	};
	if (scenario === 'duplicate-nik') {
		if (Number.isInteger(count) && count < 2) errors.push({ code: 'needs-two-rows' });
		needs(['nik']);
	}
	if (scenario === 'invalid-formats') needs(['nik', 'phone']);
	if (scenario === 'name-edge-cases') needs(['name']);
	return errors;
}

/** Birth dates of people whose age on `asOf` is within `ages` (whole years, both ends inclusive). */
export function birthDateRange(
	asOf: CivilDate,
	ages: AgeRange
): { from: CivilDate; to: CivilDate } {
	const dayAfter = civilFromDays(daysFromCivil(yearsBefore(asOf, ages.max + 1)) + 1);
	return { from: dayAfter, to: yearsBefore(asOf, ages.min) };
}

/** The same day `years` earlier; 29 February becomes 28 February in a common year. */
function yearsBefore(date: CivilDate, years: number): CivilDate {
	const year = date.year - years;
	const leapDayLost = date.month === 2 && date.day === 29 && !isLeapYear(year);
	return { year, month: date.month, day: leapDayLost ? 28 : date.day };
}

function isLeapYear(year: number): boolean {
	return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function isRealDate(date: CivilDate): boolean {
	if (![date.year, date.month, date.day].every(Number.isInteger)) return false;
	const roundTrip = civilFromDays(daysFromCivil(date));
	return (
		roundTrip.year === date.year && roundTrip.month === date.month && roundTrip.day === date.day
	);
}
