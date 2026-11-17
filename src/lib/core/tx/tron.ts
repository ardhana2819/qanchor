import type { Result } from '../result.ts';
import { array, FieldError, integer, object, reading, string, type Json } from './read.ts';
import type { TronExtra, TxParseError, TxResult } from './types.ts';

// Tron transactions from the native HTTP API (ADR-006), both calls with `visible: true` so
// addresses come back in Base58 (T...) rather than hex:
// - /wallet/gettransactionbyid: the transaction; `{}` for an unknown id.
// - /wallet/gettransactioninfobyid: the execution result; `{}` until it is in a block.
// Fixtures recorded from TronGrid mainnet on 2026-11-17 are in ./fixtures.

const TX_ID = /^[0-9a-f]{64}$/i;

const isEmpty = (value: Json) => Object.keys(value).length === 0;

function optional<T>(value: unknown, read: (value: unknown) => T): T | null {
	return value === undefined || value === null ? null : read(value);
}

/** The native TRX value and recipient of the transaction's (single) contract. */
function transferOf(type: string, value: Json): { to: string | null; valueBase: bigint } {
	switch (type) {
		case 'TransferContract':
			return {
				to: string(value.to_address, 'to_address'),
				valueBase: integer(value.amount, 'amount')
			};
		case 'TriggerSmartContract':
			return {
				to: string(value.contract_address, 'contract_address'),
				// Absent when the call sends no TRX.
				valueBase: optional(value.call_value, (v) => integer(v, 'call_value')) ?? 0n
			};
		default:
			// TRC-10 transfers, staking, votes, and so on move no TRX to a recipient.
			return {
				to: optional(value.to_address, (v) => string(v, 'to_address')),
				valueBase: 0n
			};
	}
}

/**
 * Reads both responses (FR-040 AC-2, AC-3). An empty transaction (`{}`) is an unknown id and
 * returns `null`, for lib/net to report as not found. An empty info is a transaction not yet in
 * a block: pending, with block, fee, and result `null` (EC-010).
 *
 * Success is the transaction's contractRet SUCCESS; anything else (REVERT, OUT_OF_ENERGY, ...)
 * is failed, with the fee still charged (EC-011). The node leaves out `fee` when it is zero,
 * which happens when staked energy and bandwidth covered the cost.
 */
export function parseTronTx(
	txId: string,
	transaction: unknown,
	info: unknown
): Result<TxResult | null, TxParseError> {
	return reading(() => {
		const tx = object(transaction, 'transaction');
		if (isEmpty(tx)) return null;
		const id = string(tx.txID, 'transaction.txID');
		if (!TX_ID.test(id) || id.toLowerCase() !== txId.toLowerCase()) {
			throw new FieldError('transaction.txID does not match the requested id');
		}
		const raw = object(tx.raw_data, 'transaction.raw_data');
		const [contract] = array(raw.contract, 'raw_data.contract');
		const c = object(contract, 'raw_data.contract[0]');
		const type = string(c.type, 'contract.type');
		const value = object(object(c.parameter, 'contract.parameter').value, 'parameter.value');
		const { to, valueBase } = transferOf(type, value);

		const extra: TronExtra = {
			chain: 'tron',
			contractType: type,
			result: null,
			message: null,
			input:
				type === 'TriggerSmartContract' ? optional(value.data, (v) => string(v, 'data')) : null,
			energyUsed: null,
			blockTime: null
		};
		const result: TxResult = {
			status: 'pending',
			block: null,
			from: string(value.owner_address, 'owner_address'),
			to,
			valueBase,
			fee: null,
			extra
		};

		const i = object(info, 'info');
		if (isEmpty(i)) return result;
		if (string(i.id, 'info.id').toLowerCase() !== id.toLowerCase()) {
			throw new FieldError('info.id does not match the requested id');
		}
		const [ret] = array(tx.ret, 'transaction.ret');
		extra.result = string(object(ret, 'transaction.ret[0]').contractRet, 'ret.contractRet');
		extra.message = optional(i.resMessage, (v) => string(v, 'info.resMessage'));
		const receipt = optional(i.receipt, (v) => object(v, 'info.receipt'));
		extra.energyUsed = optional(receipt?.energy_usage_total, (v) =>
			integer(v, 'receipt.energy_usage_total')
		);
		extra.blockTime = Number(integer(i.blockTimeStamp, 'info.blockTimeStamp'));
		result.status = extra.result === 'SUCCESS' ? 'success' : 'failed';
		result.block = integer(i.blockNumber, 'info.blockNumber').toString();
		result.fee = optional(i.fee, (v) => integer(v, 'info.fee')) ?? 0n;
		return result;
	});
}
