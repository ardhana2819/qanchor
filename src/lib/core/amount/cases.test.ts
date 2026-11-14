import { describe, expect, it } from 'vitest';
import { generateAmountCases, type AmountCases } from './cases.ts';
import { parseAmount } from './decimal.ts';

const inputs = (result: AmountCases) => result.cases.map((c) => c.input);
const find = (result: AmountCases, purpose: RegExp) =>
	result.cases.find((c) => purpose.test(c.purpose))?.input;
const omittedNames = (result: AmountCases) => result.omitted.flatMap((o) => o.cases);

describe('generateAmountCases: decimals only (FR-021 AC-1)', () => {
	const usdt = generateAmountCases({ decimals: 6 });

	it('lists every AC-1 case, in a stable order', () => {
		expect(inputs(usdt)).toEqual([
			'0.000001',
			'1.123456',
			'1.1234567',
			'0',
			'-1',
			'0001',
			' 1 ',
			'1,5',
			'1,000.50',
			'1.000,50',
			'1e-7'
		]);
	});

	it('gives every case a category and a purpose that does not prescribe the outcome (AC-4)', () => {
		for (const c of usdt.cases) {
			expect(c.category).toBeTruthy();
			expect(c.purpose).toMatch(/\.$/);
			expect(c.purpose).not.toMatch(/\b(must|should|accept|reject)/i);
		}
	});

	it('the smallest unit and the exact-D value parse at D; D + 1 places is one too many', () => {
		expect(parseAmount(find(usdt, /^Smallest/)!, 6)).toEqual({ ok: true, value: 1n });
		expect(parseAmount(find(usdt, /^Uses all/)!, 6).ok).toBe(true);
		expect(parseAmount(find(usdt, /^One decimal place more/)!, 6)).toEqual({
			ok: false,
			error: { code: 'too-precise', maxDecimals: 6 }
		});
	});

	it('keeps the whitespace case byte for byte (FR-022 AC-1)', () => {
		expect(usdt.cases.find((c) => c.input.trim() !== c.input)?.input).toBe(' 1 ');
	});

	it('omits every balance, fee, minimum, and maximum case with the reason (FR-020 AC-3)', () => {
		expect(usdt.omitted).toEqual([
			{
				cases: [
					'Exactly the balance',
					'Balance plus one unit',
					'Balance minus fee',
					'Balance minus fee plus one unit'
				],
				reason: 'No balance set.'
			},
			{ cases: ['Fee greater than balance'], reason: 'No network fee set.' },
			{ cases: ['Minimum', 'Minimum minus one unit'], reason: 'No minimum set.' },
			{ cases: ['Maximum', 'Maximum plus one unit'], reason: 'No maximum set.' }
		]);
	});
});

describe('generateAmountCases: decimals at the limits (EC-012)', () => {
	it('D = 0: the smallest unit is 1, and no valid fractional case is generated', () => {
		const result = generateAmountCases({ decimals: 0 });

		expect(find(result, /^Smallest/)).toBe('1');
		expect(result.cases.some((c) => /^Uses all/.test(c.purpose))).toBe(false);
		expect(omittedNames(result)).toContain('Exactly 0 decimal places');
		// Every fractional input left is there to be rejected for a 0-decimal token.
		for (const c of result.cases.filter((c) => /^\d+\.\d+$/.test(c.input))) {
			expect(parseAmount(c.input, 0).ok).toBe(false);
		}
	});

	it('D = 18 and D = 36 use exactly D places, and D + 1 is one more', () => {
		for (const d of [18, 36]) {
			const result = generateAmountCases({ decimals: d });
			expect(find(result, /^Smallest/)).toBe(`0.${'0'.repeat(d - 1)}1`);
			expect(find(result, /^Uses all/)!.split('.')[1]).toHaveLength(d);
			expect(find(result, /^One decimal place more/)!.split('.')[1]).toHaveLength(d + 1);
		}
	});

	it('D = 1 says "1 decimal place"', () => {
		expect(find(generateAmountCases({ decimals: 1 }), /^Uses all/)).toBe('1.1');
		expect(generateAmountCases({ decimals: 1 }).cases[1].purpose).toBe(
			'Uses all 1 decimal place the token allows.'
		);
	});
});

