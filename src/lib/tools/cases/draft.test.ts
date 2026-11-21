import { describe, expect, it } from 'vitest';
import type { TestCase } from '#lib/core/qa/types.ts';
import { caseErrors } from '#lib/core/qa/validation.ts';
import {
	draftFields,
	draftFromCase,
	emptyDraft,
	errorsByField,
	moveStep,
	neighbourAfterRemove,
	newStep,
	problemText,
	sameFields
} from './draft.ts';

const stored: TestCase = {
	id: 'a',
	number: 12,
	title: '  <b>Deposit</b>  ',
	preconditions: '',
	steps: [
		{ action: 'Open', expected: '' },
		{ action: 'Pay', expected: 'Paid' }
	],
	expected: '',
	tags: ['deposit'],
	priority: 'high',
	createdAt: 1,
	updatedAt: 2
};

describe('case draft', () => {
	it('starts a new case with one empty step at Medium (FR-100 AC-6)', () => {
		const draft = emptyDraft();
		expect(draft.priority).toBe('medium');
		expect(draft.steps).toHaveLength(1);
		expect(draftFields(draft).steps).toEqual([{ action: '', expected: '' }]);
	});

	it('round-trips a stored case exactly as typed (FR-100 AC-8)', () => {
		const fields = draftFields(draftFromCase(stored));
		expect(fields).toEqual({
			title: '  <b>Deposit</b>  ',
			preconditions: '',
			steps: stored.steps,
			expected: '',
			tags: ['deposit'],
			priority: 'high'
		});
		expect(fields.steps).not.toBe(stored.steps);
	});

	it('gives every step its own key', () => {
		const keys = draftFromCase(stored).steps.map((s) => s.key);
		expect(new Set([...keys, newStep().key]).size).toBe(3);
	});

	it('compares drafts by their fields, not by step keys (FR-100 AC-7)', () => {
		const a = draftFromCase(stored);
		const b = draftFromCase(stored);
		expect(sameFields(a, b)).toBe(true);
		b.steps[1].expected = 'Paid!';
		expect(sameFields(a, b)).toBe(false);
		expect(sameFields(a, { ...a, steps: moveStep(a.steps, 0, 1) })).toBe(false);
	});
});

describe('moveStep (FR-100 AC-4)', () => {
	const steps = ['a', 'b', 'c'].map((action) => newStep(action));
	const actions = (list: { action: string }[]) => list.map((s) => s.action);

	it('moves a step up or down by one', () => {
		expect(actions(moveStep(steps, 1, -1))).toEqual(['b', 'a', 'c']);
		expect(actions(moveStep(steps, 1, 1))).toEqual(['a', 'c', 'b']);
	});

	it('leaves the list as it is at either end', () => {
		expect(actions(moveStep(steps, 0, -1))).toEqual(['a', 'b', 'c']);
		expect(actions(moveStep(steps, 2, 1))).toEqual(['a', 'b', 'c']);
		expect(actions(moveStep(steps, 5, -1))).toEqual(['a', 'b', 'c']);
	});

	it('does not change the list it is given', () => {
		moveStep(steps, 0, 1);
		expect(actions(steps)).toEqual(['a', 'b', 'c']);
	});
});

describe('neighbourAfterRemove (FR-100 AC-4)', () => {
	it.each([
		[1, 0, null],
		[3, 0, 0],
		[3, 1, 1],
		[3, 2, 1]
	])('%i steps, removing %i: focus step %s', (length, index, focus) => {
		expect(neighbourAfterRemove(length, index)).toBe(focus);
	});
});

describe('error copy (design 13.7)', () => {
	it('names the first problem of each field', () => {
		const draft = { ...emptyDraft(), tags: ['ok', 'a b'] };
		const byField = errorsByField(caseErrors(draftFields(draft)));
		expect([...byField]).toEqual([
			['title', 'Enter a title.'],
			['steps.0.action', 'Describe what to do in step 1.'],
			['expected', 'Add an expected result to a step or to the case.'],
			['tags', '"a b" is not a valid tag. A tag can be up to 32 characters: letters, digits, - _ .']
		]);
	});

	it.each([
		['title', { kind: 'too-long', max: 200 }, 'Up to 200 characters.'],
		['preconditions', { kind: 'too-long', max: 5000 }, 'Up to 5,000 characters.'],
		['steps', { kind: 'too-many', max: 50 }, 'Up to 50 steps.'],
		['tags', { kind: 'too-many', max: 10 }, 'Up to 10 tags.'],
		['steps.4.action', { kind: 'required' }, 'Describe what to do in step 5.']
	] as const)('%s %j reads "%s"', (field, problem, text) => {
		expect(problemText(field, problem)).toBe(text);
	});
});
