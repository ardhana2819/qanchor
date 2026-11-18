import { describe, expect, it } from 'vitest';
import { builtinFaucets, explorerTxUrl, NETWORKS, networkById } from './networks.ts';

describe('NETWORKS', () => {
	it('has a mainnet and one testnet for each of the eight chains (OQ-29)', () => {
		expect(NETWORKS).toHaveLength(16);
		expect(NETWORKS.filter((n) => n.testnet)).toHaveLength(8);
	});

	it('has unique, URL-safe ids', () => {
		const ids = NETWORKS.map((n) => n.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
	});

	it('gives every EVM network a unique lower-case hex chain ID, and no other network one', () => {
		const evm = NETWORKS.filter((n) => n.chain === 'evm');
		expect(evm).toHaveLength(10);
		for (const n of evm) expect(n.chainId).toMatch(/^0x[0-9a-f]+$/);
		expect(new Set(evm.map((n) => n.chainId)).size).toBe(evm.length);
		for (const n of NETWORKS.filter((n) => n.chain !== 'evm')) expect(n.chainId).toBeUndefined();
	});

	it('matches each chain with its protocol', () => {
		const protocol = { evm: 'json-rpc', solana: 'json-rpc', tron: 'tron-http', bitcoin: 'esplora' };
		for (const n of NETWORKS) expect(n.protocol).toBe(protocol[n.chain]);
	});

	it('uses https default endpoints with no trailing slash', () => {
		for (const n of NETWORKS) {
			expect(new URL(n.defaultUrl).protocol).toBe('https:');
			expect(n.defaultUrl.endsWith('/')).toBe(false);
		}
	});

	it('has an https explorer template with one {hash} for every network (FR-043)', () => {
		for (const n of NETWORKS) {
			expect(new URL(n.explorerTx.replace('{hash}', 'x')).protocol).toBe('https:');
			expect(n.explorerTx.split('{hash}')).toHaveLength(2);
			expect(n.symbol).toMatch(/^[A-Z]+$/);
		}
	});

	it('fills the explorer template with the hash', () => {
		expect(explorerTxUrl(networkById('solana-devnet')!, 'abc')).toBe(
			'https://explorer.solana.com/tx/abc?cluster=devnet'
		);
		expect(explorerTxUrl(networkById('tron')!, 'ff')).toBe('https://tronscan.org/#/transaction/ff');
	});

	it('finds a network by id, and nothing for an unknown id', () => {
		expect(networkById('polygon')?.chainId).toBe('0x89');
		expect(networkById('nope')).toBeUndefined();
	});
});

describe('builtinFaucets (FR-072, architecture 5.2)', () => {
	it('lists at least one https faucet for every testnet and none for a mainnet', () => {
		for (const n of NETWORKS) {
			const list = builtinFaucets(n.id);
			if (!n.testnet) {
				expect(list, n.id).toEqual([]);
				continue;
			}
			expect(list.length, n.id).toBeGreaterThan(0);
			for (const f of list) {
				expect(f.label.trim(), n.id).not.toBe('');
				expect(new URL(f.url).protocol, f.url).toBe('https:');
				// Stored the way checkFaucetUrl stores user links, so duplicates are caught.
				expect(new URL(f.url).href).toBe(f.url);
			}
			expect(new Set(list.map((f) => f.url)).size, n.id).toBe(list.length);
		}
	});

	it('lists nothing for an unknown id, including inherited object keys', () => {
		expect(builtinFaucets('eth-goerli')).toEqual([]);
		expect(builtinFaucets('constructor')).toEqual([]);
		expect(builtinFaucets('__proto__')).toEqual([]);
	});

	it('keeps the faucets checked in T-035', () => {
		expect(builtinFaucets('eth-sepolia').map((f) => f.url)).toEqual([
			'https://cloud.google.com/application/web3/faucet/ethereum/sepolia',
			'https://faucets.chain.link/sepolia',
			'https://www.alchemy.com/faucets/ethereum-sepolia'
		]);
		expect(builtinFaucets('bitcoin-testnet4').map((f) => f.url)).toEqual([
			'https://mempool.space/testnet4/faucet',
			'https://coinfaucet.eu/en/btc-testnet4/'
		]);
	});
});
