import type { Result } from '../result.ts';
import { array, FieldError, integer, object, reading, string } from './read.ts';
import type { BitcoinExtra, BitcoinInput, BitcoinOutput, TxParseError, TxResult } from './types.ts';

// Bitcoin transactions from an Esplora REST API (`GET <base>/tx/<txid>`, mempool.space by
// default). An unknown txid is HTTP 404, reported as not found by lib/net before this. Fixtures
// recorded from mempool.space mainnet and Testnet4 on 2026-11-17 are in ./fixtures.

const TXID = /^[0-9a-f]{64}$/;

function optionalAddress(value: unknown, field: string): string | null {
	return value === undefined || value === null ? null : string(value, field);
}

function inputOf(vin: unknown, index: number): BitcoinInput {
	const field = `vin[${index}]`;
	const input = object(vin, field);
	if (input.is_coinbase === true) return { txid: null, vout: null, address: null, value: null };
	const prevout = object(input.prevout, `${field}.prevout`);
	return {
		txid: string(input.txid, `${field}.txid`),
		vout: Number(integer(input.vout, `${field}.vout`)),
		address: optionalAddress(prevout.scriptpubkey_address, `${field}.prevout.scriptpubkey_address`),
		value: integer(prevout.value, `${field}.prevout.value`)
	};
}

function outputOf(vout: unknown, index: number): BitcoinOutput {
	const field = `vout[${index}]`;
	const output = object(vout, field);
	return {
		address: optionalAddress(output.scriptpubkey_address, `${field}.scriptpubkey_address`),
		type: string(output.scriptpubkey_type, `${field}.scriptpubkey_type`),
		value: integer(output.value, `${field}.value`)
	};
}

/**
 * Reads an Esplora transaction (FR-040 AC-2, AC-3). Bitcoin shows inputs and outputs instead of
 * one sender and recipient, so `from` and `to` are null and the value is the total of the
 * outputs. A transaction is never "failed": it is in a block (success) or in the mempool
 * (pending, EC-010). A pending transaction's fee is already fixed, so it is shown.
 */
export function parseBitcoinTx(txid: string, response: unknown): Result<TxResult, TxParseError> {
	return reading(() => {
		const tx = object(response, 'transaction');
		const id = string(tx.txid, 'transaction.txid');
		if (!TXID.test(id) || id !== txid.toLowerCase()) {
			throw new FieldError('transaction.txid does not match the requested id');
		}
		const status = object(tx.status, 'transaction.status');
		const confirmed = status.confirmed;
		if (typeof confirmed !== 'boolean') throw new FieldError('status.confirmed is not a boolean');

		const inputs = array(tx.vin, 'transaction.vin').map(inputOf);
		const outputs = array(tx.vout, 'transaction.vout').map(outputOf);
		if (inputs.length === 0 || outputs.length === 0) {
			throw new FieldError('transaction has no inputs or no outputs');
		}
		const extra: BitcoinExtra = {
			chain: 'bitcoin',
			inputs,
			outputs,
			vsize: Math.ceil(Number(integer(tx.weight, 'transaction.weight')) / 4),
			blockTime: confirmed ? Number(integer(status.block_time, 'status.block_time')) : null
		};
		return {
			status: confirmed ? 'success' : 'pending',
			block: confirmed ? integer(status.block_height, 'status.block_height').toString() : null,
			from: null,
			to: null,
			valueBase: outputs.reduce((sum, o) => sum + o.value, 0n),
			fee: integer(tx.fee, 'transaction.fee'),
			extra
		};
	});
}
