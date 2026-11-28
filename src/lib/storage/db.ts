import {
	openDB,
	type IDBPDatabase,
	type IDBPTransaction,
	type StoreKey,
	type StoreValue
} from 'idb';
import { checkCount, screenshotMeta, SCREENSHOTS_MAX } from '#lib/core/qa/screenshots.ts';
import type {
	Finding,
	NewScreenshot,
	Screenshot,
	ScreenshotMeta,
	ScreenshotOwner,
	TestCase,
	TestResult
} from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import { runMigrations } from './migrations.ts';
import {
	BACKUP_STORE_NAMES,
	DB_NAME,
	DB_VERSION,
	type BackupStoreName,
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

/**
 * Why a screenshot was not written, besides a storage error:
 * - limit: the result would have more than SCREENSHOTS_MAX (FR-112 AC-6).
 * - missing: the owner is gone (its run or session was deleted in another tab), so the record
 *   would have no owner (FR-091 AC-5, NFR-024).
 */
export type ScreenshotWriteError = StorageErrorCode | 'limit' | 'missing';

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
	/**
	 * Saves new test cases with consecutive keys in one transaction, as createCase does for one
	 * (FR-150, NFR-026): either every case is saved or none is.
	 */
	createCases(
		fields: readonly NewCase[],
		now: number
	): Promise<Result<TestCase[], StorageErrorCode>>;
	/**
	 * Saves a result with the screenshots added before it was first saved (plan finding F-7), in
	 * one transaction: the result's screenshot count, the limit check, and the writes happen
	 * together, so a second tab cannot take the last place in between. Stored screenshots stay
	 * when the result changes (F-11). Resolves with the new screenshots.
	 */
	saveResult(
		result: TestResult,
		pending: readonly NewScreenshot[],
		now: number
	): Promise<Result<Screenshot[], Exclude<ScreenshotWriteError, 'missing'>>>;
	/**
	 * Saves a finding with the screenshots added before it was first saved, as saveResult does for a
	 * result (FR-131 AC-1, plan finding F-14). Refused with 'missing' when the session is gone.
	 */
	saveFinding(
		finding: Finding,
		pending: readonly NewScreenshot[],
		now: number
	): Promise<Result<Screenshot[], ScreenshotWriteError>>;
	/** Deletes a finding with its screenshots in one transaction (EC-034, NFR-024). */
	deleteFinding(
		finding: Pick<Finding, 'id' | 'sessionId'>
	): Promise<Result<void, StorageErrorCode>>;
	/**
	 * Deletes a session with every finding and screenshot it owns in one transaction (NFR-024,
	 * NFR-026).
	 */
	deleteSession(id: string): Promise<Result<void, StorageErrorCode>>;
	/** Adds a screenshot to a stored result or finding, the limit checked in the same transaction. */
	addScreenshot(
		owner: ScreenshotOwner,
		image: NewScreenshot,
		now: number
	): Promise<Result<Screenshot, ScreenshotWriteError>>;
	/** One owner's screenshots with their images, in the order added. */
	screenshotsOf(owner: ScreenshotOwner): Promise<Result<Screenshot[], StorageErrorCode>>;
	/** Every screenshot without its image, read one record at a time (NFR-004). */
	readScreenshotMeta(): Promise<Result<ScreenshotMeta[], StorageErrorCode>>;
	/**
	 * Deletes a run with every result and screenshot it owns in one transaction (FR-113 AC-4,
	 * NFR-024, NFR-026).
	 */
	deleteRun(id: string): Promise<Result<void, StorageErrorCode>>;
	/** Every backed-up store, read in one transaction so the counts are consistent. */
	readRecords(): Promise<Result<StoredRecords, StorageErrorCode>>;
	/** How many records each backed-up store holds, without reading them (import dialog). */
	countRecords(): Promise<Result<Record<BackupStoreName, number>, StorageErrorCode>>;
	/**
	 * Clears every store and writes the given records in one transaction (import, ADR-014), with
	 * the key counter rebuilt from the records: on any error nothing changes (FR-003 AC-3, EC-002,
	 * EC-032).
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
	const createCases: Storage['createCases'] = async (fields, now) => {
		if (fields.length === 0) return ok([]);
		try {
			const transaction = db.transaction(['testCases', 'meta'], 'readwrite');
			// If the read below fails, commit() never awaits done; its rejection is the same error.
			transaction.done.catch(() => {});
			const meta = transaction.objectStore('meta');
			const counter = (await meta.get('caseCounter'))?.value ?? 0;
			const records: TestCase[] = fields.map((item, i) => ({
				...item,
				id: crypto.randomUUID(),
				number: counter + i + 1,
				createdAt: now,
				updatedAt: now
			}));
			await commit(transaction, () => {
				void track(meta.put({ key: 'caseCounter', value: counter + records.length }));
				// add, not put: a key already taken fails the unique index and rolls back the counter.
				for (const record of records) void track(transaction.objectStore('testCases').add(record));
			});
			return ok(records);
		} catch (error) {
			return err(classify(error));
		}
	};

	return {
		createCases,
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
			const created = await createCases([fields], now);
			return created.ok ? ok(created.value[0]) : created;
		},

		async saveResult(result, pending, now) {
			try {
				const transaction = db.transaction(['results', 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const screenshots = transaction.objectStore('screenshots');
				const owner: ScreenshotOwner = ['result', result.runId, result.caseNumber];
				const existing = pending.length
					? await screenshots.index('byOwner').getAll(IDBKeyRange.only(owner))
					: [];
				if (existing.length + pending.length > SCREENSHOTS_MAX) {
					transaction.abort();
					return err('limit');
				}
				const first = nextNumber(existing);
				const records = pending.map((image, i) => screenshot(owner, image, first + i, now));
				await commit(transaction, () => {
					void track(transaction.objectStore('results').put(result));
					for (const record of records) void track(screenshots.add(record));
				});
				return ok(records);
			} catch (error) {
				return err(classify(error));
			}
		},

		async addScreenshot(owner, image, now) {
			try {
				const ownerStore = owner[0] === 'result' ? 'results' : 'findings';
				const transaction = db.transaction([ownerStore, 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const screenshots = transaction.objectStore('screenshots');
				const [found, existing] = await Promise.all([
					ownerExists(transaction, owner),
					screenshots.index('byOwner').getAll(IDBKeyRange.only(owner))
				]);
				if (!found || checkCount(existing.length)) {
					transaction.abort();
					return err(found ? 'limit' : 'missing');
				}
				const record = screenshot(owner, image, nextNumber(existing), now);
				await commit(transaction, () => void track(screenshots.add(record)));
				return ok(record);
			} catch (error) {
				return err(classify(error));
			}
		},

		async saveFinding(finding, pending, now) {
			try {
				const transaction = db.transaction(['sessions', 'findings', 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const screenshots = transaction.objectStore('screenshots');
				const owner: ScreenshotOwner = ['finding', finding.sessionId, finding.id];
				const [session, existing] = await Promise.all([
					transaction.objectStore('sessions').getKey(finding.sessionId),
					pending.length ? screenshots.index('byOwner').getAll(IDBKeyRange.only(owner)) : []
				]);
				if (session === undefined || existing.length + pending.length > SCREENSHOTS_MAX) {
					transaction.abort();
					return err(session === undefined ? 'missing' : 'limit');
				}
				const first = nextNumber(existing);
				const records = pending.map((image, i) => screenshot(owner, image, first + i, now));
				await commit(transaction, () => {
					void track(transaction.objectStore('findings').put(finding));
					for (const record of records) void track(screenshots.add(record));
				});
				return ok(records);
			} catch (error) {
				return err(classify(error));
			}
		},

		async deleteFinding({ id, sessionId }) {
			try {
				const transaction = db.transaction(['findings', 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const screenshots = transaction.objectStore('screenshots');
				const ids = await screenshots
					.index('byOwner')
					.getAllKeys(IDBKeyRange.only(['finding', sessionId, id]));
				await commit(transaction, () => {
					void track(transaction.objectStore('findings').delete(id));
					for (const key of ids) void track(screenshots.delete(key));
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async deleteSession(id) {
			try {
				const transaction = db.transaction(['sessions', 'findings', 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const findings = transaction.objectStore('findings');
				const screenshots = transaction.objectStore('screenshots');
				const [findingIds, screenshotIds] = await Promise.all([
					findings.index('bySession').getAllKeys(IDBKeyRange.only(id)),
					screenshots.index('byOwner').getAllKeys(screenshotsOfSession(id))
				]);
				await commit(transaction, () => {
					void track(transaction.objectStore('sessions').delete(id));
					for (const key of findingIds) void track(findings.delete(key));
					for (const key of screenshotIds) void track(screenshots.delete(key));
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async screenshotsOf(owner) {
			try {
				const records = await db.getAllFromIndex('screenshots', 'byOwner', IDBKeyRange.only(owner));
				return ok(records.sort((a, b) => a.n - b.n));
			} catch (error) {
				return err(classify(error));
			}
		},

		async readScreenshotMeta() {
			try {
				const meta: ScreenshotMeta[] = [];
				let cursor = await db.transaction('screenshots').store.openCursor();
				while (cursor) {
					meta.push(screenshotMeta(cursor.value));
					cursor = await cursor.continue();
				}
				return ok(meta);
			} catch (error) {
				return err(classify(error));
			}
		},

		async deleteRun(id) {
			try {
				const transaction = db.transaction(['runs', 'results', 'screenshots'], 'readwrite');
				transaction.done.catch(() => {});
				const screenshots = transaction.objectStore('screenshots');
				const ids = await screenshots.index('byOwner').getAllKeys(screenshotsOfRun(id));
				await commit(transaction, () => {
					void track(transaction.objectStore('runs').delete(id));
					void track(transaction.objectStore('results').delete(resultsOf(id)));
					for (const key of ids) void track(screenshots.delete(key));
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(error));
			}
		},

		async readRecords() {
			try {
				const transaction = db.transaction([...BACKUP_STORE_NAMES], 'readonly');
				const [
					endpoints,
					wallets,
					faucets,
					testCases,
					runs,
					results,
					sessions,
					findings,
					screenshots
				] = await Promise.all([
					transaction.objectStore('endpoints').getAll(),
					transaction.objectStore('wallets').getAll(),
					transaction.objectStore('faucets').getAll(),
					transaction.objectStore('testCases').getAll(),
					transaction.objectStore('runs').getAll(),
					transaction.objectStore('results').getAll(),
					transaction.objectStore('sessions').getAll(),
					transaction.objectStore('findings').getAll(),
					transaction.objectStore('screenshots').getAll(),
					transaction.done
				]);
				return ok({
					endpoints,
					wallets,
					faucets,
					testCases,
					runs,
					results,
					sessions,
					findings,
					screenshots
				});
			} catch (error) {
				return err(classify(error));
			}
		},

		async countRecords() {
			try {
				const transaction = db.transaction([...BACKUP_STORE_NAMES], 'readonly');
				const counts = await Promise.all(
					BACKUP_STORE_NAMES.map((name) => transaction.objectStore(name).count())
				);
				return ok(
					Object.fromEntries(BACKUP_STORE_NAMES.map((name, i) => [name, counts[i]])) as Record<
						BackupStoreName,
						number
					>
				);
			} catch (error) {
				return err(classify(error));
			}
		},

		async replaceRecords(records) {
			let imageError: unknown;
			try {
				const transaction = db.transaction([...BACKUP_STORE_NAMES, 'meta'], 'readwrite');
				await commit(transaction, () => {
					for (const name of BACKUP_STORE_NAMES) {
						const store = transaction.objectStore(name);
						void track(store.clear());
						if (name === 'screenshots') continue;
						for (const record of records[name]) void track(store.put(record));
					}
					// The counter is not in the file: the next case continues after the highest key in
					// it, including keys that only survive in a run (FR-100 AC-2, EC-039).
					const meta = transaction.objectStore('meta');
					void track(meta.clear());
					void track(meta.put({ key: 'caseCounter', value: highestCaseNumber(records) }));
					// Each image is written once the one before it is: queued at once, copying 200
					// images into the requests would be one long task (FR-091 AC-6). The open requests
					// keep the transaction alive, so the import stays all or nothing.
					putInTurn(transaction.objectStore('screenshots'), records.screenshots).catch((error) => {
						imageError = error;
						abortUnlessDone(transaction);
					});
				});
				return ok(undefined);
			} catch (error) {
				return err(classify(imageError ?? error));
			}
		}
	};
}

function highestCaseNumber({ testCases, runs }: Pick<StoredRecords, 'testCases' | 'runs'>): number {
	let highest = 0;
	for (const item of testCases) highest = Math.max(highest, item.number);
	for (const run of runs) for (const item of run.cases) highest = Math.max(highest, item.number);
	return highest;
}

/** Every result key of one run: results are keyed [runId, caseNumber]. */
function resultsOf(runId: string): IDBKeyRange {
	return IDBKeyRange.bound([runId, -Infinity], [runId, Infinity]);
}

/** Every screenshot key of one run's results: owners are ['result', runId, caseNumber]. */
function screenshotsOfRun(runId: string): IDBKeyRange {
	return IDBKeyRange.bound(['result', runId, -Infinity], ['result', runId, Infinity]);
}

/** Every screenshot key of one session's findings: owners are ['finding', sessionId, findingId]. */
function screenshotsOfSession(sessionId: string): IDBKeyRange {
	// A shorter array sorts before a longer one with the same start, and any array after a string.
	return IDBKeyRange.bound(['finding', sessionId], ['finding', sessionId, []]);
}

/** Whether a screenshot's owner is stored: the result, or the finding of that session. */
async function ownerExists(
	transaction: IDBPTransaction<QAnchorDB, ('results' | 'findings' | 'screenshots')[], 'readwrite'>,
	owner: ScreenshotOwner
): Promise<boolean> {
	if (owner[0] === 'result') {
		const [, runId, caseNumber] = owner;
		return (await transaction.objectStore('results').getKey([runId, caseNumber])) !== undefined;
	}
	const [, sessionId, findingId] = owner;
	const finding = await transaction.objectStore('findings').get(findingId);
	return finding?.sessionId === sessionId;
}

/** One more than the owner's highest number, so the others keep their file names (FR-122). */
function nextNumber(existing: readonly Pick<Screenshot, 'n'>[]): number {
	return existing.reduce((highest, item) => Math.max(highest, item.n), 0) + 1;
}

function screenshot(
	owner: ScreenshotOwner,
	image: NewScreenshot,
	n: number,
	now: number
): Screenshot {
	return {
		id: image.id,
		owner,
		n,
		mediaType: image.mediaType,
		width: image.width,
		height: image.height,
		size: image.bytes.byteLength,
		createdAt: now,
		bytes: image.bytes
	};
}

async function putInTurn(
	store: { put(value: Screenshot): Promise<unknown> },
	records: readonly Screenshot[]
): Promise<void> {
	for (const record of records) await store.put(record);
}

/**
 * Aborts after a write that failed before it became a request (a synchronous throw, which leaves
 * the transaction open). A request that failed has already aborted it, and aborting twice throws.
 */
function abortUnlessDone(transaction: Pick<IDBPTransaction, 'abort'>): void {
	try {
		transaction.abort();
	} catch (error) {
		if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error;
	}
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
