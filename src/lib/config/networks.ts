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
	/** The native coin's display symbol, for values and fees (FR-040 AC-2). */
	readonly symbol: string;
	/** Explorer page for a transaction; `{hash}` is replaced (FR-043, architecture 5.1). */
	readonly explorerTx: string;
}

/** Mainnet, then its one testnet (OQ-29), per chain in the order of docs/architecture.md. */
export const NETWORKS: readonly Network[] = [
	evm(
		'eth',
		'Ethereum',
		false,
		'0x1',
		'ETH',
		'https://mainnet.gateway.tenderly.co',
		'https://etherscan.io/tx/{hash}'
	),
	evm(
		'eth-sepolia',
		'Ethereum Sepolia',
		true,
		'0xaa36a7',
		'ETH',
		'https://sepolia.gateway.tenderly.co',
		'https://sepolia.etherscan.io/tx/{hash}'
	),
	evm(
		'bsc',
		'BNB Smart Chain',
		false,
		'0x38',
		'BNB',
		'https://bsc-dataseed.bnbchain.org',
		'https://bscscan.com/tx/{hash}'
	),
	evm(
		'bsc-testnet',
		'BSC Testnet',
		true,
		'0x61',
		'BNB',
		'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
		'https://testnet.bscscan.com/tx/{hash}'
	),
	evm(
		'polygon',
		'Polygon',
		false,
		'0x89',
		'POL',
		'https://polygon.gateway.tenderly.co',
		'https://polygonscan.com/tx/{hash}'
	),
	evm(
		'polygon-amoy',
		'Polygon Amoy',
		true,
		'0x13882',
		'POL',
		'https://polygon-amoy.gateway.tenderly.co',
		'https://amoy.polygonscan.com/tx/{hash}'
	),
	evm(
		'arbitrum',
		'Arbitrum One',
		false,
		'0xa4b1',
		'ETH',
		'https://arb1.arbitrum.io/rpc',
		'https://arbiscan.io/tx/{hash}'
	),
	evm(
		'arbitrum-sepolia',
		'Arbitrum Sepolia',
		true,
		'0x66eee',
		'ETH',
		'https://sepolia-rollup.arbitrum.io/rpc',
		'https://sepolia.arbiscan.io/tx/{hash}'
	),
	evm(
		'base',
		'Base',
		false,
		'0x2105',
		'ETH',
		'https://mainnet.base.org',
		'https://basescan.org/tx/{hash}'
	),
	evm(
		'base-sepolia',
		'Base Sepolia',
		true,
		'0x14a34',
		'ETH',
		'https://base-sepolia.gateway.tenderly.co',
		'https://sepolia.basescan.org/tx/{hash}'
	),
	{
		id: 'solana',
		name: 'Solana',
		chain: 'solana',
		protocol: 'json-rpc',
		testnet: false,
		defaultUrl: 'https://solana-rpc.publicnode.com',
		symbol: 'SOL',
		explorerTx: 'https://explorer.solana.com/tx/{hash}'
	},
	{
		id: 'solana-devnet',
		name: 'Solana Devnet',
		chain: 'solana',
		protocol: 'json-rpc',
		testnet: true,
		defaultUrl: 'https://api.devnet.solana.com',
		symbol: 'SOL',
		explorerTx: 'https://explorer.solana.com/tx/{hash}?cluster=devnet'
	},
	{
		id: 'tron',
		name: 'Tron',
		chain: 'tron',
		protocol: 'tron-http',
		testnet: false,
		defaultUrl: 'https://api.trongrid.io',
		symbol: 'TRX',
		explorerTx: 'https://tronscan.org/#/transaction/{hash}'
	},
	{
		id: 'tron-nile',
		name: 'Tron Nile',
		chain: 'tron',
		protocol: 'tron-http',
		testnet: true,
		defaultUrl: 'https://nile.trongrid.io',
		symbol: 'TRX',
		explorerTx: 'https://nile.tronscan.org/#/transaction/{hash}'
	},
	{
		id: 'bitcoin',
		name: 'Bitcoin',
		chain: 'bitcoin',
		protocol: 'esplora',
		testnet: false,
		defaultUrl: 'https://mempool.space/api',
		symbol: 'BTC',
		explorerTx: 'https://mempool.space/tx/{hash}'
	},
	{
		id: 'bitcoin-testnet4',
		name: 'Bitcoin Testnet4',
		chain: 'bitcoin',
		protocol: 'esplora',
		testnet: true,
		defaultUrl: 'https://mempool.space/testnet4/api',
		symbol: 'BTC',
		explorerTx: 'https://mempool.space/testnet4/tx/{hash}'
	}
];

function evm(
	id: string,
	name: string,
	testnet: boolean,
	chainId: `0x${string}`,
	symbol: string,
	defaultUrl: string,
	explorerTx: string
): Network {
	return {
		id,
		name,
		chain: 'evm',
		protocol: 'json-rpc',
		testnet,
		chainId,
		symbol,
		defaultUrl,
		explorerTx
	};
}

/** The explorer page for a transaction on the network (FR-043). */
export function explorerTxUrl(network: Network, hash: string): string {
	return network.explorerTx.replace('{hash}', encodeURIComponent(hash));
}

export function networkById(id: string): Network | undefined {
	return NETWORKS.find((network) => network.id === id);
}

/** A faucet page; the app only links to it and never fills in or submits anything (FR-072). */
export interface FaucetLink {
	readonly label: string;
	readonly url: string;
}

/** Checked 2026-11-17 (T-035, docs/architecture.md section 5.2). Mainnets have none. */
const BUILTIN_FAUCETS: Readonly<Record<string, readonly FaucetLink[]>> = {
	'eth-sepolia': [
		{
			label: 'Google Cloud',
			url: 'https://cloud.google.com/application/web3/faucet/ethereum/sepolia'
		},
		{ label: 'Chainlink', url: 'https://faucets.chain.link/sepolia' },
		{ label: 'Alchemy', url: 'https://www.alchemy.com/faucets/ethereum-sepolia' }
	],
	'bsc-testnet': [{ label: 'BNB Chain', url: 'https://www.bnbchain.org/en/testnet-faucet' }],
	'polygon-amoy': [{ label: 'Polygon', url: 'https://faucet.polygon.technology/' }],
	'arbitrum-sepolia': [
		{ label: 'Arbitrum faucet', url: 'https://arbitrum.faucet.dev/' },
		{ label: 'Chainlink', url: 'https://faucets.chain.link/arbitrum-sepolia' },
		{ label: 'Alchemy', url: 'https://www.alchemy.com/faucets/arbitrum-sepolia' }
	],
	'base-sepolia': [
		{ label: 'Alchemy', url: 'https://www.alchemy.com/faucets/base-sepolia' },
		{ label: 'Coinbase CDP', url: 'https://portal.cdp.coinbase.com/onchain-tools/faucet' }
	],
	'solana-devnet': [{ label: 'Solana', url: 'https://faucet.solana.com/' }],
	'tron-nile': [{ label: 'Nile', url: 'https://nileex.io/join/getJoinPage' }],
	'bitcoin-testnet4': [
		{ label: 'mempool.space', url: 'https://mempool.space/testnet4/faucet' },
		{ label: 'coinfaucet.eu', url: 'https://coinfaucet.eu/en/btc-testnet4/' }
	]
};

/** The built-in faucets of a network, or none for a mainnet or an unknown id. */
export function builtinFaucets(networkId: string): readonly FaucetLink[] {
	return Object.hasOwn(BUILTIN_FAUCETS, networkId) ? BUILTIN_FAUCETS[networkId] : [];
}
