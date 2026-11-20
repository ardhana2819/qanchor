import { distinctReleases, snapshotsForRun } from '#lib/core/qa/run.ts';
import type { CaseSnapshot, Run, RunStatus, TestCase, TestResult } from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import { storage } from './storage.svelte.ts';

export type RunInput = Pick<Run, 'name' | 'release' | 'environment'>;
export type ResultInput = Omit<TestResult, 'updatedAt'>;

/**
 * The test runs and their results (FR-110, FR-111, FR-113), read from IndexedDB once per visit
 * and kept in step with every write. Status values as in `wallets.svelte.ts`. The caller
 * validates with `runErrors` and `resultErrors` before saving.
 */
class Runs {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	/** Newest first (FR-113 AC-1). */
	list: readonly Run[] = $state.raw([]);
	/** Every result of every run; an untested case has none. */
	results: readonly TestResult[] = $state.raw([]);

	/** Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const [runs, results] = db
			? await Promise.all([db.readAll('runs'), db.readAll('results')])
			: [null, null];
		if (!runs?.ok || !results?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = newestFirst(runs.value);
		this.results = results.value;
		this.status = 'ready';
	}

	/** Releases used so far, each once in its first spelling, for suggestions (FR-110 AC-4). */
	get releases(): string[] {
		return distinctReleases(this.list.toReversed().map((run) => run.release));
	}

	/** Runs that hold a snapshot of the case, for its delete confirmation (FR-102 AC-2). */
	runsWith(caseId: string): Run[] {
		return this.list.filter((run) => run.cases.some((c) => c.id === caseId));
	}

	/** Creates an in-progress run with a snapshot of each case, in key order (FR-110). */
	async create(
		input: RunInput,
		cases: readonly (TestCase | CaseSnapshot)[]
	): Promise<Result<Run, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const now = Date.now();
		const run: Run = {
			...input,
			id: crypto.randomUUID(),
			status: 'in-progress',
			cases: snapshotsForRun(cases),
			createdAt: now,
			updatedAt: now,
			completedAt: null
		};
		const written = await db.putAll('runs', [run]);
		if (!written.ok) return written;
		this.list = newestFirst([...this.list, run]);
		return ok(run);
	}

	/** Completes or reopens a run (FR-113 AC-2, AC-3). */
	async setStatus(id: string, status: RunStatus): Promise<Result<Run, StorageErrorCode>> {
		const existing = this.list.find((run) => run.id === id);
		if (!existing) return err('failed');
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const now = Date.now();
		const run: Run = {
			...existing,
			status,
			updatedAt: now,
			completedAt: status === 'completed' ? now : null
		};
		const written = await db.putAll('runs', [run]);
		if (!written.ok) return written;
		this.list = this.list.map((r) => (r.id === id ? run : r));
		return ok(run);
	}

	/**
	 * Saves the latest result of a case, replacing any earlier one (FR-111 AC-2, AC-6). Two tabs
	 * saving the same case: the last write wins (FR-111 AC-8).
	 */
	async saveResult(input: ResultInput): Promise<Result<TestResult, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const result: TestResult = { ...input, updatedAt: Date.now() };
		const written = await db.putAll('results', [result]);
		if (!written.ok) return written;
		const same = (r: TestResult) => r.runId === result.runId && r.caseNumber === result.caseNumber;
		this.results = [...this.results.filter((r) => !same(r)), result];
		return ok(result);
	}

	/** Deletes a run with its results (FR-113 AC-4, NFR-024). */
	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteRun(id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((run) => run.id !== id);
		this.results = this.results.filter((r) => r.runId !== id);
		return ok(undefined);
	}
}

function newestFirst(runs: readonly Run[]): Run[] {
	return [...runs].sort((a, b) => b.createdAt - a.createdAt);
}

export const runs = new Runs();
