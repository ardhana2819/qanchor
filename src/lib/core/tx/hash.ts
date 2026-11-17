import { base58 } from '@scure/base';
import type { ChainId } from '../chains/types.ts';
import { err, ok, type Result } from '../result.ts';

// Transaction id formats (FR-040 AC-4). EVM, Tron, and Bitcoin share the 64-hex shape, so the
// chain cannot be told from the hash (EC-005); the user picks the network.

export type TxHashError = 'empty' | 'format';

const HEX_64 = /^(0x)?[0-9a-f]{64}$/i;

/**
 * Checks a pasted transaction id for the chain and returns it in the form the endpoint expects:
 * EVM `0x` + lower-case hex; Tron and Bitcoin lower-case hex without `0x`; Solana the Base58
 * signature as typed. A `0x` prefix is accepted or added where the chain differs, since wallets
 * and explorers copy both forms.
 */
export function parseTxHash(chain: ChainId, input: string): Result<string, TxHashError> {
	const text = input.trim();
	if (text === '') return err('empty');
	if (chain === 'solana') {
		try {
			return base58.decode(text).length === 64 ? ok(text) : err('format');
		} catch {
			return err('format');
		}
	}
	if (!HEX_64.test(text)) return err('format');
	const digits = text.slice(text.length - 64).toLowerCase();
	return ok(chain === 'evm' ? `0x${digits}` : digits);
}

/** What a valid id looks like, for the field error. */
export const TX_HASH_FORMAT: Record<ChainId, string> = {
	evm: 'An EVM transaction hash is 0x followed by 64 hex characters.',
	tron: 'A Tron transaction ID is 64 hex characters.',
	bitcoin: 'A Bitcoin transaction ID is 64 hex characters.',
	solana: 'A Solana transaction signature is 64 bytes in Base58, usually 87 or 88 characters.'
};
