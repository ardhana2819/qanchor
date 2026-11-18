import { networkById } from '#lib/config/networks.ts';
import { resolveEndpoint } from '#lib/net/endpoint.ts';
import { fetchBalance } from '#lib/net/balance.ts';
import type { LookupError } from '#lib/net/request.ts';
import { endpointOverrides } from './endpoints.svelte.ts';

/**
 * - value: the last balance fetched, in base units, with its fetch time (Unix ms).
 * - refreshing: a request is in flight.
 * - error: the last refresh failed; a value from before it is kept and shown as stale
 *   (FR-073 AC-3).
 */
export interface BalanceState {
	value?: { amount: bigint; fetchedAt: number };
	refreshing: boolean;
	error?: LookupError;
}

const IDLE: BalanceState = { refreshing: false };

/** Two entries for one address on one network share their balance. */
const keyOf = (networkId: string, address: string) => `${networkId}\n${address}`;

/**
 * Wallet balances (FR-073), kept in memory for the session only and never stored (decisions,
 * ADR on storage): a stored balance would be stale by the next visit. Nothing here runs on its
 * own; a request is sent only from `refresh`, which a button calls (AC-2).
 */
class Balances {
	// Raw: each update replaces the record, which also keeps bigints out of a proxy.
	#states: Readonly<Record<string, BalanceState>> = $state.raw({});

	get(networkId: string, address: string): BalanceState {
		return this.#states[keyOf(networkId, address)] ?? IDLE;
	}

	#set(key: string, state: BalanceState): void {
		this.#states = { ...this.#states, [key]: state };
	}

	/**
	 * Fetches one balance. A second call for the same address while one is in flight is ignored.
	 * Returns false when the request failed, so the caller can move focus to the error.
	 */
	async refresh(networkId: string, address: string, signal?: AbortSignal): Promise<boolean> {
		const network = networkById(networkId);
		const key = keyOf(networkId, address);
		const before = this.#states[key] ?? IDLE;
		if (!network || before.refreshing) return true;
		this.#set(key, { ...before, refreshing: true });
		if (endpointOverrides.status === 'loading') await endpointOverrides.load();
		const endpoint = resolveEndpoint(network, endpointOverrides.list);
		const result = await fetchBalance(network, endpoint, address, { signal });
		const current = this.#states[key] ?? IDLE;
		if (result.ok) {
			this.#set(key, { value: { amount: result.value, fetchedAt: Date.now() }, refreshing: false });
			return true;
		}
		// The page was left: forget the attempt, keep what was there before (NFR-019).
		if (result.error.code === 'aborted') {
			this.#set(key, { ...current, refreshing: false });
			return true;
		}
		this.#set(key, { value: current.value, refreshing: false, error: result.error });
		return false;
	}
}

export const balances = new Balances();
