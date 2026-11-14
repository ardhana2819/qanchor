import type { AddressRow, GenerateOptions } from '#lib/core/chains/catalog.ts';
import type { AddressJobRequest, AddressJobResponse } from '#lib/workers/messages.ts';

// The page's side of the address worker. The worker is created on the first job, not at load, and
// terminated when the page goes away (NFR-019).

export interface AddressJobs {
	generate(options: GenerateOptions): Promise<AddressRow[]>;
	dispose(): void;
}

export function createAddressJobs(
	spawn: () => Worker = () =>
		new Worker(new URL('../../workers/address.worker.ts', import.meta.url), { type: 'module' })
): AddressJobs {
	let worker: Worker | undefined;
	let nextId = 0;
	const pending = new Map<
		number,
		{ resolve: (rows: AddressRow[]) => void; reject: (e: Error) => void }
	>();

	function connect(): Worker {
		if (worker) return worker;
		worker = spawn();
		worker.onmessage = (event: MessageEvent<AddressJobResponse>) => {
			const job = pending.get(event.data.id);
			if (!job) return;
			pending.delete(event.data.id);
			if (event.data.type === 'done') job.resolve(event.data.rows);
			else job.reject(new Error(event.data.message));
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
		generate(options) {
			const id = ++nextId;
			const request: AddressJobRequest = { type: 'generate', id, payload: options };
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
