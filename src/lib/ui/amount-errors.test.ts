import { describe, expect, it } from 'vitest';
import { describeAmountError, describeParameterError } from './amount-errors.ts';

describe('describeAmountError', () => {
	it('names the unit and its maximum decimal places (FR-031 AC-1, design S-04)', () => {
		expect(describeAmountError({ code: 'too-precise', maxDecimals: 0 }, 'wei')).toBe(
			'wei has no decimal places.'
		);
		expect(describeAmountError({ code: 'too-precise', maxDecimals: 1 }, 'token')).toBe(
			'token allows at most 1 decimal place.'
		);
		expect(describeAmountError({ code: 'too-precise', maxDecimals: 9 }, 'gwei')).toBe(
			'gwei allows at most 9 decimal places.'
		);
	});

	it('gives the separator hint for a comma (FR-031 AC-4)', () => {
		expect(describeAmountError({ code: 'comma' }, 'ether')).toBe(
			'Use . as the decimal separator and no thousands separators.'
		);
	});

	it.each([
		['whitespace', 'Remove the spaces inside the number.'],
		['scientific', 'Write the number in full; scientific notation is not supported.'],
		['plus-sign', 'Remove the + sign.'],
		['negative', 'Amounts cannot be negative.'],
		['not-a-number', 'Enter a number, for example 1.5.'],
		['empty', 'Enter a value.']
	] as const)('describes %s', (code, message) => {
		expect(describeAmountError({ code }, 'ether')).toBe(message);
	});
});

describe('describeParameterError (FR-020 AC-5)', () => {
	it('names the field and the decimals (design S-03)', () => {
		expect(describeParameterError({ code: 'too-precise', maxDecimals: 6 }, 'Balance')).toBe(
			'Balance has more than 6 decimal places.'
		);
		expect(describeParameterError({ code: 'too-precise', maxDecimals: 1 }, 'Minimum')).toBe(
			'Minimum has more than 1 decimal place.'
		);
		expect(describeParameterError({ code: 'too-precise', maxDecimals: 0 }, 'Network fee')).toBe(
			'Network fee cannot have decimal places with 0 decimals.'
		);
	});

	it('uses the shared message for every other error', () => {
		expect(describeParameterError({ code: 'comma' }, 'Balance')).toBe(
			'Use . as the decimal separator and no thousands separators.'
		);
	});
});
