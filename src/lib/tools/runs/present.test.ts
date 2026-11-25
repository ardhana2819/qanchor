import { describe, expect, it } from 'vitest';
import { runErrors } from '#lib/core/qa/validation.ts';
import {
	createdRunText,
	defaultRunName,
	deletedRunText,
	deleteRunBody,
	deleteRunTitle,
	progressText,
	runErrorsByField,
	saveErrorText,
	selectedText,
	selectionProblem
} from './present.ts';

const counts = (pass: number, fail: number, blocked: number, untested: number) => ({
	pass,
	fail,
	blocked,
	untested,
	total: pass + fail + blocked + untested
});

describe('defaultRunName', () => {
	it('uses the local date with zero-padded month and day', () => {
		expect(defaultRunName(new Date(2026, 0, 5, 23, 59))).toBe('Run 2026-01-05');
		expect(defaultRunName(new Date(2026, 10, 23))).toBe('Run 2026-11-23');
	});
});

describe('progressText', () => {
	it('counts every case with a result', () => {
		expect(progressText(counts(10, 5, 3, 22))).toBe('18 / 40');
	});

	it('reads 0 / n for a new run and n / n for a finished one', () => {
		expect(progressText(counts(0, 0, 0, 3))).toBe('0 / 3');
		expect(progressText(counts(2, 1, 0, 0))).toBe('3 / 3');
	});
});

describe('selectedText', () => {
	it('groups thousands', () => {
		expect(selectedText(0)).toBe('0 selected');
		expect(selectedText(1200)).toBe('1,200 selected');
	});
});

describe('selectionProblem (FR-110 AC-1)', () => {
	it('refuses no cases and more than 500', () => {
		expect(selectionProblem(0)).toBe('Select at least one test case.');
		expect(selectionProblem(501)).toBe('Up to 500 test cases per run.');
	});

	it('accepts 1 and 500', () => {
		expect(selectionProblem(1)).toBeNull();
		expect(selectionProblem(500)).toBeNull();
	});
});

describe('runErrorsByField', () => {
	it('names a missing name and a long release', () => {
		const errors = runErrorsByField(
			runErrors({ name: '  ', release: 'x'.repeat(201), environment: '', caseCount: 1 })
		);
		expect(errors.get('name')).toBe('Enter a name.');
		expect(errors.get('release')).toBe('Up to 200 characters.');
		expect(errors.has('environment')).toBe(false);
	});

	it('names a long environment', () => {
		const errors = runErrorsByField(
			runErrors({ name: 'Run', release: '', environment: 'x'.repeat(5001), caseCount: 1 })
		);
		expect(errors.get('environment')).toBe('Up to 5,000 characters.');
	});

	it('is empty for a valid run', () => {
		expect(
			runErrorsByField(runErrors({ name: 'Run', release: '', environment: '', caseCount: 1 })).size
		).toBe(0);
	});
});

describe('delete and toast copy (design 13.7)', () => {
	it('counts the results that go with the run', () => {
		expect(deleteRunBody(0)).toBe('It has no results yet. This cannot be undone.');
		expect(deleteRunBody(1)).toBe('Its 1 result is deleted too. This cannot be undone.');
		expect(deleteRunBody(1500)).toBe('Its 1,500 results are deleted too. This cannot be undone.');
	});

	it('names the screenshots deleted with the results (design 13.7, NFR-024)', () => {
		expect(deleteRunBody(40, 6)).toBe(
			'Its 40 results and 6 screenshots are deleted too. This cannot be undone.'
		);
		expect(deleteRunBody(1, 1)).toBe(
			'Its 1 result and 1 screenshot are deleted too. This cannot be undone.'
		);
		expect(deleteRunBody(2, 0)).toBe('Its 2 results are deleted too. This cannot be undone.');
	});

	it('quotes the run name', () => {
		expect(deleteRunTitle('Smoke')).toBe('Delete run "Smoke"?');
		expect(deletedRunText('Smoke')).toBe('Deleted run "Smoke".');
		expect(createdRunText('Smoke')).toBe('Created run "Smoke".');
	});
});

describe('saveErrorText', () => {
	it('uses the storage copy for a storage error and the screenshot copy for a refusal', () => {
		expect(saveErrorText('closed')).toBe(
			'QAnchor was updated in another tab. Reload this tab, then try again.'
		);
		expect(saveErrorText({ kind: 'limit' })).toBe('5 of 5 screenshots');
		expect(saveErrorText({ kind: 'storage', usage: 1.9e9, quota: 2e9 })).toBe(
			'Not enough storage to save this screenshot. 1.9 GB of 2 GB used.'
		);
	});
});
