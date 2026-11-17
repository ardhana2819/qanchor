import { base58 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import failed from './fixtures/solana-failed.json' with { type: 'json' };
import finalized from './fixtures/solana-status-finalized.json' with { type: 'json' };
import transfer from './fixtures/solana-transfer.json' with { type: 'json' };
import v0 from './fixtures/solana-v0.json' with { type: 'json' };
import { parseSolanaStatus, parseSolanaTx, pendingSolanaTx } from './solana.ts';

// Real mainnet responses recorded on 2026-11-17 (log messages cut to three lines: the parser does
// not read them). Expected values were decoded from the raw data separately, not with this code.

type Fixture = { signature: string; transaction: unknown };
/** An edited copy of a recorded response: any shape, on purpose. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Raw = Record<string, any>;

function parsed(f: Fixture) {
	const result = parseSolanaTx(f.signature, f.transaction);
	if (!result.ok) throw new Error(result.error);
	return result.value;
}

/** A deep copy of a fixture's transaction, to edit. */
const copy = (f: Fixture) => structuredClone(f.transaction) as Raw;

/** System Program Transfer instruction data: index 2 (u32 LE), lamports (u64 LE). */
function transferData(lamports: bigint): string {
	const data = new Uint8Array(12);
	const view = new DataView(data.buffer);
	view.setUint32(0, 2, true);
	view.setBigUint64(4, lamports, true);
	return base58.encode(data);
}

describe('parseSolanaTx (FR-040 AC-2)', () => {
	it('reads a SOL transfer: fee payer, recipient, exact lamports', () => {
		expect(parsed(transfer)).toEqual({
			status: 'success',
			block: '470495358',
			from: '4YWqv92DpCqcR9EtEsnXRpGRWa5Pv6kL7REMeuV1ACyw',
			to: 'Ho7m3UceyWmyywaPoNuoHEDGWdvN2TAZfELPJU33D9QF',
			valueBase: 2_068_605n,
			fee: 5050n,
			extra: {
				chain: 'solana',
				blockTime: 1794910246,
				computeUnits: 450n,
				error: null,
				version: 'legacy'
			}
		});
	});

	it('reads a program call with no SOL transfer as value 0 and no recipient', () => {
		const tx = parsed(v0);
		expect(tx).toMatchObject({
			status: 'success',
			from: 'Gygj9QQby4j2jryqyqBHvLP7ctv2SaANgh4sCb69BUpA',
			to: null,
			valueBase: 0n,
			fee: 50455n
		});
		expect(tx.extra).toMatchObject({ version: 0, computeUnits: 115778n });
	});

	it('resolves a transfer to an account loaded from a lookup table (version 0)', () => {
		const raw = copy(v0);
		const staticKeys = raw.transaction.message.accountKeys.length;
		raw.transaction.message.instructions.push({
			programIdIndex: raw.transaction.message.accountKeys.length, // patched below
			accounts: [0, staticKeys + 1],
			data: transferData(7n)
		});
		// The System Program is the second read-only loaded address in this fixture.
		const writable = raw.meta.loadedAddresses.writable.length;
		raw.transaction.message.instructions.at(-1).programIdIndex = staticKeys + writable + 1;
		expect(raw.meta.loadedAddresses.readonly[1]).toBe('11111111111111111111111111111111');

		const tx = parsed({ signature: v0.signature, transaction: raw });
		expect(tx.to).toBe(raw.meta.loadedAddresses.writable[1]);
		expect(tx.valueBase).toBe(7n);
	});

	it('adds transfers to one recipient, and names no recipient when there are several', () => {
		const raw = copy(transfer);
		const [, , sys] = raw.transaction.message.instructions;
		raw.transaction.message.instructions.push({ ...sys, data: transferData(10n) });
		expect(parsed({ signature: transfer.signature, transaction: raw })).toMatchObject({
			to: 'Ho7m3UceyWmyywaPoNuoHEDGWdvN2TAZfELPJU33D9QF',
			valueBase: 2_068_615n
		});

		raw.transaction.message.instructions.push({ ...sys, accounts: [0, 3], data: transferData(1n) });
		expect(parsed({ signature: transfer.signature, transaction: raw })).toMatchObject({
			to: null,
			valueBase: 2_068_616n
		});
	});

	it('does not count other 12-byte System Program instructions, such as Allocate', () => {
		const raw = copy(transfer);
		const data = new Uint8Array(12);
		new DataView(data.buffer).setUint32(0, 8, true); // Allocate, then the space as a u64
		data[4] = 1;
		raw.transaction.message.instructions[2].data = base58.encode(data);
		expect(parsed({ signature: transfer.signature, transaction: raw })).toMatchObject({
			to: null,
			valueBase: 0n
		});
	});

	it('reads a u64 amount above 2^53 exactly', () => {
		const raw = copy(transfer);
		raw.transaction.message.instructions[2].data = transferData(18_446_744_073_709_551_615n);
		expect(parsed({ signature: transfer.signature, transaction: raw }).valueBase).toBe(
			18_446_744_073_709_551_615n
		);
	});
});

describe('parseSolanaTx: failed (EC-011)', () => {
	it('reports the runtime error and the fee that was still charged', () => {
		const tx = parsed(failed);
		expect(tx.status).toBe('failed');
		expect(tx.fee).toBe(8283n);
		expect(tx.extra).toMatchObject({ error: '{"InstructionError":[3,{"Custom":6039}]}' });
	});

	it('keeps the attempted value of a failed transfer', () => {
		const raw = copy(transfer);
		raw.meta.err = { InstructionError: [2, { Custom: 1 }] };
		expect(parsed({ signature: transfer.signature, transaction: raw })).toMatchObject({
			status: 'failed',
			valueBase: 2_068_605n,
			fee: 5050n
		});
	});
});

describe('parseSolanaTx: unexpected responses (FR-042 AC-5)', () => {
	const broken = (edit: (raw: Raw) => void) => {
		const raw = copy(transfer);
		edit(raw);
		return parseSolanaTx(transfer.signature, raw);
	};

	it('refuses another signature', () => {
		expect(parseSolanaTx(v0.signature, transfer.transaction)).toEqual({
			ok: false,
			error: 'transaction.signatures does not match'
		});
	});

	const cases: [string, (raw: Raw) => void, string][] = [
		['no meta', (raw) => delete raw.meta, 'meta is not an object'],
		['no slot', (raw) => delete raw.slot, 'slot is not a non-negative integer'],
		['a fee as text', (raw) => (raw.meta.fee = '5050'), 'meta.fee is not a non-negative integer'],
		[
			'a fee above 2^53',
			(raw) => (raw.meta.fee = 2 ** 53),
			'meta.fee is not a non-negative integer'
		],
		[
			'no account keys',
			(raw) => (raw.transaction.message.accountKeys = []),
			'message.accountKeys is empty'
		],
		[
			'data that is not Base58',
			(raw) => (raw.transaction.message.instructions[2].data = '0OIl'),
			'instructions[2].data is not Base58'
		],
		[
			'a destination outside the keys',
			(raw) => (raw.transaction.message.instructions[2].accounts = [0, 9]),
			'transfer destination is not an account key'
		],
		[
			'no instructions',
			(raw) => delete raw.transaction.message.instructions,
			'message.instructions is not an array'
		]
	];
	for (const [name, edit, error] of cases) {
		it(name, () => expect(broken(edit)).toEqual({ ok: false, error }));
	}
});

describe('parseSolanaStatus (FR-040 AC-3, EC-010)', () => {
	const withStatus = (confirmationStatus: string) => {
		const result = structuredClone(finalized.result);
		result.value[0].confirmationStatus = confirmationStatus;
		return result;
	};

	it('reads finalized and confirmed as confirmed, processed as pending', () => {
		expect(parseSolanaStatus(finalized.result)).toEqual({ ok: true, value: 'confirmed' });
		expect(parseSolanaStatus(withStatus('confirmed'))).toEqual({ ok: true, value: 'confirmed' });
		expect(parseSolanaStatus(withStatus('processed'))).toEqual({ ok: true, value: 'pending' });
	});

	it('reads an unknown signature as not found', () => {
		expect(parseSolanaStatus({ context: { slot: 1 }, value: [null] })).toEqual({
			ok: true,
			value: 'not-found'
		});
	});

	it('refuses an unknown confirmation status or shape', () => {
		expect(parseSolanaStatus(withStatus('rooted')).ok).toBe(false);
		expect(parseSolanaStatus({ value: 'x' })).toEqual({
			ok: false,
			error: 'result.value is not an array'
		});
	});

	it('a pending transaction has only its status: every other field is null', () => {
		expect(pendingSolanaTx()).toMatchObject({
			status: 'pending',
			block: null,
			from: null,
			to: null,
			valueBase: null,
			fee: null
		});
	});
});
