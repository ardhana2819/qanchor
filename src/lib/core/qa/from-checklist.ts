import type { Checklist } from '#lib/content/checklists/index.ts';
import { normalizeTag, TAG_MAX_LENGTH } from './tags.ts';
import type { TestCase } from './types.ts';

// Checklist items as test cases (FR-150). Each item is written as expected behaviour (T-032),
// so it becomes both the title and the case-level expected result; the tester adds steps.

/** One checklist item, with an ID that stays the same while the checklist does not change. */
export interface ChecklistItem {
	/** `<section index>-<item index>`, both from 0. */
	id: string;
	heading: string;
	text: string;
}

export type CaseFields = Omit<TestCase, 'id' | 'number' | 'createdAt' | 'updatedAt'>;

export function checklistItems(checklist: Checklist): ChecklistItem[] {
	return checklist.sections.flatMap((section, s) =>
		section.items.map((text, i) => ({ id: `${s}-${i}`, heading: section.heading, text }))
	);
}

/**
 * A section heading as a tag (FR-150 AC-2): lowercase, every run of characters a tag cannot hold
 * becomes one `-`, without `-` at either end, cut to the tag length. "Allowance (on-chain swaps)"
 * becomes `allowance-on-chain-swaps`.
 */
export function sectionTag(heading: string): string {
	return normalizeTag(heading)
		.replace(/[^\p{L}\p{N}._]+/gu, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, TAG_MAX_LENGTH)
		.replace(/-+$/, '');
}

/** The case for an item (FR-150 AC-2): no steps, Medium priority, the checklist and section tags. */
export function caseFromItem(
	slug: string,
	item: Pick<ChecklistItem, 'heading' | 'text'>
): CaseFields {
	const tags = [normalizeTag(slug), sectionTag(item.heading)].filter(Boolean);
	return {
		title: item.text,
		preconditions: '',
		steps: [],
		expected: item.text,
		tags: [...new Set(tags)],
		priority: 'medium'
	};
}

const sameTitle = (title: string) => title.trim().toLowerCase();

/**
 * The items that already exist as a case with the same title and the checklist's tag (FR-150
 * AC-3), so converting twice can skip them. Titles are compared trimmed and ignoring case.
 */
export function existingItemIds(
	items: readonly ChecklistItem[],
	cases: readonly Pick<TestCase, 'title' | 'tags'>[],
	slug: string
): Set<string> {
	const tag = normalizeTag(slug);
	const titles = new Set(cases.filter((c) => c.tags.includes(tag)).map((c) => sameTitle(c.title)));
	return new Set(items.filter((item) => titles.has(sameTitle(item.text))).map((item) => item.id));
}
