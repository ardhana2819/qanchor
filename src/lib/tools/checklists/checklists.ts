import type { Checklist } from '#lib/content/checklists/index.ts';

/**
 * The checklist as a Markdown task list (FR-061 AC-1): the title as a level-1 heading, the
 * summary, then each section as a level-2 heading over `- [ ] item` lines. Ends with one newline.
 */
export function toMarkdown(checklist: Checklist): string {
	const parts = [`# ${checklist.title}`, checklist.summary];
	for (const section of checklist.sections) {
		parts.push(
			`## ${section.heading}\n\n${section.items.map((item) => `- [ ] ${item}`).join('\n')}`
		);
	}
	return `${parts.join('\n\n')}\n`;
}

export interface ItemMatch {
	readonly heading: string;
	readonly item: string;
}

export interface ChecklistMatch {
	readonly checklist: Checklist;
	/** Matching items, or null when the title or summary matched and the whole checklist is shown. */
	readonly items: readonly ItemMatch[] | null;
}

/**
 * Checklists and items that contain the text, ignoring case and surrounding spaces (FR-060
 * AC-3). A match in the title or summary keeps the whole checklist; otherwise only the matching
 * items are kept, and a matching section heading counts for each of its items. An empty or
 * blank filter keeps everything.
 */
export function filterChecklists(checklists: readonly Checklist[], text: string): ChecklistMatch[] {
	const needle = text.trim().toLowerCase();
	if (needle === '') return checklists.map((checklist) => ({ checklist, items: null }));

	const has = (value: string) => value.toLowerCase().includes(needle);
	const matches: ChecklistMatch[] = [];
	for (const checklist of checklists) {
		if (has(checklist.title) || has(checklist.summary)) {
			matches.push({ checklist, items: null });
			continue;
		}
		const items = checklist.sections.flatMap((section) =>
			section.items
				.filter((item) => has(section.heading) || has(item))
				.map((item) => ({ heading: section.heading, item }))
		);
		if (items.length > 0) matches.push({ checklist, items });
	}
	return matches;
}

export interface TextPart {
	readonly text: string;
	readonly match: boolean;
}

/**
 * Splits text around each case-insensitive occurrence of the filter, for highlighting. Indexes
 * into the lower-cased text are used on the original, which holds because lower-casing the
 * checklist content (English) never changes its length.
 */
export function splitMatches(text: string, filter: string): TextPart[] {
	const needle = filter.trim().toLowerCase();
	if (needle === '') return [{ text, match: false }];

	const haystack = text.toLowerCase();
	const parts: TextPart[] = [];
	let from = 0;
	for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, from)) {
		if (at > from) parts.push({ text: text.slice(from, at), match: false });
		parts.push({ text: text.slice(at, at + needle.length), match: true });
		from = at + needle.length;
	}
	if (from < text.length) parts.push({ text: text.slice(from), match: false });
	return parts;
}
