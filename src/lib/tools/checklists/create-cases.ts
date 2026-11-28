import { EMPTY_FILTER, filterToQuery } from '#lib/core/qa/filter.ts';
import { normalizeTag } from '#lib/core/qa/tags.ts';
import { CASES_MAX } from '#lib/core/qa/validation.ts';

// Copy for Create test cases on a checklist page (design 13.3 S-07, 13.7; FR-150).

const cases = (n: number) => `${n.toLocaleString('en')} test ${n === 1 ? 'case' : 'cases'}`;

/** Without a count when there is nothing to create, as the button is then disabled. */
export const createButtonText = (n: number) =>
	n === 0 ? 'Create test cases' : `Create ${cases(n)}`;
export const creatingText = (n: number) => `Creating ${cases(n)}…`;
export const createdText = (n: number) => `Created ${cases(n)}.`;

export function selectedText(selected: number, total: number): string {
	return `${selected.toLocaleString('en')} of ${total.toLocaleString('en')} selected`;
}

/** The duplicate warning (FR-150 AC-3): "6 of these items already exist as test cases with the tag deposit." */
export function duplicateText(count: number, slug: string): string {
	const tag = normalizeTag(slug);
	return count === 1
		? `1 of these items already exists as a test case with the tag ${tag}.`
		: `${count.toLocaleString('en')} of these items already exist as test cases with the tag ${tag}.`;
}

/** Why nothing can be created with the current choices, or null when something can. */
export function nothingToCreateText(selected: number, toCreate: number): string | null {
	if (selected === 0) return 'Select at least one item.';
	return toCreate === 0 ? 'Every selected item already exists as a test case.' : null;
}

/** The limit, counted for a batch (PRD 10.5): how many more fit. */
export function roomText(stored: number): string {
	const room = Math.max(0, CASES_MAX - stored);
	return (
		`Only ${room.toLocaleString('en')} more test ${room === 1 ? 'case fits' : 'cases fit'}: ` +
		`this browser keeps up to ` +
		`${CASES_MAX.toLocaleString('en')}. Select fewer items, or delete some test cases.`
	);
}

/** The Test cases list filtered by the checklist's tag (FR-150 AC-4), without the base path. */
export function casesQuery(slug: string): string {
	return filterToQuery({ ...EMPTY_FILTER, tags: [normalizeTag(slug)] });
}
