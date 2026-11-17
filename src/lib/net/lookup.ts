import type { Network } from '#lib/config/networks.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import { parseBitcoinTx } from '#lib/core/tx/bitcoin.ts';
import { parseEvmTx } from '#lib/core/tx/evm.ts';
import { parseSolanaStatus, parseSolanaTx, pendingSolanaTx } from '#lib/core/tx/solana.ts';
import { parseTronTx } from '#lib/core/tx/tron.ts';
import type { TxParseError, TxResult } from '#lib/core/tx/types.ts';
import { checkChainId, type Endpoint } from './endpoint.ts';
import {
	esploraGet,
	jsonRpc,
	orNotFound,
	tronPost,
	type LookupError,
	type RequestOptions
} from './request.ts';

// One transaction lookup per protocol (docs/architecture.md section 4.2): the calls in order,
// then the parser from lib/core/tx. Requests run one after another, never in parallel, so one
// lookup is at most three small requests and stops at the first error.

type Lookup = Promise<Result<TxResult, LookupError>>;

const badResponse = (host: string, detail: TxParseError): Result<never, LookupError> =>
	err({ code: 'bad-response', host, detail });

const parsed = (
	result: Result<TxResult, TxParseError>,
	host: string
): Result<TxResult, LookupError> => (result.ok ? result : badResponse(host, result.error));

async function lookupEvm(
	network: Network,
	endpoint: Endpoint,
	hash: string,
	o: RequestOptions
): Lookup {
	const chain = await checkChainId(endpoint, network, o);
	if (!chain.ok) return chain;
	const tx = orNotFound(
		await jsonRpc(endpoint.url, 'eth_getTransactionByHash', [hash], o),
		endpoint.url
	);
	if (!tx.ok) return tx;
	const receipt = await jsonRpc(endpoint.url, 'eth_getTransactionReceipt', [hash], o);
	if (!receipt.ok) return receipt;
	return parsed(parseEvmTx(hash, tx.value, receipt.value), endpoint.host);
}

/**
 * Status first: getTransaction returns nothing for a transaction that is only "processed", so
 * that call alone could not tell pending from not found (decisions 2026-11-17, T-038).
 */
async function lookupSolana(endpoint: Endpoint, signature: string, o: RequestOptions): Lookup {
	const statuses = await jsonRpc(
		endpoint.url,
		'getSignatureStatuses',
		[[signature], { searchTransactionHistory: true }],
		o
	);
	if (!statuses.ok) return statuses;
	const status = parseSolanaStatus(statuses.value);
	if (!status.ok) return badResponse(endpoint.host, status.error);
	if (status.value === 'not-found') return err({ code: 'not-found', host: endpoint.host });
	if (status.value === 'pending') return ok(pendingSolanaTx());

	const tx = orNotFound(
		await jsonRpc(
			endpoint.url,
			'getTransaction',
			[signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }],
			o
		),
		endpoint.url
	);
	if (!tx.ok) return tx;
	return parsed(parseSolanaTx(signature, tx.value), endpoint.host);
}

/** `visible: true` makes TronGrid answer with Base58 addresses (decisions 2026-11-17, T-039). */
async function lookupTron(endpoint: Endpoint, txId: string, o: RequestOptions): Lookup {
	const body = { value: txId, visible: true };
	const tx = await tronPost(`${endpoint.url}/wallet/gettransactionbyid`, body, o);
	if (!tx.ok) return tx;
	const info = await tronPost(`${endpoint.url}/wallet/gettransactioninfobyid`, body, o);
	if (!info.ok) return info;
	const result = parseTronTx(txId, tx.value, info.value);
	if (!result.ok) return badResponse(endpoint.host, result.error);
	if (result.value === null) return err({ code: 'not-found', host: endpoint.host });
	return ok(result.value);
}

async function lookupBitcoin(endpoint: Endpoint, txid: string, o: RequestOptions): Lookup {
	const tx = await esploraGet(`${endpoint.url}/tx/${txid}`, o);
	if (!tx.ok) return tx;
	return parsed(parseBitcoinTx(txid, tx.value), endpoint.host);
}

/**
 * Looks up a transaction id already checked with `parseTxHash` (FR-040). Every expected failure
 * is a LookupError value (ADR-013); aborting through `options.signal` gives `aborted`.
 */
export function lookupTx(
	network: Network,
	endpoint: Endpoint,
	hash: string,
	options: RequestOptions = {}
): Lookup {
	switch (network.chain) {
		case 'evm':
			return lookupEvm(network, endpoint, hash, options);
		case 'solana':
			return lookupSolana(endpoint, hash, options);
		case 'tron':
			return lookupTron(endpoint, hash, options);
		case 'bitcoin':
			return lookupBitcoin(endpoint, hash, options);
	}
}
