import { describe, expect, it } from 'vitest';
import { parseBitcoinTx } from './bitcoin.ts';
import coinbase from './fixtures/bitcoin-coinbase.json' with { type: 'json' };
import confirmed from './fixtures/bitcoin-confirmed.json' with { type: 'json' };
import opReturn from './fixtures/bitcoin-op-return.json' with { type: 'json' };
import pending from './fixtures/bitcoin-pending.json' with { type: 'json' };
import testnet4 from './fixtures/bitcoin-testnet4.json' with { type: 'json' };

// Real Esplora responses from mempool.space, recorded on 2026-11-17; the pending one was in the
// mempool at the time. Expected values were added up from the raw JSON separately.

type Fixture = { txid: string; transaction: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function parsed(f: Fixture) {
	const result = parseBitcoinTx(f.txid, f.transaction);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

function broken(edit: (raw: Raw) => void) {
	const raw = structuredClone(confirmed.transaction) as Raw;
	edit(raw);
	return parseBitcoinTx(confirmed.txid, raw);
}

describe('parseBitcoinTx (FR-040 AC-2)', () => {
	it('reads a confirmed transaction with its inputs and outputs', () => {
		expect(parsed(confirmed)).toEqual({
			status: 'success',
			block: '976267',
			from: null,
			to: null,
			valueBase: 399_977_561n,
			fee: 15345n,
			extra: {
				chain: 'bitcoin',
				vsize: 278,
				blockTime: 1794914784,
				inputs: [
					{
						txid: '6a3165130c3f07127c336519cffccdee10a49409f9e611d21aa75790098630dd',
						vout: 0,
						address: 'bc1qjlug3usk7u52vqzraqrl9yhnlnhp4vl4tfd9zj',
						value: 158_440_205n
					},
					expect.objectContaining({
						vout: 1,
						address: 'bc1pw95sdy7llg3ncrmgmm2lyydf77mzw8xl7g59d5gggwftaqm2se7qlph69f',
						value: 129_991_177n
					}),
					expect.objectContaining({ vout: 0, value: 111_561_524n })
				],
				outputs: [
					{
						address: 'bc1q6n7fr6y2s455yhmqa25x9vxxa5pyys6zdljjy4',
						type: 'v0_p2wpkh',
						value: 2_677_561n
					},
					{
						address: 'bc1phr2a55unpfk2sykn88s4sjuwfwja38phcakv7dtf7zvlt8glq7qq9grnym',
						type: 'v1_p2tr',
						value: 397_300_000n
					}
				]
			}
		});
	});

	it('inputs minus outputs is the fee', () => {
		const tx = parsed(confirmed);
		if (tx.extra.chain !== 'bitcoin') throw new Error('not bitcoin');
		const spent = tx.extra.inputs.reduce((sum, i) => sum + (i.value ?? 0n), 0n);
		expect(spent - tx.valueBase!).toBe(tx.fee);
	});

	it('reads a coinbase: one input that spends nothing, fee 0', () => {
		const tx = parsed(coinbase);
		expect(tx).toMatchObject({ status: 'success', valueBase: 314_130_276n, fee: 0n });
		expect(tx.extra).toMatchObject({
			inputs: [{ txid: null, vout: null, address: null, value: null }]
		});
	});

	it('reads an OP_RETURN output with no address', () => {
		const tx = parsed(opReturn);
		expect(tx.extra).toMatchObject({
			outputs: [
				{ type: 'v0_p2wpkh', value: 119_331_864n },
				{ type: 'v0_p2wpkh', value: 496_221_065n },
				{ address: null, type: 'op_return', value: 0n }
			]
		});
		expect(tx.valueBase).toBe(615_552_929n);
	});

	it('reads Testnet4 addresses', () => {
		const tx = parsed(testnet4);
		expect(tx).toMatchObject({ block: '161881', valueBase: 147_800n, fee: 14200n });
		expect(tx.extra).toMatchObject({
			inputs: [{ address: 'tb1qvmtawe8w2se339atpsgl0phnupaqpmxg94yqnj', value: 162_000n }]
		});
	});
});

describe('parseBitcoinTx: pending (FR-040 AC-3, EC-010)', () => {
	it('a mempool transaction is pending, with no block, and its fixed fee', () => {
		expect(parsed(pending)).toMatchObject({
			status: 'pending',
			block: null,
			valueBase: 12_469_555_319n,
			fee: 365n,
			extra: { blockTime: null, vsize: 154 }
		});
	});
});

describe('parseBitcoinTx: unexpected responses (FR-042 AC-5)', () => {
	it('refuses another txid', () => {
		expect(parseBitcoinTx(pending.txid, confirmed.transaction)).toEqual({
			ok: false,
			error: 'transaction.txid does not match the requested id'
		});
	});

	it('accepts the requested txid in upper case', () => {
		expect(parseBitcoinTx(confirmed.txid.toUpperCase(), confirmed.transaction).ok).toBe(true);
	});

	const cases: [string, (raw: Raw) => void, string][] = [
		['no status', (raw) => delete raw.status, 'transaction.status is not an object'],
		[
			'status.confirmed as text',
			(raw) => (raw.status.confirmed = 'true'),
			'status.confirmed is not a boolean'
		],
		[
			'no block height',
			(raw) => delete raw.status.block_height,
			'status.block_height is not a non-negative integer'
		],
		['no fee', (raw) => delete raw.fee, 'transaction.fee is not a non-negative integer'],
		['no outputs', (raw) => (raw.vout = []), 'transaction has no inputs or no outputs'],
		['no inputs', (raw) => (raw.vin = []), 'transaction has no inputs or no outputs'],
		[
			'an output value in BTC',
			(raw) => (raw.vout[1].value = 3.973),
			'vout[1].value is not a non-negative integer'
		],
		[
			'an input without prevout',
			(raw) => delete raw.vin[2].prevout,
			'vin[2].prevout is not an object'
		],
		['no weight', (raw) => delete raw.weight, 'transaction.weight is not a non-negative integer']
	];
	for (const [name, edit, error] of cases) {
		it(name, () => expect(broken(edit)).toEqual({ ok: false, error }));
	}
});
