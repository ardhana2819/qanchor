import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { QAnchorDB, StoreName } from './schema.ts';

type UpgradeDB = IDBPDatabase<QAnchorDB>;
type UpgradeTransaction = IDBPTransaction<QAnchorDB, StoreName[], 'versionchange'>;

/** Brings the database from version n - 1 to n. Runs inside idb's upgrade callback (NFR-016). */
export type Migration = (db: UpgradeDB, transaction: UpgradeTransaction) => void;

/**
 * One step per version. A schema change adds the next step here and raises DB_VERSION; the
 * backup format has its own version (BACKUP_VERSION in backup.ts), raised when the backup changes.
 * Shipped steps never change: a browser that already ran them would not run them again.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	1: (db) => {
		db.createObjectStore('endpoints', { keyPath: 'networkId' });
		const wallets = db.createObjectStore('wallets', { keyPath: 'id' });
		// For the "already saved" warning on the same network and address (FR-070 AC-6).
		wallets.createIndex('byNetworkAddress', ['networkId', 'address']);
		db.createObjectStore('faucets', { keyPath: 'id' });
	},
	// Phase 2 test cases and runs (ADR-015). Adds stores only; the v1 stores and their records
	// are untouched (FR-091 AC-1).
	2: (db) => {
		const testCases = db.createObjectStore('testCases', { keyPath: 'id' });
		// A key (TC-<n>) belongs to one case; a second case with it fails its transaction.
		testCases.createIndex('byNumber', 'number', { unique: true });
		db.createObjectStore('runs', { keyPath: 'id' });
		// runId first in the key keeps one run's results in one key range, which is how a run is
		// read and deleted with its results (NFR-024); no separate index is needed.
		db.createObjectStore('results', { keyPath: ['runId', 'caseNumber'] });
		db.createObjectStore('meta', { keyPath: 'key' });
	},
	// Screenshots of results, and of session findings in slice 2c (plan finding F-8). Adds a store
	// only; the v2 records are untouched.
	3: (db) => {
		const screenshots = db.createObjectStore('screenshots', { keyPath: 'id' });
		// The owner is an array key: one range reads or deletes a result's or a run's screenshots.
		screenshots.createIndex('byOwner', 'owner');
	}
};

/** Runs every step after oldVersion up to newVersion, in order. */
export function runMigrations(
	db: UpgradeDB,
	transaction: UpgradeTransaction,
	oldVersion: number,
	newVersion: number,
	migrations: Readonly<Record<number, Migration>> = MIGRATIONS
): void {
	for (let version = oldVersion + 1; version <= newVersion; version++) {
		const step = migrations[version];
		// A gap is a bug in this file; failing here aborts the upgrade and keeps the old data.
		if (!step) throw new Error(`No migration to schema version ${version}.`);
		step(db, transaction);
	}
}
