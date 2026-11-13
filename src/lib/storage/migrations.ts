import type { IDBPDatabase, IDBPTransaction } from 'idb';
import type { QAnchorDB } from './schema.ts';

type UpgradeDB = IDBPDatabase<QAnchorDB>;
type UpgradeTransaction = IDBPTransaction<
	QAnchorDB,
	('endpoints' | 'wallets' | 'faucets')[],
	'versionchange'
>;

/** Brings the database from version n - 1 to n. Runs inside idb's upgrade callback (NFR-016). */
export type Migration = (db: UpgradeDB, transaction: UpgradeTransaction) => void;

/**
 * One step per version. A schema change adds the next step here, raises DB_VERSION, and raises
 * the export schemaVersion with it. Shipped steps never change: a browser that already ran them
 * would not run them again.
 */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
	1: (db) => {
		db.createObjectStore('endpoints', { keyPath: 'networkId' });
		const wallets = db.createObjectStore('wallets', { keyPath: 'id' });
		// For the "already saved" warning on the same network and address (FR-070 AC-6).
		wallets.createIndex('byNetworkAddress', ['networkId', 'address']);
		db.createObjectStore('faucets', { keyPath: 'id' });
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
