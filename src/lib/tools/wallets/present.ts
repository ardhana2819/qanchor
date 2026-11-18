import { NETWORKS, networkById, type Network } from '#lib/config/networks.ts';
import { CHAIN_NAMES } from '#lib/core/chains/catalog.ts';
import type { ChainId } from '#lib/core/chains/types.ts';
import type { FaucetUrlProblem } from '#lib/core/faucets.ts';
import type { AddressProblem } from '#lib/core/wallets.ts';
import type { LookupError } from '#lib/net/request.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import { defectText } from '#lib/tools/address/verdict-text.ts';

// Copy and options for the testnet wallet tracker (design S-08, section 7).

export const CHAIN_OPTIONS = (Object.keys(CHAIN_NAMES) as ChainId[]).map((chain) => ({
	value: chain,
	label: CHAIN_NAMES[chain]
}));

/** The testnets of a chain: the tracker is for testnet wallets. */
export function networkOptions(chain: ChainId): { value: string; label: string }[] {
	return NETWORKS.filter((n) => n.chain === chain && n.testnet).map((n) => ({
		value: n.id,
		label: n.name
	}));
}

/** A stored network id by name; an imported entry may name a network this version lacks. */
export function networkName(networkId: string): string {
	return networkById(networkId)?.name ?? networkId;
}

export function addressProblemText(problem: AddressProblem, chain: ChainId): string {
	switch (problem.kind) {
		case 'empty':
			return 'Paste the wallet address.';
		case 'mainnet':
			return 'This is a mainnet address. Only testnet Bitcoin addresses can be saved.';
		case 'other-chain':
			return `This is a valid ${CHAIN_NAMES[problem.chain]} address, not ${CHAIN_NAMES[chain]}. Pick the matching chain.`;
		case 'invalid':
			return problem.defect
				? `Not a valid ${CHAIN_NAMES[chain]} address. ${defectText(problem.defect)}`
				: `Not a valid ${CHAIN_NAMES[chain]} address.`;
	}
}

export const WRITE_ERRORS: Record<StorageErrorCode, string> = {
	quota: 'Storage is full. Free up space in this browser, then try again.',
	unavailable: 'Storage is unavailable in this browser session, so nothing was saved.',
	closed: 'QAnchor was updated in another tab. Reload this tab, then try again.',
	failed: 'The change could not be saved.'
};

export const FAUCET_URL_ERRORS: Record<FaucetUrlProblem, string> = {
	empty: "Paste the faucet's web address.",
	invalid: 'Not a web address. Paste the full address, starting with https://.',
	scheme: 'Only http and https links can be added.'
};

/** The message for a failed balance refresh; the codes and wording follow FR-042. */
export function balanceErrorText(error: LookupError, network: Network): string {
	switch (error.code) {
		case 'not-found':
			return `${error.host} could not find this address.`;
		case 'rate-limited':
			return `${error.host} is rate-limiting requests. Try again later or set your own endpoint in Settings.`;
		case 'network':
			return `Could not reach ${error.host}. The balance could not be read.`;
		case 'timeout':
			return `No response from ${error.host} within 10 seconds.`;
		case 'bad-response':
			return `${error.host} returned a response QAnchor could not read.`;
		case 'chain-mismatch':
			return `This endpoint serves chain ID ${error.actual}, but ${network.name} is chain ID ${error.expected}.`;
		case 'aborted':
			throw new Error('an aborted refresh has no message');
	}
}

/** "14:02", the local time a balance was fetched. */
export function clockTime(ms: number): string {
	const date = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
