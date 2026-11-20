import { formatKey } from './keys.ts';
import { normalizeTag } from './tags.ts';
import { PRIORITIES, type Priority, type TestCase } from './types.ts';

// The test case filter (FR-101 AC-2), shared by the case list and the new-run picker (FR-110
// AC-1). Its state lives in the URL query so it survives a reload.

export interface CaseFilter {
	/** Matched against the key and the title, ignoring case and surrounding spaces. */
	text: string;
	/** Every tag must be on the case. */
	tags: readonly string[];
	/** The case may have any of these; none selected means every priority. */
	priorities: readonly Priority[];
}

export const EMPTY_FILTER: CaseFilter = { text: '', tags: [], priorities: [] };

type Filterable = Pick<TestCase, 'number' | 'title' | 'tags' | 'priority'>;

export function isEmptyFilter(filter: CaseFilter): boolean {
	return filter.text.trim() === '' && filter.tags.length === 0 && filter.priorities.length === 0;
}

export function matchesFilter(item: Filterable, filter: CaseFilter): boolean {
	const needle = filter.text.trim().toLowerCase();
	if (needle !== '') {
		const haystack = `${formatKey(item.number)} ${item.title}`.toLowerCase();
		if (!haystack.includes(needle)) return false;
	}
	if (!filter.tags.every((tag) => item.tags.includes(tag))) return false;
	return filter.priorities.length === 0 || filter.priorities.includes(item.priority);
}

export function filterCases<T extends Filterable>(items: readonly T[], filter: CaseFilter): T[] {
	if (isEmptyFilter(filter)) return [...items];
	return items.filter((item) => matchesFilter(item, filter));
}

const PARAM = { text: 'q', tag: 'tag', priority: 'priority' } as const;

/**
 * The filter in a URL query. Tags are normalised; unknown priorities and duplicates are dropped,
 * so a hand-edited or outdated URL still gives a valid filter.
 */
export function filterFromQuery(search: string): CaseFilter {
	const params = new URLSearchParams(search);
	const tags = new Set(params.getAll(PARAM.tag).map(normalizeTag).filter(Boolean));
	const wanted = new Set(params.getAll(PARAM.priority));
	return {
		text: params.get(PARAM.text) ?? '',
		tags: [...tags],
		priorities: PRIORITIES.filter((p) => wanted.has(p))
	};
}

/**
 * The query for a filter, without the leading `?`, keeping any other parameter of `search` (such
 * as a selected case). Empty parts are left out, so the empty filter adds nothing.
 */
export function filterToQuery(filter: CaseFilter, search = ''): string {
	const params = new URLSearchParams(search);
	for (const name of Object.values(PARAM)) params.delete(name);
	if (filter.text !== '') params.set(PARAM.text, filter.text);
	for (const tag of filter.tags) params.append(PARAM.tag, tag);
	for (const priority of filter.priorities) params.append(PARAM.priority, priority);
	return params.toString();
}
