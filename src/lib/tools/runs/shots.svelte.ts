import { SvelteMap } from 'svelte/reactivity';
import { attachmentName, checkCount, type ScreenshotType } from '#lib/core/qa/screenshots.ts';
import type { NewScreenshot } from '#lib/core/qa/types.ts';
import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import { notify } from '#lib/state/notify.svelte.ts';
import { runs, type ScreenshotSaveError } from '#lib/state/runs.svelte.ts';
import { createImageJobs, type ImageJobs } from '#lib/workers/image-jobs.ts';
import { addedText, firstFrameText, shotName } from './screenshots.ts';

// The screenshots of a run's results on the run page (FR-112, plan finding F-7). A screenshot
// added before its result is first saved waits here, per case, and is written with the result
// (`pendingOf`, then `saved`); on a stored result it is written at once. Images are shown through
// object URLs: the open case's stored ones, read when it opens and revoked when another opens,
// and every waiting one until it is saved, removed, or the page goes away (`dispose`).

/** One screenshot as the area and the viewer show it. */
export interface ShotItem {
	id: string;
	src: string;
	blob: Blob;
	/** "Screenshot 2 of TC-12". */
	name: string;
	/** The attachment name (FR-122), e.g. `TC-12-1a2b3c4d-2.webp`. */
	fileName: string;
}

/** Why an add stopped: a refusal with its own copy, or a storage error. */
export type AddError = ScreenshotSaveError;

export interface AddOutcome {
	error: AddError | null;
	/** Said when a GIF keeps only its first frame (EC-030). */
	note: string | null;
}

interface Shown {
	src: string;
	blob: Blob;
}

export class RunShots {
	#jobs: ImageJobs;
	/** Every image the page shows, by screenshot id. */
	#shown = new SvelteMap<string, Shown>();
	#pending = new SvelteMap<number, readonly NewScreenshot[]>();
	#compressing = new SvelteMap<number, number>();
	/** The case whose stored images are read, and their ids. */
	#open: { runId: string; caseNumber: number; ids: string[] } | null = $state(null);
	#opening = 0;

	constructor(jobs: ImageJobs = createImageJobs()) {
		this.#jobs = jobs;
	}

	pendingOf(caseNumber: number): readonly NewScreenshot[] {
		return this.#pending.get(caseNumber) ?? [];
	}

	compressingOf(caseNumber: number): number {
		return this.#compressing.get(caseNumber) ?? 0;
	}

	/** Whether the case's stored images are read, so its area shows them all at once. */
	isOpen(runId: string, caseNumber: number): boolean {
		return this.#open?.runId === runId && this.#open.caseNumber === caseNumber;
	}

