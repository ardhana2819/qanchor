import type { BitcoinNetwork, BitcoinType } from './bitcoin.ts';
import type { ChainId } from './types.ts';

// What the generator offers, with no crypto code: targets, variant IDs, labels, and which variant
// applies to which target. The page imports this; the worker builds the addresses
// (dispatch.ts, variants.ts), so noble stays out of the route chunk (NFR-015).

export type AddressTarget =
	| { chain: 'evm' | 'tron' | 'solana' }
	| { chain: 'bitcoin'; type: BitcoinType; network: BitcoinNetwork };

export const CHAIN_NAMES: Record<ChainId, string> = {
	evm: 'EVM',
	bitcoin: 'Bitcoin',
	solana: 'Solana',
	tron: 'Tron'
};

/** Every target the generator offers, in menu order. */
export const TARGETS: readonly AddressTarget[] = [
	{ chain: 'evm' },
	...(['p2pkh', 'p2sh', 'p2wpkh', 'p2tr'] as const).flatMap((type) =>
		(['mainnet', 'testnet'] as const).map((network) => ({
			chain: 'bitcoin' as const,
			type,
			network
		}))
	),
	{ chain: 'solana' },
	{ chain: 'tron' }
];

/** Type and network as written in an export record (FR-012 AC-1). */
export function describeTarget(target: AddressTarget): { type: string; network: string } {
	return target.chain === 'bitcoin'
		? { type: target.type, network: target.network }
		: { type: 'standard', network: 'any' };
}

export type VariantId =
	| 'wrong-checksum'
	| 'invalid-character'
	| 'wrong-length'
	| 'bad-checksum'
	| 'wrong-network'
	| 'wrong-encoding'
	| 'mixed-case'
	| 'missing-prefix'
	| 'look-alike'
	| 'whitespace'
	| 'zero-width'
	| 'empty';

export type RiskyId = 'all-lowercase' | 'zero-address' | 'off-curve';

export interface VariantRow {
	address: string;
	validity: 'invalid' | 'risky';
	/** Stable across releases, e.g. "evm.wrong-checksum" (FR-011, FR-012 AC-1). */
	variantId: string;
	label: string;
	reason: string;
	/** Look-alike only: the chain the address is valid on (FR-011 AC-3). */
	sourceChain?: ChainId;
}

/** One generated row, as shown and exported (FR-010, FR-011, FR-012 AC-1). */
export interface AddressRow {
	address: string;
	chain: ChainId;
	type: string;
	network: string;
	validity: 'valid' | 'invalid' | 'risky';
	variantId: string;
	label: string;
	reason: string;
	sourceChain?: ChainId;
}

/** Most valid addresses per generation (FR-010 AC-3). */
export const MAX_COUNT = 500;

export interface GenerateOptions {
	target: AddressTarget;
	/** Valid addresses, 1 to MAX_COUNT; each selected variant adds one row. */
	count: number;
	variants: readonly (VariantId | RiskyId)[];
}

export type Encoding = 'eip55' | 'base58check' | 'base58' | 'segwit';

export function encodingOf(target: AddressTarget): Encoding {
	if (target.chain !== 'bitcoin') {
		return target.chain === 'evm' ? 'eip55' : target.chain === 'solana' ? 'base58' : 'base58check';
	}
	return target.type === 'p2pkh' || target.type === 'p2sh' ? 'base58check' : 'segwit';
}

export interface VariantOption<Id extends string> {
	id: Id;
	label: string;
}

interface Option<Id extends string> extends VariantOption<Id> {
	applies: (target: AddressTarget) => boolean;
}

const every = () => true;
const isEncoding =
	(...encodings: Encoding[]) =>
	(t: AddressTarget) =>
		encodings.includes(encodingOf(t));

const INVALID: readonly Option<VariantId>[] = [
	{ id: 'wrong-checksum', label: 'Wrong EIP-55 checksum', applies: isEncoding('eip55') },
	{ id: 'invalid-character', label: 'Invalid character', applies: every },
	{ id: 'wrong-length', label: 'Wrong length', applies: every },
	{ id: 'bad-checksum', label: 'Corrupted checksum', applies: isEncoding('base58check', 'segwit') },
	{ id: 'wrong-network', label: 'Wrong network prefix', applies: (t) => t.chain === 'bitcoin' },
	{ id: 'wrong-encoding', label: 'Bech32/Bech32m mix-up', applies: isEncoding('segwit') },
	{ id: 'mixed-case', label: 'Mixed-case Bech32', applies: isEncoding('segwit') },
	{ id: 'missing-prefix', label: 'Missing 0x prefix', applies: isEncoding('eip55') },
	{ id: 'look-alike', label: 'Look-alike from another chain', applies: every },
	{ id: 'whitespace', label: 'Leading/trailing whitespace', applies: every },
	{ id: 'zero-width', label: 'Zero-width character', applies: every },
	{ id: 'empty', label: 'Empty string', applies: every }
];

const RISKY: readonly Option<RiskyId>[] = [
	{ id: 'all-lowercase', label: 'All-lowercase', applies: (t) => t.chain === 'evm' },
	{ id: 'zero-address', label: 'Zero address', applies: (t) => t.chain === 'evm' },
	{ id: 'off-curve', label: 'Off-curve address', applies: (t) => t.chain === 'solana' }
];

/** The invalid variants that apply to a target; others are not offered (FR-011 AC-4). */
export function invalidVariantsFor(target: AddressTarget): VariantOption<VariantId>[] {
	return INVALID.filter((v) => v.applies(target)).map(({ id, label }) => ({ id, label }));
}

/** The valid-but-risky samples for a target, a separate group (FR-011 AC-5). */
export function riskySamplesFor(target: AddressTarget): VariantOption<RiskyId>[] {
	return RISKY.filter((v) => v.applies(target)).map(({ id, label }) => ({ id, label }));
}

/** Label and group of a variant that applies to `target`, or null. */
export function variantOption(
	target: AddressTarget,
	id: VariantId | RiskyId
): { label: string; validity: 'invalid' | 'risky' } | null {
	const invalid = INVALID.find((v) => v.id === id);
	const option = invalid ?? RISKY.find((v) => v.id === id);
	if (!option || !option.applies(target)) return null;
	return { label: option.label, validity: invalid ? 'invalid' : 'risky' };
}

export function describeTargetName(target: AddressTarget): string {
	if (target.chain === 'bitcoin') {
		return `a Bitcoin ${target.type.toUpperCase()} ${target.network} address`;
	}
	return `${target.chain === 'evm' ? 'an' : 'a'} ${CHAIN_NAMES[target.chain]} address`;
}

/** Which other chain's address to offer as a look-alike (FR-011 AC-3). */
export function lookAlikeSource(target: AddressTarget): AddressTarget {
	switch (target.chain) {
		case 'evm':
		case 'solana':
			return { chain: 'tron' };
		case 'tron':
			return { chain: 'evm' };
		case 'bitcoin':
			// Base58Check against Base58Check, Bech32 against a hex address.
			return encodingOf(target) === 'base58check' ? { chain: 'tron' } : { chain: 'evm' };
	}
}
