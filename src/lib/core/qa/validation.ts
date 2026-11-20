import { isValidTag, TAGS_MAX } from './tags.ts';
import type { ResultStatus, Step } from './types.ts';

// Field rules for test cases, runs, and results (FR-100 AC-3, FR-110, FR-111 AC-3, AC-4,
// PRD 10.5). Lengths are UTF-16 code units, the unit an input's `maxlength` counts. Text is
// checked as typed; "blank" means empty after trimming.

export const TITLE_MAX = 200;
export const TEXT_MAX = 5000;
export const STEPS_MAX = 50;
export const CASES_PER_RUN_MAX = 500;
export const CASES_MAX = 5000;
/** Not in PRD 10.5: chosen with T-048 (decisions 2026-11-20). */
export const RELEASE_MAX = 200;
export const ISSUE_MAX = 500;

export type FieldProblem =
	| { kind: 'required' }
	| { kind: 'too-long'; max: number }
	| { kind: 'too-many'; max: number }
	| { kind: 'invalid-tag'; tag: string }
	/** No expected result on the case or on any step (FR-100 AC-2). */
	| { kind: 'no-expected' }
	| { kind: 'out-of-range'; min: number; max: number };

export interface FieldError<F extends string> {
	field: F;
	problem: FieldProblem;
}

function tooLong(text: string, max: number): FieldProblem | null {
	return text.length > max ? { kind: 'too-long', max } : null;
}

function requiredText(text: string, max: number): FieldProblem | null {
	return text.trim() === '' ? { kind: 'required' } : tooLong(text, max);
}

/** Collects the problems in field order, so the first one is where focus goes (NFR-008). */
class Errors<F extends string> {
	readonly list: FieldError<F>[] = [];
	add(field: F, problem: FieldProblem | null): void {
		if (problem) this.list.push({ field, problem });
	}
}

export type CaseField =
	| 'title'
	| 'preconditions'
	| 'steps'
	| `steps.${number}.action`
	| `steps.${number}.expected`
	| 'expected'
	| 'tags';

export interface CaseDraft {
	title: string;
	preconditions: string;
	steps: readonly Step[];
	expected: string;
	/** Already normalised (see `normalizeTags`). */
	tags: readonly string[];
}

/**
 * Every problem that blocks saving a case, in form order (FR-100 AC-3). A step needs an action;
 * its expected result is optional. "No expected result" is reported on the case-level field.
 */
export function caseErrors(draft: CaseDraft): FieldError<CaseField>[] {
	const errors = new Errors<CaseField>();
	errors.add('title', requiredText(draft.title, TITLE_MAX));
	errors.add('preconditions', tooLong(draft.preconditions, TEXT_MAX));
	if (draft.steps.length > STEPS_MAX) errors.add('steps', { kind: 'too-many', max: STEPS_MAX });
	draft.steps.forEach((step, i) => {
		errors.add(`steps.${i}.action`, requiredText(step.action, TEXT_MAX));
		errors.add(`steps.${i}.expected`, tooLong(step.expected, TEXT_MAX));
	});
	const hasExpected = [draft.expected, ...draft.steps.map((s) => s.expected)].some(
		(text) => text.trim() !== ''
	);
	errors.add('expected', hasExpected ? tooLong(draft.expected, TEXT_MAX) : { kind: 'no-expected' });
	if (draft.tags.length > TAGS_MAX) errors.add('tags', { kind: 'too-many', max: TAGS_MAX });
	const invalid = draft.tags.find((tag) => !isValidTag(tag));
	if (invalid !== undefined) errors.add('tags', { kind: 'invalid-tag', tag: invalid });
	return errors.list;
}

export type RunField = 'name' | 'release' | 'environment' | 'cases';

export interface RunDraft {
	name: string;
	release: string;
	environment: string;
	caseCount: number;
}

/** Every problem that blocks creating a run (FR-110 AC-1, PRD 10.5). */
export function runErrors(draft: RunDraft): FieldError<RunField>[] {
	const errors = new Errors<RunField>();
	errors.add('name', requiredText(draft.name, TITLE_MAX));
	errors.add('release', tooLong(draft.release, RELEASE_MAX));
	errors.add('environment', tooLong(draft.environment, TEXT_MAX));
	if (draft.caseCount < 1 || draft.caseCount > CASES_PER_RUN_MAX) {
		errors.add('cases', { kind: 'out-of-range', min: 1, max: CASES_PER_RUN_MAX });
	}
	return errors.list;
}

export type ResultField = 'failedStep' | 'actual' | 'reason' | 'notes' | 'linkedIssue';

export interface ResultDraft {
	status: ResultStatus;
	failedStep: number | null;
	actual: string;
	reason: string;
	notes: string;
	linkedIssue: string;
}

/**
 * Every problem that blocks saving a result. Fail needs the actual result (FR-111 AC-3) and a
 * failed step that exists, or 0 for "not step-specific"; Blocked needs the reason (AC-4). Fields
 * of another status are not checked: they are kept so a status change can be undone (AC-6).
 */
export function resultErrors(draft: ResultDraft, stepCount: number): FieldError<ResultField>[] {
	const errors = new Errors<ResultField>();
	if (draft.status === 'fail') {
		const step = draft.failedStep;
		if (step !== null && (!Number.isInteger(step) || step < 0 || step > stepCount)) {
			errors.add('failedStep', { kind: 'out-of-range', min: 0, max: stepCount });
		}
		errors.add('actual', requiredText(draft.actual, TEXT_MAX));
	} else {
		errors.add('actual', tooLong(draft.actual, TEXT_MAX));
	}
	errors.add(
		'reason',
		draft.status === 'blocked'
			? requiredText(draft.reason, TEXT_MAX)
			: tooLong(draft.reason, TEXT_MAX)
	);
	errors.add('notes', tooLong(draft.notes, TEXT_MAX));
	errors.add('linkedIssue', tooLong(draft.linkedIssue, ISSUE_MAX));
	return errors.list;
}
