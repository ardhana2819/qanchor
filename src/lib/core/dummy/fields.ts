import { BANKS } from './data/banks.ts';
import { FEMALE_GIVEN_NAMES, MALE_GIVEN_NAMES, SECOND_NAMES } from './data/names.ts';
import { NATIONAL_LENGTH, OPERATORS, UNALLOCATED_PREFIXES } from './data/phones.ts';
import type { Regions } from './data/regions.ts';
import { STREET_NAMES } from './data/streets.ts';
import { pad2, isoDate, randomDate, type CivilDate } from './dates.ts';
import type { Rng } from './random.ts';

// Field rules for one dummy person (FR-081). A row draws every attribute in a fixed order, whatever
// fields the user selected, so changing the selection never changes the values in other columns.

export type Gender = 'male' | 'female';
/** `+62812…`, `0812…`, or `62812…` (FR-081 AC-2). */
export type PhoneFormat = 'plus62' | 'national' | 'sixtwo';
/** 15-digit legacy `XX.XXX.XXX.X-XXX.XXX`, or 16-digit equal to the NIK (FR-081 AC-6). */
export type NpwpFormat = 'legacy' | 'nik';
/** FR-081 AC-9. */
export type Realism = 'realistic' | 'non-colliding';

export interface FieldOptions {
	readonly phoneFormat: PhoneFormat;
	readonly npwpFormat: NpwpFormat;
	readonly realism: Realism;
	/** Birth dates are drawn uniformly from this range, both ends inclusive. */
	readonly birthDates: { readonly from: CivilDate; readonly to: CivilDate };
}

export interface Address {
	readonly street: string;
	/** Three digits, as written on a KTP. */
	readonly rt: string;
	readonly rw: string;
	readonly village: string;
	readonly district: string;
	readonly regency: string;
	readonly province: string;
	readonly postalCode: string;
	/** One line with every part, comma-separated. */
	readonly full: string;
}

export interface Person {
	readonly name: string;
	readonly gender: Gender;
	/** `YYYY-MM-DD`. */
	readonly birthDate: string;
	readonly phone: string;
	readonly address: Address;
	readonly nik: string;
	readonly npwp: string;
	readonly bank: { readonly name: string; readonly code: string; readonly account: string };
}

/**
 * Province code for non-colliding NIKs. Kepmendagri codes start at 11, so `00` is not assigned and
 * a NIK with it cannot belong to anyone. The kabupaten and kecamatan digits still come from the
 * address; only the province part differs from it (decisions 2026-11-16).
 */
export const NON_COLLIDING_PROVINCE = '00';

/** Female birth days are written with 40 added in a NIK (FR-081 AC-4). */
const FEMALE_DAY_OFFSET = 40;

export function generatePerson(rng: Rng, regions: Regions, options: FieldOptions): Person {
	const gender: Gender = rng.below(2) === 0 ? 'male' : 'female';
	const birth = randomDate(rng, options.birthDates.from, options.birthDates.to);
	const name = generateName(rng, gender);
	const { address, districtCode } = generateAddress(rng, regions);
	const nik = generateNik(rng, districtCode, birth, gender, options.realism);
	const npwp = generateNpwp(rng, nik, options.npwpFormat);
	const bank = generateBank(rng);
	// Last: the realism setting changes how many values the prefix draw takes.
	const phone = generatePhone(rng, options.phoneFormat, options.realism);
	return { name, gender, birthDate: isoDate(birth), phone, address, nik, npwp, bank };
}

/**
 * One given name alone (about 1 in 10, common in Indonesia), two given names (about 2 in 10), or a
 * given name and a second name (FR-081 AC-1).
 */
export function generateName(rng: Rng, gender: Gender): string {
	const given = gender === 'male' ? MALE_GIVEN_NAMES : FEMALE_GIVEN_NAMES;
	const first = rng.pick(given);
	const shape = rng.below(10);
	if (shape === 0) return first;
	if (shape <= 2) {
		const others = given.filter((name) => name !== first);
		return `${first} ${rng.pick(others)}`;
	}
	return `${first} ${rng.pick(SECOND_NAMES)}`;
}

