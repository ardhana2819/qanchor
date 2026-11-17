import { describe, expect, it } from 'vitest';
import { CHECKLISTS, itemCount } from './index.ts';

describe('checklist content (FR-060 AC-1, AC-2)', () => {
	it('has one checklist per decided topic, with unique URL-safe slugs', () => {
		expect(CHECKLISTS.map((c) => c.slug)).toEqual([
			'deposit',
			'withdraw',
			'swap',
			'staking',
			'network-mismatch',
			'memo-tag',
			'stocks'
		]);
		for (const { slug } of CHECKLISTS) expect(slug).toMatch(/^[a-z]+(-[a-z]+)*$/);
	});

	it('every checklist has a title, a one-line summary, and items under headings', () => {
		for (const checklist of CHECKLISTS) {
			expect(checklist.title.trim()).toBe(checklist.title);
			expect(checklist.summary).toMatch(/^[A-Z].*\.$/);
			expect(checklist.sections.length).toBeGreaterThan(1);
			expect(new Set(checklist.sections.map((s) => s.heading)).size).toBe(
				checklist.sections.length
			);
			for (const { heading, items } of checklist.sections) {
				expect(heading).toMatch(/^[A-Z]\S*( \S+)*$/);
				expect(items.length).toBeGreaterThan(0);
			}
		}
	});

	it('each item is one sentence: a capital, one full stop at the end, no line breaks', () => {
		for (const checklist of CHECKLISTS) {
			const items = checklist.sections.flatMap((s) => s.items);
			expect(new Set(items).size, checklist.slug).toBe(items.length);
			for (const item of items) {
				expect(item, item).toMatch(/^[A-Z0-9].*[^.]\.$/);
				expect(item, item).not.toMatch(/[\r\n]|\s{2}|^\s|\s$/);
				// A second sentence would start after ". " with a capital; "e.g." style abbreviations are not used.
				expect(item, item).not.toMatch(/\.\s+[A-Z]/);
				// Square brackets would turn into Markdown links or task boxes when copied (FR-061).
				expect(item, item).not.toMatch(/[[\]]/);
			}
		}
	});

	it('counts items across sections', () => {
		const counts = Object.fromEntries(CHECKLISTS.map((c) => [c.slug, itemCount(c)]));
		for (const count of Object.values(counts)) expect(count).toBeGreaterThanOrEqual(15);
		expect(itemCount({ slug: 'x', title: 'X', summary: 'X.', sections: [] })).toBe(0);
	});
});
