import { verdictFor } from './chains/verdict.ts';
import type { AddressDefect, ChainId } from './chains/types.ts';
import { err, ok, type Result } from './result.ts';

// Rules for a testnet wallet entry (FR-070, FR-071). The entry stores a public address, a label,
// and notes only; there is no field for a key or mnemonic, and free text is stored as typed
// (EC-021).

export const LABEL_MAX = 80;
export const NOTES_MAX = 2000;

export type AddressProblem =
	| { kind: 'empty' }
	/** A valid Bitcoin mainnet address: only testnet ones can be saved (FR-070 AC-4). */
	| { kind: 'mainnet' }
	/** Valid, but for another chain than the one selected. */
	| { kind: 'other-chain'; chain: ChainId }
	/** Not valid for the selected chain, with the reason when the input is close to its format. */
	| { kind: 'invalid'; defect: AddressDefect | null };

/**
 * Checks a pasted address against the selected chain with the address validator (FR-070 AC-3)
 * and returns it without surrounding whitespace. EVM, Solana, and Tron addresses look the same on
 * mainnet and testnet, so only Bitcoin can be held to testnet (FR-070 AC-4, EC-025).
 */
export function checkWalletAddress(chain: ChainId, text: string): Result<string, AddressProblem> {
	const address = text.trim();
	if (address === '') return err({ kind: 'empty' });
	const verdict = verdictFor(address);
	if (verdict.kind === 'invalid') {
		return err({
			kind: 'invalid',
			defect: verdict.closest?.chain === chain ? verdict.defect : null
		});
	}
	const own = verdict.matches.filter((m) => m.target.chain === chain);
	if (own.length === 0) return err({ kind: 'other-chain', chain: verdict.matches[0].target.chain });
	if (chain === 'bitcoin') {
		const testnet = own.some((m) => m.target.chain === 'bitcoin' && m.target.network === 'testnet');
		if (!testnet) return err({ kind: 'mainnet' });
	}
	return ok(address);
}

/**
 * The form an address is compared in: hex and Bech32 ignore case, so `0xAbC…` and `0xabc…` are
 * the same EVM address; Base58 is case-sensitive and compared as written.
 */
function comparable(chain: ChainId, address: string): string {
	if (chain === 'evm') return address.toLowerCase();
	if (chain === 'bitcoin' && /^tb1/i.test(address)) return address.toLowerCase();
	return address;
}

export interface WalletKey {
	id?: string;
	chain: ChainId;
	networkId: string;
	address: string;
}

/** Another entry with the same chain, network, and address (FR-070 AC-6), or undefined. */
export function findDuplicate<T extends WalletKey>(
	entries: readonly T[],
	entry: WalletKey
): T | undefined {
	const address = comparable(entry.chain, entry.address);
	return entries.find(
		(other) =>
			other.id !== entry.id &&
			other.chain === entry.chain &&
			other.networkId === entry.networkId &&
			comparable(other.chain, other.address) === address
	);
}
