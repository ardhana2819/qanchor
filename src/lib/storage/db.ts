import {
	openDB,
	type IDBPDatabase,
	type IDBPTransaction,
	type StoreKey,
	type StoreValue
} from 'idb';
import type { TestCase } from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import { runMigrations } from './migrations.ts';
import {
	BACKUP_STORE_NAMES,
	DB_NAME,
	DB_VERSION,
	type QAnchorDB,
	type StoreName,
	type StoredRecords
} from './schema.ts';

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
	/** Removes one record by key; a key that is not stored is not an error. */
	deleteOne<S extends StoreName>(
		store: S,
		key: StoreKey<QAnchorDB, S>
	): Promise<Result<void, StorageErrorCode>>;
	/**
	 * Saves a new test case with the next key (FR-100 AC-2): the counter is read, raised, and
	 * written with the case in one transaction, so two tabs never assign the same key, and a
	 * deleted case's key is never given out again.
	 */
	createCase(fields: NewCase, now: number): Promise<Result<TestCase, StorageErrorCode>>;
	/** Deletes a run and every result it owns in one transaction (FR-113 AC-4, NFR-024, NFR-026). */
	deleteRun(id: string): Promise<Result<void, StorageErrorCode>>;
	/** Every backed-up store, read in one transaction so the counts are consistent. */
	readRecords(): Promise<Result<StoredRecords, StorageErrorCode>>;
	/**
	 * Clears every backed-up store and writes the given records in one transaction (import,
	 * ADR-014): on any error nothing changes (FR-003 AC-3, EC-002).
	 */
	replaceRecords(records: StoredRecords): Promise<Result<void, StorageErrorCode>>;
}

/** What a new case supplies; the key, id, and timestamps are assigned on save. */
export type NewCase = Omit<TestCase, 'id' | 'number' | 'createdAt' | 'updatedAt'>;

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
				await commit(transaction, () => {
					for (const record of records) void track(transaction.store.put(record));
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async deleteOne(store, key) {
			try {
				await db.delete(store, key);
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async createCase(fields, now) {
			try {
				const transaction = db.transaction(['testCases', 'meta'], 'readwrite');
				// If the read below fails, commit() never awaits done; its rejection is the same error.
				transaction.done.catch(() => {});
				const meta = transaction.objectStore('meta');
				const counter = await meta.get('caseCounter');
				const record: TestCase = {
					...fields,
					id: crypto.randomUUID(),
					number: (counter?.value ?? 0) + 1,
					createdAt: now,
					updatedAt: now
				};
				await commit(transaction, () => {
					void track(meta.put({ key: 'caseCounter', value: record.number }));
					// add, not put: a key already taken fails the unique index and rolls back the counter.
					void track(transaction.objectStore('testCases').add(record));
				});
				return ok(record);
			} catch (error) {
				return err(classify(error));
			}
		},

		async deleteRun(id) {
			try {
				const transaction = db.transaction(['runs', 'results'], 'readwrite');
				await commit(transaction, () => {
					void track(transaction.objectStore('runs').delete(id));
					void track(transaction.objectStore('results').delete(resultsOf(id)));
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async readRecords() {
			try {
				const transaction = db.transaction([...BACKUP_STORE_NAMES], 'readonly');
				const [endpoints, wallets, faucets] = await Promise.all([
					transaction.objectStore('endpoints').getAll(),
					transaction.objectStore('wallets').getAll(),
					transaction.objectStore('faucets').getAll(),
					transaction.done
				]);
				return ok({ endpoints, wallets, faucets });
			} catch (error) {
				return err(classify(error));
			}
		},

		async replaceRecords(records) {
			try {
				const transaction = db.transaction([...BACKUP_STORE_NAMES], 'readwrite');
				await commit(transaction, () => {
					for (const name of BACKUP_STORE_NAMES) {
						const store = transaction.objectStore(name);
						void track(store.clear());
						for (const record of records[name]) void track(store.put(record));
					}
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		}
	};
}

/** Every result key of one run: results are keyed [runId, caseNumber]. */
function resultsOf(runId: string): IDBKeyRange {
	return IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);
}

/** A request's error also rejects transaction.done, which commit() awaits; this avoids an
 * unhandled rejection for the request itself. */
function track(request: Promise<unknown>): Promise<unknown> {
	return request.catch(() => {});
}

/**
 * Queues requests and waits for the transaction. A request that throws synchronously leaves the
 * transaction open, so it is aborted: the requests queued before it are not committed.
 */
async function commit(
	transaction: Pick<IDBPTransaction, 'done' | 'abort'>,
	queue: () => void
): Promise<void> {
	try {
		queue();
	} catch (error) {
		transaction.done.catch(() => {});
		transaction.abort();
		throw error;
	}
	await transaction.done;
}

function classify(error: unknown): StorageErrorCode {
	if (!(error instanceof DOMException)) return 'failed';
	if (error.name === 'QuotaExceededError') return 'quota';
	// The connection was closed (for an upgrade elsewhere) before this call.
	if (error.name === 'InvalidStateError') return 'closed';
	return 'failed';
}
