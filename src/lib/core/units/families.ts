import { err, ok, type Result } from '../result.ts';
import { formatAmount, MAX_DECIMALS, parseAmount, type AmountError } from '../amount/decimal.ts';

// Unit families for the converter (FR-030, FR-032). Every unit is stated by its decimals relative
// to the family's smallest unit, so converting is parse at one unit, format at another (ADR-003).

export type FamilyId = 'ethereum' | 'bitcoin' | 'solana' | 'tron' | 'custom';

export interface Unit {
	id: string;
	name: string;
	/** Decimal places relative to the smallest unit: ether 18, gwei 9, wei 0. */
	decimals: number;
	/** Shown under the unit name, e.g. "10⁹ wei". */
	factor: string;
}

export interface UnitFamily {
	id: FamilyId;
	label: string;
	/** Largest unit first. */
	units: readonly Unit[];
}

const SUPERSCRIPT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function power(exponent: number): string {
	return `10${[...String(exponent)].map((digit) => SUPERSCRIPT[Number(digit)]).join('')}`;
}

function pair(id: FamilyId, label: string, display: string, base: string, decimals: number) {
	return {
		id,
		label,
		units: [
			{ id: display, name: display, decimals, factor: `${power(decimals)} ${base}` },
			{ id: base, name: base, decimals: 0, factor: 'Smallest unit' }
		]
	} satisfies UnitFamily;
}

export const FAMILIES: readonly UnitFamily[] = [
	{
		id: 'ethereum',
		label: 'Ethereum',
		units: [
			{ id: 'ether', name: 'ether', decimals: 18, factor: `${power(18)} wei` },
			{ id: 'gwei', name: 'gwei', decimals: 9, factor: `${power(9)} wei` },
			{ id: 'wei', name: 'wei', decimals: 0, factor: 'Smallest unit' }
		]
	},
	pair('bitcoin', 'Bitcoin', 'BTC', 'sats', 8),
	pair('solana', 'Solana', 'SOL', 'lamports', 9),
	pair('tron', 'Tron', 'TRX', 'sun', 6),
	customFamily(18)
];

/** A token with the given decimals (FR-032): display unit and base units. */
export function customFamily(decimals: number): UnitFamily {
	if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
		throw new RangeError(`decimals must be an integer from 0 to ${MAX_DECIMALS}, got ${decimals}`);
	}
	return pair('custom', 'Custom token', 'token', 'base units', decimals);
}

/** Decimals as typed in the custom-token field: a whole number from 0 to 36 (FR-032 AC-1). */
export function parseDecimals(input: string): number | null {
	const text = input.trim();
	if (!/^\d{1,2}$/.test(text)) return null;
	const decimals = Number(text);
	return decimals <= MAX_DECIMALS ? decimals : null;
}

/**
 * Converts a value typed in one unit to every unit of its family, exactly. Surrounding whitespace
 * is trimmed (EC-013); an invalid value converts nothing (FR-031).
 */
export function convert(
	input: string,
	from: Unit,
	family: UnitFamily
): Result<Record<string, string>, AmountError> {
	const base = parseAmount(input, from.decimals, { trim: true });
	if (!base.ok) return err(base.error);
	return ok(
		Object.fromEntries(
			family.units.map((unit) => [unit.id, formatAmount(base.value, unit.decimals)])
		)
	);
}
