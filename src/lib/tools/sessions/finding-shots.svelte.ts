import { SvelteMap } from 'svelte/reactivity';
import {
	checkCount,
	findingAttachmentName,
	type ScreenshotType
} from '#lib/core/qa/screenshots.ts';
import { findingTime } from '#lib/core/qa/session.ts';
import type { Finding, NewScreenshot } from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import { notify } from '#lib/state/notify.svelte.ts';
import type { ScreenshotSaveError } from '#lib/state/runs.svelte.ts';
import { sessions } from '#lib/state/sessions.svelte.ts';
import { createImageJobs, type ImageJobs } from '#lib/workers/image-jobs.ts';
import { addedText, firstFrameText } from '#lib/tools/runs/screenshots.ts';
import type { AddOutcome, ShotItem } from '#lib/tools/runs/shots.svelte.ts';

// The screenshots of a session's findings on the session page (FR-131 AC-1 with the FR-112
// rules). The composer's screenshots wait here until Add finding saves them with the finding;
// a saved finding's are written at once. Every image of the session is read when the page
// opens, as each finding shows its thumbnails, and shown through object URLs that are revoked
// on removal and when the page goes away (`dispose`).

/** Where a screenshot goes: a saved finding, or the finding being written in the composer. */
export type ShotTarget = Pick<Finding, 'id' | 'sessionId' | 'at'> & { saved: boolean };

interface Shown {
	src: string;
	blob: Blob;
}

export class FindingShots {
	#jobs: ImageJobs;
	#shown = new SvelteMap<string, Shown>();
	/** The composer's screenshots, written with its finding. */
	pending: readonly NewScreenshot[] = $state.raw([]);
	#compressing = new SvelteMap<string, number>();
	loaded = $state(false);
	#loading = 0;

	constructor(jobs: ImageJobs = createImageJobs()) {
		this.#jobs = jobs;
	}

	compressingOf(target: ShotTarget): number {
		return this.#compressing.get(target.id) ?? 0;
	}

	/** Reads the images of every finding of the session. */
	async load(findings: readonly Finding[]): Promise<Result<void, StorageErrorCode>> {
		const loading = ++this.#loading;
		for (const finding of findings) {
			const read = await sessions.images(finding);
			if (loading !== this.#loading) return ok(undefined);
			if (!read.ok) return read;
			for (const image of read.value) this.#show(image.id, image.bytes, image.mediaType);
		}
		this.loaded = true;
		return ok(undefined);
	}

	/** A target's screenshots, stored ones first, then the composer's, in the order added. */
	itemsOf(target: ShotTarget): ShotItem[] {
		const stored = target.saved
			? sessions
					.screenshotsOf(target)
					.map((meta) => ({ id: meta.id, n: meta.n, type: meta.mediaType }))
			: [];
		const waiting = target.saved
			? []
			: this.pending.map((shot, i) => ({ id: shot.id, n: i + 1, type: shot.mediaType }));
		return [...stored, ...waiting].flatMap(({ id, n, type }) => {
			const shown = this.#shown.get(id);
			if (!shown) return [];
			return [
				{
					id,
					...shown,
					name: shotName(target, n),
					fileName: findingAttachmentName(target.id, n, type as ScreenshotType)
				}
			];
		});
	}

	/**
	 * Compresses each file in the worker and adds it, up to the limit (FR-112 AC-1, AC-6,
	 * EC-029), as `RunShots.add` does: a refused file does not stop the ones after it.
	 */
	async add(target: ShotTarget, files: readonly File[]): Promise<AddOutcome> {
		const outcome: AddOutcome = { error: null, note: null };
		for (const file of files) {
			const full = checkCount(this.#count(target) + this.compressingOf(target));
			if (full) return { ...outcome, error: full };
			this.#compressing.set(target.id, this.compressingOf(target) + 1);
			try {
				const compressed = await this.#jobs.compress(file, file.name);
				if (!compressed.ok) {
					outcome.error = compressed.error;
					continue;
				}
				const { bytes, type, width, height, firstFrameOnly } = compressed.value;
				const shot: NewScreenshot = {
					id: crypto.randomUUID(),
					mediaType: type,
					width,
					height,
					bytes
				};
				const added = await this.#keep(target, shot);
				if (!added.ok) return { ...outcome, error: added.error };
				if (firstFrameOnly) outcome.note = firstFrameText(file.name);
				notify.announce(addedText(this.#count(target)));
			} catch {
				// The worker failed (out of memory, no canvas): nothing was added.
				outcome.error = 'failed';
			} finally {
				this.#compressing.set(target.id, this.compressingOf(target) - 1);
			}
		}
		return outcome;
	}

	/** After Add finding saved `written` with the finding, they are no longer waiting. */
	saved(written: readonly NewScreenshot[]): void {
		const ids = written.map((shot) => shot.id);
		this.pending = this.pending.filter((shot) => !ids.includes(shot.id));
	}

	/** Removes a screenshot: a waiting one from memory, a stored one with its image (FR-112 AC-4). */
	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		if (this.pending.some((shot) => shot.id === id)) {
			this.pending = this.pending.filter((shot) => shot.id !== id);
			this.#forget(id);
			return ok(undefined);
		}
		const removed = await sessions.removeScreenshot(id);
		if (!removed.ok) return removed;
		this.#forget(id);
		return ok(undefined);
	}

	/** Frees the images of a deleted finding. */
	forget(ids: readonly string[]): void {
		ids.forEach((id) => this.#forget(id));
	}

	dispose(): void {
		for (const id of [...this.#shown.keys()]) this.#forget(id);
		this.pending = [];
		this.#loading++;
		this.#jobs.dispose();
	}

	#count(target: ShotTarget): number {
		return target.saved ? sessions.screenshotsOf(target).length : this.pending.length;
	}

	async #keep(target: ShotTarget, shot: NewScreenshot): Promise<Result<void, ScreenshotSaveError>> {
		if (!target.saved) {
			this.pending = [...this.pending, shot];
			this.#show(shot.id, shot.bytes, shot.mediaType);
			return ok(undefined);
		}
		const finding = sessions.findings.find((f) => f.id === target.id);
		if (!finding) return err('failed');
		const added = await sessions.addScreenshot(finding, shot);
		if (!added.ok) return err(added.error);
		this.#show(shot.id, shot.bytes, shot.mediaType);
		return ok(undefined);
	}

	#show(id: string, bytes: ArrayBuffer, type: string): void {
		if (this.#shown.has(id)) return;
		const blob = new Blob([bytes], { type });
		this.#shown.set(id, { src: URL.createObjectURL(blob), blob });
	}

	#forget(id: string): void {
		const shown = this.#shown.get(id);
		if (!shown) return;
		URL.revokeObjectURL(shown.src);
		this.#shown.delete(id);
	}
}

/** Alt text and buttons' names (design 13.8): "Screenshot 2 of the finding at 12 min". */
export function shotName(target: ShotTarget, n: number): string {
	return target.saved
		? `Screenshot ${n} of the finding ${findingTime(target)}`
		: `Screenshot ${n} of the new finding`;
}
