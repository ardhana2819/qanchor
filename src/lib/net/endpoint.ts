import { err, ok, type Result } from '#lib/core/result.ts';
import type { Network } from '#lib/config/networks.ts';
import type { EndpointOverride } from '#lib/storage/schema.ts';
import { hostOf, jsonRpc, type LookupError, type RequestOptions } from './request.ts';

export interface Endpoint {
	url: string;
	host: string;
	/** The user's own URL from Settings rather than the default (FR-041 AC-3). */
	isOverride: boolean;
}

/** The user's override for the network if there is one, else the default (FR-041 AC-3). */
export function resolveEndpoint(
	network: Network,
	overrides: readonly EndpointOverride[]
): Endpoint {
	const override = overrides.find((o) => o.networkId === network.id);
	const url = override?.url ?? network.defaultUrl;
	return { url, host: hostOf(url), isOverride: override !== undefined };
}

/**
 * Asks an EVM endpoint which chain it serves before any lookup, so data from the wrong chain is
 * never shown (FR-041 AC-4, EC-009). Run for defaults too: it costs one small request. Networks
 * without a chain ID (non-EVM) pass.
 */
export async function checkChainId(
	endpoint: Endpoint,
	network: Network,
	options: RequestOptions = {}
): Promise<Result<void, LookupError>> {
	if (!network.chainId) return ok(undefined);
	const answer = await jsonRpc(endpoint.url, 'eth_chainId', [], options);
	if (!answer.ok) return answer;
	if (typeof answer.value !== 'string' || !/^0x[0-9a-f]+$/i.test(answer.value)) {
		return err({ code: 'bad-response', host: endpoint.host, detail: 'eth_chainId is not hex' });
	}
	const expected = BigInt(network.chainId);
	const actual = BigInt(answer.value);
	if (actual !== expected) {
		return err({ code: 'chain-mismatch', host: endpoint.host, expected, actual });
	}
	return ok(undefined);
}
