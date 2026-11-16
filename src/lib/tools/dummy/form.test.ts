import { describe, expect, it } from 'vitest';
import { formErrors, parseIsoDate, parseWhole, today } from './form.ts';

describe('parseWhole', () => {
	it('accepts digits only, trimmed', () => {
		expect(parseWhole('10')).toBe(10);
		expect(parseWhole(' 0007 ')).toBe(7);
		expect(parseWhole('10000')).toBe(10_000);
	});

	it('rejects anything else as NaN, so the settings check reports it', () => {
		for (const text of ['', ' ', '-1', '1.5', '1e3', '0x10', '1,000', '١٢', 'abc', '1234567890']) {
			expect(parseWhole(text)).toBeNaN();
		}
	});
});

describe('parseIsoDate', () => {
	it('reads YYYY-MM-DD without checking that the day exists', () => {
		expect(parseIsoDate('2026-11-16')).toEqual({ year: 2026, month: 11, day: 16 });
		expect(parseIsoDate(' 2026-02-30 ')).toEqual({ year: 2026, month: 2, day: 30 });
	});

	it('gives NaN parts for any other shape', () => {
		for (const text of ['', '2026-1-16', '16-11-2026', '2026/11/16', '2026-11-16T00:00']) {
			expect(parseIsoDate(text)).toEqual({ year: NaN, month: NaN, day: NaN });
		}
	});
});

describe('today', () => {
	it('is the calendar date in local time, months counted from 1', () => {
		expect(today(new Date(2026, 0, 31, 23, 59))).toEqual({ year: 2026, month: 1, day: 31 });
	});
});

describe('formErrors (design S-09)', () => {
	it('maps each settings error to the control it belongs to', () => {
		expect(formErrors([])).toEqual({});
		expect(
			formErrors([{ code: 'count' }, { code: 'no-fields' }, { code: 'ages' }, { code: 'as-of' }])
		).toEqual({
			count: 'Enter a whole number from 1 to 10,000.',
			fields: 'Select at least one field.',
			ages: 'Enter whole ages from 0 to 120, the first no more than the second.',
			asOf: 'Enter a real date as YYYY-MM-DD.'
		});
	});

	it('names what a preset needs (FR-084 AC-5)', () => {
		expect(formErrors([{ code: 'needs-two-rows' }])).toEqual({
			count: 'This preset needs at least 2 rows.'
		});
		expect(formErrors([{ code: 'needs-field', fields: ['nik', 'phone'] }])).toEqual({
			fields: 'This preset needs NIK or Phone.'
		});
	});

	it('a general error wins over a preset error on the same control', () => {
		expect(formErrors([{ code: 'count' }, { code: 'needs-two-rows' }]).count).toBe(
			'Enter a whole number from 1 to 10,000.'
		);
		expect(
			formErrors([{ code: 'no-fields' }, { code: 'needs-field', fields: ['name'] }]).fields
		).toBe('Select at least one field.');
	});
});
