import { err, ok, type Result } from '#lib/core/result.ts';
import type { BackupData, BackupFile, ImportError } from '#lib/storage/backup.ts';
import type { BackupJobRequest, BackupJobResponse } from './messages.ts';

// The page's side of the backup worker (Settings, Data). The worker is created on the first
// export or import, not at load, and terminated when the page goes away (NFR-019).

export interface BackupJobs {
	/**
	 * Builds the backup file. The screenshot bytes are transferred to the worker, so `data` must
	 * not be used afterwards.
	 */
	build(data: BackupData, now: Date): Promise<Blob>;
	/** Reads and checks a chosen file; rejects only if the worker fails. */
	read(file: Blob): Promise<Result<BackupFile, ImportError>>;
	dispose(): void;
}

type Answer = Exclude<BackupJobResponse, { type: 'error' }>;

interface Pending {
	resolve: (answer: Answer) => void;
	reject: (error: Error) => void;
}

export function createBackupJobs(
	spawn: () => Worker = () =>
		new Worker(new URL('./backup.worker.ts', import.meta.url), { type: 'module' })
): BackupJobs {
	let worker: Worker | undefined;
	let nextId = 0;
	const pending = new Map<number, Pending>();

	function connect(): Worker {
		if (worker) return worker;
		worker = spawn();
		worker.onmessage = ({ data }: MessageEvent<BackupJobResponse>) => {
			const job = pending.get(data.id);
			if (!job) return;
			pending.delete(data.id);
			if (data.type === 'error') job.reject(new Error(data.message));
			else job.resolve(data);
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

	function send(request: BackupJobRequest, transfer: Transferable[] = []): Promise<Answer> {
		return new Promise((resolve, reject) => {
			pending.set(request.id, { resolve, reject });
			connect().postMessage(request, { transfer });
		});
	}

	return {
		async build(data, now) {
			const transfer = data.screenshots.map((shot) => shot.bytes);
			const answer = await send(
				{ type: 'export', id: ++nextId, data, now: now.getTime() },
				transfer
			);
			if (answer.type !== 'exported') throw new Error(`Unexpected answer: ${answer.type}.`);
			return answer.file;
		},
		async read(file) {
			const answer = await send({ type: 'import', id: ++nextId, file });
			if (answer.type === 'parsed') return ok(answer.backup);
			if (answer.type === 'refused') return err(answer.error);
			throw new Error(`Unexpected answer: ${answer.type}.`);
		},
		dispose() {
			worker?.terminate();
			worker = undefined;
			for (const job of pending.values()) job.reject(new Error('Cancelled.'));
			pending.clear();
		}
	};
}
