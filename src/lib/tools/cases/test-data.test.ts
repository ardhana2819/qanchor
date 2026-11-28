import { describe, expect, it } from 'vitest';
import type { Person } from '#lib/core/dummy/fields.ts';
import { FIELD_IDS } from '#lib/core/dummy/settings.ts';
import {
	addressText,
	defaultCaret,
	dummyText,
	freshSeed,
	insertedText,
	spliceText,
	targetText
} from './test-data.ts';

const PERSON: Person = {
	name: 'Siti Rahayu',
	gender: 'female',
	birthDate: '1990-04-12',
	phone: '081234567890',
	address: {
		street: 'Jl. Melati No. 5',
		rt: '001',
		rw: '002',
		village: 'Menteng',
		district: 'Menteng',
		regency: 'Jakarta Pusat',
		province: 'DKI Jakarta',
		postalCode: '10310',
		full: 'Jl. Melati No. 5, RT 001/RW 002, Menteng, Menteng, Jakarta Pusat, DKI Jakarta 10310'
	},
	nik: '3171015204900001',
	npwp: '12.345.678.9-012.000',
	bank: { name: 'BCA', code: '014', account: '1234567890' }
};

describe('spliceText (FR-151 AC-2)', () => {
	it('inserts at the caret and puts the caret after the text', () => {
		expect(spliceText('Send to  now', { start: 8, end: 8 }, '0xabc')).toEqual({
			value: 'Send to 0xabc now',
			caret: 13
		});
	});

	it('replaces the selection', () => {
		expect(spliceText('Enter AMOUNT here', { start: 6, end: 12 }, '0.1')).toEqual({
			value: 'Enter 0.1 here',
			caret: 9
		});
	});

	it('works on an empty field, at the start and at the end', () => {
		expect(spliceText('', { start: 0, end: 0 }, 'x')).toEqual({ value: 'x', caret: 1 });
		expect(spliceText('ab', { start: 0, end: 0 }, 'x')).toEqual({ value: 'xab', caret: 1 });
		expect(spliceText('ab', { start: 2, end: 2 }, 'x')).toEqual({ value: 'abx', caret: 3 });
	});

	it('clamps a selection outside the text', () => {
		expect(spliceText('ab', { start: 9, end: 12 }, 'x')).toEqual({ value: 'abx', caret: 3 });
		expect(spliceText('ab', { start: -3, end: -1 }, 'x')).toEqual({ value: 'xab', caret: 1 });
		expect(spliceText('abcd', { start: 3, end: 1 }, 'x')).toEqual({ value: 'abcxd', caret: 4 });
	});

	it('keeps the inserted text literal, whitespace included', () => {
		expect(spliceText('a', { start: 1, end: 1 }, ' 1 ').value).toBe('a 1 ');
	});
});

describe('defaultCaret', () => {
	it('is the end of the action', () => {
		expect(defaultCaret('Open the app')).toEqual({ field: 'action', start: 12, end: 12 });
		expect(defaultCaret('')).toEqual({ field: 'action', start: 0, end: 0 });
	});
});

describe('addressText (FR-151 AC-2)', () => {
	it('is the address alone when valid', () => {
		expect(addressText({ address: '0xAbC', validity: 'valid', reason: '' })).toBe('0xAbC');
	});

	it('follows an invalid sample with its reason in parentheses', () => {
		expect(
			addressText({ address: '0xabg', validity: 'invalid', reason: '"g" is not a hex digit.' })
		).toBe('0xabg ("g" is not a hex digit.)');
	});

	it('is the reason alone for the empty-string sample', () => {
		expect(addressText({ address: '', validity: 'invalid', reason: 'Empty string.' })).toBe(
			'(Empty string.)'
		);
	});
});

describe('dummyText (FR-080)', () => {
	it('gives one value for every field', () => {
		expect(FIELD_IDS.map((id) => dummyText(PERSON, id))).toEqual([
			'Siti Rahayu',
			'female',
			'1990-04-12',
			'3171015204900001',
			'12.345.678.9-012.000',
			'081234567890',
			PERSON.address.full,
			'BCA 1234567890'
		]);
	});
});

describe('freshSeed', () => {
	it('is 16 lowercase hex digits, new each time', () => {
		const a = freshSeed();
		expect(a).toMatch(/^[0-9a-f]{16}$/);
		expect(freshSeed()).not.toBe(a);
	});
});

describe('copy', () => {
	it('names the step and field', () => {
		expect(targetText(2, 'action')).toBe('Into step 2, Action, at the cursor.');
		expect(targetText(3, 'expected')).toBe('Into step 3, Expected result, at the cursor.');
		expect(insertedText(4)).toBe('Test data inserted into step 4.');
	});
});
