import { describe, expect, it, vi } from 'vitest';
import { networkById, type Network } from '#lib/config/networks.ts';
import btc from '#lib/core/tx/fixtures/bitcoin-confirmed.json' with { type: 'json' };
import evmPending from '#lib/core/tx/fixtures/evm-pending.json' with { type: 'json' };
import evm from '#lib/core/tx/fixtures/evm-success-transfer.json' with { type: 'json' };
import solStatus from '#lib/core/tx/fixtures/solana-status-finalized.json' with { type: 'json' };
import sol from '#lib/core/tx/fixtures/solana-transfer.json' with { type: 'json' };
import tron from '#lib/core/tx/fixtures/tron-transfer.json' with { type: 'json' };
import { resolveEndpoint } from './endpoint.ts';
import { lookupTx } from './lookup.ts';

// The call sequence per protocol (docs/architecture.md 4.2), against a fetch stub that answers
// with the recorded fixtures. Parsing itself is tested in lib/core/tx.

interface Call {
	url: string;
	method?: string;
	params?: unknown;
	body?: unknown;
}

/** A fetch that records each request and answers from `reply`; unknown calls fail the test. */
function stub(reply: (call: Call) => [number, unknown] | undefined) {
	const calls: Call[] = [];
	const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
		const url = String(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const call: Call = { url, method: body?.method, params: body?.params, body };
		calls.push(call);
		const answer = reply(call);
		if (!answer) throw new Error(`unexpected request ${url} ${body?.method ?? ''}`);
		const [status, payload] = answer;
		return new Response(typeof payload === 'string' ? payload : JSON.stringify(payload), {
			status
		});
	});
	return { fetch, calls };
}

const rpc = (result: unknown): [number, unknown] => [200, { jsonrpc: '2.0', id: 1, result }];

function run(networkId: string, hash: string, fetch: typeof globalThis.fetch) {
	const network = networkById(networkId) as Network;
	return lookupTx(network, resolveEndpoint(network, []), hash, { fetch });
}

describe('lookupTx: EVM', () => {
	const evmReply = (call: Call) => {
		if (call.method === 'eth_chainId') return rpc('0xaa36a7');
		if (call.method === 'eth_getTransactionByHash') return rpc(evm.transaction);
		if (call.method === 'eth_getTransactionReceipt') return rpc(evm.receipt);
	};

	it('checks the chain ID, then reads the transaction and its receipt', async () => {
		const { fetch, calls } = stub(evmReply);
		const result = await run('eth-sepolia', evm.hash, fetch);
		expect(result.ok && result.value.status).toBe('success');
		expect(calls.map((c) => c.method)).toEqual([
			'eth_chainId',
			'eth_getTransactionByHash',
			'eth_getTransactionReceipt'
		]);
		expect(calls[1].params).toEqual([evm.hash]);
	});

	it('stops at a chain mismatch before asking for the transaction (FR-041 AC-4)', async () => {
		const { fetch, calls } = stub((call) =>
			call.method === 'eth_chainId' ? rpc('0x89') : undefined
		);
		expect(await run('eth-sepolia', evm.hash, fetch)).toMatchObject({
			ok: false,
			error: { code: 'chain-mismatch', expected: 0xaa36a7n, actual: 0x89n }
		});
		expect(calls).toHaveLength(1);
	});

	it('reports a null transaction as not found, without asking for a receipt', async () => {
		const { fetch, calls } = stub((call) =>
			call.method === 'eth_chainId' ? rpc('0xaa36a7') : rpc(null)
		);
		expect(await run('eth-sepolia', evm.hash, fetch)).toEqual({
			ok: false,
			error: { code: 'not-found', host: 'sepolia.gateway.tenderly.co' }
		});
		expect(calls).toHaveLength(2);
	});

	it('reads a null receipt as pending', async () => {
		const { fetch } = stub((call) => {
			if (call.method === 'eth_chainId') return rpc('0xaa36a7');
			if (call.method === 'eth_getTransactionByHash') return rpc(evmPending.transaction);
			return rpc(null);
		});
		const result = await run('eth-sepolia', evmPending.hash, fetch);
		expect(result.ok && result.value).toMatchObject({ status: 'pending', fee: null });
	});

	it('reports a parse failure as a bad response naming the host', async () => {
		const { fetch } = stub((call) =>
			call.method === 'eth_getTransactionReceipt'
				? rpc({ ...evm.receipt, status: '0x2' })
				: evmReply(call)
		);
		expect(await run('eth-sepolia', evm.hash, fetch)).toEqual({
			ok: false,
			error: {
				code: 'bad-response',
				host: 'sepolia.gateway.tenderly.co',
				detail: 'receipt.status is not 0x0 or 0x1'
			}
		});
	});
});

