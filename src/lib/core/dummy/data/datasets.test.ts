import { describe, expect, it } from 'vitest';
import { BANKS } from './banks.ts';
import { FEMALE_GIVEN_NAMES, MALE_GIVEN_NAMES, SECOND_NAMES } from './names.ts';
import { NATIONAL_LENGTH, OPERATORS, UNALLOCATED_PREFIXES } from './phones.ts';
import { loadRegions } from './regions.ts';

const regions = await loadRegions();
const districts = regions.regencies.flatMap((regency) => regency[2]);
const villages = districts.flatMap((district) => district[2]);

describe('regions (FR-081 AC-3)', () => {
	it('covers all 38 provinces and 514 kabupaten/kota of Kepmendagri 300.2.2-2430 Tahun 2025', () => {
		expect(regions.provinces).toHaveLength(38);
		expect(regions.regencies).toHaveLength(514);
		expect(regions.regencies.filter(([, name]) => name.startsWith('Kota '))).toHaveLength(98);
		expect(regions.source.decree).toBe('Kepmendagri 300.2.2-2430 Tahun 2025');
		expect(regions.source.regions).toMatch(
			/^https:\/\/github\.com\/cahyadsn\/wilayah\/blob\/[0-9a-f]{40}\//
		);
	});

	it('every kabupaten/kota belongs to a listed province, and every province has one', () => {
		const provinceCodes = new Set(regions.provinces.map(([code]) => code));
		for (const [code] of regions.regencies) expect(provinceCodes).toContain(code.slice(0, 2));
		const used = new Set(regions.regencies.map(([code]) => code.slice(0, 2)));
		expect(used).toEqual(provinceCodes);
	});

	it('every sampled district and village sits under its parent code', () => {
		for (const [regencyCode, , regencyDistricts] of regions.regencies) {
			expect(regencyDistricts.length).toBeGreaterThanOrEqual(1);
			for (const [districtCode, , districtVillages] of regencyDistricts) {
				expect(districtCode.startsWith(`${regencyCode}.`)).toBe(true);
				expect(districtVillages.length).toBeGreaterThanOrEqual(1);
				for (const [villageCode] of districtVillages) {
					expect(villageCode.startsWith(`${districtCode}.`)).toBe(true);
				}
			}
		}
	});

	it('codes have the Kepmendagri shape, a NIK region code is the district code without dots', () => {
		expect(regions.provinces.every(([code]) => /^\d{2}$/.test(code))).toBe(true);
		expect(regions.regencies.every(([code]) => /^\d{2}\.\d{2}$/.test(code))).toBe(true);
		expect(districts.every(([code]) => /^\d{2}\.\d{2}\.\d{2}$/.test(code))).toBe(true);
		expect(villages.every(([code]) => /^\d{2}\.\d{2}\.\d{2}\.\d{4}$/.test(code))).toBe(true);
		expect(districts.every(([code]) => code.replaceAll('.', '').length === 6)).toBe(true);
	});

	it('codes are unique and every village has a five-digit postal code', () => {
		for (const list of [regions.provinces, regions.regencies, districts, villages]) {
			expect(new Set(list.map(([code]) => code)).size).toBe(list.length);
		}
		expect(villages.every(([, , postal]) => /^\d{5}$/.test(postal))).toBe(true);
	});

	it('names are trimmed and non-empty', () => {
		for (const [, name] of [
			...regions.provinces,
			...regions.regencies,
			...districts,
			...villages
		]) {
			expect(name).toBe(name.trim());
			expect(name.length).toBeGreaterThan(0);
		}
	});

	it('samples two districts per kabupaten/kota and two villages per district where they exist', () => {
		expect(districts).toHaveLength(1028);
		expect(villages.length).toBeGreaterThanOrEqual(2000);
	});
});

describe('names (FR-081 AC-1)', () => {
	const lists = { MALE_GIVEN_NAMES, FEMALE_GIVEN_NAMES, SECOND_NAMES };

	it('each list is non-empty, has no duplicates, and holds single trimmed words', () => {
		for (const list of Object.values(lists)) {
			expect(list.length).toBeGreaterThanOrEqual(25);
			expect(new Set(list).size).toBe(list.length);
			for (const name of list) expect(name).toMatch(/^[A-Z][a-z']+$/);
		}
	});

	it('includes an apostrophe name for SQL and CSV escaping (FR-083 AC-3)', () => {
		expect(MALE_GIVEN_NAMES).toContain("Ma'ruf");
	});
});

describe('phone prefixes (FR-081 AC-2, AC-9)', () => {
	const realistic = OPERATORS.flatMap((operator) => operator.prefixes);

	it('realistic prefixes follow the consumer NDC rule 08XY with X not 0, 4, 6', () => {
		for (const prefix of realistic) expect(prefix).toMatch(/^08[1235789]\d$/);
		expect(new Set(realistic).size).toBe(realistic.length);
	});

	it('non-colliding prefixes are the unallocated blocks and never a realistic one', () => {
		expect(UNALLOCATED_PREFIXES).toEqual(['0801', '0802', '0803', '0805']);
		for (const prefix of UNALLOCATED_PREFIXES) expect(realistic).not.toContain(prefix);
	});

	it('the length rule fits the regulated maximum of 13 digits after 62', () => {
		expect(NATIONAL_LENGTH.min).toBeGreaterThan(4);
		// `08…` with N digits is `+62 8…` with N - 1 digits after 62.
		expect(NATIONAL_LENGTH.max - 1).toBeLessThanOrEqual(13);
	});
});

describe('banks (FR-081 AC-7)', () => {
	it('have unique three-digit codes, a positive account length, and a source label', () => {
		expect(new Set(BANKS.map((bank) => bank.code)).size).toBe(BANKS.length);
		for (const bank of BANKS) {
			expect(bank.code).toMatch(/^\d{3}$/);
			expect(bank.accountLength).toBeGreaterThanOrEqual(8);
			expect(bank.source).toBe('secondary');
		}
	});
});
