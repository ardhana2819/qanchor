import { formatKey } from '#lib/core/qa/keys.ts';
import { CASES_MAX } from '#lib/core/qa/validation.ts';
import type { CaseSaveError } from '#lib/state/test-cases.svelte.ts';
import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';

// Copy for the test case list (design 13.3 P2-01, 13.7).

export { PRIORITY_LABELS } from '#lib/core/qa/types.ts';

export const SAVE_ERRORS: Record<CaseSaveError, string> = {
	...WRITE_ERRORS,
	limit: `This browser already keeps ${CASES_MAX.toLocaleString('en')} test cases, the most it can. Delete some to add more.`
};

const cases = (n: number) => `${n.toLocaleString('en')} ${n === 1 ? 'test case' : 'test cases'}`;

/** "124 test cases", or "12 of 124 match" while a filter hides some. */
export function countText(shown: number, total: number): string {
	return shown === total
		? cases(total)
		: `${shown.toLocaleString('en')} of ${total.toLocaleString('en')} match`;
}

/** The delete confirmation's body (FR-102 AC-2, design 13.7). */
export function deleteBody(runCount: number): string {
	if (runCount === 0) return 'It is not in any run.';
	if (runCount === 1) return 'It is in 1 run. That run keeps its own copy.';
	return `It is in ${runCount} runs. Those runs keep their own copy.`;
}

/** The closed tag filter: "Any tag", "1 tag", "2 tags". */
export function tagFilterSummary(count: number): string {
	if (count === 0) return 'Any tag';
	return `${count} ${count === 1 ? 'tag' : 'tags'}`;
}

/** The chips a row shows, at most three, then "+2" for the rest (design 13.3). */
export function visibleTags(tags: readonly string[]): { shown: string[]; more: number } {
	return { shown: tags.slice(0, 3), more: Math.max(0, tags.length - 3) };
}

export const deletedText = (number: number) => `Deleted ${formatKey(number)}.`;
export const duplicatedText = (number: number) => `Duplicated as ${formatKey(number)}.`;
