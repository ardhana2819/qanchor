import type { AmountError } from '#lib/core/amount/decimal.ts';

// Field errors for the unit converter (design section 7, S-04). Each says what to type instead.

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
