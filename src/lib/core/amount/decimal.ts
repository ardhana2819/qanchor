import { err, ok, type Result } from '../result.ts';

// Exact decimal amounts as bigint base units (ADR-003). "1.5" with 6 decimals is 1500000n.
// No floating point anywhere, so values up to 78 digits (2^256 - 1) stay exact (FR-030 AC-4,
// FR-021 AC-6).

/** Largest supported token decimals (FR-020 AC-1, FR-032, EC-012). */
export const MAX_DECIMALS = 36;

export type AmountError =
	| { code: 'empty' }
	| { code: 'whitespace' }
	| { code: 'comma' }
	| { code: 'plus-sign' }
	| { code: 'scientific' }
	| { code: 'negative' }
	| { code: 'not-a-number' }
	| { code: 'too-precise'; maxDecimals: number };

export interface ParseOptions {
	/** Removes leading and trailing whitespace first, as the converter does (EC-013). */
	trim?: boolean;
}

const PLAIN = /^(\d*)(?:\.(\d*))?$/;
const SCIENTIFIC = /^[+-]?(?:\d+\.?\d*|\.\d+)e[+-]?\d+$/i;

function assertDecimals(decimals: number): void {
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
		throw new RangeError(`decimals must be an integer from 0 to ${MAX_DECIMALS}, got ${decimals}`);
	}
}

/**
 * Parses a non-negative decimal string into base units. Accepts digits with at most one `.`
 * (`1`, `0.5`, `.5`, `5.`, `007`); everything else is rejected with the reason, never guessed.
 */
export function parseAmount(
	input: string,
	decimals: number,
	options: ParseOptions = {}
): Result<bigint, AmountError> {
	assertDecimals(decimals);
	const text = options.trim ? input.trim() : input;
	if (text === '') return err({ code: 'empty' });

	// Most specific reason first: a comma gets its separator hint even in "-1,5" (FR-031 AC-4),
	// and "1e-7" is scientific notation, not a negative number.
	if (text.includes(',')) return err({ code: 'comma' });
	if (/\s/.test(text)) return err({ code: 'whitespace' });
	if (SCIENTIFIC.test(text)) return err({ code: 'scientific' });
	if (text.startsWith('+')) return err({ code: 'plus-sign' });
	if (text.startsWith('-')) return err({ code: 'negative' });

	const match = PLAIN.exec(text);
	const [whole = '', fraction = ''] = match ? match.slice(1) : [];
	if (!match || whole + fraction === '') return err({ code: 'not-a-number' });

	// Trailing zeros carry no precision: "1.50" is valid for 1 decimal.
	const significant = fraction.replace(/0+$/, '');
	if (significant.length > decimals) return err({ code: 'too-precise', maxDecimals: decimals });

	return ok(BigInt(whole + significant.padEnd(decimals, '0')));
}

/**
 * Formats base units as a plain decimal string: no exponent, no thousands separators, no
 * trailing fractional zeros (`1500000n`, 6 → `"1.5"`).
 */
export function formatAmount(base: bigint, decimals: number): string {
	assertDecimals(decimals);
	const sign = base < 0n ? '-' : '';
	const digits = (base < 0n ? -base : base).toString().padStart(decimals + 1, '0');
	const whole = digits.slice(0, digits.length - decimals);
	const fraction = digits.slice(digits.length - decimals).replace(/0+$/, '');
	return `${sign}${whole}${fraction ? `.${fraction}` : ''}`;
}
