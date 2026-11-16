import { describe, expect, it } from 'vitest';
import { BANKS } from './data/banks.ts';
import { FEMALE_GIVEN_NAMES, MALE_GIVEN_NAMES, SECOND_NAMES } from './data/names.ts';
import { OPERATORS, UNALLOCATED_PREFIXES } from './data/phones.ts';
import { loadRegions } from './data/regions.ts';
import { civilFromDays, daysFromCivil, isoDate, randomDate } from './dates.ts';
import {
	generateNik,
	generatePerson,
	NON_COLLIDING_PROVINCE,
	type FieldOptions,
	type Person
} from './fields.ts';
import { rowRng, seedKey, type Rng } from './random.ts';

const regions = await loadRegions();

const OPTIONS: FieldOptions = {
	phoneFormat: 'national',
	npwpFormat: 'legacy',
	realism: 'realistic',
	birthDates: { from: { year: 1960, month: 1, day: 1 }, to: { year: 2007, month: 12, day: 31 } }
};

function people(count: number, options: Partial<FieldOptions> = {}, seed = 'fields'): Person[] {
	const key = seedKey(seed);
	return Array.from({ length: count }, (_, i) =>
		generatePerson(rowRng(key, i), regions, { ...OPTIONS, ...options })
	);
}

const SAMPLE = people(3000);
const realisticPrefixes = OPERATORS.flatMap((operator) => operator.prefixes);

function without(person: Person, ...keys: (keyof Person)[]) {
	return Object.fromEntries(
		Object.entries(person).filter(([key]) => !keys.includes(key as keyof Person))
	);
}

/** The kecamatan, kabupaten/kota, and province an address names, looked up in the dataset. */
function locate(person: Person) {
	for (const [regencyCode, regency, districts] of regions.regencies) {
		for (const [districtCode, district, villages] of districts) {
			for (const [, village, postal] of villages) {
				const { address } = person;
				if (
					address.village === village &&
					address.district === district &&
					address.regency === regency &&
					address.postalCode === postal
				) {
					const province = regions.provinces.find(([code]) => code === regencyCode.slice(0, 2))!;
					return { districtCode, province: province[1] };
				}
			}
		}
	}
	return null;
}

describe('dates (EC-016)', () => {
	it('day numbers match the Gregorian calendar, including leap days and century years', () => {
		for (let days = daysFromCivil({ year: 1899, month: 1, day: 1 }); days < 50_000; days += 7) {
			const date = civilFromDays(days);
			expect(isoDate(date)).toBe(new Date(days * 86_400_000).toISOString().slice(0, 10));
			expect(daysFromCivil(date)).toBe(days);
		}
		expect(civilFromDays(daysFromCivil({ year: 2000, month: 2, day: 29 }))).toEqual({
			year: 2000,
			month: 2,
			day: 29
		});
		const afterFeb1900 = daysFromCivil({ year: 1900, month: 2, day: 28 }) + 1;
		expect(isoDate(civilFromDays(afterFeb1900))).toBe('1900-03-01');
	});

	it('random dates stay in range and include 29 February when the range has one', () => {
		const rng = rowRng(seedKey('leap'), 0);
		const from = { year: 2024, month: 2, day: 28 };
		const to = { year: 2024, month: 3, day: 1 };
		const seen = new Set(Array.from({ length: 200 }, () => isoDate(randomDate(rng, from, to))));
		expect([...seen].sort()).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
	});
});

describe('FR-081 AC-1: names', () => {
	it('come from the dataset, with a given name of the row gender', () => {
		for (const { name, gender } of SAMPLE) {
			const [first, ...rest] = name.split(' ');
			const given: readonly string[] = gender === 'male' ? MALE_GIVEN_NAMES : FEMALE_GIVEN_NAMES;
			expect(given).toContain(first);
			expect(rest.length).toBeLessThanOrEqual(1);
			if (rest.length === 1) expect([...given, ...SECOND_NAMES]).toContain(rest[0]);
		}
	});

	it('include single-word names at a low rate, and never repeat a given name', () => {
		const single = SAMPLE.filter(({ name }) => !name.includes(' ')).length / SAMPLE.length;
		expect(single).toBeGreaterThan(0.05);
		expect(single).toBeLessThan(0.15);
		for (const { name } of SAMPLE) {
			const parts = name.split(' ');
			expect(new Set(parts).size).toBe(parts.length);
		}
	});

	it('cover both genders', () => {
		const male = SAMPLE.filter(({ gender }) => gender === 'male').length / SAMPLE.length;
		expect(male).toBeGreaterThan(0.45);
		expect(male).toBeLessThan(0.55);
	});
});

describe('FR-081 AC-2: phone numbers', () => {
	it('use an operator prefix and 10 to 13 digits in the national form', () => {
		for (const { phone } of SAMPLE) {
			expect(phone).toMatch(/^08\d{8,11}$/);
			expect(realisticPrefixes).toContain(phone.slice(0, 4));
		}
		const lengths = new Set(SAMPLE.map(({ phone }) => phone.length));
		expect([...lengths].sort()).toEqual([10, 11, 12, 13]);
	});

	it('the three formats write the same number', () => {
		const national = people(50);
		const plus = people(50, { phoneFormat: 'plus62' });
		const bare = people(50, { phoneFormat: 'sixtwo' });
		national.forEach(({ phone }, i) => {
			expect(plus[i].phone).toBe(`+62${phone.slice(1)}`);
			expect(bare[i].phone).toBe(`62${phone.slice(1)}`);
		});
		expect(plus[0].phone).toMatch(/^\+628\d{8,11}$/);
	});
});

