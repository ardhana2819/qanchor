import { describe, expect, it } from 'vitest';
import type { CaseSnapshot, TestResult } from '#lib/core/qa/types.ts';
import { resultErrors } from '#lib/core/qa/validation.ts';
import {
	caseIndexFromQuery,
	clockTime,
	completeBody,
	completedText,
	failedStepOptions,
	formFor,
	isSaved,
	markedText,
	positionText,
	resultErrorsByField,
	saveStatusText,
	shortcutFor,
	type KeyPress,
	type ResultForm
} from './execution.ts';

const stored = (fields: Partial<TestResult> = {}): TestResult => ({
	runId: 'r',
	caseNumber: 1,
	status: 'fail',
	failedStep: 2,
	actual: 'Shows 0 USDT',
	reason: '',
	notes: '',
	linkedIssue: 'PAY-1',
	updatedAt: new Date(2026, 10, 23, 14, 2).getTime(),
	...fields
});

const snapshot = (number: number): CaseSnapshot => ({
	id: `c${number}`,
	number,
	title: `Case ${number}`,
	preconditions: '',
	steps: [],
	expected: 'ok',
	tags: [],
	priority: 'medium'
});

const counts = { pass: 18, fail: 3, blocked: 2, untested: 17, total: 40 };

describe('formFor', () => {
	it('starts untested, pointing a failure at the last step', () => {
		expect(formFor(undefined, 3)).toEqual({
			status: null,
			failedStep: 3,
			actual: '',
			reason: '',
			notes: '',
			linkedIssue: ''
		});
	});

	it('points a failure at "not step-specific" for a case without steps', () => {
		expect(formFor(undefined, 0).failedStep).toBe(0);
	});

	it('copies a stored result, and fills a missing failed step', () => {
		expect(formFor(stored(), 3)).toMatchObject({
			status: 'fail',
			failedStep: 2,
			actual: 'Shows 0 USDT'
		});
		expect(formFor(stored({ status: 'pass', failedStep: null }), 3).failedStep).toBe(3);
	});
});

describe('isSaved (FR-111 AC-3, AC-6)', () => {
	it('is true only for an untested form without a result', () => {
		expect(isSaved(formFor(undefined, 1), undefined)).toBe(true);
		expect(isSaved({ ...formFor(undefined, 1), status: 'fail' }, undefined)).toBe(false);
	});

	it('compares every field of the stored result', () => {
		const result = stored();
		const form = formFor(result, 3);
		expect(isSaved(form, result)).toBe(true);
		expect(isSaved({ ...form, actual: 'Other' }, result)).toBe(false);
		expect(isSaved({ ...form, failedStep: 1 }, result)).toBe(false);
		expect(isSaved({ ...form, status: 'blocked' }, result)).toBe(false);
		expect(isSaved({ ...form, notes: 'n' }, result)).toBe(false);
	});

	it('ignores spaces around the linked issue, which is stored trimmed', () => {
		const result = stored();
		expect(isSaved({ ...formFor(result, 3), linkedIssue: ' PAY-1 ' }, result)).toBe(true);
	});

	it('ignores the failed step of a result that is not a failure', () => {
		const result = stored({ status: 'pass', failedStep: 1 });
		expect(isSaved({ ...formFor(result, 3), failedStep: 3 }, result)).toBe(true);
	});
});

describe('failedStepOptions', () => {
	it('names each step by its first five words, then offers "Not step-specific"', () => {
		expect(
			failedStepOptions([
				{ action: 'Open the withdraw screen and pick BTC', expected: '' },
				{ action: '  Paste  ', expected: '' }
			])
		).toEqual([
			{ value: '1', label: 'Step 1: Open the withdraw screen and…' },
			{ value: '2', label: 'Step 2: Paste' },
			{ value: '0', label: 'Not step-specific' }
		]);
	});

	it('offers only "Not step-specific" without steps', () => {
		expect(failedStepOptions([])).toEqual([{ value: '0', label: 'Not step-specific' }]);
	});
});

describe('saveStatusText', () => {
	const result = stored();
	it('names the time of a saved result', () => {
		expect(clockTime(result.updatedAt)).toBe('14:02');
		expect(saveStatusText(formFor(result, 3), result, false)).toBe('Saved 14:02');
	});

	it('asks for the missing text of an unsaved failure or block', () => {
		const form: ResultForm = { ...formFor(undefined, 1), status: 'fail' };
		expect(saveStatusText(form, undefined, false)).toBe(
			'Not saved yet: write the actual result, then save.'
		);
		expect(saveStatusText({ ...form, status: 'blocked' }, undefined, false)).toBe(
			'Not saved yet: write the reason, then save.'
		);
	});

	it('explains the untested and completed states', () => {
		expect(saveStatusText(formFor(undefined, 1), undefined, false)).toBe(
			'Pick a result. Pass is saved at once.'
		);
		expect(saveStatusText(formFor(result, 3), result, true)).toBe(
			'This run is completed. Reopen it to change results.'
		);
	});
});

