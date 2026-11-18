import { describe, expect, it, vi } from 'vitest';
import { networkById, type Network } from '#lib/config/networks.ts';
import { fetchBalance } from './balance.ts';
import { resolveEndpoint } from './endpoint.ts';

// The request per protocol (FR-073) against a fetch stub. Parsing is tested in lib/core/balance.

interface Call {
	url: string;
	method?: string;
	params?: unknown;
	body?: unknown;
}

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

function run(networkId: string, address: string, fetch: typeof globalThis.fetch) {
	const network = networkById(networkId) as Network;
	return fetchBalance(network, resolveEndpoint(network, []), address, { fetch });
}

const EVM = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed';

describe('fetchBalance: EVM', () => {
	it('checks the chain ID, then asks for the latest balance', async () => {
		const { fetch, calls } = stub((call) =>
			call.method === 'eth_chainId' ? rpc('0x14a34') : rpc('0xde0b6b3a7640000')
		);
		expect(await run('base-sepolia', EVM, fetch)).toEqual({ ok: true, value: 10n ** 18n });
		expect(calls.map((c) => [c.url, c.method, c.params])).toEqual([
			['https://base-sepolia.gateway.tenderly.co', 'eth_chainId', []],
			['https://base-sepolia.gateway.tenderly.co', 'eth_getBalance', [EVM, 'latest']]
		]);
	});

	it('stops at a chain mismatch without asking for the balance', async () => {
		const { fetch, calls } = stub(() => rpc('0x1'));
		const result = await run('base-sepolia', EVM, fetch);
		expect(result).toEqual({
			ok: false,
			error: {
				code: 'chain-mismatch',
				host: 'base-sepolia.gateway.tenderly.co',
				expected: 84532n,
				actual: 1n
			}
		});
		expect(calls).toHaveLength(1);
	});

	it('reports an answer that is not a quantity as a bad response', async () => {
		const { fetch } = stub((call) => (call.method === 'eth_chainId' ? rpc('0x14a34') : rpc(null)));
		expect(await run('base-sepolia', EVM, fetch)).toEqual({
			ok: false,
			error: {
				code: 'bad-response',
				host: 'base-sepolia.gateway.tenderly.co',
				detail: 'result is not a hex quantity'
			}
		});
	});
});

describe('fetchBalance: Solana', () => {
	it('asks getBalance for the address', async () => {
		const address = 'So11111111111111111111111111111111111111112';
		const { fetch, calls } = stub(() => rpc({ context: { slot: 1 }, value: 2_500_000_000 }));
		expect(await run('solana-devnet', address, fetch)).toEqual({ ok: true, value: 2_500_000_000n });
		expect(calls.map((c) => [c.url, c.method, c.params])).toEqual([
			['https://api.devnet.solana.com', 'getBalance', [address]]
		]);
	});
});

describe('fetchBalance: Tron', () => {
	const address = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

	it('posts getaccount with a Base58 address', async () => {
		const { fetch, calls } = stub(() => [200, { address, balance: 1_000_000 }]);
		expect(await run('tron-nile', address, fetch)).toEqual({ ok: true, value: 1_000_000n });
		expect(calls).toEqual([
			{
				url: 'https://nile.trongrid.io/wallet/getaccount',
				method: undefined,
				params: undefined,
				body: { address, visible: true }
			}
		]);
	});

	it('reads an account that was never activated as 0', async () => {
		const { fetch } = stub(() => [200, {}]);
		expect(await run('tron-nile', address, fetch)).toEqual({ ok: true, value: 0n });
	});
});

describe('fetchBalance: Bitcoin', () => {
	const address = 'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx';
	const stats = (funded: number, spent: number) => ({
		funded_txo_sum: funded,
		spent_txo_sum: spent
	});

	it('reads the Esplora address summary', async () => {
		const { fetch, calls } = stub(() => [
			200,
			{ chain_stats: stats(5000, 1000), mempool_stats: stats(250, 0) }
		]);
		expect(await run('bitcoin-testnet4', address, fetch)).toEqual({ ok: true, value: 4250n });
		expect(calls.map((c) => c.url)).toEqual([
			`https://mempool.space/testnet4/api/address/${address}`
		]);
	});

	it('passes a request error through unchanged', async () => {
		const { fetch } = stub(() => [429, 'Too Many Requests']);
		expect(await run('bitcoin-testnet4', address, fetch)).toEqual({
			ok: false,
			error: { code: 'rate-limited', host: 'mempool.space' }
		});
	});
});