describe('FR-081 AC-3: addresses', () => {
	it('name a village, kecamatan, kabupaten/kota, and province that belong together', () => {
		for (const person of SAMPLE.slice(0, 500)) {
			const found = locate(person);
			expect(found, person.address.full).not.toBeNull();
			expect(person.address.province).toBe(found!.province);
		}
	});

	it('have a street, three-digit RT and RW, a postal code, and one full line', () => {
		for (const { address } of SAMPLE) {
			expect(address.street).toMatch(/^Jl\. [A-Za-z ]+ No\. \d{1,3}$/);
			expect(address.rt).toMatch(/^0(0[1-9]|1[0-5])$/);
			expect(address.rw).toMatch(/^0(0[1-9]|10)$/);
			expect(address.postalCode).toMatch(/^\d{5}$/);
			expect(address.full).toBe(
				`${address.street}, RT ${address.rt}/RW ${address.rw}, ${address.village}, ` +
					`${address.district}, ${address.regency}, ${address.province} ${address.postalCode}`
			);
		}
	});
});

describe('FR-081 AC-4, AC-5: NIK', () => {
	it('is 16 digits: kecamatan code, DDMMYY with 40 added for women, and a sequence from 0001', () => {
		for (const person of SAMPLE) {
			expect(person.nik).toMatch(/^\d{16}$/);
			const [year, month, day] = person.birthDate.split('-').map(Number);
			const encodedDay = day + (person.gender === 'female' ? 40 : 0);
			expect(person.nik.slice(6, 12)).toBe(
				`${String(encodedDay).padStart(2, '0')}${String(month).padStart(2, '0')}${String(year % 100).padStart(2, '0')}`
			);
			const sequence = Number(person.nik.slice(12));
			expect(sequence).toBeGreaterThanOrEqual(1);
			expect(sequence).toBeLessThanOrEqual(9999);
		}
	});

	it('sequence numbers run from 0001 to 9999', () => {
		const edge = (pick: 'min' | 'max'): Rng => ({
			uint32: () => 0,
			below: (n) => (pick === 'min' ? 0 : n - 1),
			between: (min, max) => (pick === 'min' ? min : max),
			pick: (items) => items[0]
		});
		const birth = { year: 1990, month: 5, day: 17 };
		expect(generateNik(edge('min'), '11.01.01', birth, 'male', 'realistic')).toBe(
			'1101011705900001'
		);
		expect(generateNik(edge('max'), '11.01.01', birth, 'female', 'realistic')).toBe(
			'1101015705909999'
		);
	});

	it('agrees with the address region (AC-5)', () => {
		for (const person of SAMPLE.slice(0, 500)) {
			expect(person.nik.slice(0, 6)).toBe(locate(person)!.districtCode.replaceAll('.', ''));
		}
	});

	it('encodes a real calendar date, including a woman born on 29 February (EC-016)', () => {
		const leap = people(200, {
			birthDates: { from: { year: 2000, month: 2, day: 29 }, to: { year: 2000, month: 2, day: 29 } }
		});
		const woman = leap.find(({ gender }) => gender === 'female')!;
		expect(woman.nik.slice(6, 12)).toBe('690200');
		const man = leap.find(({ gender }) => gender === 'male')!;
		expect(man.nik.slice(6, 12)).toBe('290200');
	});
});

describe('FR-081 AC-6: NPWP', () => {
	it('legacy: 15 digits as XX.XXX.XXX.X-XXX.000', () => {
		for (const { npwp } of SAMPLE) expect(npwp).toMatch(/^\d{2}\.\d{3}\.\d{3}\.\d-\d{3}\.000$/);
	});

	it('16-digit: an individual NPWP equals the NIK', () => {
		for (const { npwp, nik } of people(100, { npwpFormat: 'nik' })) expect(npwp).toBe(nik);
	});
});

describe('FR-081 AC-7: bank accounts', () => {
	it('name a dataset bank and have that bank account length', () => {
		for (const { bank } of SAMPLE) {
			const known = BANKS.find(({ code }) => code === bank.code)!;
			expect(bank.name).toBe(known.name);
			expect(bank.account).toMatch(new RegExp(`^\\d{${known.accountLength}}$`));
		}
	});
});

describe('FR-081 AC-9: identifier realism', () => {
	const provinceCodes = regions.provinces.map(([code]) => code);

	it('realistic: NIK provinces and phone prefixes are assigned values', () => {
		for (const { nik, phone } of SAMPLE) {
			expect(provinceCodes).toContain(nik.slice(0, 2));
			expect(realisticPrefixes).toContain(phone.slice(0, 4));
		}
	});

	it('non-colliding: NIK province 00 and unallocated phone blocks, with everything else unchanged', () => {
		const safe = people(300, { realism: 'non-colliding' });
		const real = people(300);
		safe.forEach((person, i) => {
			expect(person.nik.slice(0, 2)).toBe(NON_COLLIDING_PROVINCE);
			expect(provinceCodes).not.toContain(person.nik.slice(0, 2));
			expect(person.nik.slice(2)).toBe(real[i].nik.slice(2));
			expect(UNALLOCATED_PREFIXES).toContain(person.phone.slice(0, 4));
			expect(without(person, 'nik', 'phone', 'npwp')).toEqual(
				without(real[i], 'nik', 'phone', 'npwp')
			);
		});
	});
});

describe('determinism (FR-082)', () => {
	it('the same seed gives the same people; another seed gives others', () => {
		expect(people(20)).toEqual(people(20));
		expect(people(20, {}, 'other')).not.toEqual(people(20));
	});

	it('changing the NPWP or phone format changes only that field', () => {
		const base = people(50);
		const changed = people(50, { npwpFormat: 'nik', phoneFormat: 'plus62' });
		changed.forEach((person, i) => {
			expect(without(person, 'npwp', 'phone')).toEqual(without(base[i], 'npwp', 'phone'));
		});
	});
});