describe('resultErrorsByField (design 13.7)', () => {
	it('asks for the actual result of a failure and the reason of a block', () => {
		const base = { failedStep: 0, actual: '', reason: '', notes: '', linkedIssue: '' };
		expect(resultErrorsByField(resultErrors({ ...base, status: 'fail' }, 2)).get('actual')).toBe(
			'Write the actual result to save a failure.'
		);
		expect(resultErrorsByField(resultErrors({ ...base, status: 'blocked' }, 2)).get('reason')).toBe(
			'Write the reason to save a block.'
		);
	});

	it('names the length limit', () => {
		const errors = resultErrorsByField(
			resultErrors(
				{
					status: 'pass',
					failedStep: 0,
					actual: '',
					reason: '',
					notes: 'x'.repeat(5001),
					linkedIssue: ''
				},
				0
			)
		);
		expect(errors.get('notes')).toBe('Up to 5,000 characters.');
	});
});

describe('caseIndexFromQuery', () => {
	const cases = [snapshot(4), snapshot(7), snapshot(9)];
	it('finds the case named in the URL', () => {
		expect(caseIndexFromQuery('?id=r&case=TC-7', cases)).toBe(1);
	});

	it('falls back to the first case for a missing or unknown key', () => {
		expect(caseIndexFromQuery('?id=r', cases)).toBe(0);
		expect(caseIndexFromQuery('?id=r&case=TC-5', cases)).toBe(0);
	});
});

describe('announcements and copy', () => {
	it('reads out a new status with the counts (design 13.8)', () => {
		expect(markedText(12, 'fail', counts)).toBe(
			'TC-12 marked Failed. 18 passed, 3 failed, 2 blocked, 17 untested.'
		);
		expect(positionText(18, 40, 'Deposit')).toBe('Case 19 of 40: Deposit');
	});

	it('counts the untested cases before completing (FR-113 AC-2)', () => {
		expect(completeBody(4)).toBe(
			'4 test cases are still untested. They will stay untested in the run and the release summary.'
		);
		expect(completeBody(1)).toBe(
			'1 test case is still untested. They will stay untested in the run and the release summary.'
		);
		expect(completeBody(0)).toBe('Every test case has a result.');
		expect(completedText(counts)).toBe('Run completed: 18 passed, 3 failed, 2 blocked.');
	});
});

describe('shortcutFor (design 13.4)', () => {
	const element = (tagName: string, fields: Record<string, unknown> = {}) =>
		({ tagName, isContentEditable: false, ...fields }) as unknown as EventTarget;
	const press = (key: string, fields: Partial<KeyPress> = {}): KeyPress => ({
		key,
		ctrlKey: false,
		metaKey: false,
		altKey: false,
		defaultPrevented: false,
		target: element('BODY'),
		...fields
	});

	it('maps the keys in either case', () => {
		expect(shortcutFor(press('p'), false)).toBe('p');
		expect(shortcutFor(press('F'), false)).toBe('f');
		expect(shortcutFor(press('?'), false)).toBe('?');
		expect(shortcutFor(press('x'), false)).toBeNull();
	});

	it('never fires with Ctrl, Alt, or Cmd, while a dialog is open, or when handled', () => {
		expect(shortcutFor(press('p', { ctrlKey: true }), false)).toBeNull();
		expect(shortcutFor(press('p', { metaKey: true }), false)).toBeNull();
		expect(shortcutFor(press('p', { altKey: true }), false)).toBeNull();
		expect(shortcutFor(press('p', { defaultPrevented: true }), false)).toBeNull();
		expect(shortcutFor(press('p'), true)).toBeNull();
	});

	it('never fires in a text field, select, or editable content', () => {
		for (const target of [
			element('INPUT', { type: 'text' }),
			element('INPUT', { type: 'search' }),
			element('TEXTAREA'),
			element('SELECT'),
			element('DIV', { isContentEditable: true })
		]) {
			expect(shortcutFor(press('p', { target }), false)).toBeNull();
		}
	});

	it('fires on a radio, a checkbox, or a button', () => {
		expect(shortcutFor(press('p', { target: element('INPUT', { type: 'radio' }) }), false)).toBe(
			'p'
		);
		expect(shortcutFor(press('b', { target: element('INPUT', { type: 'checkbox' }) }), false)).toBe(
			'b'
		);
		expect(shortcutFor(press('j', { target: element('BUTTON') }), false)).toBe('j');
	});
});
