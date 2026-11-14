import {
	generateBitcoinAddress,
	validateBitcoinAddress,
	type BitcoinNetwork,
	type BitcoinType
} from './bitcoin.ts';
import { generateEvmAddress, validateEvmAddress } from './evm.ts';
import { generateSolanaAddress, validateSolanaAddress } from './solana.ts';
import { generateTronAddress, validateTronAddress } from './tron.ts';
import type { AddressCheck, ChainId } from './types.ts';

// What the user picks in the generator: a chain, plus type and network where the encoding depends
// on them (FR-010 AC-1). EVM, Tron, and Solana addresses look the same on every network.

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

export function generateAddress(target: AddressTarget): string {
	switch (target.chain) {
		case 'evm':
			return generateEvmAddress();
		case 'tron':
			return generateTronAddress();
		case 'solana':
			return generateSolanaAddress();
		case 'bitcoin':
			return generateBitcoinAddress(target.type, target.network);
	}
}

export function validateAddress(target: AddressTarget, text: string): AddressCheck {
	switch (target.chain) {
		case 'evm':
			return validateEvmAddress(text);
		case 'tron':
			return validateTronAddress(text);
		case 'solana':
			return validateSolanaAddress(text);
		case 'bitcoin':
			return validateBitcoinAddress(text, target.type, target.network);
	}
}
