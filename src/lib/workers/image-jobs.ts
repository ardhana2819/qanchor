import { err, ok, type Result } from '#lib/core/result.ts';
import type { ScreenshotError } from '#lib/core/qa/screenshots.ts';
import type { CompressedImage, ImageJobRequest, ImageJobResponse } from './messages.ts';

// The page's side of the image worker. Run execution and, in slice 2c, session findings both
// add screenshots, so it lives with the worker rather than in one tool. The worker is created on
// the first image, not at load (T-059), and terminated when the page goes away (NFR-019).

export type CompressResult = Result<CompressedImage, ScreenshotError>;

export interface ImageJobs {
	/** Resolves with the image or the reason it was refused; rejects if the worker fails. */
	compress(file: Blob, name: string): Promise<CompressResult>;
	dispose(): void;
}

interface Pending {
	resolve: (result: CompressResult) => void;
	reject: (error: Error) => void;
}

export function createImageJobs(
	spawn: () => Worker = () =>
		new Worker(new URL('./image.worker.ts', import.meta.url), { type: 'module' })
): ImageJobs {
	let worker: Worker | undefined;
	let nextId = 0;
	const pending = new Map<number, Pending>();

	function connect(): Worker {
		if (worker) return worker;
		worker = spawn();
		worker.onmessage = ({ data }: MessageEvent<ImageJobResponse>) => {
			const job = pending.get(data.id);
			if (!job) return;
			pending.delete(data.id);
			if (data.type === 'done') job.resolve(ok(data.image));
			else if (data.type === 'refused') job.resolve(err(data.error));
			else job.reject(new Error(data.message));
		};
		worker.onerror = (event) => {
			event.preventDefault();
			for (const job of pending.values())
				job.reject(new Error(event.message || 'The worker failed.'));
			pending.clear();
			worker?.terminate();
			worker = undefined;
		};
		return worker;
	}

	return {
		compress(file, name) {
			const id = ++nextId;
			const request: ImageJobRequest = { type: 'compress', id, name, file };
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject });
				connect().postMessage(request);
			});
		},
		dispose() {
			worker?.terminate();
			worker = undefined;
			for (const job of pending.values()) job.reject(new Error('Cancelled.'));
			pending.clear();
		}
	};
}
