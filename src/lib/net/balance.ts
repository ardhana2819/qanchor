import type { Network } from '#lib/config/networks.ts';
import {
	parseEsploraBalance,
	parseEvmBalance,
	parseSolanaBalance,
	parseTronBalance
} from '#lib/core/balance/parse.ts';
import { err, type Result } from '#lib/core/result.ts';
import { checkChainId, type Endpoint } from './endpoint.ts';
import { esploraGet, jsonRpc, tronPost, type LookupError, type RequestOptions } from './request.ts';

// One native-balance request per protocol (FR-073), sent only when the user asks for it. The
// errors are the tx lookup's LookupError codes, so the same states apply (FR-073 AC-3).

type Balance = Promise<Result<bigint, LookupError>>;

function parsed(result: Result<bigint, string>, host: string): Result<bigint, LookupError> {
	return result.ok ? result : err({ code: 'bad-response', host, detail: result.error });
}

async function evmBalance(
	network: Network,
	endpoint: Endpoint,
	address: string,
	o: RequestOptions
): Balance {
	// A wrong-chain endpoint would answer with a balance from another chain (EC-009).
	const chain = await checkChainId(endpoint, network, o);
	if (!chain.ok) return chain;
	const answer = await jsonRpc(endpoint.url, 'eth_getBalance', [address, 'latest'], o);
	return answer.ok ? parsed(parseEvmBalance(answer.value), endpoint.host) : answer;
}

async function solanaBalance(endpoint: Endpoint, address: string, o: RequestOptions): Balance {
	const answer = await jsonRpc(endpoint.url, 'getBalance', [address], o);
	return answer.ok ? parsed(parseSolanaBalance(answer.value), endpoint.host) : answer;
}

async function tronBalance(endpoint: Endpoint, address: string, o: RequestOptions): Balance {
	const answer = await tronPost(`${endpoint.url}/wallet/getaccount`, { address, visible: true }, o);
	return answer.ok ? parsed(parseTronBalance(answer.value), endpoint.host) : answer;
}

async function bitcoinBalance(endpoint: Endpoint, address: string, o: RequestOptions): Balance {
	const answer = await esploraGet(`${endpoint.url}/address/${encodeURIComponent(address)}`, o);
	return answer.ok ? parsed(parseEsploraBalance(answer.value), endpoint.host) : answer;
}

/** The native balance of an address already checked for the network's chain, in base units. */
export function fetchBalance(
	network: Network,
	endpoint: Endpoint,
	address: string,
	options: RequestOptions = {}
): Balance {
	switch (network.chain) {
		case 'evm':
			return evmBalance(network, endpoint, address, options);
		case 'solana':
			return solanaBalance(endpoint, address, options);
		case 'tron':
			return tronBalance(endpoint, address, options);
		case 'bitcoin':
			return bitcoinBalance(endpoint, address, options);
	}
}
