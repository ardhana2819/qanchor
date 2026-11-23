import type { StatusCounts } from '#lib/core/qa/run.ts';
import {
	CASES_PER_RUN_MAX,
	type FieldError,
	type FieldProblem,
	type RunField
} from '#lib/core/qa/validation.ts';

// Copy for the run list and New run (design 13.3 P2-03, P2-03a, 13.7).

/** "Run 2026-11-23": the default name of a new run, from the local date (design 13.3). */
export function defaultRunName(now: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `Run ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "18 / 40": cases with a result out of all cases, beside the results bar (design 13.3). */
export function progressText(counts: StatusCounts): string {
	return `${counts.total - counts.untested} / ${counts.total}`;
}

/** "40 selected" in the picker toolbar and the footer (design 13.3 P2-03a). */
export function selectedText(count: number): string {
	return `${count.toLocaleString('en')} selected`;
}

/** Why Create run is disabled, or null when the selection can make a run (FR-110 AC-1). */
export function selectionProblem(count: number): string | null {
	if (count < 1) return 'Select at least one test case.';
	if (count > CASES_PER_RUN_MAX) return `Up to ${CASES_PER_RUN_MAX} test cases per run.`;
	return null;
}

/** The first problem per field of the run form, as shown under it (design 13.7). */
export function runErrorsByField(errors: readonly FieldError<RunField>[]): Map<RunField, string> {
	const byField = new Map<RunField, string>();
	for (const { field, problem } of errors) {
		if (!byField.has(field)) byField.set(field, problemText(field, problem));
	}
	return byField;
}

// The case count is not a field: Create run stays disabled until `selectionProblem` is null.
function problemText(field: RunField, problem: FieldProblem): string {
	if (problem.kind === 'required')
		return field === 'name' ? 'Enter a name.' : 'Fill in this field.';
	if (problem.kind === 'too-long') return `Up to ${problem.max.toLocaleString('en')} characters.`;
	return 'Check this field.';
}

/** The delete confirmation's body (FR-113 AC-4, design 13.7); screenshots come in slice 2b. */
export function deleteRunBody(resultCount: number): string {
	if (resultCount === 0) return 'It has no results yet. This cannot be undone.';
	if (resultCount === 1) return 'Its 1 result is deleted too. This cannot be undone.';
	return `Its ${resultCount.toLocaleString('en')} results are deleted too. This cannot be undone.`;
}

export const deleteRunTitle = (name: string) => `Delete run "${name}"?`;
export const deletedRunText = (name: string) => `Deleted run "${name}".`;
export const createdRunText = (name: string) => `Created run "${name}".`;
