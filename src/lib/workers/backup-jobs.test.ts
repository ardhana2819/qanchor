import { describe, expect, it } from 'vitest';
import type { BackupData, BackupFile } from '#lib/storage/backup.ts';
import { createBackupJobs } from './backup-jobs.ts';
import type { BackupJobRequest, BackupJobResponse } from './messages.ts';

/** A stand-in Worker that records requests and their transfer lists. */
class FakeWorker {
	onmessage: ((event: MessageEvent<BackupJobResponse>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	sent: { request: BackupJobRequest; transfer: Transferable[] }[] = [];
	terminated = false;

	postMessage(request: BackupJobRequest, options: { transfer: Transferable[] }): void {
		this.sent.push({ request, transfer: options.transfer });
	}

	terminate(): void {
		this.terminated = true;
	}

	answer(response: BackupJobResponse): void {
		this.onmessage?.({ data: response } as MessageEvent<BackupJobResponse>);
	}

	fail(): void {
		this.onerror?.({ message: '', preventDefault() {} } as ErrorEvent);
	}
}

function setup() {
	const workers: FakeWorker[] = [];
	const jobs = createBackupJobs(() => {
		const worker = new FakeWorker();
		workers.push(worker);
		return worker as unknown as Worker;
	});
	return { jobs, workers };
}

const bytes = new ArrayBuffer(4);
const data = {
	settings: { theme: 'system' },
	endpoints: [],
	wallets: [],
	faucets: [],
	testCases: [],
	runs: [],
	results: [],
	screenshots: [{ bytes }]
} as unknown as BackupData;

describe('createBackupJobs (FR-091 AC-6, plan finding F-9)', () => {
	it('creates no worker until the first job', () => {
		const { workers } = setup();
		expect(workers).toHaveLength(0);
	});

	it('builds a file, transferring the screenshot bytes', async () => {
		const { jobs, workers } = setup();
		const built = jobs.build(data, new Date(5000));

		const [{ request, transfer }] = workers[0].sent;
		expect(request).toEqual({ type: 'export', id: 1, data, now: 5000 });
		expect(transfer).toEqual([bytes]);
		const file = new Blob(['{}']);
		workers[0].answer({ type: 'exported', id: 1, file });
		expect(await built).toBe(file);
	});

	it('reads a file into a backup or the reason it was refused', async () => {
		const { jobs, workers } = setup();
		const file = new Blob(['x']);
		const first = jobs.read(file);
		const second = jobs.read(file);
		const backup = { app: 'qanchor' } as BackupFile;

		expect(workers).toHaveLength(1);
		workers[0].answer({ type: 'refused', id: 2, error: { code: 'not-json' } });
		workers[0].answer({ type: 'parsed', id: 1, backup });

		expect(await first).toEqual({ ok: true, value: backup });
		expect(await second).toEqual({ ok: false, error: { code: 'not-json' } });
	});

	it('rejects on an error answer, and every pending job when the worker fails', async () => {
		const { jobs, workers } = setup();
		const failed = jobs.read(new Blob([]));
		workers[0].answer({ type: 'error', id: 1, message: 'Out of memory' });
		await expect(failed).rejects.toThrow('Out of memory');

		const a = jobs.read(new Blob([]));
		const b = jobs.build(data, new Date(0));
		workers[0].fail();
		await expect(a).rejects.toThrow('The worker failed.');
		await expect(b).rejects.toThrow('The worker failed.');
		expect(workers[0].terminated).toBe(true);
	});

	it('dispose terminates the worker and cancels pending jobs', async () => {
		const { jobs, workers } = setup();
		const job = jobs.read(new Blob([]));
		jobs.dispose();
		await expect(job).rejects.toThrow('Cancelled.');
		expect(workers[0].terminated).toBe(true);
	});
});
