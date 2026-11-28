import { describe, expect, it } from 'vitest';
import { CHECKLISTS, itemCount, type Checklist } from '#lib/content/checklists/index.ts';
import { isValidTag } from './tags.ts';
import { caseErrors } from './validation.ts';
import { caseFromItem, checklistItems, existingItemIds, sectionTag } from './from-checklist.ts';

const CHECKLIST: Checklist = {
	slug: 'deposit',
	title: 'Deposit',
	summary: 'Deposit checks.',
	sections: [
		{ heading: 'Deposit address', items: ['The address is shown.', 'A QR code is shown.'] },
		{ heading: 'Allowance (on-chain swaps)', items: ['Approval is asked once.'] }
	]
};

describe('checklistItems', () => {
	it('lists every item with its section and a stable ID', () => {
		expect(checklistItems(CHECKLIST)).toEqual([
			{ id: '0-0', heading: 'Deposit address', text: 'The address is shown.' },
			{ id: '0-1', heading: 'Deposit address', text: 'A QR code is shown.' },
			{ id: '1-0', heading: 'Allowance (on-chain swaps)', text: 'Approval is asked once.' }
		]);
	});
});

describe('sectionTag', () => {
	it('turns a heading into a tag (FR-150 AC-2)', () => {
		expect(sectionTag('Deposit address')).toBe('deposit-address');
		expect(sectionTag('Allowance (on-chain swaps)')).toBe('allowance-on-chain-swaps');
		expect(sectionTag('Stellar (XLM) memo')).toBe('stellar-xlm-memo');
		expect(sectionTag('  Fees & receive.amount_  ')).toBe('fees-receive.amount_');
	});

	it('cuts a long heading to the tag length without a trailing dash', () => {
		const tag = sectionTag('Withdraw to a mismatched address on another network');
		expect(tag).toBe('withdraw-to-a-mismatched-address');
		expect(tag.length).toBeLessThanOrEqual(32);
		expect(sectionTag('Withdraw to a mismatched addres x')).toBe('withdraw-to-a-mismatched-addres');
	});

	it('gives a valid tag for every heading of the built-in checklists', () => {
		for (const checklist of CHECKLISTS) {
			for (const section of checklist.sections)
				expect(isValidTag(sectionTag(section.heading))).toBe(true);
		}
	});
});

describe('caseFromItem', () => {
	it('makes the item the title and expected result, with no steps (FR-150 AC-2)', () => {
		expect(
			caseFromItem('deposit', { heading: 'Deposit address', text: 'The address is shown.' })
		).toEqual({
			title: 'The address is shown.',
			preconditions: '',
			steps: [],
			expected: 'The address is shown.',
			tags: ['deposit', 'deposit-address'],
			priority: 'medium'
		});
	});

	it('tags once when the section heading equals the slug', () => {
		expect(caseFromItem('deposit', { heading: 'Deposit', text: 'X' }).tags).toEqual(['deposit']);
	});

	it('passes the case validation for every item of the built-in checklists', () => {
		let checked = 0;
		for (const checklist of CHECKLISTS) {
			for (const item of checklistItems(checklist)) {
				expect(caseErrors(caseFromItem(checklist.slug, item))).toEqual([]);
				checked++;
			}
		}
		expect(checked).toBe(CHECKLISTS.reduce((n, c) => n + itemCount(c), 0));
	});
});

describe('existingItemIds (FR-150 AC-3)', () => {
	const items = checklistItems(CHECKLIST);

	it('finds items stored with the same title and the checklist tag', () => {
		const cases = [
			{ title: ' the address is SHOWN. ', tags: ['deposit', 'deposit-address'] },
			{ title: 'Approval is asked once.', tags: ['deposit'] }
		];
		expect(existingItemIds(items, cases, 'deposit')).toEqual(new Set(['0-0', '1-0']));
	});

	it('ignores a case with the same title but without the checklist tag', () => {
		expect(
			existingItemIds(items, [{ title: 'A QR code is shown.', tags: ['withdraw'] }], 'deposit')
		).toEqual(new Set());
	});
});
