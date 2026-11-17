import { describe, expect, it } from 'vitest';
import call from './fixtures/tron-call.json' with { type: 'json' };
import failed from './fixtures/tron-failed.json' with { type: 'json' };
import transfer from './fixtures/tron-transfer.json' with { type: 'json' };
import { parseTronTx } from './tron.ts';

// Real TronGrid mainnet responses (visible: true), recorded on 2026-11-17; event logs removed,
// the parser does not read them. A pending transaction is the recorded one with an empty info,
// as TronGrid answers before the transaction is in a block.

type Fixture = { txID: string; transaction: unknown; info: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function parsed(f: Fixture) {
	const result = parseTronTx(f.txID, f.transaction, f.info);
	if (!result.ok) throw new Error(result.error);
	if (result.value === null) throw new Error('not found');
	return result.value;
}

const clone = (f: Fixture) => ({
	txID: f.txID,
	transaction: structuredClone(f.transaction) as Raw,
	info: structuredClone(f.info) as Raw
});

describe('parseTronTx (FR-040 AC-2)', () => {
	it('reads a TRX transfer', () => {
		expect(parsed(transfer)).toEqual({
			status: 'success',
			block: '88080448',
			from: 'TUEDTpgFNfkP51q1463HzfrLvtf1a1ULj7',
			to: 'TE6Btvt6sCDCqpbEmPcuhzphDnELohi9kn',
			valueBase: 7_000_000n,
			fee: 1_100_000n,
			extra: {
				chain: 'tron',
				contractType: 'TransferContract',
				result: 'SUCCESS',
				message: null,
				input: null,
				energyUsed: null,
				blockTime: 1794915336000
			}
		});
	});

	it('reads a TRC-20 call: the contract as recipient, no TRX value, calldata and energy', () => {
		const tx = parsed(call);
		expect(tx).toMatchObject({
			status: 'success',
			from: 'TXJUdEr9pn2WDMZArDxfqwV9yPARF2ZkvY',
			to: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
			valueBase: 0n,
			fee: 345_000n
		});
		expect(tx.extra).toMatchObject({ energyUsed: 130_285n });
		expect(tx.extra.chain === 'tron' && tx.extra.input?.slice(0, 8)).toBe('a9059cbb');
	});

	it('reads call_value as the TRX sent with a contract call', () => {
		const f = clone(call);
		f.transaction.raw_data.contract[0].parameter.value.call_value = 25_000_000;
		expect(parsed(f).valueBase).toBe(25_000_000n);
	});

	it('takes no TRX value from other contract types, such as a TRC-10 transfer', () => {
		const f = clone(transfer);
		const contract = f.transaction.raw_data.contract[0];
		contract.type = 'TransferAssetContract';
		contract.parameter.value.asset_name = '1002000';
		expect(parsed(f)).toMatchObject({ to: 'TE6Btvt6sCDCqpbEmPcuhzphDnELohi9kn', valueBase: 0n });
	});

	it('an unknown id ({}) is null, for "not found"', () => {
		expect(parseTronTx(transfer.txID, {}, {})).toEqual({ ok: true, value: null });
	});
});

describe('parseTronTx: failed and pending (EC-010, EC-011, FR-040 AC-3)', () => {
	it('reports OUT_OF_ENERGY as failed, with the reason; a missing fee is 0', () => {
		const tx = parsed(failed);
		expect(tx).toMatchObject({ status: 'failed', block: '88080448', fee: 0n });
		expect(tx.extra).toMatchObject({ result: 'OUT_OF_ENERGY' });
		expect(tx.extra.chain === 'tron' && tx.extra.message).toMatch(/^Not enough energy/);
	});

	it('reports REVERT as failed', () => {
		const f = clone(call);
		f.transaction.ret[0].contractRet = 'REVERT';
		expect(parsed(f).status).toBe('failed');
	});

	it('a transaction with an empty info is pending, confirmed-only fields null', () => {
		expect(parsed({ ...transfer, info: {} })).toMatchObject({
			status: 'pending',
			block: null,
			fee: null,
			valueBase: 7_000_000n,
			extra: { result: null, blockTime: null, energyUsed: null }
		});
	});
});

describe('parseTronTx: unexpected responses (FR-042 AC-5)', () => {
	const broken = (edit: (f: ReturnType<typeof clone>) => void) => {
		const f = clone(transfer);
		edit(f);
		return parseTronTx(f.txID, f.transaction, f.info);
	};

	it('refuses another id, in the transaction or in its info', () => {
		expect(parseTronTx(call.txID, transfer.transaction, transfer.info)).toEqual({
			ok: false,
			error: 'transaction.txID does not match the requested id'
		});
		expect(broken((f) => (f.info.id = call.txID))).toEqual({
			ok: false,
			error: 'info.id does not match the requested id'
		});
	});

	const cases: [string, (f: ReturnType<typeof clone>) => void, string][] = [
		[
			'no contract',
			(f) => (f.transaction.raw_data.contract = []),
			'raw_data.contract[0] is not an object'
		],
		[
			'no amount',
			(f) => delete f.transaction.raw_data.contract[0].parameter.value.amount,
			'amount is not a non-negative integer'
		],
		[
			'an amount above 2^53',
			(f) => (f.transaction.raw_data.contract[0].parameter.value.amount = 2 ** 53),
			'amount is not a non-negative integer'
		],
		[
			'no sender',
			(f) => delete f.transaction.raw_data.contract[0].parameter.value.owner_address,
			'owner_address is not a string'
		],
		['no ret', (f) => delete f.transaction.ret, 'transaction.ret is not an array'],
		[
			'no block number',
			(f) => delete f.info.blockNumber,
			'info.blockNumber is not a non-negative integer'
		],
		['a fee as text', (f) => (f.info.fee = '1100000'), 'info.fee is not a non-negative integer']
	];
	for (const [name, edit, error] of cases) {
		it(name, () => expect(broken(edit)).toEqual({ ok: false, error }));
	}
});
