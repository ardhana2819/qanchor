import { describe, expect, it } from 'vitest';
import { formatAmount, MAX_DECIMALS, parseAmount, type AmountError } from './decimal.ts';

const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT256_DIGITS = MAX_UINT256.toString();

function parsed(input: string, decimals: number, trim = false): bigint {
	const result = parseAmount(input, decimals, { trim });
	if (!result.ok) throw new Error(`expected ${input} to parse, got ${result.error.code}`);
	return result.value;
}

function rejected(input: string, decimals = 18, trim = false): AmountError {
	const result = parseAmount(input, decimals, { trim });
	if (result.ok) throw new Error(`expected ${input} to be rejected, got ${result.value}`);
	return result.error;
}

describe('parseAmount', () => {
	it('converts the PRD examples exactly (FR-030 AC-2, AC-3, FR-032 AC-1)', () => {
		expect(parsed('1', 18)).toBe(1_000_000_000_000_000_000n);
		expect(parsed('1', 9)).toBe(1_000_000_000n);
		expect(parsed('1', 8)).toBe(100_000_000n);
		expect(parsed('0.1', 18)).toBe(100_000_000_000_000_000n);
		expect(parsed('1.5', 6)).toBe(1_500_000n);
	});

	it('accepts leading zeros, a bare leading or trailing point, and trailing zeros (EC-013)', () => {
		expect(parsed('007', 0)).toBe(7n);
		expect(parsed('000.5', 1)).toBe(5n);
		expect(parsed('.5', 1)).toBe(5n);
		expect(parsed('5.', 0)).toBe(5n);
		expect(parsed('1.50000', 1)).toBe(15n);
		expect(parsed('0', 18)).toBe(0n);
		expect(parsed('0.0', 0)).toBe(0n);
	});

	it('handles D = 0: whole numbers only (EC-012)', () => {
		expect(parsed('42', 0)).toBe(42n);
		expect(rejected('0.1', 0)).toEqual({ code: 'too-precise', maxDecimals: 0 });
	});

	it('handles D = 36: the smallest unit and a full fraction (EC-012)', () => {
		const smallest = `0.${'0'.repeat(35)}1`;
		expect(parsed(smallest, MAX_DECIMALS)).toBe(1n);
		expect(parsed(`1.${'9'.repeat(36)}`, 36)).toBe(2n * 10n ** 36n - 1n);
		expect(rejected(`0.${'0'.repeat(36)}1`, 36)).toEqual({ code: 'too-precise', maxDecimals: 36 });
	});

	it('keeps 78-digit values exact (FR-030 AC-4, FR-021 AC-6)', () => {
		expect(MAX_UINT256_DIGITS).toHaveLength(78);
		expect(parsed(MAX_UINT256_DIGITS, 0)).toBe(MAX_UINT256);
		const asEther = `${MAX_UINT256_DIGITS.slice(0, -18)}.${MAX_UINT256_DIGITS.slice(-18)}`;
		expect(parsed(asEther, 18)).toBe(MAX_UINT256);
	});

	it('rejects more decimal places than the unit allows (FR-031 AC-1)', () => {
		expect(rejected('0.5', 0)).toEqual({ code: 'too-precise', maxDecimals: 0 });
		expect(rejected('0.0000001', 6)).toEqual({ code: 'too-precise', maxDecimals: 6 });
		expect(parsed('0.000001', 6)).toBe(1n);
	});

	it('rejects empty input', () => {
		expect(rejected('')).toEqual({ code: 'empty' });
		expect(rejected('   ', 18, true)).toEqual({ code: 'empty' });
	});

	it.each(['1,5', '1,000', '1,000.50', '1.000,50', ',5', '-1,5', '1, 000'])(
		'rejects %s with the comma reason, never guessing its meaning (FR-031 AC-4)',
		(input) => {
			expect(rejected(input)).toEqual({ code: 'comma' });
		}
	);

	it.each(['+1', '+0.5', '+'])('rejects the plus sign in %s (EC-013)', (input) => {
		expect(rejected(input)).toEqual({ code: 'plus-sign' });
	});

	it.each(['-1', '-0', '-0.5', '-'])('rejects the negative value %s (FR-031 AC-3)', (input) => {
		expect(rejected(input)).toEqual({ code: 'negative' });
	});

	it.each(['1e-7', '1E7', '1.5e+3', '.5e2', '-1e5', '+1e5'])(
		'rejects scientific notation %s (FR-031 AC-3)',
		(input) => {
			expect(rejected(input)).toEqual({ code: 'scientific' });
		}
	);

	it.each(['abc', '.', '1.2.3', '1-2', '0x10', '1e', 'e5', 'Infinity', 'NaN', '１', '1_000', '½'])(
		'rejects the non-numeric text %s (FR-031 AC-3)',
		(input) => {
			expect(rejected(input)).toEqual({ code: 'not-a-number' });
		}
	);

	it('trims surrounding whitespace only when asked (EC-013)', () => {
		expect(parsed(' 1.5\t\n', 6, true)).toBe(1_500_000n);
		expect(parsed(' 1 ', 0, true)).toBe(1n);
		expect(rejected(' 1.5', 6)).toEqual({ code: 'whitespace' });
		expect(rejected('1.5 ', 6)).toEqual({ code: 'whitespace' });
	});

	it('rejects whitespace inside the number even when trimming', () => {
		expect(rejected('1 000', 0, true)).toEqual({ code: 'whitespace' });
		expect(rejected('1. 5', 6, true)).toEqual({ code: 'whitespace' });
	});

	it.each([-1, 37, 1.5, Number.NaN])('throws for decimals %s, a caller bug', (decimals) => {
		expect(() => parseAmount('1', decimals)).toThrow(RangeError);
	});
});

