import { describe, expect, it } from 'vitest';
import {
	countText,
	deleteBody,
	deletedText,
	duplicatedText,
	SAVE_ERRORS,
	tagFilterSummary,
	visibleTags
} from './present.ts';

describe('test case list copy', () => {
	it.each([
		[1, 1, '1 test case'],
		[124, 124, '124 test cases'],
		[1000, 1000, '1,000 test cases'],
		[12, 124, '12 of 124 match'],
		[0, 1200, '0 of 1,200 match']
	])('count %i of %i reads "%s"', (shown, total, text) => {
		expect(countText(shown, total)).toBe(text);
	});

	it.each([
		[0, 'It is not in any run.'],
		[1, 'It is in 1 run. That run keeps its own copy.'],
		[3, 'It is in 3 runs. Those runs keep their own copy.']
	])('delete body for %i runs (FR-102 AC-2)', (runs, text) => {
		expect(deleteBody(runs)).toBe(text);
	});

	it('summarises the tag filter', () => {
		expect([0, 1, 2].map(tagFilterSummary)).toEqual(['Any tag', '1 tag', '2 tags']);
	});

	it('shows at most three tags and counts the rest', () => {
		expect(visibleTags([])).toEqual({ shown: [], more: 0 });
		expect(visibleTags(['a', 'b', 'c'])).toEqual({ shown: ['a', 'b', 'c'], more: 0 });
		expect(visibleTags(['a', 'b', 'c', 'd', 'e'])).toEqual({ shown: ['a', 'b', 'c'], more: 2 });
	});

	it('names the key in toasts and explains the case limit', () => {
		expect(deletedText(12)).toBe('Deleted TC-12.');
		expect(duplicatedText(31)).toBe('Duplicated as TC-31.');
		expect(SAVE_ERRORS.limit).toContain('5,000 test cases');
	});
});
