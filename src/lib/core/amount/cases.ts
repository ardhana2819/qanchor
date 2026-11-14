import { formatAmount } from './decimal.ts';

// Edge-case amounts for an amount field under test (FR-021, US-003). Each case is a literal input
// string plus what it probes; it never says what the app under test must do, since that depends on
// that app's spec (FR-021 AC-4). Boundaries are computed on bigint base units, so they stay exact
// up to 78 digits (FR-021 AC-6).

export type AmountCategory =
	| 'Decimals'
	| 'Dust'
	| 'Format'
	| 'Comma vs dot'
	| 'Scientific notation'
	| 'Balance and fee'
	| 'Min and max';

export interface AmountCase {
	/** Typed into the app under test exactly as given, whitespace included (FR-022 AC-1). */
	input: string;
	category: AmountCategory;
	purpose: string;
}

export interface OmittedCases {
	cases: string[];
	reason: string;
}

/** Token parameters in base units; optional ones are left out when the field is empty. */
export interface AmountParams {
	decimals: number;
	balance?: bigint;
	fee?: bigint;
	min?: bigint;
	max?: bigint;
}

export interface AmountCases {
	cases: AmountCase[];
	/** Cases that could not be generated, with the reason (FR-020 AC-3). */
	omitted: OmittedCases[];
}

const DIGITS = '1234567890';

/** "1." followed by `places` digits, e.g. 3 → "1.123". */
function withPlaces(places: number): string {
	return `1.${DIGITS.repeat(Math.ceil(places / DIGITS.length)).slice(0, places)}`;
}

function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

export function generateAmountCases(params: AmountParams): AmountCases {
	const { decimals: d, balance, fee, min, max } = params;
	for (const [name, value] of Object.entries({ balance, fee, min, max })) {
		if (value !== undefined && value < 0n) throw new RangeError(`${name} must not be negative`);
	}
	const fmt = (base: bigint) => formatAmount(base, d);
	const unit = fmt(1n);
	const places = plural(d, 'decimal place', 'decimal places');
	const cases: AmountCase[] = [];
	const omitted: OmittedCases[] = [];
	const add = (input: string, category: AmountCategory, purpose: string) =>
		cases.push({ input, category, purpose });

	// FR-021 AC-1: always generated.
	add(unit, 'Dust', `Smallest amount the token can represent (1 base unit, ${places}).`);
	if (d > 0) {
		add(withPlaces(d), 'Decimals', `Uses all ${places} the token allows.`);
	} else {
		omitted.push({
			cases: ['Exactly 0 decimal places'],
			reason: 'With 0 decimals it is the same as the smallest unit.'
		});
	}
	add(
		withPlaces(d + 1),
		'Decimals',
		`One decimal place more than the token allows (${plural(d + 1, 'place', 'places')}).`
	);
	add('0', 'Format', 'Zero amount.');
	add('-1', 'Format', 'Negative amount.');
	add('0001', 'Format', 'Leading zeros.');
	add(' 1 ', 'Format', 'Surrounding whitespace (a space before and after).');
	add('1,5', 'Comma vs dot', 'Comma as the decimal separator.');
	add(
		'1,000.50',
		'Comma vs dot',
		'Comma as the thousands separator, dot as the decimal separator.'
	);
	add(
		'1.000,50',
		'Comma vs dot',
		'Dot as the thousands separator, comma as the decimal separator.'
	);
	add('1e-7', 'Scientific notation', 'Scientific notation for a small amount.');

	// FR-021 AC-2: balance and fee.
	if (balance === undefined) {
		omitted.push({
			cases: [
				'Exactly the balance',
				'Balance plus one unit',
				'Balance minus fee',
				'Balance minus fee plus one unit'
			],
			reason: 'No balance set.'
		});
	} else {
		add(fmt(balance), 'Balance and fee', 'Exactly the balance.');
		add(fmt(balance + 1n), 'Balance and fee', 'One base unit more than the balance.');
		if (fee === undefined) {
			omitted.push({
				cases: ['Balance minus fee', 'Balance minus fee plus one unit'],
				reason: 'No network fee set.'
			});
		} else if (fee > balance) {
			omitted.push({
				cases: ['Balance minus fee', 'Balance minus fee plus one unit'],
				reason: 'The fee is greater than the balance, so balance minus fee is negative.'
			});
		} else {
			add(
				fmt(balance - fee),
				'Balance and fee',
				'Balance minus fee: the most that can be sent with the fee paid from the balance.'
			);
			add(
				fmt(balance - fee + 1n),
				'Balance and fee',
				'One base unit more than balance minus fee: amount plus fee exceeds the balance.'
			);
		}
	}
	if (fee === undefined) {
		omitted.push({ cases: ['Fee greater than balance'], reason: 'No network fee set.' });
	} else if (fee === 0n) {
		omitted.push({
			cases: ['Fee greater than balance'],
			reason: 'The fee is 0, so no balance is below it.'
		});
	} else {
		add(
			fmt(fee - 1n),
			'Balance and fee',
			'Use as the balance: one base unit below the fee, so even the smallest amount cannot pay the fee.'
		);
	}

	// FR-021 AC-3: minimum and maximum.
	if (min === undefined) {
		omitted.push({
			cases: ['Minimum', 'Minimum minus one unit'],
			reason: 'No minimum set.'
		});
	} else {
		add(fmt(min), 'Min and max', 'Exactly the minimum.');
		if (min > 0n) {
			add(fmt(min - 1n), 'Min and max', 'One base unit below the minimum.');
		} else {
			omitted.push({
				cases: ['Minimum minus one unit'],
				reason: 'The minimum is 0, so one unit below it is negative (covered by the negative case).'
			});
		}
	}
	if (max === undefined) {
		omitted.push({ cases: ['Maximum', 'Maximum plus one unit'], reason: 'No maximum set.' });
	} else {
		add(fmt(max), 'Min and max', 'Exactly the maximum.');
		add(fmt(max + 1n), 'Min and max', 'One base unit above the maximum.');
	}

	return { cases, omitted };
}
