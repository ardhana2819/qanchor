import type { ReleaseGroup, ReleaseTotals } from '#lib/core/qa/release.ts';

// Copy and URLs for the Releases list and the release page (design 13.3 P2-07, 13.7; plan
// finding F-16).

/** The release page's query: the first spelling, encoded, or `none` for "No release". */
export function releaseQuery(group: Pick<ReleaseGroup, 'key' | 'name'>): string {
	return group.key === '' ? 'none' : `name=${encodeURIComponent(group.name)}`;
}

/**
 * The release a page URL asks for: its name, '' for "No release", or null when the URL names
 * neither (the page then goes to the list, EC-028). A blank name is treated as missing.
 */
export function requestedRelease(params: Pick<URLSearchParams, 'has' | 'get'>): string | null {
	if (params.has('none')) return '';
	const name = params.get('name')?.trim();
	return name ? name : null;
}

export const unknownReleaseText = (name: string) => `No run or session uses the release "${name}".`;

export const COPIED_SUMMARY = 'Copied release summary';

/** Under the pass rate: the numbers it comes from (FR-141 AC-2). */
export function passRateDetail(totals: Pick<ReleaseTotals, 'pass' | 'executed'>): string {
	return totals.executed === 0
		? 'No case executed yet'
		: `from ${totals.pass} of ${totals.executed} executed`;
}

const plural = (n: number, word: string) =>
	`${n.toLocaleString('en')} ${word}${n === 1 ? '' : 's'}`;

/** "2 runs · 1 session" under the release name. */
export function releaseCountsText(group: Pick<ReleaseGroup, 'runs' | 'sessions'>): string {
	return `${plural(group.runs.length, 'run')} · ${plural(group.sessions.length, 'session')}`;
}

/**
 * The disclosure that holds the cases that are not open (design 13.3 P2-07): "Show 96 passed",
 * "Show 96 passed and 4 untested", or "Show 4 untested".
 */
export function otherCasesText(passed: number, untested: number): string {
	const parts = [
		passed > 0 ? `${passed.toLocaleString('en')} passed` : '',
		untested > 0 ? `${untested.toLocaleString('en')} untested` : ''
	].filter(Boolean);
	return `Show ${parts.join(' and ')}`;
}
