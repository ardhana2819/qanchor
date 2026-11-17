import { describe, expect, it } from 'vitest';
import { parseEvmTx } from './evm.ts';
import arbitrum from './fixtures/evm-arbitrum.json' with { type: 'json' };
import baseFailed from './fixtures/evm-base-failed.json' with { type: 'json' };
import creation from './fixtures/evm-contract-creation.json' with { type: 'json' };
import failed from './fixtures/evm-failed.json' with { type: 'json' };
import pending from './fixtures/evm-pending.json' with { type: 'json' };
import call from './fixtures/evm-success-call.json' with { type: 'json' };
import transfer from './fixtures/evm-success-transfer.json' with { type: 'json' };

// Fixtures are real responses recorded on 2026-11-17 (receipt logs removed: the parser does not
// read them). Expected values were worked out from the raw hex separately, not with this code;
// checksummed addresses were computed with keccak-256 directly.

interface Fixture {
	hash: string;
	transaction: Record<string, unknown>;
	receipt: Record<string, unknown> | null;
}

const parse = (f: Fixture) => parseEvmTx(f.hash, f.transaction, f.receipt);

function parsed(f: Fixture) {
	const result = parse(f);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** A copy of the fixture with some fields replaced (`undefined` deletes a field). */
function edited(f: Fixture, tx: Record<string, unknown>, receipt: Record<string, unknown> = {}) {
	const strip = (o: Record<string, unknown>) =>
		Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));
	return {
		hash: f.hash,
		transaction: strip({ ...f.transaction, ...tx }),
		receipt: f.receipt === null ? null : strip({ ...f.receipt, ...receipt })
	};
}

describe('parseEvmTx: confirmed transactions (FR-040 AC-2)', () => {
	it('reads a successful ETH transfer on Sepolia', () => {
		expect(parsed(transfer)).toEqual({
			status: 'success',
			block: '12153709',
			from: '0xC2C8Ea7679B5119Fe934bc20262aC99D9497517C',
			to: '0x858bc99d8b994496204160970e7898Ad1DFFe25c',
			valueBase: 5_100_000_000_000_000n,
			fee: 613_800_003_273_600n,
			extra: {
				chain: 'evm',
				nonce: 28803n,
				input: '0x',
				gasLimit: 207391n,
				gasUsed: 204600n,
				effectiveGasPrice: 3_000_000_016n,
				l1Fee: null,
				contractAddress: null
			}
		});
	});

	it('reads a contract call with its calldata', () => {
		const tx = parsed(call);
		expect(tx.status).toBe('success');
		expect(tx.valueBase).toBe(0n);
		expect(tx.fee).toBe(200_202_002_135_488n);
		expect(tx.extra).toMatchObject({ nonce: 8446n, gasUsed: 133468n });
		expect(tx.extra.chain === 'evm' && tx.extra.input).toBe(call.transaction.input);
		expect(tx.extra.chain === 'evm' && tx.extra.input.slice(0, 10)).toBe('0x095ea7b3');
	});

	it('reads a contract creation: no recipient, the new contract address', () => {
		const tx = parsed(creation);
		expect(tx.to).toBeNull();
		expect(tx.fee).toBe(14_668_176_156_460_544n);
		expect(tx.extra).toMatchObject({
			contractAddress: '0x544B268653D961090Ad3AC4B6508FF8B5F31E209'
		});
	});

	it('adds the L1 data fee on Base (OP Stack)', () => {
		const tx = parsed(baseFailed);
		expect(tx.extra).toMatchObject({ gasUsed: 53663n, l1Fee: 0x5481111fn });
		expect(tx.fee).toBe(1_879_622_744_671n);
	});

	it('takes Arbitrum gas used as the whole fee, L1 part included', () => {
		const tx = parsed(arbitrum);
		expect(tx.block).toBe('525004686');
		expect(tx.fee).toBe(2_681_489_194_488n);
		expect(tx.extra).toMatchObject({ l1Fee: null, nonce: 407581n });
	});

	it("prefers the receipt's effective gas price over the transaction's gas price", () => {
		const tx = parsed(edited(transfer, { gasPrice: '0x1' }));
		expect(tx.fee).toBe(613_800_003_273_600n);
	});

	it('falls back to gasPrice when the receipt has no effectiveGasPrice (pre-London)', () => {
		const tx = parsed(
			edited(transfer, { gasPrice: '0x3b9aca00' }, { effectiveGasPrice: undefined })
		);
		expect(tx.fee).toBe(204600n * 1_000_000_000n);
	});
});

