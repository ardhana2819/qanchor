import type { Result } from '../result.ts';
import { integer, object, quantity, reading } from '../tx/read.ts';

// Native balance answers per protocol (FR-073), in the smallest unit. Shapes were checked on
// the default testnet endpoints on 2026-11-18. Anything else is a bad response (FR-042 AC-5),
// so a balance is never shown from an answer that was not understood.

/** `eth_getBalance`: a hex quantity in wei. */
export function parseEvmBalance(result: unknown): Result<bigint, string> {
	return reading(() => quantity(result, 'result'));
}

/** Solana `getBalance`: `{ context, value }` with lamports in `value`. */
export function parseSolanaBalance(result: unknown): Result<bigint, string> {
	return reading(() => integer(object(result, 'result').value, 'result.value'));
}

/**
 * Tron `getaccount` in sun. An account that never received TRX is not activated and comes back
 * as `{}`; an activated one with nothing left has no `balance` field. Both hold 0.
 */
export function parseTronBalance(response: unknown): Result<bigint, string> {
	return reading(() => {
		const account = object(response, 'response');
		return account.balance === undefined ? 0n : integer(account.balance, 'balance');
	});
}

/**
 * Esplora `/address/<address>` in sats: funded minus spent, confirmed plus mempool, so a faucet
 * payment shows as soon as it is broadcast.
 */
export function parseEsploraBalance(response: unknown): Result<bigint, string> {
	return reading(() => {
		const body = object(response, 'response');
		let total = 0n;
		for (const field of ['chain_stats', 'mempool_stats'] as const) {
			const stats = object(body[field], field);
			total +=
				integer(stats.funded_txo_sum, `${field}.funded_txo_sum`) -
				integer(stats.spent_txo_sum, `${field}.spent_txo_sum`);
		}
		return total;
	});
}
