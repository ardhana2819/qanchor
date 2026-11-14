import { describe, expect, it } from 'vitest';
import { PRESET_OPTIONS, presetDecimals, readForm, type FormValues } from './form.ts';

const form = (values: Partial<FormValues>): FormValues => ({
	decimals: '',
	balance: '',
	fee: '',
	min: '',
	max: '',
	...values
});

describe('presets (FR-020 AC-2)', () => {
	it('fill in the decimals verified in T-014', () => {
		expect(
			PRESET_OPTIONS.filter((o) => o.value !== 'custom').map((o) => [
				o.label,
				presetDecimals(o.value)
			])
		).toEqual([
			['ETH (18)', 18],
			['BTC (8)', 8],
			['SOL (9)', 9],
			['TRX (6)', 6],
			['USDT on Ethereum (6)', 6],
			['USDT on Tron (6)', 6],
			['USDT on BNB Smart Chain (18)', 18]
		]);
	});

	it('Custom comes first and fills in nothing', () => {
		expect(PRESET_OPTIONS[0]).toEqual({ value: 'custom', label: 'Custom' });
		expect(presetDecimals('custom')).toBeNull();
	});
});

describe('readForm (FR-020 AC-1)', () => {
	it('empty decimals: not ready, but no error yet', () => {
		expect(readForm(form({}))).toEqual({ ok: false, errors: {} });
	});

	it('decimals only: parameters with no optional values', () => {
		expect(readForm(form({ decimals: '6' }))).toEqual({ ok: true, params: { decimals: 6 } });
	});

	it.each(['37', '-1', '1.5', 'six'])('decimals %j: error stating the allowed format', (d) => {
		expect(readForm(form({ decimals: d }))).toEqual({
			ok: false,
			errors: { decimals: 'Decimals must be a whole number from 0 to 36.' }
		});
	});

	it('converts optional fields to base units, trimming whitespace', () => {
		expect(
			readForm(form({ decimals: '6', balance: ' 10 ', fee: '1.5', min: '0.000001', max: '50000' }))
		).toEqual({
			ok: true,
			params: { decimals: 6, balance: 10_000_000n, fee: 1_500_000n, min: 1n, max: 50_000_000_000n }
		});
	});

	it('blocks a value with more decimal places than the token allows (AC-5)', () => {
		expect(readForm(form({ decimals: '6', balance: '1.1234567' }))).toEqual({
			ok: false,
			errors: { balance: 'Balance has more than 6 decimal places.' }
		});
		expect(readForm(form({ decimals: '0', fee: '0.5' }))).toEqual({
			ok: false,
			errors: { fee: 'Network fee cannot have decimal places with 0 decimals.' }
		});
	});

	it('names the field in each error and reports every bad field at once', () => {
		expect(readForm(form({ decimals: '6', min: '1,5', max: '-1' }))).toEqual({
			ok: false,
			errors: {
				min: 'Use . as the decimal separator and no thousands separators.',
				max: 'Amounts cannot be negative.'
			}
		});
	});

	it('does not check amounts until the decimals are valid', () => {
		expect(readForm(form({ decimals: '99', balance: '1.5' }))).toEqual({
			ok: false,
			errors: { decimals: 'Decimals must be a whole number from 0 to 36.' }
		});
		expect(readForm(form({ balance: '1.5' }))).toEqual({ ok: false, errors: {} });
	});

	it('keeps 78-digit values exact (FR-021 AC-6)', () => {
		const max = (2n ** 256n - 1n).toString();
		const result = readForm(form({ decimals: '0', max }));
		expect(result.ok && result.params.max).toBe(2n ** 256n - 1n);
	});
});