describe('parseEvmTx: failed and pending (EC-010, EC-011, FR-040 AC-3)', () => {
	it('reports a reverted transaction as failed, still with its fee', () => {
		const tx = parsed(failed);
		expect(tx.status).toBe('failed');
		expect(tx.block).toBe('12153707');
		expect(tx.fee).toBe(4_756_401_522_048n);
	});

	it('keeps the attempted value of a failed transfer (EC-011)', () => {
		const tx = parsed(edited(transfer, {}, { status: '0x0' }));
		expect(tx.status).toBe('failed');
		expect(tx.valueBase).toBe(5_100_000_000_000_000n);
	});

	it('reports a transaction with no receipt as pending, confirmed-only fields null', () => {
		expect(parsed(pending)).toEqual({
			status: 'pending',
			block: null,
			from: '0x7fca164239FD733715b49C3B100062253e58CAbF',
			to: '0x51C0d8527Eca285Fabf0D9E946C8D8bA36c89063',
			valueBase: 0n,
			fee: null,
			extra: expect.objectContaining({
				nonce: 22179n,
				gasLimit: 3_000_000n,
				gasUsed: null,
				effectiveGasPrice: null
			})
		});
	});

	it('refuses a mined transaction whose receipt is missing', () => {
		expect(parse({ ...transfer, receipt: null })).toEqual({
			ok: false,
			error: 'receipt is missing for a transaction in a block'
		});
	});
});

describe('parseEvmTx: unexpected responses give a bad-response detail (FR-042 AC-5)', () => {
	const cases: [string, Fixture, string][] = [
		[
			'a non-object transaction',
			{ ...transfer, transaction: [] as never },
			'transaction is not an object'
		],
		[
			'another hash',
			edited(transfer, { hash: call.hash }),
			'transaction.hash does not match the requested hash'
		],
		[
			'a receipt for another hash',
			edited(transfer, {}, { transactionHash: call.hash }),
			'receipt.transactionHash does not match the requested hash'
		],
		['no value', edited(transfer, { value: undefined }), 'transaction.value is not a hex quantity'],
		[
			'a decimal value',
			edited(transfer, { value: '5100000000000000' }),
			'transaction.value is not a hex quantity'
		],
		['no sender', edited(transfer, { from: undefined }), 'transaction.from is not a string'],
		['a short sender', edited(transfer, { from: '0x1234' }), 'transaction.from is not an address'],
		['odd-length input', edited(transfer, { input: '0x123' }), 'transaction.input is not hex data'],
		['no nonce', edited(transfer, { nonce: undefined }), 'transaction.nonce is not a hex quantity'],
		[
			'no receipt status (pre-Byzantium)',
			edited(transfer, {}, { status: undefined }),
			'receipt.status is not a hex quantity'
		],
		[
			'an unknown receipt status',
			edited(transfer, {}, { status: '0x2' }),
			'receipt.status is not 0x0 or 0x1'
		],
		[
			'no gas used',
			edited(transfer, {}, { gasUsed: undefined }),
			'receipt.gasUsed is not a hex quantity'
		],
		[
			'no block number',
			edited(transfer, {}, { blockNumber: null }),
			'receipt.blockNumber is not a hex quantity'
		],
		[
			'no gas price at all',
			edited(transfer, { gasPrice: undefined }, { effectiveGasPrice: undefined }),
			'receipt.effectiveGasPrice is not a hex quantity'
		]
	];

	for (const [name, fixture, error] of cases) {
		it(name, () => expect(parse(fixture)).toEqual({ ok: false, error }));
	}
});
