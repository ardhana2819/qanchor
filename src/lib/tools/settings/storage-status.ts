import { formatSize } from '#lib/core/qa/screenshots.ts';

// Copy for the Storage part of Settings (design 13.3 S-10, 13.7; FR-092 AC-1, AC-2).

/** "38 MB of about 2 GB used"; the quota is the browser's estimate, so it is "about". */
export function usageText(usage: number, quota: number | undefined): string {
	const used = formatSize(usage);
	return quota ? `${used} of about ${formatSize(quota)} used` : `${used} used`;
}

/**
 * How browsers decide, from T-057 and MDN: Chromium browsers and Safari decide on their own from
 * how the site is used, and Firefox asks. Said in one line, as the page does not guess the browser.
 */
export const PERSIST_REFUSED =
	'Chrome, Edge, and Safari decide on their own, for example once you visit often or bookmark the site; Firefox asks you.';
