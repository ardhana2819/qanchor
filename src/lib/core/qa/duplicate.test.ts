import { describe, expect, it } from 'vitest';
import { copyOfCase } from './duplicate.ts';
import type { TestCase } from './types.ts';
import { TITLE_MAX } from './validation.ts';

const original: TestCase = {
	id: 'a',
	number: 12,
	title: 'Deposit USDT on Tron',
	preconditions: 'Wallet funded',
	steps: [{ action: 'Open Deposit', expected: 'Address shown' }],
	expected: '',
	tags: ['deposit', 'tron'],
	priority: 'high',
	createdAt: 1,
	updatedAt: 2
};

describe('copyOfCase (FR-102 AC-1)', () => {
	it('copies every field but the identity and prefixes the title', () => {
		expect(copyOfCase(original)).toEqual({
			title: 'Copy of Deposit USDT on Tron',
			preconditions: 'Wallet funded',
			steps: [{ action: 'Open Deposit', expected: 'Address shown' }],
			expected: '',
			tags: ['deposit', 'tron'],
			priority: 'high'
		});
	});

	it('shares no array with the original', () => {
		const copy = copyOfCase(original);
		expect(copy.steps).not.toBe(original.steps);
		expect(copy.steps[0]).not.toBe(original.steps[0]);
		expect(copy.tags).not.toBe(original.tags);
	});

	it('keeps a title at the limit within it', () => {
		const copy = copyOfCase({ ...original, title: 'a'.repeat(TITLE_MAX) });
		expect(copy.title).toHaveLength(TITLE_MAX);
		expect(copy.title.startsWith('Copy of a')).toBe(true);
	});
});
