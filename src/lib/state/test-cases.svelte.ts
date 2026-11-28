import type { TestCase } from '#lib/core/qa/types.ts';
import { CASES_MAX } from '#lib/core/qa/validation.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { NewCase, StorageErrorCode } from '#lib/storage/db.ts';
import { storage } from './storage.svelte.ts';

/** `limit`: the database already holds the most test cases allowed (PRD 10.5). */
export type CaseSaveError = StorageErrorCode | 'limit';

/**
 * The test cases (FR-100 to FR-102), read from IndexedDB once per visit and kept in step with
 * every write. Status values as in `wallets.svelte.ts`. The caller validates a case with
 * `caseErrors` before saving it.
 */
class TestCases {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	/** Sorted by key (FR-101 AC-1). */
	list: readonly TestCase[] = $state.raw([]);

	/** Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const read = db ? await db.readAll('testCases') : null;
		if (!read?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = byKey(read.value);
		this.status = 'ready';
	}

	/** Saves a new case with the next key (FR-100 AC-2). */
	async create(fields: NewCase): Promise<Result<TestCase, CaseSaveError>> {
		if (this.list.length >= CASES_MAX) return err('limit');
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const created = await db.createCase(fields, Date.now());
		if (!created.ok) return created;
		this.list = byKey([...this.list, created.value]);
		return created;
	}

	/**
	 * Saves new cases with consecutive keys in one transaction (FR-150, NFR-026). Refused as a
	 * whole when they would take the database past the most cases allowed.
	 */
	async createMany(fields: readonly NewCase[]): Promise<Result<TestCase[], CaseSaveError>> {
		if (this.list.length + fields.length > CASES_MAX) return err('limit');
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const created = await db.createCases(fields, Date.now());
		if (!created.ok) return created;
		this.list = byKey([...this.list, ...created.value]);
		return created;
	}

	/** Replaces the fields of a stored case; its key and creation time never change. */
	async update(id: string, fields: NewCase): Promise<Result<TestCase, CaseSaveError>> {
		const existing = this.list.find((c) => c.id === id);
		if (!existing) return err('failed');
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const record: TestCase = {
			...fields,
			id,
			number: existing.number,
			createdAt: existing.createdAt,
			updatedAt: Date.now()
		};
		const written = await db.putAll('testCases', [record]);
		if (!written.ok) return written;
		this.list = this.list.map((c) => (c.id === id ? record : c));
		return ok(record);
	}

	/** Deletes a case; runs keep their snapshot of it (FR-102 AC-2, FR-110 AC-3). */
	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('testCases', id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((c) => c.id !== id);
		return ok(undefined);
	}
}

function byKey(cases: readonly TestCase[]): TestCase[] {
	return [...cases].sort((a, b) => a.number - b.number);
}

export const testCases = new TestCases();
