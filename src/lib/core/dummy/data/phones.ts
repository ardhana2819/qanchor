// Mobile number prefixes for dummy phone numbers (FR-081 AC-2, AC-9; T-025, decisions 2026-11-16).
//
// Verified: mobile NDCs are `08XY` with X not 0, 4, or 6 (Permenkomdigi 7/2025 Pasal 8), and a
// number has at most 13 digits after `62` (Permenkominfo 14/2018). Komdigi publishes no list of
// which operator holds which NDC, so the operator list below is from commonly published secondary
// sources; the owner decided to use it with this label.

export interface Operator {
	readonly name: string;
	/** National form, with the trunk prefix `0`. */
	readonly prefixes: readonly string[];
	readonly source: 'secondary';
}

/** "Realistic" mode: prefixes in use by mobile operators. */
export const OPERATORS: readonly Operator[] = [
	{
		name: 'Telkomsel',
		prefixes: ['0811', '0812', '0813', '0821', '0822', '0823', '0851', '0852', '0853'],
		source: 'secondary'
	},
	{
		name: 'Indosat',
		prefixes: ['0814', '0815', '0816', '0855', '0856', '0857', '0858'],
		source: 'secondary'
	},
	{
		name: 'Tri',
		prefixes: ['0895', '0896', '0897', '0898', '0899'],
		source: 'secondary'
	},
	{
		name: 'XL',
		prefixes: ['0817', '0818', '0819', '0859', '0877', '0878'],
		source: 'secondary'
	},
	{ name: 'Axis', prefixes: ['0831', '0832', '0833', '0838'], source: 'secondary' },
	{
		name: 'Smartfren',
		prefixes: ['0881', '0882', '0883', '0884', '0885', '0886', '0887', '0888', '0889'],
		source: 'secondary'
	}
];

/**
 * "Non-colliding" mode: blocks Permenkominfo 14/2018 lists as "belum dialokasikan" (not
 * allocated), so no subscriber can hold a number in them. Strict validators reject them.
 */
export const UNALLOCATED_PREFIXES = ['0801', '0802', '0803', '0805'] as const;

/** Length rule in the national `08…` form (decisions 2026-11-16). */
export const NATIONAL_LENGTH = { min: 10, max: 13 } as const;
