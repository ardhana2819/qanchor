import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '#lib/core/result.ts';
import { networkById, type Network } from '#lib/config/networks.ts';
import { checkChainId, resolveEndpoint } from './endpoint.ts';

const polygon = networkById('polygon')!;
const solana = networkById('solana')!;

const rpcAnswer = (result: unknown) =>
	vi.fn<typeof fetch>(
		async () => new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 })
	);

describe('resolveEndpoint (FR-041 AC-3)', () => {
	it('uses the default when the network has no override', () => {
		expect(resolveEndpoint(polygon, [{ networkId: 'eth', url: 'https://other.dev' }])).toEqual({
			url: 'https://polygon.gateway.tenderly.co',
			host: 'polygon.gateway.tenderly.co',
			isOverride: false
		});
	});

	it("uses the network's override when there is one", () => {
		expect(
			resolveEndpoint(polygon, [{ networkId: 'polygon', url: 'http://localhost:8545' }])
		).toEqual({ url: 'http://localhost:8545', host: 'localhost:8545', isOverride: true });
	});
});

describe('checkChainId (FR-041 AC-4, EC-009)', () => {
	const endpoint = resolveEndpoint(polygon, []);

	it('passes when the endpoint serves the network, in any hex case', async () => {
		for (const id of ['0x89', '0X89', '0x0089']) {
			expect(await checkChainId(endpoint, polygon, { fetch: rpcAnswer(id) }), id).toEqual(
				ok(undefined)
			);
		}
	});

	it('reports another chain as chain-mismatch with both IDs', async () => {
		expect(await checkChainId(endpoint, polygon, { fetch: rpcAnswer('0x1') })).toEqual(
			err({ code: 'chain-mismatch', host: endpoint.host, expected: 137n, actual: 1n })
		);
	});

	it('reports a chain ID that is not hex as bad-response', async () => {
		for (const id of [137, '137', null, '0x', '0xzz']) {
			expect(await checkChainId(endpoint, polygon, { fetch: rpcAnswer(id) }), String(id)).toEqual(
				err({ code: 'bad-response', host: endpoint.host, detail: 'eth_chainId is not hex' })
			);
		}
	});

	it('passes request errors through unchanged', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw new TypeError('Failed to fetch');
		});
		expect(await checkChainId(endpoint, polygon, { fetch })).toEqual(
			err({ code: 'network', host: endpoint.host })
		);
	});

	it('makes no request for a network without a chain ID', async () => {
		const fetch = rpcAnswer('0x1');
		const network: Network = solana;

		expect(await checkChainId(resolveEndpoint(network, []), network, { fetch })).toEqual(
			ok(undefined)
		);
		expect(fetch).not.toHaveBeenCalled();
	});
});
