import { describe, expect, it } from 'vitest';
import {
	EMPTY_FILTER,
	filterCases,
	filterFromQuery,
	filterToQuery,
	isEmptyFilter,
	matchesFilter,
	type CaseFilter
} from './filter.ts';
import type { Priority } from './types.ts';

const item = (number: number, title: string, tags: string[], priority: Priority) => ({
	number,
	title,
	tags,
	priority
});

const CASES = [
	item(1, 'Deposit USDT on Tron', ['deposit', 'tron'], 'high'),
	item(2, 'Withdraw ETH', ['withdraw', 'evm'], 'critical'),
	item(12, 'Deposit memo tag', ['deposit', 'memo'], 'medium'),
	item(120, 'Login', [], 'low')
];

const filter = (part: Partial<CaseFilter>): CaseFilter => ({ ...EMPTY_FILTER, ...part });
const numbers = (f: CaseFilter) => filterCases(CASES, f).map((c) => c.number);

describe('case filter (FR-101 AC-2)', () => {
	it('keeps everything for the empty filter', () => {
		expect(isEmptyFilter(EMPTY_FILTER)).toBe(true);
		expect(isEmptyFilter(filter({ text: '  ' }))).toBe(true);
		expect(numbers(EMPTY_FILTER)).toEqual([1, 2, 12, 120]);
	});

	it('matches text in the title, ignoring case and surrounding spaces', () => {
		expect(numbers(filter({ text: '  DEPOSIT ' }))).toEqual([1, 12]);
	});

	it('matches text in the key', () => {
		expect(numbers(filter({ text: 'tc-12' }))).toEqual([12, 120]);
		expect(numbers(filter({ text: 'TC-2' }))).toEqual([2]);
	});

	it('does not match text across the key and the title', () => {
		expect(numbers(filter({ text: '1 deposit usdt x' }))).toEqual([]);
	});

	it('requires every picked tag', () => {
		expect(numbers(filter({ tags: ['deposit'] }))).toEqual([1, 12]);
		expect(numbers(filter({ tags: ['deposit', 'memo'] }))).toEqual([12]);
		expect(numbers(filter({ tags: ['deposit', 'evm'] }))).toEqual([]);
	});

	it('accepts any picked priority', () => {
		expect(numbers(filter({ priorities: ['critical', 'low'] }))).toEqual([2, 120]);
		expect(numbers(filter({ priorities: ['medium'] }))).toEqual([12]);
	});

	it('combines text, tags, and priorities with AND', () => {
		const f = filter({ text: 'deposit', tags: ['deposit'], priorities: ['medium', 'low'] });
		expect(numbers(f)).toEqual([12]);
		expect(matchesFilter(CASES[0]!, f)).toBe(false);
	});

	it('returns a new array, not the input', () => {
		const out = filterCases(CASES, EMPTY_FILTER);
		expect(out).toEqual(CASES);
		expect(out).not.toBe(CASES);
	});
});

describe('filter in the URL query (FR-101 AC-2)', () => {
	it('writes nothing for the empty filter', () => {
		expect(filterToQuery(EMPTY_FILTER)).toBe('');
	});

	it('round-trips a full filter', () => {
		const f = filter({
			text: 'USDT & more',
			tags: ['deposit', 'v2.3'],
			priorities: ['high', 'low']
		});
		const query = filterToQuery(f);
		expect(query).toBe('q=USDT+%26+more&tag=deposit&tag=v2.3&priority=high&priority=low');
		expect(filterFromQuery(query)).toEqual(f);
		expect(filterFromQuery(`?${query}`)).toEqual(f);
	});

	it('keeps other parameters and replaces the old filter', () => {
		expect(filterToQuery(filter({ tags: ['memo'] }), '?id=7&q=old&tag=x&priority=low')).toBe(
			'id=7&tag=memo'
		);
	});

	it('cleans a hand-edited query', () => {
		expect(
			filterFromQuery('tag=Deposit&tag=deposit&tag=&priority=urgent&priority=low&priority=low')
		).toEqual({ text: '', tags: ['deposit'], priorities: ['low'] });
	});

	it('lists priorities in their fixed order', () => {
		expect(filterFromQuery('priority=low&priority=critical').priorities).toEqual([
			'critical',
			'low'
		]);
	});
});
