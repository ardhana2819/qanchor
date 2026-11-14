import { describe, expect, it } from 'vitest';
import { COUNT_ERROR, parseCount, targetFor, visibleAddress } from './form.ts';

describe('parseCount (FR-010 AC-3)', () => {
	it.each([
		['1', 1],
		['10', 10],
		['500', 500],
		[' 25 ', 25],
		['007', 7]
	])('accepts %j', (text, count) => {
		expect(parseCount(text)).toBe(count);
	});

	it.each(['', '0', '-1', '501', '1000', '1.5', '1e2', 'ten', '1 0'])('rejects %j', (text) => {
		expect(parseCount(text)).toBeNull();
	});

	it('states the allowed range', () => {
		expect(COUNT_ERROR).toBe('Enter a whole number from 1 to 500.');
	});
});

describe('targetFor', () => {
	it('uses type and network for Bitcoin only', () => {
		expect(targetFor('bitcoin', 'p2tr', 'testnet')).toEqual({
			chain: 'bitcoin',
			type: 'p2tr',
			network: 'testnet'
		});
		expect(targetFor('evm', 'p2tr', 'testnet')).toEqual({ chain: 'evm' });
	});
});

describe('visibleAddress', () => {
	it('shows spaces, zero-width spaces, and the empty string', () => {
		expect(visibleAddress(' T1 ')).toBe('␣T1␣');
		expect(visibleAddress('T\u200b1')).toBe('T⟨ZWSP⟩1');
		expect(visibleAddress('')).toBe('(empty)');
		expect(visibleAddress('0xabc')).toBe('0xabc');
	});
});
