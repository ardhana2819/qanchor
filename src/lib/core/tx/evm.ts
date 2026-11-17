import { hex } from '@scure/base';
import { toChecksumAddress } from '../encoding/eip55.ts';
import type { Result } from '../result.ts';
import { FieldError, object, quantity, reading, string, type Json } from './read.ts';
import type { EvmExtra, TxParseError, TxResult } from './types.ts';

// EVM transactions from two JSON-RPC calls: eth_getTransactionByHash (`null` means not found,
// handled by lib/net before this) and eth_getTransactionReceipt (`null` while pending).
// Fixtures recorded from Sepolia, Base, and Arbitrum on 2026-11-17 are in ./fixtures.

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const HASH = /^0x[0-9a-fA-F]{64}$/;
const DATA = /^0x([0-9a-fA-F]{2})*$/;

function address(value: unknown, field: string): string {
	const text = string(value, field);
	if (!ADDRESS.test(text)) throw new FieldError(`${field} is not an address`);
	return toChecksumAddress(hex.decode(text.slice(2).toLowerCase()));
}

function optionalAddress(value: unknown, field: string): string | null {
	return value === null || value === undefined ? null : address(value, field);
}

/** The node must answer for the hash that was asked, or the data is not this transaction. */
function sameHash(value: unknown, hash: string, field: string): void {
	const text = string(value, field);
	if (!HASH.test(text) || text.toLowerCase() !== hash.toLowerCase()) {
		throw new FieldError(`${field} does not match the requested hash`);
	}
}

/** Receipt status per EIP-658: 0x1 success, 0x0 failed (reverted, EC-011). */
function receiptStatus(receipt: Json): 'success' | 'failed' {
	const status = quantity(receipt.status, 'receipt.status');
	if (status === 1n) return 'success';
	if (status === 0n) return 'failed';
	throw new FieldError('receipt.status is not 0x0 or 0x1');
}

/**
 * Reads a transaction and its receipt (FR-040 AC-2, AC-3). `transaction` must not be `null`; a
 * `null` receipt means pending, so block, fee, and gas used are left `null` (EC-010).
 *
 * The fee is gas used × effective gas price, plus the L1 data fee that OP Stack chains (Base)
 * report as `l1Fee`. Arbitrum already counts its L1 cost in `gasUsed`.
 */
export function parseEvmTx(
	hash: string,
	transaction: unknown,
	receipt: unknown
): Result<TxResult, TxParseError> {
	return reading(() => {
		const tx = object(transaction, 'transaction');
		sameHash(tx.hash, hash, 'transaction.hash');
		const input = string(tx.input, 'transaction.input');
		if (!DATA.test(input)) throw new FieldError('transaction.input is not hex data');

		const extra: EvmExtra = {
			chain: 'evm',
			nonce: quantity(tx.nonce, 'transaction.nonce'),
			input: input.toLowerCase(),
			gasLimit: quantity(tx.gas, 'transaction.gas'),
			gasUsed: null,
			effectiveGasPrice: null,
			l1Fee: null,
			contractAddress: null
		};
		const result: TxResult = {
			status: 'pending',
			block: null,
			from: address(tx.from, 'transaction.from'),
			to: optionalAddress(tx.to, 'transaction.to'),
			valueBase: quantity(tx.value, 'transaction.value'),
			fee: null,
			extra
		};

		if (receipt === null) {
			// A node that knows the block but has no receipt yet is out of step; the lookup
			// cannot say whether the transaction succeeded.
			if (tx.blockNumber !== null) {
				throw new FieldError('receipt is missing for a transaction in a block');
			}
			return result;
		}

		const r = object(receipt, 'receipt');
		sameHash(r.transactionHash, hash, 'receipt.transactionHash');
		result.status = receiptStatus(r);
		result.block = quantity(r.blockNumber, 'receipt.blockNumber').toString();
		extra.gasUsed = quantity(r.gasUsed, 'receipt.gasUsed');
		// Receipts from before the London fork may lack effectiveGasPrice; gasPrice is then exact.
		extra.effectiveGasPrice = quantity(
			r.effectiveGasPrice ?? tx.gasPrice,
			'receipt.effectiveGasPrice'
		);
		extra.l1Fee =
			r.l1Fee === undefined || r.l1Fee === null ? null : quantity(r.l1Fee, 'receipt.l1Fee');
		extra.contractAddress = optionalAddress(r.contractAddress, 'receipt.contractAddress');
		result.fee = extra.gasUsed * extra.effectiveGasPrice + (extra.l1Fee ?? 0n);
		return result;
	});
}
