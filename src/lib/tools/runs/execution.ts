import { formatKey } from '#lib/core/qa/keys.ts';
import { countsInWords, type StatusCounts } from '#lib/core/qa/run.ts';
import type { CaseSnapshot, ResultStatus, Step, TestResult } from '#lib/core/qa/types.ts';
import type {
	FieldError,
	FieldProblem,
	ResultField,
	ResultDraft
} from '#lib/core/qa/validation.ts';

// Rules and copy of the run page (design 13.3 P2-04, 13.4, 13.7; FR-111, FR-113).

/** The result form of one case. `status` null: untested, nothing picked yet. */
export interface ResultForm extends Omit<ResultDraft, 'status'> {
	status: ResultStatus | null;
}

export const STATUS_WORDS: Record<ResultStatus, string> = {
	pass: 'Passed',
	fail: 'Failed',
	blocked: 'Blocked'
};

/** The step a new failure points at: the last step, or "not step-specific" without steps. */
export function defaultFailedStep(stepCount: number): number {
	return stepCount;
}

/** The form for a case: its stored result, or an untested blank. */
export function formFor(result: TestResult | undefined, stepCount: number): ResultForm {
	if (!result) {
		return {
			status: null,
			failedStep: defaultFailedStep(stepCount),
			actual: '',
			reason: '',
			notes: '',
			linkedIssue: ''
		};
	}
	return {
		status: result.status,
		failedStep: result.failedStep ?? defaultFailedStep(stepCount),
		actual: result.actual,
		reason: result.reason,
		notes: result.notes,
		linkedIssue: result.linkedIssue
	};
}

/** Whether the form holds exactly the stored result, so nothing is waiting to be saved. */
export function isSaved(form: ResultForm, result: TestResult | undefined): boolean {
	if (!result) return form.status === null;
	return (
		form.status === result.status &&
		(result.status !== 'fail' || form.failedStep === result.failedStep) &&
		form.actual === result.actual &&
		form.reason === result.reason &&
		form.notes === result.notes &&
		form.linkedIssue.trim() === result.linkedIssue
	);
}

/** "Step 1: Open the deposit screen…", then "Not step-specific" (design 13.3 P2-04). */
export function failedStepOptions(steps: readonly Step[]): { value: string; label: string }[] {
	const options = steps.map((step, index) => {
		const words = step.action.trim().split(/\s+/);
		const start = words.slice(0, 5).join(' ');
		return {
			value: String(index + 1),
			label: `Step ${index + 1}: ${start}${words.length > 5 ? '…' : ''}`
		};
	});
	return [...options, { value: '0', label: 'Not step-specific' }];
}

/** The text under the result control (design 13.3 P2-04, prototype). */
export function saveStatusText(
	form: ResultForm,
	result: TestResult | undefined,
	completed: boolean
): string {
	if (completed) return 'This run is completed. Reopen it to change results.';
	if (form.status === null) return 'Pick a result. Pass is saved at once.';
	if (result && isSaved(form, result)) return `Saved ${clockTime(result.updatedAt)}`;
	if (form.status === 'fail') return 'Not saved yet: write the actual result, then save.';
	if (form.status === 'blocked') return 'Not saved yet: write the reason, then save.';
	return 'Not saved yet.';
}

/** "14:02" in local time. */
export function clockTime(time: number): string {
	const date = new Date(time);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** The first problem per field of the result form (design 13.7). */
export function resultErrorsByField(
	errors: readonly FieldError<ResultField>[]
): Map<ResultField, string> {
	const byField = new Map<ResultField, string>();
	for (const { field, problem } of errors) {
		if (!byField.has(field)) byField.set(field, problemText(field, problem));
	}
	return byField;
}

function problemText(field: ResultField, problem: FieldProblem): string {
	if (problem.kind === 'required') {
		return field === 'actual'
			? 'Write the actual result to save a failure.'
			: 'Write the reason to save a block.';
	}
	if (problem.kind === 'too-long') return `Up to ${problem.max.toLocaleString('en')} characters.`;
	return 'Pick a step from the list.';
}

export type CaseListFilter = 'all' | 'untested' | ResultStatus;

export const CASE_LIST_FILTERS: readonly { value: CaseListFilter; label: string }[] = [
	{ value: 'all', label: 'All cases' },
	{ value: 'untested', label: 'Untested' },
	{ value: 'fail', label: 'Failed' },
	{ value: 'blocked', label: 'Blocked' },
	{ value: 'pass', label: 'Passed' }
];

/** The index of the case named in the URL (`case=TC-12`), or the first case. */
export function caseIndexFromQuery(search: string, cases: readonly CaseSnapshot[]): number {
	const wanted = new URLSearchParams(search).get('case');
	const index = cases.findIndex((c) => formatKey(c.number) === wanted);
	return Math.max(0, index);
}

/** "TC-12 marked Failed. 18 passed, 3 failed, 2 blocked, 17 untested." (design 13.8) */
export function markedText(number: number, status: ResultStatus, counts: StatusCounts): string {
	return `${formatKey(number)} marked ${STATUS_WORDS[status]}. ${countsInWords(counts)}.`;
}

/** "Case 19 of 40: <title>", read out when another case opens (design 13.8). */
export function positionText(index: number, total: number, title: string): string {
	return `Case ${index + 1} of ${total}: ${title}`;
}

/** The complete confirmation's body (FR-113 AC-2, design 13.7). */
export function completeBody(untested: number): string {
	if (untested === 0) return 'Every test case has a result.';
	const cases = untested === 1 ? '1 test case is' : `${untested} test cases are`;
	return `${cases} still untested. They will stay untested in the run and the release summary.`;
}

/** "Run completed: 36 passed, 3 failed, 1 blocked." (design 13.7) */
export function completedText(counts: StatusCounts): string {
	return `Run completed: ${counts.pass} passed, ${counts.fail} failed, ${counts.blocked} blocked.`;
}

const SHORTCUT_KEYS = ['p', 'f', 'b', 'j', 'k', '?'] as const;
export type Shortcut = (typeof SHORTCUT_KEYS)[number];

/** The parts of a key press the shortcuts read; a `KeyboardEvent` has them all. */
export interface KeyPress {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	defaultPrevented: boolean;
	target: EventTarget | null;
}

/**
 * The shortcut a key press means, or null (design 13.4): never with Ctrl, Alt, or Cmd, never in
 * a text field, select, or editable content, and never while a dialog is open.
 */
export function shortcutFor(event: KeyPress, dialogOpen: boolean): Shortcut | null {
	if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
	if (dialogOpen || isTypingTarget(event.target)) return null;
	const key = event.key === '?' ? '?' : event.key.toLowerCase();
	return (SHORTCUT_KEYS as readonly string[]).includes(key) ? (key as Shortcut) : null;
}

const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range']);

function isTypingTarget(target: EventTarget | null): boolean {
	const element = target as Partial<HTMLInputElement> | null;
	if (typeof element?.tagName !== 'string') return false;
	if (element.isContentEditable) return true;
	const tag = element.tagName.toLowerCase();
	if (tag === 'textarea' || tag === 'select') return true;
	return tag === 'input' && !NON_TEXT_INPUTS.has(element.type ?? 'text');
}
