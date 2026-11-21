import { TAG_MAX_LENGTH } from '#lib/core/qa/tags.ts';
import { DEFAULT_PRIORITY, type Priority, type TestCase } from '#lib/core/qa/types.ts';
import type { CaseField, FieldError, FieldProblem } from '#lib/core/qa/validation.ts';
import type { NewCase } from '#lib/storage/db.ts';

// The editor's working copy of a test case (design 13.3 P2-02, FR-100).

export interface DraftStep {
	/** Stable per step while editing, so a moved step keeps its fields and focus. */
	key: number;
	action: string;
	expected: string;
}

export interface CaseDraftState {
	title: string;
	preconditions: string;
	steps: DraftStep[];
	expected: string;
	tags: string[];
	priority: Priority;
}

let lastKey = 0;

export function newStep(action = '', expected = ''): DraftStep {
	lastKey += 1;
	return { key: lastKey, action, expected };
}

/** A new case: one empty step and the default priority, Medium (FR-100 AC-6). */
export function emptyDraft(): CaseDraftState {
	return {
		title: '',
		preconditions: '',
		steps: [newStep()],
		expected: '',
		tags: [],
		priority: DEFAULT_PRIORITY
	};
}

export function draftFromCase(item: TestCase): CaseDraftState {
	return {
		title: item.title,
		preconditions: item.preconditions,
		steps: item.steps.map((step) => newStep(step.action, step.expected)),
		expected: item.expected,
		tags: [...item.tags],
		priority: item.priority
	};
}

/** The fields to store; text is kept exactly as typed (FR-100 AC-8). */
export function draftFields(draft: CaseDraftState): NewCase {
	return {
		title: draft.title,
		preconditions: draft.preconditions,
		steps: draft.steps.map(({ action, expected }) => ({ action, expected })),
		expected: draft.expected,
		tags: [...draft.tags],
		priority: draft.priority
	};
}

/** Whether two drafts would store the same case: the unsaved-changes check (FR-100 AC-7). */
export function sameFields(a: CaseDraftState, b: CaseDraftState): boolean {
	return JSON.stringify(draftFields(a)) === JSON.stringify(draftFields(b));
}

/** The steps with the one at `index` moved one place up (-1) or down (+1); out of range: unchanged. */
export function moveStep(steps: readonly DraftStep[], index: number, by: -1 | 1): DraftStep[] {
	const target = index + by;
	if (index < 0 || index >= steps.length || target < 0 || target >= steps.length) {
		return [...steps];
	}
	const next = [...steps];
	[next[index], next[target]] = [next[target], next[index]];
	return next;
}

/** The step whose fields should take focus after removing `index`: the next one, else the previous. */
export function neighbourAfterRemove(length: number, index: number): number | null {
	if (length <= 1) return null;
	return index < length - 1 ? index : index - 1;
}

/** The first problem per field, keyed by field. */
export function errorsByField(errors: readonly FieldError<CaseField>[]): Map<CaseField, string> {
	const byField = new Map<CaseField, string>();
	for (const { field, problem } of errors) {
		if (!byField.has(field)) byField.set(field, problemText(field, problem));
	}
	return byField;
}

/** Error copy (design 13.7). */
export function problemText(field: CaseField, problem: FieldProblem): string {
	switch (problem.kind) {
		case 'required': {
			const step = /^steps\.(\d+)\.action$/.exec(field);
			if (step) return `Describe what to do in step ${Number(step[1]) + 1}.`;
			return field === 'title' ? 'Enter a title.' : 'Fill in this field.';
		}
		case 'too-long':
			return `Up to ${problem.max.toLocaleString('en')} characters.`;
		case 'too-many':
			return `Up to ${problem.max} ${field === 'steps' ? 'steps' : 'tags'}.`;
		case 'invalid-tag':
			return `"${problem.tag}" is not a valid tag. A tag can be up to ${TAG_MAX_LENGTH} characters: letters, digits, - _ .`;
		case 'no-expected':
			return 'Add an expected result to a step or to the case.';
		case 'out-of-range':
			return `From ${problem.min} to ${problem.max}.`;
	}
}
