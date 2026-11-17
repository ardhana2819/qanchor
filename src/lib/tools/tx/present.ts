import type { Network } from '#lib/config/networks.ts';
import type { ChainId } from '#lib/core/chains/types.ts';
import { formatAmount } from '#lib/core/amount/decimal.ts';
import type { Endpoint } from '#lib/net/endpoint.ts';
import type { LookupError } from '#lib/net/request.ts';

// Text for the tx lookup page: amounts in two units (FR-040 AC-2) and the error copy from
// docs/design.md section 7 (FR-042).

/** Smallest unit and its decimals per chain, as in the unit converter. */
const BASE_UNIT: Record<ChainId, { name: string; decimals: number }> = {
	evm: { name: 'wei', decimals: 18 },
	solana: { name: 'lamports', decimals: 9 },
	tron: { name: 'sun', decimals: 6 },
	bitcoin: { name: 'sats', decimals: 8 }
};

export interface Amount {
	/** "0.0051 ETH" */
	display: string;
	/** "5100000000000000 wei" */
	base: string;
}

export function amount(value: bigint, network: Network): Amount {
	const unit = BASE_UNIT[network.chain];
	return {
		display: `${formatAmount(value, unit.decimals)} ${network.symbol}`,
		base: `${value} ${unit.name}`
	};
}

/** "2026-11-17 08:14:00 UTC" from Unix milliseconds. */
export function utc(ms: number): string {
	return `${new Date(ms).toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export interface ErrorCopy {
	text: string;
	/** A second paragraph with what to try next, when there is one. */
	hint?: string;
}

/** The message for a lookup error (FR-042 AC-1 to AC-5, FR-041 AC-4). */
export function errorCopy(error: LookupError, network: Network, endpoint: Endpoint): ErrorCopy {
	switch (error.code) {
		case 'not-found':
			return {
				text: `Transaction not found on ${network.name}. Check that the selected network is the one the transaction was sent on.`,
				// Only the default keeps a short history; an override may be a full-history node.
				hint:
					network.id === 'solana' && !endpoint.isOverride
						? 'The default Solana endpoint keeps only the last few days of transactions. For an older one, set an endpoint with full history in Settings.'
						: undefined
			};
		case 'rate-limited':
			return {
				text: `${error.host} is rate-limiting requests. Try again later or set your own endpoint in Settings.`
			};
		case 'network':
			return {
				text: `Could not reach ${error.host}. The request did not complete, so this says nothing about whether the transaction exists.`
			};
		case 'timeout':
			return { text: `No response from ${error.host} within 10 seconds.` };
		case 'bad-response':
			return { text: `${error.host} returned a response QAnchor could not read.` };
		case 'aborted':
			// The caller cancelled (a new lookup, or the page was left): nothing is shown for it.
			throw new Error('an aborted lookup has no message');
		case 'chain-mismatch':
			return {
				text: `This endpoint serves chain ID ${error.actual}, but ${network.name} is chain ID ${error.expected}.`
			};
	}
}
