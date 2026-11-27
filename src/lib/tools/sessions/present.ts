import { clockText, durationText, elapsedMs } from '#lib/core/qa/session.ts';
import {
	FINDING_TYPE_LABELS,
	FINDING_TYPES,
	TIMEBOX_PRESETS,
	type FindingType,
	type Session
} from '#lib/core/qa/types.ts';
import type { FieldError, FieldProblem, SessionField } from '#lib/core/qa/validation.ts';

// Copy and form rules for the Sessions list and the session page (design 13.3 P2-06, 13.7).

/** A preset's minutes as text, or Custom with its own minutes field. */
export type TimeboxChoice = `${(typeof TIMEBOX_PRESETS)[number]}` | 'custom';

export const TIMEBOX_OPTIONS: readonly { value: TimeboxChoice; label: string }[] = [
	...TIMEBOX_PRESETS.map((minutes) => ({
		value: `${minutes}` as TimeboxChoice,
		label: `${minutes} min`
	})),
	{ value: 'custom', label: 'Custom' }
];

/**
 * The timebox in minutes for the chosen option. Custom reads the minutes field: empty or not a
 * whole number gives NaN, which `sessionErrors` rejects as out of range.
 */
export function timeboxMinutes(choice: TimeboxChoice, custom: string): number {
	if (choice !== 'custom') return Number(choice);
	const text = custom.trim();
	return /^\d+$/.test(text) ? Number(text) : NaN;
}

/** The control's state for a stored timebox: its preset, or Custom with the minutes. */
export function timeboxChoiceOf(minutes: number): { choice: TimeboxChoice; custom: string } {
	const preset = TIMEBOX_OPTIONS.find((option) => option.value === `${minutes}`);
	return preset ? { choice: preset.value, custom: '' } : { choice: 'custom', custom: `${minutes}` };
}

/** The first problem per field of the session form, as shown under it (design 13.7). */
export function sessionErrorsByField(
	errors: readonly FieldError<SessionField>[]
): Map<SessionField, string> {
	const byField = new Map<SessionField, string>();
	for (const { field, problem } of errors) {
		if (!byField.has(field)) byField.set(field, problemText(field, problem));
	}
	return byField;
}

function problemText(field: SessionField, problem: FieldProblem): string {
	if (problem.kind === 'required')
		return field === 'charter' ? 'Enter a charter.' : 'Fill in this field.';
	if (problem.kind === 'too-long') return `Up to ${problem.max.toLocaleString('en')} characters.`;
	if (problem.kind === 'out-of-range')
		return `Timebox from ${problem.min} to ${problem.max} minutes.`;
	return 'Check this field.';
}

const countWord = (count: number, word: string) =>
	`${count.toLocaleString('en')} ${word}${count === 1 ? '' : 's'}`;

/** The delete confirmation's body, naming the findings and screenshots deleted with it. */
export function deleteSessionBody(findingCount: number, screenshotCount: number): string {
	if (findingCount === 0) return 'It has no findings. This cannot be undone.';
	const findings = countWord(findingCount, 'finding');
	const what = screenshotCount
		? `${findings} and ${countWord(screenshotCount, 'screenshot')} are`
		: `${findings} ${findingCount === 1 ? 'is' : 'are'}`;
	return `Its ${what} deleted too. This cannot be undone.`;
}

export const deleteSessionTitle = (charter: string) => `Delete session "${charter}"?`;
export const deletedSessionText = (charter: string) => `Deleted session "${charter}".`;

/** The clock line (design 13.9 decision 2): live while running or paused, the total once ended. */
export function clockLine(session: Session, now: number): string {
	if (session.status === 'ended') return `Ended after ${durationText(elapsedMs(session, now))}`;
	const text = clockText(session, now);
	return session.status === 'paused' ? `${text} · paused` : text;
}

export const TIMEBOX_REACHED = 'Timebox reached. The session keeps running until you end it.';

export const FINDING_TYPE_OPTIONS: readonly { value: FindingType; label: string }[] =
	FINDING_TYPES.map((type) => ({ value: type, label: FINDING_TYPE_LABELS[type] }));

export type FindingFilter = FindingType | 'all';

/** The findings list filter (FR-131 AC-2): all, or one type. */
export const FINDING_FILTER_OPTIONS: readonly { value: FindingFilter; label: string }[] = [
	{ value: 'all', label: 'All' },
	...FINDING_TYPE_OPTIONS
];

/** The finding field's error, as shown under it. */
export function findingTextError(errors: readonly FieldError<'text'>[]): string | undefined {
	const problem = errors[0]?.problem;
	if (!problem) return undefined;
	if (problem.kind === 'too-long') return `Up to ${problem.max.toLocaleString('en')} characters.`;
	return 'Write the finding.';
}

/** "No bug findings." under a filter that matches none. */
export const noFindingsOfType = (type: FindingType) =>
	`No ${FINDING_TYPE_LABELS[type].toLowerCase()} findings.`;

/** The finding delete confirmation's body. */
export function deleteFindingBody(screenshotCount: number): string {
	if (screenshotCount === 0) return 'This cannot be undone.';
	return `Its ${countWord(screenshotCount, 'screenshot')} ${screenshotCount === 1 ? 'is' : 'are'} deleted too. This cannot be undone.`;
}