describe('generateAmountCases: balance and fee (FR-021 AC-2)', () => {
	// Balance 10 USDT, fee 1.5 USDT, 6 decimals.
	const result = generateAmountCases({ decimals: 6, balance: 10_000_000n, fee: 1_500_000n });

	it('lists exactly B, B + 1 unit, B - F, B - F + 1 unit, and a balance below the fee', () => {
		expect(
			result.cases.filter((c) => c.category === 'Balance and fee').map((c) => c.input)
		).toEqual(['10', '10.000001', '8.5', '8.500001', '1.499999']);
	});

	it('omits no balance or fee case', () => {
		expect(omittedNames(result)).not.toContain('Balance minus fee');
		expect(omittedNames(result)).not.toContain('Fee greater than balance');
	});

	it('with a balance and no fee, omits the fee cases with the reason', () => {
		const noFee = generateAmountCases({ decimals: 6, balance: 1n });
		expect(find(noFee, /^Exactly the balance/)).toBe('0.000001');
		expect(noFee.omitted).toContainEqual({
			cases: ['Balance minus fee', 'Balance minus fee plus one unit'],
			reason: 'No network fee set.'
		});
		expect(noFee.omitted).toContainEqual({
			cases: ['Fee greater than balance'],
			reason: 'No network fee set.'
		});
	});

	it('with a fee and no balance, still gives a balance below the fee', () => {
		const feeOnly = generateAmountCases({ decimals: 6, fee: 1_500_000n });
		expect(find(feeOnly, /^Use as the balance/)).toBe('1.499999');
		expect(omittedNames(feeOnly)).toContain('Exactly the balance');
	});

	it('with the fee above the balance, omits balance minus fee as negative', () => {
		const result = generateAmountCases({ decimals: 6, balance: 1_000_000n, fee: 2_000_000n });
		expect(result.omitted).toContainEqual({
			cases: ['Balance minus fee', 'Balance minus fee plus one unit'],
			reason: 'The fee is greater than the balance, so balance minus fee is negative.'
		});
		expect(result.cases.every((c) => !c.input.startsWith('-') || c.input === '-1')).toBe(true);
	});

	it('with the fee equal to the balance, balance minus fee is 0', () => {
		const result = generateAmountCases({ decimals: 6, balance: 5n, fee: 5n });
		expect(find(result, /^Balance minus fee:/)).toBe('0');
		expect(find(result, /^One base unit more than balance minus fee/)).toBe('0.000001');
	});

	it('with a fee of 0, omits the balance-below-fee case', () => {
		const result = generateAmountCases({ decimals: 6, balance: 5n, fee: 0n });
		expect(result.omitted).toContainEqual({
			cases: ['Fee greater than balance'],
			reason: 'The fee is 0, so no balance is below it.'
		});
		expect(find(result, /^Balance minus fee:/)).toBe('0.000005');
	});
});

describe('generateAmountCases: minimum and maximum (FR-021 AC-3)', () => {
	it('lists min, min - 1 unit, max, and max + 1 unit', () => {
		const result = generateAmountCases({ decimals: 6, min: 10_000_000n, max: 50_000_000_000n });
		expect(result.cases.filter((c) => c.category === 'Min and max').map((c) => c.input)).toEqual([
			'10',
			'9.999999',
			'50000',
			'50000.000001'
		]);
		expect(omittedNames(result)).not.toContain('Minimum');
		expect(omittedNames(result)).not.toContain('Maximum');
	});

	it('only a minimum: omits the maximum cases', () => {
		const result = generateAmountCases({ decimals: 2, min: 100n });
		expect(find(result, /^Exactly the minimum/)).toBe('1');
		expect(result.omitted).toContainEqual({
			cases: ['Maximum', 'Maximum plus one unit'],
			reason: 'No maximum set.'
		});
	});

	it('a minimum of 0 omits one unit below it', () => {
		const result = generateAmountCases({ decimals: 2, min: 0n });
		expect(find(result, /^Exactly the minimum/)).toBe('0');
		expect(omittedNames(result)).toContain('Minimum minus one unit');
	});
});

describe('generateAmountCases: exactness (FR-021 AC-6)', () => {
	it('computes 78-digit boundaries exactly', () => {
		const max = 2n ** 256n - 1n;
		const result = generateAmountCases({ decimals: 18, balance: max, fee: 1n, max });
		const digits = (2n ** 256n).toString();

		expect(find(result, /^One base unit more than the balance/)).toBe(
			`${digits.slice(0, -18)}.${digits.slice(-18)}`
		);
		expect(find(result, /^One base unit more than balance minus fee/)).toBe(
			`${max.toString().slice(0, -18)}.${max.toString().slice(-18)}`
		);
		expect(
			result.cases.some((c) => /e/i.test(c.input) && c.category !== 'Scientific notation')
		).toBe(false);
	});

	it('every boundary parses back to its base-unit value', () => {
		const params = {
			decimals: 9,
			balance: 123_456_789_012n,
			fee: 21_000n,
			min: 1n,
			max: 10n ** 30n
		};
		const result = generateAmountCases(params);
		const values = result.cases
			.filter((c) => c.category === 'Balance and fee' || c.category === 'Min and max')
			.map((c) => parseAmount(c.input, 9));
		expect(values.map((v) => v.ok && v.value)).toEqual([
			123_456_789_012n,
			123_456_789_013n,
			123_456_768_012n,
			123_456_768_013n,
			20_999n,
			1n,
			0n,
			10n ** 30n,
			10n ** 30n + 1n
		]);
	});

	it.each(['balance', 'fee', 'min', 'max'] as const)('throws for a negative %s', (name) => {
		expect(() => generateAmountCases({ decimals: 6, [name]: -1n })).toThrow(RangeError);
	});

	it('throws for decimals outside 0 to 36', () => {
		expect(() => generateAmountCases({ decimals: 37 })).toThrow(RangeError);
	});
});
