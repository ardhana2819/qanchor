import { describe, expect, it } from 'vitest';
import { reveal } from './reveal.ts';

describe('reveal', () => {
	it('shows the first rows up to the step when nothing was shown', () => {
		expect([...reveal([1, 2, 3, 4, 5], new Set(), 2)]).toEqual([1, 2]);
	});

	it('keeps rows already shown and adds up to the step more, in list order', () => {
		expect([...reveal([1, 2, 3, 4, 5, 6], new Set([2, 5]), 2)]).toEqual([1, 2, 3, 5]);
	});

	it('drops rows that no longer pass', () => {
		expect([...reveal([1, 3], new Set([1, 2, 3]), 2)]).toEqual([1, 3]);
	});

	it('shows every row when the step covers them all', () => {
		expect([...reveal([1, 2, 3], new Set(), 3)]).toEqual([1, 2, 3]);
	});

	it('adds nothing with a step of 0', () => {
		expect([...reveal([1, 2, 3], new Set([3]), 0)]).toEqual([3]);
	});

	it('returns an empty set for an empty list', () => {
		expect(reveal([], new Set([1]), 5).size).toBe(0);
	});
});
