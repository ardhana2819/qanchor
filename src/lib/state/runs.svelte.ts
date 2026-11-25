import { distinctReleases, snapshotsForRun } from '#lib/core/qa/run.ts';
import { screenshotMeta, type ScreenshotError } from '#lib/core/qa/screenshots.ts';
import type {
	CaseSnapshot,
	NewScreenshot,
	Run,
	RunStatus,
	Screenshot,
	ScreenshotMeta,
	ScreenshotOwner,
	TestCase,
	TestResult
} from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { ScreenshotWriteError, StorageErrorCode } from '#lib/storage/db.ts';
import { storage } from './storage.svelte.ts';

export type RunInput = Pick<Run, 'name' | 'release' | 'environment'>;
export type ResultInput = Omit<TestResult, 'updatedAt'>;

/**
 * A screenshot write that failed: the limit, or a quota error with the storage used (EC-032,
 * FR-092 AC-3), as a ScreenshotError with its own copy; any other failure as a storage error.
 */
export type ScreenshotSaveError = ScreenshotError | StorageErrorCode;

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
	/** Every result's screenshots without their images, which are read when shown (NFR-004). */
	screenshots: readonly ScreenshotMeta[] = $state.raw([]);

	/** Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const [runs, results, screenshots] = db
			? await Promise.all([db.readAll('runs'), db.readAll('results'), db.readScreenshotMeta()])
			: [null, null, null];
		if (!runs?.ok || !results?.ok || !screenshots?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = newestFirst(runs.value);
		this.results = results.value;
		this.screenshots = screenshots.value;
		this.status = 'ready';
	}

	/** A result's screenshots, in the order added. */
	screenshotsOf(runId: string, caseNumber: number): ScreenshotMeta[] {
		return this.screenshots
			.filter((item) => sameOwner(item.owner, owner(runId, caseNumber)))
			.sort((a, b) => a.n - b.n);
	}

	/** How many screenshots a run holds, for its delete confirmation (design 13.7). */
	screenshotCount(runId: string): number {
		return this.screenshots.filter((item) => item.owner[1] === runId).length;
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
	 * Saves the latest result of a case, replacing any earlier one (FR-111 AC-2, AC-6), with the
	 * screenshots added before its first save (plan finding F-7) in the same transaction. Two tabs
	 * saving the same case: the last write wins (FR-111 AC-8).
	 */
	async saveResult(
		input: ResultInput,
		pending: readonly NewScreenshot[] = []
	): Promise<Result<TestResult, ScreenshotSaveError>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const now = Date.now();
		const result: TestResult = { ...input, updatedAt: now };
		const written = await db.saveResult(result, pending, now);
		if (!written.ok) {
			// A quota error on a result alone is not about screenshots, so it keeps the storage copy.
			return err(
				pending.length ? await screenshotError(written.error) : storageError(written.error)
			);
		}
		const same = (r: TestResult) => r.runId === result.runId && r.caseNumber === result.caseNumber;
		this.results = [...this.results.filter((r) => !same(r)), result];
		this.screenshots = [...this.screenshots, ...written.value.map(screenshotMeta)];
		return ok(result);
	}

	/** Adds a screenshot to a saved result (FR-112 AC-1, AC-6). */
	async addScreenshot(
		runId: string,
		caseNumber: number,
		image: NewScreenshot
	): Promise<Result<ScreenshotMeta, ScreenshotSaveError>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const written = await db.addScreenshot(owner(runId, caseNumber), image, Date.now());
		if (!written.ok) return err(await screenshotError(written.error));
		const meta = screenshotMeta(written.value);
		this.screenshots = [...this.screenshots, meta];
		return ok(meta);
	}

	/** Removes one screenshot and its image (FR-112 AC-4, EC-034). */
	async removeScreenshot(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('screenshots', id);
		if (!deleted.ok) return deleted;
		this.screenshots = this.screenshots.filter((item) => item.id !== id);
		return ok(undefined);
	}

	/** A result's screenshots with their images, for thumbnails and the viewer (FR-112 AC-3). */
	async images(runId: string, caseNumber: number): Promise<Result<Screenshot[], StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		return db.screenshotsOf(owner(runId, caseNumber));
	}

	/** Deletes a run with its results and screenshots (FR-113 AC-4, NFR-024). */
	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteRun(id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((run) => run.id !== id);
		this.results = this.results.filter((r) => r.runId !== id);
		this.screenshots = this.screenshots.filter((item) => item.owner[1] !== id);
		return ok(undefined);
	}
}

function owner(runId: string, caseNumber: number): ScreenshotOwner {
	return ['result', runId, caseNumber];
}

function sameOwner(a: ScreenshotOwner, b: ScreenshotOwner): boolean {
	return a.length === b.length && a.every((part, i) => part === b[i]);
}

/**
 * A refusal outside the screenshot copy: the result is gone (its run was deleted in another tab),
 * or the limit on a save without new screenshots, which cannot happen; both read as a failed save.
 */
function storageError(code: ScreenshotWriteError): StorageErrorCode {
	return code === 'limit' || code === 'missing' ? 'failed' : code;
}

async function screenshotError(code: ScreenshotWriteError): Promise<ScreenshotSaveError> {
	if (code === 'limit') return { kind: 'limit' };
	if (code === 'quota') return { kind: 'storage', ...(await storageUse()) };
	return storageError(code);
}

/** Used and available bytes, when the browser says (FR-092 AC-3). */
async function storageUse(): Promise<{ usage?: number; quota?: number }> {
	try {
		const { usage, quota } = (await navigator.storage?.estimate?.()) ?? {};
		return { usage, quota };
	} catch {
		return {};
	}
}

function newestFirst(runs: readonly Run[]): Run[] {
	return [...runs].sort((a, b) => b.createdAt - a.createdAt);
}

export const runs = new Runs();
