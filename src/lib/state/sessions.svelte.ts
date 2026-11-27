import { distinctReleases } from '#lib/core/qa/run.ts';
import { screenshotMeta } from '#lib/core/qa/screenshots.ts';
import { endSession, pauseSession, resumeSession } from '#lib/core/qa/session.ts';
import type {
	Finding,
	FindingOwner,
	NewScreenshot,
	Screenshot,
	ScreenshotMeta,
	Session
} from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import {
	sameOwner,
	screenshotError,
	storageError,
	type ScreenshotSaveError
} from './runs.svelte.ts';
import { storage } from './storage.svelte.ts';

export type SessionInput = Pick<Session, 'charter' | 'release' | 'environment' | 'timeboxMinutes'>;
export type FindingInput = Pick<Finding, 'type' | 'text'>;

/**
 * Exploratory sessions and their findings (FR-130, FR-131), read from IndexedDB once per visit and
 * kept in step with every write, as `runs.svelte.ts` does. The caller validates with
 * `sessionErrors` and `findingErrors` before saving.
 */
class Sessions {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	/** Newest first. */
	list: readonly Session[] = $state.raw([]);
	/** Every finding of every session. */
	findings: readonly Finding[] = $state.raw([]);
	/** Every finding's screenshots without their images, which are read when shown (NFR-004). */
	screenshots: readonly ScreenshotMeta[] = $state.raw([]);

	/** Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const [sessions, findings, screenshots] = db
			? await Promise.all([db.readAll('sessions'), db.readAll('findings'), db.readScreenshotMeta()])
			: [null, null, null];
		if (!sessions?.ok || !findings?.ok || !screenshots?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = newestFirst(sessions.value);
		this.findings = findings.value;
		this.screenshots = screenshots.value.filter((item) => item.owner[0] === 'finding');
		this.status = 'ready';
	}

	/** Releases used by sessions, oldest first, for suggestions with the runs' (FR-130 AC-1). */
	get releases(): string[] {
		return distinctReleases(this.list.toReversed().map((session) => session.release));
	}

	/** A session's findings, in no particular order; `sortFindings` orders them. */
	findingsOf(sessionId: string): Finding[] {
		return this.findings.filter((finding) => finding.sessionId === sessionId);
	}

	/** A finding's screenshots, in the order added. */
	screenshotsOf(finding: Pick<Finding, 'id' | 'sessionId'>): ScreenshotMeta[] {
		return this.screenshots
			.filter((item) => sameOwner(item.owner, owner(finding)))
			.sort((a, b) => a.n - b.n);
	}

	/** Starts a running session now (FR-130 AC-1). */
	async start(input: SessionInput): Promise<Result<Session, StorageErrorCode>> {
		const now = Date.now();
		return this.put({
			...input,
			id: crypto.randomUUID(),
			status: 'running',
			startedAt: now,
			pausedAt: null,
			pausedMs: 0,
			endedAt: null,
			createdAt: now,
			updatedAt: now
		});
	}

	/** Edits charter, release, environment, or timebox; also on an ended session (FR-130 AC-6). */
	edit(id: string, input: SessionInput): Promise<Result<Session, StorageErrorCode>> {
		return this.change(id, (session) => ({ ...session, ...input, updatedAt: Date.now() }));
	}

	pause(id: string): Promise<Result<Session, StorageErrorCode>> {
		return this.change(id, (session) => pauseSession(session, Date.now()));
	}

	resume(id: string): Promise<Result<Session, StorageErrorCode>> {
		return this.change(id, (session) => resumeSession(session, Date.now()));
	}

	/** Ends the session; it cannot run again (FR-130 AC-6). */
	end(id: string): Promise<Result<Session, StorageErrorCode>> {
		return this.change(id, (session) => endSession(session, Date.now()));
	}

	/**
	 * Saves a finding, new or edited, with the screenshots added before its first save in the same
	 * transaction. A new finding gets the session time now (FR-131 AC-1); an edit keeps its time.
	 */
	async saveFinding(
		finding: Finding,
		pending: readonly NewScreenshot[] = []
	): Promise<Result<Finding, ScreenshotSaveError>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const now = Date.now();
		const record: Finding = { ...finding, updatedAt: now };
		const written = await db.saveFinding(record, pending, now);
		if (!written.ok) {
			return err(
				pending.length ? await screenshotError(written.error) : storageError(written.error)
			);
		}
		this.findings = [...this.findings.filter((f) => f.id !== record.id), record];
		this.screenshots = [...this.screenshots, ...written.value.map(screenshotMeta)];
		return ok(record);
	}

	/** Deletes a finding with its screenshots (EC-034). */
	async removeFinding(finding: Finding): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteFinding(finding);
		if (!deleted.ok) return deleted;
		this.findings = this.findings.filter((f) => f.id !== finding.id);
		this.screenshots = this.screenshots.filter((item) => item.owner[2] !== finding.id);
		return ok(undefined);
	}

	/** Adds a screenshot to a saved finding (FR-131 AC-1 with the FR-112 rules). */
	async addScreenshot(
		finding: Finding,
		image: NewScreenshot
	): Promise<Result<ScreenshotMeta, ScreenshotSaveError>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const written = await db.addScreenshot(owner(finding), image, Date.now());
		if (!written.ok) return err(await screenshotError(written.error));
		const meta = screenshotMeta(written.value);
		this.screenshots = [...this.screenshots, meta];
		return ok(meta);
	}

	/** Removes one screenshot and its image (EC-034). */
	async removeScreenshot(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('screenshots', id);
		if (!deleted.ok) return deleted;
		this.screenshots = this.screenshots.filter((item) => item.id !== id);
		return ok(undefined);
	}

	/** A finding's screenshots with their images, for thumbnails, the viewer, and the report. */
	async images(finding: Finding): Promise<Result<Screenshot[], StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		return db.screenshotsOf(owner(finding));
	}

	/** Deletes a session with its findings and screenshots (NFR-024). */
	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteSession(id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((session) => session.id !== id);
		this.findings = this.findings.filter((f) => f.sessionId !== id);
		this.screenshots = this.screenshots.filter((item) => item.owner[1] !== id);
		return ok(undefined);
	}

	private async change(
		id: string,
		update: (session: Session) => Session
	): Promise<Result<Session, StorageErrorCode>> {
		const existing = this.list.find((session) => session.id === id);
		if (!existing) return err('failed');
		const next = update(existing);
		return next === existing ? ok(existing) : this.put(next);
	}

	private async put(session: Session): Promise<Result<Session, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const written = await db.putAll('sessions', [session]);
		if (!written.ok) return written;
		this.list = newestFirst([...this.list.filter((s) => s.id !== session.id), session]);
		return ok(session);
	}
}

function owner(finding: Pick<Finding, 'id' | 'sessionId'>): FindingOwner {
	return ['finding', finding.sessionId, finding.id];
}

function newestFirst(sessions: readonly Session[]): Session[] {
	return [...sessions].sort((a, b) => b.createdAt - a.createdAt);
}

export const sessions = new Sessions();
