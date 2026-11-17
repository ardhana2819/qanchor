import { describe, expect, it } from 'vitest';
import { CHECKLISTS, itemCount, type Checklist } from '#lib/content/checklists/index.ts';
import { filterChecklists, splitMatches, toMarkdown } from './checklists.ts';

const sample: Checklist = {
	slug: 'sample',
	title: 'Sample',
	summary: 'Two short sections.',
	sections: [
		{ heading: 'First', items: ['Alpha works.', 'Beta works.'] },
		{ heading: 'Second', items: ['Gamma works.'] }
	]
};

const other: Checklist = {
	slug: 'other',
	title: 'Other',
	summary: 'Unrelated.',
	sections: [{ heading: 'Only', items: ['Delta works.', 'Alphabet soup is served.'] }]
};

describe('toMarkdown', () => {
	it('writes the title, summary, headings, and one task line per item (FR-061 AC-1)', () => {
		expect(toMarkdown(sample)).toBe(
			[
				'# Sample',
				'',
				'Two short sections.',
				'',
				'## First',
				'',
				'- [ ] Alpha works.',
				'- [ ] Beta works.',
				'',
				'## Second',
				'',
				'- [ ] Gamma works.',
				''
			].join('\n')
		);
	});

	it('has one unchecked task line per item for every real checklist', () => {
		for (const checklist of CHECKLISTS) {
			const lines = toMarkdown(checklist).split('\n');
			expect(lines.filter((line) => line.startsWith('- [ ] '))).toHaveLength(itemCount(checklist));
			expect(lines.filter((line) => line.startsWith('## '))).toHaveLength(
				checklist.sections.length
			);
			expect(lines.filter((line) => line.startsWith('# '))).toEqual([`# ${checklist.title}`]);
		}
	});
});

describe('filterChecklists', () => {
	const both = [sample, other];

	it('keeps everything for an empty or blank filter', () => {
		for (const text of ['', '   ']) {
			expect(filterChecklists(both, text)).toEqual([
				{ checklist: sample, items: null },
				{ checklist: other, items: null }
			]);
		}
	});

	it('keeps the whole checklist when the title or summary matches', () => {
		expect(filterChecklists(both, 'sample')).toEqual([{ checklist: sample, items: null }]);
		expect(filterChecklists(both, 'UNRELATED')).toEqual([{ checklist: other, items: null }]);
	});

	it('keeps only matching items, ignoring case and surrounding spaces (FR-060 AC-3)', () => {
		expect(filterChecklists(both, '  ALPHA ')).toEqual([
			{ checklist: sample, items: [{ heading: 'First', item: 'Alpha works.' }] },
			{ checklist: other, items: [{ heading: 'Only', item: 'Alphabet soup is served.' }] }
		]);
	});

	it('counts a matching section heading for each of its items', () => {
		expect(filterChecklists(both, 'second')).toEqual([
			{ checklist: sample, items: [{ heading: 'Second', item: 'Gamma works.' }] }
		]);
	});

	it('returns nothing when no checklist or item contains the text', () => {
		expect(filterChecklists(both, 'zeta')).toEqual([]);
	});

	it('matches text inside items of the real content', () => {
		const [match] = filterChecklists(CHECKLISTS, '4294967295');
		expect(match?.checklist.slug).toBe('memo-tag');
		expect(match?.items?.length).toBeGreaterThan(0);
	});
});

describe('splitMatches', () => {
	it('marks every case-insensitive occurrence and keeps the original case', () => {
		expect(splitMatches('Tag, then TAG.', ' tag ')).toEqual([
			{ text: 'Tag', match: true },
			{ text: ', then ', match: false },
			{ text: 'TAG', match: true },
			{ text: '.', match: false }
		]);
	});

	it('returns the text unmarked for a blank filter or no match', () => {
		expect(splitMatches('Memo', '  ')).toEqual([{ text: 'Memo', match: false }]);
		expect(splitMatches('Memo', 'xyz')).toEqual([{ text: 'Memo', match: false }]);
	});

	it('relies on lower-casing keeping the length of every piece of content', () => {
		for (const { title, summary, sections } of CHECKLISTS) {
			const texts = [title, summary, ...sections.flatMap((s) => [s.heading, ...s.items])];
			for (const text of texts) expect(text.toLowerCase()).toHaveLength(text.length);
		}
	});

	it('does not overlap matches', () => {
		expect(splitMatches('aaa', 'aa')).toEqual([
			{ text: 'aa', match: true },
			{ text: 'a', match: false }
		]);
	});
});
