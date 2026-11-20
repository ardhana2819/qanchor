import { describe, expect, it } from 'vitest';
import { formatKey, parseKey } from './keys.ts';

describe('case keys (FR-100 AC-2)', () => {
	it('formats a number as TC-<n>', () => {
		expect(formatKey(1)).toBe('TC-1');
		expect(formatKey(4999)).toBe('TC-4999');
	});

	it.each([
		['TC-1', 1],
		['TC-12', 12],
		['tc-12', 12],
		['  TC-7\n', 7],
		[`TC-${Number.MAX_SAFE_INTEGER}`, Number.MAX_SAFE_INTEGER]
	])('parses %j as %i', (text, number) => {
		expect(parseKey(text)).toBe(number);
	});

	it.each([
		'',
		'TC-',
		'TC-0',
		'TC-012',
		'TC--1',
		'TC-1.5',
		'TC-1a',
		'TC 1',
		'12',
		'XC-1',
		`TC-${Number.MAX_SAFE_INTEGER + 1}`
	])('rejects %j', (text) => {
		expect(parseKey(text)).toBeNull();
	});

	it('round-trips', () => {
		for (const n of [1, 9, 10, 500, 5000]) expect(parseKey(formatKey(n))).toBe(n);
	});
});
