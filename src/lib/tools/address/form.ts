import { MAX_COUNT, TARGETS, type AddressTarget } from '#lib/core/chains/catalog.ts';
import type { ChainId } from '#lib/core/chains/types.ts';

// The Generate tab form (FR-010 AC-1, AC-3): chain, type, network, and count.

export const COUNT_ERROR = `Enter a whole number from 1 to ${MAX_COUNT}.`;

/** A count of valid addresses as typed: a whole number from 1 to 500, or null. */
export function parseCount(text: string): number | null {
	const trimmed = text.trim();
	if (!/^\d{1,4}$/.test(trimmed)) return null;
	const count = Number(trimmed);
	return count >= 1 && count <= MAX_COUNT ? count : null;
}

export const CHAIN_OPTIONS: readonly { value: ChainId; label: string }[] = [
	{ value: 'evm', label: 'EVM' },
	{ value: 'bitcoin', label: 'Bitcoin' },
	{ value: 'solana', label: 'Solana' },
	{ value: 'tron', label: 'Tron' }
];

export const BITCOIN_TYPES = [
	{ value: 'p2pkh', label: 'P2PKH (legacy)' },
	{ value: 'p2sh', label: 'P2SH (nested SegWit)' },
	{ value: 'p2wpkh', label: 'P2WPKH (native SegWit)' },
	{ value: 'p2tr', label: 'P2TR (Taproot)' }
] as const;

export const BITCOIN_NETWORKS = [
	{ value: 'mainnet', label: 'Mainnet' },
	{ value: 'testnet', label: 'Testnet' }
] as const;

export type BitcoinTypeValue = (typeof BITCOIN_TYPES)[number]['value'];
export type BitcoinNetworkValue = (typeof BITCOIN_NETWORKS)[number]['value'];

/** The target for the form's choices; type and network only matter for Bitcoin. */
export function targetFor(
	chain: ChainId,
	type: BitcoinTypeValue,
	network: BitcoinNetworkValue
): AddressTarget {
	const target: AddressTarget = chain === 'bitcoin' ? { chain, type, network } : { chain };
	if (!TARGETS.some((t) => JSON.stringify(t) === JSON.stringify(target))) {
		throw new RangeError(`no such target: ${JSON.stringify(target)}`);
	}
	return target;
}

/** Spaces and invisible characters are shown, not hidden; copy and export keep the literal value. */
export function visibleAddress(address: string): string {
	if (address === '') return '(empty)';
	return address.replaceAll(' ', '␣').replaceAll('\u200b', '⟨ZWSP⟩');
}