describe('lookupTx: Solana', () => {
	it('asks for the status first, then the transaction', async () => {
		const { fetch, calls } = stub((call) => {
			if (call.method === 'getSignatureStatuses') return rpc(solStatus.result);
			if (call.method === 'getTransaction') return rpc(sol.transaction);
		});
		const result = await run('solana', sol.signature, fetch);
		expect(result.ok && result.value.valueBase).toBe(2_068_605n);
		expect(calls[0].params).toEqual([[sol.signature], { searchTransactionHistory: true }]);
		expect(calls[1].params).toEqual([
			sol.signature,
			{ encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }
		]);
	});

	it('an unknown signature is not found, a processed one pending; neither fetches the transaction', async () => {
		const unknown = stub(() => rpc({ context: { slot: 1 }, value: [null] }));
		expect(await run('solana', sol.signature, unknown.fetch)).toMatchObject({
			ok: false,
			error: { code: 'not-found' }
		});
		expect(unknown.calls).toHaveLength(1);

		const processed = structuredClone(solStatus.result);
		processed.value[0].confirmationStatus = 'processed';
		const pending = stub(() => rpc(processed));
		const result = await run('solana-devnet', sol.signature, pending.fetch);
		expect(result.ok && result.value).toMatchObject({ status: 'pending', valueBase: null });
		expect(pending.calls).toHaveLength(1);
	});
});

describe('lookupTx: Tron', () => {
	it('posts both calls with visible: true', async () => {
		const { fetch, calls } = stub((call) => {
			if (call.url.endsWith('/wallet/gettransactionbyid')) return [200, tron.transaction];
			if (call.url.endsWith('/wallet/gettransactioninfobyid')) return [200, tron.info];
		});
		const result = await run('tron', tron.txID, fetch);
		expect(result.ok && result.value.to).toBe('TE6Btvt6sCDCqpbEmPcuhzphDnELohi9kn');
		expect(calls.map((c) => c.url)).toEqual([
			'https://api.trongrid.io/wallet/gettransactionbyid',
			'https://api.trongrid.io/wallet/gettransactioninfobyid'
		]);
		for (const call of calls) expect(call.body).toEqual({ value: tron.txID, visible: true });
	});

	it('reports {} as not found', async () => {
		const { fetch } = stub(() => [200, {}]);
		expect(await run('tron-nile', tron.txID, fetch)).toEqual({
			ok: false,
			error: { code: 'not-found', host: 'nile.trongrid.io' }
		});
	});
});

describe('lookupTx: Bitcoin', () => {
	it('gets /tx/<txid> from the Esplora base URL', async () => {
		const { fetch, calls } = stub(() => [200, btc.transaction]);
		const result = await run('bitcoin', btc.txid, fetch);
		expect(result.ok && result.value.fee).toBe(15345n);
		expect(calls.map((c) => c.url)).toEqual([`https://mempool.space/api/tx/${btc.txid}`]);
	});

	it('reports a 404 "Transaction not found" as not found', async () => {
		const { fetch } = stub(() => [404, 'Transaction not found']);
		expect(await run('bitcoin-testnet4', btc.txid, fetch)).toMatchObject({
			ok: false,
			error: { code: 'not-found', host: 'mempool.space' }
		});
	});
});
