import type { DummyRow } from '#lib/core/dummy/rows.ts';
import type { Settings } from '#lib/core/dummy/settings.ts';
import type { DummyJobRequest, DummyJobResponse } from '#lib/workers/messages.ts';

// The page's side of the dummy data worker. The worker is created on the first job, not at load,
// and terminated when the page goes away (NFR-019).

export interface DummyJobs {
	generate(
		settings: Settings,
		seed: string,
		onProgress: (done: number, total: number) => void
	): Promise<DummyRow[]>;
	dispose(): void;
}

interface Pending {
	resolve: (rows: DummyRow[]) => void;
	reject: (error: Error) => void;
	onProgress: (done: number, total: number) => void;
}

export function createDummyJobs(
	spawn: () => Worker = () =>
		new Worker(new URL('../../workers/dummy.worker.ts', import.meta.url), { type: 'module' })
): DummyJobs {
	let worker: Worker | undefined;
	let nextId = 0;
	const pending = new Map<number, Pending>();

	function connect(): Worker {
		if (worker) return worker;
		worker = spawn();
		worker.onmessage = ({ data }: MessageEvent<DummyJobResponse>) => {
			const job = pending.get(data.id);
			if (!job) return;
			if (data.type === 'progress') return job.onProgress(data.done, data.total);
			pending.delete(data.id);
			if (data.type === 'done') job.resolve(data.rows);
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
		generate(settings, seed, onProgress) {
			const id = ++nextId;
			const request: DummyJobRequest = { type: 'generate', id, payload: { settings, seed } };
			return new Promise((resolve, reject) => {
				pending.set(id, { resolve, reject, onProgress });
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