describe('formatAmount', () => {
	it('formats the PRD examples (FR-030 AC-2, FR-032 AC-1)', () => {
		expect(formatAmount(1_000_000_000_000_000_000n, 18)).toBe('1');
		expect(formatAmount(1_500_000n, 6)).toBe('1.5');
		expect(formatAmount(100_000_000_000_000_000n, 18)).toBe('0.1');
		expect(formatAmount(1_000_000_000n, 9)).toBe('1');
	});

	it('drops trailing fractional zeros and keeps a leading zero', () => {
		expect(formatAmount(1_500_000_000n, 9)).toBe('1.5');
		expect(formatAmount(5n, 3)).toBe('0.005');
		expect(formatAmount(0n, 18)).toBe('0');
		expect(formatAmount(1000n, 3)).toBe('1');
	});

	it('handles D = 0 and D = 36 (EC-012)', () => {
		expect(formatAmount(42n, 0)).toBe('42');
		expect(formatAmount(1n, 36)).toBe(`0.${'0'.repeat(35)}1`);
		expect(formatAmount(10n ** 36n, 36)).toBe('1');
	});

	it('shows 78-digit values in full, never in scientific notation (FR-030 AC-4)', () => {
		expect(formatAmount(MAX_UINT256, 0)).toBe(MAX_UINT256_DIGITS);
		const asEther = formatAmount(MAX_UINT256, 18);
		expect(asEther).toBe(`${MAX_UINT256_DIGITS.slice(0, -18)}.${MAX_UINT256_DIGITS.slice(-18)}`);
		expect(asEther).not.toMatch(/e/i);
	});

	it('formats negative base units with a leading minus, for computed boundaries', () => {
		expect(formatAmount(-1_500_000n, 6)).toBe('-1.5');
		expect(formatAmount(-1n, 18)).toBe(`-0.${'0'.repeat(17)}1`);
	});

	it.each([-1, 37, 0.5])('throws for decimals %s, a caller bug', (decimals) => {
		expect(() => formatAmount(1n, decimals)).toThrow(RangeError);
	});
});

describe('round trip', () => {
	const cases: [bigint, number][] = [
		[0n, 0],
		[1n, 0],
		[1n, 36],
		[MAX_UINT256, 0],
		[MAX_UINT256, 18],
		[MAX_UINT256, 36],
		[123_456_789n, 6],
		[10n ** 40n, 36]
	];

	it.each(cases)('formats %s with %s decimals and parses back to the same value', (base, d) => {
		expect(parsed(formatAmount(base, d), d)).toBe(base);
	});

	it('converts between units of a family exactly via base units (FR-030 AC-1)', () => {
		// Base units are wei; formatting with 9 decimals reads them as gwei, with 0 as wei.
		const wei = parsed('1.000000001000000005', 18);
		expect(formatAmount(wei, 9)).toBe('1000000001.000000005');
		expect(formatAmount(wei, 0)).toBe('1000000001000000005');
	});
});