	/** Reads the case's stored images, and frees those of the case open before. */
	async open(runId: string, caseNumber: number): Promise<Result<void, StorageErrorCode>> {
		if (this.isOpen(runId, caseNumber)) return ok(undefined);
		const opening = ++this.#opening;
		const read = await runs.images(runId, caseNumber);
		if (opening !== this.#opening) return ok(undefined);
		for (const id of this.#open?.ids ?? []) this.#forget(id);
		if (!read.ok) {
			this.#open = null;
			return read;
		}
		for (const image of read.value) this.#show(image.id, image.bytes, image.mediaType);
		this.#open = { runId, caseNumber, ids: read.value.map((image) => image.id) };
		return ok(undefined);
	}

	/** The case's screenshots, stored ones first, in the order added. */
	itemsOf(runId: string, caseNumber: number): ShotItem[] {
		const stored = runs.screenshotsOf(runId, caseNumber);
		// A waiting screenshot gets the number its save will give it (T-060). Right after the
		// save, until `saved` runs, it is both stored and waiting; it is listed once.
		const after = Math.max(0, ...stored.map((meta) => meta.n));
		const waiting = this.pendingOf(caseNumber).filter(
			(shot) => !stored.some((meta) => meta.id === shot.id)
		);
		const all = [
			...stored.map((meta) => ({ id: meta.id, n: meta.n, type: meta.mediaType })),
			...waiting.map((shot, i) => ({
				id: shot.id,
				n: after + i + 1,
				type: shot.mediaType
			}))
		];
		return all.flatMap(({ id, n, type }) => {
			const shown = this.#shown.get(id);
			if (!shown) return [];
			return [
				{
					id,
					...shown,
					name: shotName(caseNumber, n),
					fileName: attachmentName(caseNumber, runId, n, type as ScreenshotType)
				}
			];
		});
	}

	/**
	 * Compresses each file in the worker and adds it, up to the limit (FR-112 AC-1, AC-6,
	 * EC-029). Stops at the first refusal of the limit or of storage; a refused file does not
	 * stop the ones after it, and the last refusal is reported.
	 */
	async add(runId: string, caseNumber: number, files: readonly File[]): Promise<AddOutcome> {
		const outcome: AddOutcome = { error: null, note: null };
		for (const file of files) {
			const count =
				runs.screenshotsOf(runId, caseNumber).length +
				this.pendingOf(caseNumber).length +
				this.compressingOf(caseNumber);
			const full = checkCount(count);
			if (full) return { ...outcome, error: full };
			this.#compressing.set(caseNumber, this.compressingOf(caseNumber) + 1);
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
				const added = await this.#keep(runId, caseNumber, shot);
				if (!added.ok) return { ...outcome, error: added.error };
				if (firstFrameOnly) outcome.note = firstFrameText(file.name);
				const total =
					runs.screenshotsOf(runId, caseNumber).length + this.pendingOf(caseNumber).length;
				notify.announce(addedText(total));
			} catch {
				// The worker failed (out of memory, no canvas): nothing was added.
				outcome.error = 'failed';
			} finally {
				this.#compressing.set(caseNumber, this.compressingOf(caseNumber) - 1);
			}
		}
		return outcome;
	}

	/**
	 * After the result was saved with `written` (the waiting screenshots passed to the save),
	 * they are stored. Any added while the save ran are written now.
	 */
	async saved(
		runId: string,
		caseNumber: number,
		written: readonly NewScreenshot[]
	): Promise<AddError | null> {
		const ids = written.map((shot) => shot.id);
		const left = this.pendingOf(caseNumber).filter((shot) => !ids.includes(shot.id));
		this.#pending.delete(caseNumber);
		if (!this.#adopt(runId, caseNumber, ids)) ids.forEach((id) => this.#forget(id));
		for (const shot of left) {
			const added = await this.#keep(runId, caseNumber, shot);
			if (!added.ok) {
				this.#forget(shot.id);
				return added.error;
			}
		}
		return null;
	}

	/** Removes a screenshot: a waiting one from memory, a stored one with its image (FR-112 AC-4). */
	async remove(caseNumber: number, id: string): Promise<Result<void, StorageErrorCode>> {
		const pending = this.pendingOf(caseNumber);
		if (pending.some((shot) => shot.id === id)) {
			this.#setPending(
				caseNumber,
				pending.filter((shot) => shot.id !== id)
			);
			this.#forget(id);
			return ok(undefined);
		}
		const removed = await runs.removeScreenshot(id);
		if (!removed.ok) return removed;
		this.#forget(id);
		return ok(undefined);
	}

	dispose(): void {
		for (const id of [...this.#shown.keys()]) this.#forget(id);
		this.#pending.clear();
		this.#open = null;
		this.#opening++;
		this.#jobs.dispose();
	}

	/** Stores the screenshot on a saved result, or keeps it waiting for the first save (F-7). */
	async #keep(
		runId: string,
		caseNumber: number,
		shot: NewScreenshot
	): Promise<Result<void, AddError>> {
		const stored = runs.results.some((r) => r.runId === runId && r.caseNumber === caseNumber);
		if (!stored) {
			this.#setPending(caseNumber, [...this.pendingOf(caseNumber), shot]);
			this.#show(shot.id, shot.bytes, shot.mediaType);
			return ok(undefined);
		}
		const added = await runs.addScreenshot(runId, caseNumber, shot);
		if (!added.ok) return err(added.error);
		// Another case's image is read when that case opens.
		if (this.#adopt(runId, caseNumber, [shot.id])) this.#show(shot.id, shot.bytes, shot.mediaType);
		return ok(undefined);
	}

	/**
	 * Counts stored images as the open case's, so opening another case frees them; false when
	 * the case is not open, as its images are read when it opens.
	 */
	#adopt(runId: string, caseNumber: number, ids: readonly string[]): boolean {
		if (!this.#open || !this.isOpen(runId, caseNumber)) return false;
		this.#open = { ...this.#open, ids: [...this.#open.ids, ...ids] };
		return true;
	}

	#setPending(caseNumber: number, shots: readonly NewScreenshot[]): void {
		if (shots.length) this.#pending.set(caseNumber, shots);
		else this.#pending.delete(caseNumber);
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