export function generateAddress(
	rng: Rng,
	regions: Regions
): { address: Address; districtCode: string } {
	const [regencyCode, regency, districts] = rng.pick(regions.regencies);
	const [districtCode, district, villages] = rng.pick(districts);
	const [, village, postalCode] = rng.pick(villages);
	const province = regions.provinces.find(([code]) => code === regencyCode.slice(0, 2))![1];
	const street = `Jl. ${rng.pick(STREET_NAMES)} No. ${rng.between(1, 200)}`;
	const rt = pad3(rng.between(1, 15));
	const rw = pad3(rng.between(1, 10));
	const full = `${street}, RT ${rt}/RW ${rw}, ${village}, ${district}, ${regency}, ${province} ${postalCode}`;
	return {
		address: { street, rt, rw, village, district, regency, province, postalCode, full },
		districtCode
	};
}

/**
 * 16 digits: the 6-digit kecamatan code, the birth date as DDMMYY with 40 added to the day for
 * women, and a sequence number from 0001 (FR-081 AC-4, AC-5, AC-9).
 */
export function generateNik(
	rng: Rng,
	districtCode: string,
	birth: CivilDate,
	gender: Gender,
	realism: Realism
): string {
	const region = districtCode.replaceAll('.', '');
	const regionCode = realism === 'realistic' ? region : NON_COLLIDING_PROVINCE + region.slice(2);
	const day = birth.day + (gender === 'female' ? FEMALE_DAY_OFFSET : 0);
	const date = `${pad2(day)}${pad2(birth.month)}${pad2(birth.year % 100)}`;
	return `${regionCode}${date}${String(rng.between(1, 9999)).padStart(4, '0')}`;
}

/**
 * Legacy: 2 digits taxpayer type, 6 serial, 1 check digit, 3 tax office, 3 branch status (`000`
 * for a single taxpayer). DJP publishes no check-digit rule, so the format is valid but the check
 * digit is random (decisions 2026-11-16). 16-digit: an individual's NPWP is the NIK.
 */
export function generateNpwp(rng: Rng, nik: string, format: NpwpFormat): string {
	// Drawn in both formats, so switching the format leaves the later fields unchanged.
	const legacy = digits(rng, 12);
	if (format === 'nik') return nik;
	return `${legacy.slice(0, 2)}.${legacy.slice(2, 5)}.${legacy.slice(5, 8)}.${legacy[8]}-${legacy.slice(9, 12)}.000`;
}

/** `08XY` prefix and 10 to 13 digits in the national form (FR-081 AC-2, AC-9). */
export function generatePhone(rng: Rng, format: PhoneFormat, realism: Realism): string {
	const prefix =
		realism === 'realistic'
			? rng.pick(rng.pick(OPERATORS).prefixes)
			: rng.pick(UNALLOCATED_PREFIXES);
	const length = rng.between(NATIONAL_LENGTH.min, NATIONAL_LENGTH.max);
	return formatPhone(prefix + digits(rng, length - prefix.length), format);
}

/** Writes a national `08…` number in the chosen format. */
export function formatPhone(national: string, format: PhoneFormat): string {
	const significant = national.slice(1);
	if (format === 'national') return national;
	return format === 'plus62' ? `+62${significant}` : `62${significant}`;
}

/** The national `08…` form of a number in any of the three formats. */
export function nationalPhone(phone: string): string {
	return `0${phone.replace(/^\+?62/, '').replace(/^0/, '')}`;
}

/** A bank from the dataset and an account number of its length; no checksum (FR-081 AC-7). */
export function generateBank(rng: Rng): Person['bank'] {
	const bank = rng.pick(BANKS);
	return { name: bank.name, code: bank.code, account: digits(rng, bank.accountLength) };
}

export function digits(rng: Rng, count: number): string {
	let out = '';
	for (let i = 0; i < count; i++) out += rng.below(10);
	return out;
}

function pad3(value: number): string {
	return String(value).padStart(3, '0');
}
