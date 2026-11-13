import { openDB, type IDBPDatabase, type StoreValue } from 'idb';
import { err, ok, type Result } from '#lib/core/result.ts';
import { runMigrations } from './migrations.ts';
import { DB_NAME, DB_VERSION, type QAnchorDB, type StoreName } from './schema.ts';

/**
 * - unavailable: no IndexedDB, or the browser refuses to open it (private mode, disabled
 *   storage; EC-001).
 * - quota: the write did not fit (EC-002).
 * - closed: the connection was closed for a newer schema in another tab, or by the browser.
 * - failed: anything else. In every write error case the transaction was rolled back.
 */
export type StorageErrorCode = 'unavailable' | 'quota' | 'closed' | 'failed';

export interface Storage {
	readAll<S extends StoreName>(
		store: S
	): Promise<Result<StoreValue<QAnchorDB, S>[], StorageErrorCode>>;
	/** Writes all records in one transaction: either every record is saved or none is. */
	putAll<S extends StoreName>(
		store: S,
		records: readonly StoreValue<QAnchorDB, S>[]
	): Promise<Result<void, StorageErrorCode>>;
}

export interface OpenOptions {
	/** Another tab opened a newer schema, or the browser closed the database (EC-003). */
	onClosed: (reason: 'outdated' | 'lost') => void;
}

export async function openStorage(
	options: OpenOptions
): Promise<Result<Storage, StorageErrorCode>> {
	if (typeof indexedDB === 'undefined') return err('unavailable');
	let db: IDBPDatabase<QAnchorDB>;
	try {
		db = await openDB<QAnchorDB>(DB_NAME, DB_VERSION, {
			upgrade: (database, oldVersion, newVersion, transaction) =>
				runMigrations(database, transaction, oldVersion, newVersion ?? DB_VERSION),
			// Close at once so the other tab's upgrade can run; this tab asks for a reload.
			blocking: () => {
				db.close();
				options.onClosed('outdated');
			},
			terminated: () => options.onClosed('lost')
		});
	} catch {
		// Firefox private windows throw InvalidStateError; Safari with storage blocked throws
		// SecurityError or UnknownError. All mean the same to the user.
		return err('unavailable');
	}
	return ok(wrap(db));
}

function wrap(db: IDBPDatabase<QAnchorDB>): Storage {
	return {
		async readAll(store) {
			try {
				return ok(await db.getAll(store));
			} catch (error) {
				return err(classify(error));
			}
		},

		async putAll(store, records) {
			try {
				const transaction = db.transaction(store, 'readwrite');
				try {
					// Each request's error also rejects transaction.done, which is awaited below.
					for (const record of records) transaction.store.put(record).catch(() => {});
				} catch (error) {
					// A request that throws synchronously leaves the transaction open; abort it so
					// the records queued before it are not committed.
					transaction.done.catch(() => {});
					transaction.abort();
					throw error;
				}
				await transaction.done;
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		}
	};
}

function classify(error: unknown): StorageErrorCode {
	if (!(error instanceof DOMException)) return 'failed';
	if (error.name === 'QuotaExceededError') return 'quota';
	// The connection was closed (for an upgrade elsewhere) before this call.
	if (error.name === 'InvalidStateError') return 'closed';
	return 'failed';
}
