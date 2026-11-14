import { describe, expect, it } from 'vitest';
import { groupTools, type ToolEntry } from './tools';

const entry = (name: string, group: ToolEntry['group']): ToolEntry => ({
	route: '/',
	name,
	description: `${name} description`,
	group,
	icon: 'swap'
});

describe('groupTools', () => {
	it('returns no groups for an empty list', () => {
		expect(groupTools([])).toEqual([]);
	});

	it('orders groups as in the sidebar and keeps entry order within a group', () => {
		const result = groupTools([
			entry('Dummy data', 'Data'),
			entry('A', 'Blockchain'),
			entry('B', 'Blockchain')
		]);

		expect(result.map(({ group }) => group)).toEqual(['Blockchain', 'Data']);
		expect(result[0].entries.map(({ name }) => name)).toEqual(['A', 'B']);
	});

	it('skips groups that have no entries', () => {
		expect(groupTools([entry('Checklists', 'Data')]).map(({ group }) => group)).toEqual(['Data']);
	});
});
