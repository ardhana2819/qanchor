import { describe, expect, it } from 'vitest';
import { convert, customFamily, FAMILIES, parseDecimals, type FamilyId } from './families.ts';

const family = (id: FamilyId) => FAMILIES.find((f) => f.id === id)!;
const unit = (id: FamilyId, unitId: string) => family(id).units.find((u) => u.id === unitId)!;

function converted(input: string, familyId: FamilyId, unitId: string) {
	const result = convert(input, unit(familyId, unitId), family(familyId));
	if (!result.ok) throw new Error(`expected ${input} to convert, got ${result.error.code}`);
	return result.value;
}

describe('FAMILIES', () => {
	it('lists the decided families and units, largest unit first (FR-030)', () => {
		expect(FAMILIES.map((f) => [f.label, f.units.map((u) => `${u.name}:${u.decimals}`)])).toEqual([
			['Ethereum', ['ether:18', 'gwei:9', 'wei:0']],
			['Bitcoin', ['BTC:8', 'sats:0']],
			['Solana', ['SOL:9', 'lamports:0']],
			['Tron', ['TRX:6', 'sun:0']],
			['Custom token', ['token:18', 'base units:0']]
		]);
	});

	it('states each factor against the smallest unit', () => {
		expect(family('ethereum').units.map((u) => u.factor)).toEqual([
			'10¹⁸ wei',
			'10⁹ wei',
			'Smallest unit'
		]);
		expect(customFamily(6).units[0].factor).toBe('10⁶ base units');
		expect(customFamily(0).units[0].factor).toBe('10⁰ base units');
		expect(customFamily(36).units[0].factor).toBe('10³⁶ base units');
	});
});

describe('convert', () => {
	it('gives the PRD examples exactly (FR-030 AC-2)', () => {
		expect(converted('1', 'ethereum', 'ether')).toEqual({
			ether: '1',
			gwei: '1000000000',
			wei: '1000000000000000000'
		});
		expect(converted('1', 'bitcoin', 'BTC')).toEqual({ BTC: '1', sats: '100000000' });
		expect(converted('1', 'solana', 'SOL')).toEqual({ SOL: '1', lamports: '1000000000' });
		expect(converted('1', 'tron', 'TRX')).toEqual({ TRX: '1', sun: '1000000' });
	});

	it('converts 0.1 ether with no rounding artefacts (FR-030 AC-3)', () => {
		expect(converted('0.1', 'ethereum', 'ether').wei).toBe('100000000000000000');
	});

	it('converts from any unit, including the middle one (FR-030 AC-1)', () => {
		expect(converted('1.5', 'ethereum', 'gwei')).toEqual({
			ether: '0.0000000015',
			gwei: '1.5',
			wei: '1500000000'
		});
		expect(converted('1', 'bitcoin', 'sats')).toEqual({ BTC: '0.00000001', sats: '1' });
	});

	it('keeps 2^256 - 1 wei exact in every unit, with no exponent (FR-030 AC-4)', () => {
		const max = (2n ** 256n - 1n).toString();
		const out = converted(max, 'ethereum', 'wei');
		expect(out.wei).toBe(max);
		expect(out.ether).toBe(`${max.slice(0, -18)}.${max.slice(-18)}`);
		expect(out.gwei).toBe(`${max.slice(0, -9)}.${max.slice(-9)}`);
		expect(Object.values(out).join('')).not.toMatch(/e/i);
	});

	it('converts custom-token values both ways (FR-032 AC-1)', () => {
		const token = customFamily(6);
		const base = convert('1500000', token.units[1], token);
		expect(base.ok && base.value).toEqual({ token: '1.5', 'base units': '1500000' });
		const display = convert('1.5', token.units[0], token);
		expect(display.ok && display.value['base units']).toBe('1500000');
	});

	it('trims surrounding whitespace (EC-013)', () => {
		expect(converted('  1 \t', 'ethereum', 'ether').gwei).toBe('1000000000');
	});

	it('rejects too many decimal places for the unit (FR-031 AC-1)', () => {
		expect(convert('0.5', unit('ethereum', 'wei'), family('ethereum'))).toEqual({
			ok: false,
			error: { code: 'too-precise', maxDecimals: 0 }
		});
	});

	it('rejects a comma, a negative number, and scientific notation (FR-031 AC-3, AC-4)', () => {
		const ether = unit('ethereum', 'ether');
		const codes = ['1,5', '-1', '1e-7'].map((input) => {
			const result = convert(input, ether, family('ethereum'));
			return result.ok ? null : result.error.code;
		});
		expect(codes).toEqual(['comma', 'negative', 'scientific']);
	});
});

describe('customFamily', () => {
	it.each([-1, 37, 2.5])('throws for decimals %s', (decimals) => {
		expect(() => customFamily(decimals)).toThrow(RangeError);
	});
});

describe('parseDecimals', () => {
	it.each([
		['0', 0],
		['6', 6],
		['18', 18],
		['36', 36],
		[' 9 ', 9],
		['06', 6]
	])('accepts %j as %i', (input, expected) => {
		expect(parseDecimals(input)).toBe(expected);
	});

	it.each(['', '37', '99', '100', '-1', '1.5', '6e0', '+6', 'six', '1 8'])(
		'rejects %j (FR-020 AC-1)',
		(input) => {
			expect(parseDecimals(input)).toBeNull();
		}
	);
});
