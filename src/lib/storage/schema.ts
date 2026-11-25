import type { DBSchema } from 'idb';
import type { Run, Screenshot, TestCase, TestResult } from '#lib/core/qa/types.ts';

// IndexedDB schema v3 (docs/architecture.md section 3.1, ADR-014, ADR-015, plan finding F-8). No store and no
// field holds a private key or mnemonic (FR-071 AC-2, NFR-012).

export const DB_NAME = 'qanchor';
export const DB_VERSION = 3;

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

/** The highest case number ever assigned, so a deleted key is never given out again (ADR-015). */
export interface CaseCounter {
	key: 'caseCounter';
	value: number;
}

export interface QAnchorDB extends DBSchema {
	endpoints: { key: string; value: EndpointOverride };
	wallets: { key: string; value: Wallet; indexes: { byNetworkAddress: [string, string] } };
	faucets: { key: string; value: Faucet };
	testCases: { key: string; value: TestCase; indexes: { byNumber: number } };
	runs: { key: string; value: Run };
	results: { key: [string, number]; value: TestResult };
	meta: { key: string; value: CaseCounter };
	screenshots: {
		key: string;
		value: Screenshot;
		indexes: { byOwner: Screenshot['owner'] };
	};
}

export type StoreName =
	'endpoints' | 'wallets' | 'faucets' | 'testCases' | 'runs' | 'results' | 'meta' | 'screenshots';

/**
 * The stores a backup carries: every store except `meta`, whose key counter is rebuilt on import
 * from the highest case number in the file (ADR-015, plan finding F-5), and `screenshots`, which
 * backup v3 adds (T-061).
 */
export type BackupStoreName = Exclude<StoreName, 'meta' | 'screenshots'>;

export const BACKUP_STORE_NAMES: readonly BackupStoreName[] = [
	'endpoints',
	'wallets',
	'faucets',
	'testCases',
	'runs',
	'results'
];

/** Every record in the backed-up stores, store by store: what a backup carries besides the theme. */
export interface StoredRecords {
	endpoints: EndpointOverride[];
	wallets: Wallet[];
	faucets: Faucet[];
	testCases: TestCase[];
	runs: Run[];
	results: TestResult[];
}
