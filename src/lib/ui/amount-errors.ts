import type { AmountError } from '#lib/core/amount/decimal.ts';

// Field errors for amount inputs (design section 7, S-03 and S-04). Each says what to type instead.

export const DECIMALS_ERROR = 'Decimals must be a whole number from 0 to 36.';

export function describeAmountError(error: AmountError, unit: string): string {
	switch (error.code) {
		case 'empty':
			return 'Enter a value.';
		case 'too-precise':
			return error.maxDecimals === 0
				? `${unit} has no decimal places.`
				: `${unit} allows at most ${error.maxDecimals} decimal ${error.maxDecimals === 1 ? 'place' : 'places'}.`;
		case 'comma':
			return 'Use . as the decimal separator and no thousands separators.';
		case 'whitespace':
			return 'Remove the spaces inside the number.';
		case 'scientific':
			return 'Write the number in full; scientific notation is not supported.';
		case 'plus-sign':
			return 'Remove the + sign.';
		case 'negative':
			return 'Amounts cannot be negative.';
		case 'not-a-number':
			return 'Enter a number, for example 1.5.';
	}
}

/**
 * An amount parameter such as Balance or Minimum, checked against the token's decimals
 * (FR-020 AC-5): "Balance has more than 6 decimal places."
 */
export function describeParameterError(error: AmountError, label: string): string {
	if (error.code !== 'too-precise') return describeAmountError(error, label);
	return error.maxDecimals === 0
		? `${label} cannot have decimal places with 0 decimals.`
		: `${label} has more than ${error.maxDecimals} decimal ${error.maxDecimals === 1 ? 'place' : 'places'}.`;
}
