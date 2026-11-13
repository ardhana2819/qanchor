import type { DBSchema } from 'idb';

// IndexedDB schema v1 (docs/architecture.md section 3.1, ADR-014). No store and no field holds
// a private key or mnemonic (FR-071 AC-2, NFR-012).

export const DB_NAME = 'qanchor';
export const DB_VERSION = 1;

/** A user override of a network's default endpoint; defaults live in code (FR-041). */
export interface EndpointOverride {
	networkId: string;
	url: string;
}

/** A testnet wallet entry: public address and the user's own notes only (FR-070, FR-071). */
export interface Wallet {
	id: string;
	label: string;
	chain: 'evm' | 'bitcoin' | 'solana' | 'tron';
	networkId: string;
	address: string;
	notes: string;
	createdAt: number;
	updatedAt: number;
}

/** A user-added faucet link (FR-072). */
export interface Faucet {
	id: string;
	networkId: string;
	label: string;
	url: string;
}

export interface QAnchorDB extends DBSchema {
	endpoints: { key: string; value: EndpointOverride };
	wallets: { key: string; value: Wallet; indexes: { byNetworkAddress: [string, string] } };
	faucets: { key: string; value: Faucet };
}

export type StoreName = 'endpoints' | 'wallets' | 'faucets';

export const STORE_NAMES: readonly StoreName[] = ['endpoints', 'wallets', 'faucets'];

/** Every record in the database, store by store: what a backup carries besides the theme. */
export interface StoredRecords {
	endpoints: EndpointOverride[];
	wallets: Wallet[];
	faucets: Faucet[];
}
