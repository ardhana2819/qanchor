import type { ChainId } from '#lib/core/chains/types.ts';

/** How a network's endpoint is spoken to (docs/architecture.md section 5, ADR-006). */
export type Protocol = 'json-rpc' | 'tron-http' | 'esplora';

export interface Network {
	/** Stable key: endpoint overrides and wallets are stored under it, so it never changes. */
	readonly id: string;
	readonly name: string;
	readonly chain: ChainId;
	readonly protocol: Protocol;
	readonly testnet: boolean;
	/** EVM only: the `eth_chainId` the endpoint must answer (FR-041 AC-4), lower-case hex. */
	readonly chainId?: `0x${string}`;
	/** Verified 2026-11-17 (T-035, docs/architecture.md section 5). */
	readonly defaultUrl: string;
}

/** Mainnet, then its one testnet (OQ-29), per chain in the order of docs/architecture.md. */
export const NETWORKS: readonly Network[] = [
	evm('eth', 'Ethereum', false, '0x1', 'https://mainnet.gateway.tenderly.co'),
	evm('eth-sepolia', 'Ethereum Sepolia', true, '0xaa36a7', 'https://sepolia.gateway.tenderly.co'),
	evm('bsc', 'BNB Smart Chain', false, '0x38', 'https://bsc-dataseed.bnbchain.org'),
	evm(
		'bsc-testnet',
		'BSC Testnet',
		true,
		'0x61',
		'https://data-seed-prebsc-1-s1.bnbchain.org:8545'
	),
	evm('polygon', 'Polygon', false, '0x89', 'https://polygon.gateway.tenderly.co'),
	evm('polygon-amoy', 'Polygon Amoy', true, '0x13882', 'https://polygon-amoy.gateway.tenderly.co'),
	evm('arbitrum', 'Arbitrum One', false, '0xa4b1', 'https://arb1.arbitrum.io/rpc'),
	evm(
		'arbitrum-sepolia',
		'Arbitrum Sepolia',
		true,
		'0x66eee',
		'https://sepolia-rollup.arbitrum.io/rpc'
	),
	evm('base', 'Base', false, '0x2105', 'https://mainnet.base.org'),
	evm('base-sepolia', 'Base Sepolia', true, '0x14a34', 'https://base-sepolia.gateway.tenderly.co'),
	{
		id: 'solana',
		name: 'Solana',
		chain: 'solana',
		protocol: 'json-rpc',
		testnet: false,
		defaultUrl: 'https://solana-rpc.publicnode.com'
	},
	{
		id: 'solana-devnet',
		name: 'Solana Devnet',
		chain: 'solana',
		protocol: 'json-rpc',
		testnet: true,
		defaultUrl: 'https://api.devnet.solana.com'
	},
	{
		id: 'tron',
		name: 'Tron',
		chain: 'tron',
		protocol: 'tron-http',
		testnet: false,
		defaultUrl: 'https://api.trongrid.io'
	},
	{
		id: 'tron-nile',
		name: 'Tron Nile',
		chain: 'tron',
		protocol: 'tron-http',
		testnet: true,
		defaultUrl: 'https://nile.trongrid.io'
	},
	{
		id: 'bitcoin',
		name: 'Bitcoin',
		chain: 'bitcoin',
		protocol: 'esplora',
		testnet: false,
		defaultUrl: 'https://mempool.space/api'
	},
	{
		id: 'bitcoin-testnet4',
		name: 'Bitcoin Testnet4',
		chain: 'bitcoin',
		protocol: 'esplora',
		testnet: true,
		defaultUrl: 'https://mempool.space/testnet4/api'
	}
];

function evm(
	id: string,
	name: string,
	testnet: boolean,
	chainId: `0x${string}`,
	defaultUrl: string
): Network {
	return { id, name, chain: 'evm', protocol: 'json-rpc', testnet, chainId, defaultUrl };
}

export function networkById(id: string): Network | undefined {
	return NETWORKS.find((network) => network.id === id);
}
