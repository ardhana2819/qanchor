import { describe, expect, it } from 'vitest';
import { filterFromQuery } from '#lib/core/qa/filter.ts';
import {
	casesQuery,
	createButtonText,
	createdText,
	creatingText,
	duplicateText,
	nothingToCreateText,
	roomText,
	selectedText
} from './create-cases.ts';

describe('Create test cases copy (design 13.7)', () => {
	it('counts test cases', () => {
		expect(createButtonText(18)).toBe('Create 18 test cases');
		expect(createButtonText(1)).toBe('Create 1 test case');
		expect(createButtonText(0)).toBe('Create test cases');
		expect(creatingText(24)).toBe('Creating 24 test cases…');
		expect(createdText(18)).toBe('Created 18 test cases.');
		expect(createdText(1)).toBe('Created 1 test case.');
		expect(selectedText(24, 31)).toBe('24 of 31 selected');
	});

	it('warns about items that already exist (FR-150 AC-3)', () => {
		expect(duplicateText(6, 'deposit')).toBe(
			'6 of these items already exist as test cases with the tag deposit.'
		);
		expect(duplicateText(1, 'memo-tag')).toBe(
			'1 of these items already exists as a test case with the tag memo-tag.'
		);
	});

	it('says why nothing can be created', () => {
		expect(nothingToCreateText(0, 0)).toBe('Select at least one item.');
		expect(nothingToCreateText(3, 0)).toBe('Every selected item already exists as a test case.');
		expect(nothingToCreateText(3, 1)).toBeNull();
	});

	it('says how many more cases fit under the limit', () => {
		expect(roomText(4_990)).toBe(
			'Only 10 more test cases fit: this browser keeps up to 5,000. Select fewer items, or delete some test cases.'
		);
		expect(roomText(4_999)).toContain('Only 1 more test case fits:');
		expect(roomText(5_000)).toContain('Only 0 more test cases fit');
	});

	it('links to the cases filtered by the checklist tag (FR-150 AC-4)', () => {
		expect(casesQuery('memo-tag')).toBe('tag=memo-tag');
		expect(filterFromQuery(casesQuery('Deposit')).tags).toEqual(['deposit']);
	});
});
