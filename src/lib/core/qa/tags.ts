// Tags on a test case (FR-100 AC-5, PRD 10.5).

export const TAG_MAX_LENGTH = 32;
export const TAGS_MAX = 10;

// Letters (any script), digits, `-`, `_`, `.`. The `u` flag counts code points.
const TAG_PATTERN = new RegExp(`^[\\p{L}\\p{N}._-]{1,${TAG_MAX_LENGTH}}$`, 'u');

/** The stored form of a tag: trimmed and lowercased. */
export function normalizeTag(text: string): string {
	return text.trim().toLowerCase();
}

/** Whether a normalised tag has an allowed length and characters. */
export function isValidTag(tag: string): boolean {
	return TAG_PATTERN.test(tag);
}

/**
 * Normalises each tag and drops blanks and duplicates, keeping the first occurrence's position.
 * Invalid tags are kept, so the editor can show them with an error instead of losing them.
 */
export function normalizeTags(tags: readonly string[]): string[] {
	const seen = new Set<string>();
	for (const text of tags) {
		const tag = normalizeTag(text);
		if (tag !== '') seen.add(tag);
	}
	return [...seen];
}

/**
 * Known tags that start with the typed text, excluding tags the case already has, sorted. An
 * empty input suggests nothing.
 */
export function suggestTags(
	known: Iterable<string>,
	typed: string,
	current: readonly string[]
): string[] {
	const prefix = normalizeTag(typed);
	if (prefix === '') return [];
	const taken = new Set(current);
	const matches = new Set<string>();
	for (const tag of known) {
		if (tag.startsWith(prefix) && !taken.has(tag)) matches.add(tag);
	}
	return [...matches].sort();
}
