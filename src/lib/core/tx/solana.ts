import { base58 } from '@scure/base';
import type { Result } from '../result.ts';
import { array, FieldError, integer, object, reading, string } from './read.ts';
import type { SolanaExtra, TxParseError, TxResult } from './types.ts';

// Solana transactions from two JSON-RPC calls (fixtures from mainnet, 2026-11-17, in ./fixtures):
// - getSignatureStatuses with searchTransactionHistory: whether the signature is known, and
//   whether it is only "processed" (pending) or already confirmed.
// - getTransaction with encoding "json", maxSupportedTransactionVersion 0, commitment
//   "confirmed": the transaction itself. It returns nothing for a processed-only transaction.

const SYSTEM_PROGRAM = '11111111111111111111111111111111';
/** System Program instruction index for Transfer, followed by the lamports as a u64 (LE). */
const TRANSFER = 2;

export type SolanaStatus = 'not-found' | 'pending' | 'confirmed';

/** Reads getSignatureStatuses for one signature (FR-040 AC-3, EC-010). */
export function parseSolanaStatus(response: unknown): Result<SolanaStatus, TxParseError> {
	return reading(() => {
		const [entry] = array(object(response, 'result').value, 'result.value');
		if (entry === null || entry === undefined) return 'not-found';
		const status = string(object(entry, 'status').confirmationStatus, 'status.confirmationStatus');
		if (status === 'processed') return 'pending';
		if (status === 'confirmed' || status === 'finalized') return 'confirmed';
		throw new FieldError('status.confirmationStatus is not processed, confirmed, or finalized');
	});
}

/** A transaction seen only as "processed": nothing but its status is known yet (FR-040 AC-3). */
export function pendingSolanaTx(): TxResult {
	return {
		status: 'pending',
		block: null,
		from: null,
		to: null,
		valueBase: null,
		fee: null,
		extra: { chain: 'solana', blockTime: null, computeUnits: null, error: null, version: null }
	};
}

interface Transfer {
	to: string;
	lamports: bigint;
}

/** A top-level System Program Transfer, or null for any other instruction. */
function transferOf(instruction: unknown, keys: string[], index: number): Transfer | null {
	const ix = object(instruction, `instructions[${index}]`);
	const program = keys[Number(integer(ix.programIdIndex, 'programIdIndex'))];
	if (program !== SYSTEM_PROGRAM) return null;
	let data: Uint8Array;
	try {
		data = base58.decode(string(ix.data, 'instruction data'));
	} catch {
		throw new FieldError(`instructions[${index}].data is not Base58`);
	}
	const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
	if (data.length !== 12 || view.getUint32(0, true) !== TRANSFER) return null;
	const accounts = array(ix.accounts, `instructions[${index}].accounts`);
	const to = keys[Number(integer(accounts[1], 'transfer destination'))];
	if (to === undefined) throw new FieldError('transfer destination is not an account key');
	return { to, lamports: view.getBigUint64(4, true) };
}

/**
 * Reads getTransaction (FR-040 AC-2). The sender is the fee payer, the first account. The value
 * is the SOL moved by top-level System Program transfers, read exactly from the instruction data;
 * the recipient is shown only when every transfer goes to the same account. A transaction that
 * calls other programs has value 0 and no recipient. For a failed transaction the value is what
 * it tried to send (EC-011), and the fee was still charged.
 */
export function parseSolanaTx(
	signature: string,
	response: unknown
): Result<TxResult, TxParseError> {
	return reading(() => {
		const raw = object(response, 'result');
		const meta = object(raw.meta, 'meta');
		const transaction = object(raw.transaction, 'transaction');
		const [first] = array(transaction.signatures, 'transaction.signatures');
		if (first !== signature) throw new FieldError('transaction.signatures does not match');
		const message = object(transaction.message, 'transaction.message');

		// Version 0 transactions load more accounts from lookup tables; instruction indexes run
		// over the static keys, then the loaded writable, then the loaded read-only ones.
		const loaded =
			meta.loadedAddresses === undefined ? {} : object(meta.loadedAddresses, 'loadedAddresses');
		const keys = [
			...array(message.accountKeys, 'message.accountKeys'),
			...(loaded.writable === undefined ? [] : array(loaded.writable, 'loadedAddresses.writable')),
			...(loaded.readonly === undefined ? [] : array(loaded.readonly, 'loadedAddresses.readonly'))
		].map((key, i) => string(key, `accountKeys[${i}]`));
		if (keys.length === 0) throw new FieldError('message.accountKeys is empty');

		const transfers = array(message.instructions, 'message.instructions')
			.map((ix, i) => transferOf(ix, keys, i))
			.filter((t) => t !== null);
		const recipients = new Set(transfers.map((t) => t.to));

		const error = meta.err === null || meta.err === undefined ? null : JSON.stringify(meta.err);
		const version = raw.version === 'legacy' ? 'legacy' : raw.version === 0 ? 0 : null;
		const extra: SolanaExtra = {
			chain: 'solana',
			blockTime:
				raw.blockTime === null || raw.blockTime === undefined
					? null
					: Number(integer(raw.blockTime, 'blockTime')),
			computeUnits:
				meta.computeUnitsConsumed === undefined
					? null
					: integer(meta.computeUnitsConsumed, 'meta.computeUnitsConsumed'),
			error,
			version
		};
		return {
			status: error === null ? 'success' : 'failed',
			block: integer(raw.slot, 'slot').toString(),
			from: keys[0],
			to: recipients.size === 1 ? [...recipients][0] : null,
			valueBase: transfers.reduce((sum, t) => sum + t.lamports, 0n),
			fee: integer(meta.fee, 'meta.fee'),
			extra
		};
	});
}
