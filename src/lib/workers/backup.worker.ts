import { createBackup, parseBackup } from '#lib/storage/backup.ts';
import type { BackupJobRequest, BackupJobResponse } from './messages.ts';

// Builds and reads backup files off the main thread (FR-091 AC-6, NFR-023, plan finding F-9):
// with screenshots a file is tens of megabytes of base64, and encoding, stringifying, parsing,
// checking, and decoding it are each a long task on their own. It never touches storage.

async function handle(request: BackupJobRequest): Promise<void> {
	const { id } = request;
	let response: BackupJobResponse;
	let transfer: Transferable[] = [];
	try {
		if (request.type === 'export') {
			const text = `${JSON.stringify(createBackup(request.data, new Date(request.now)), null, 2)}\n`;
			response = { type: 'exported', id, file: new Blob([text], { type: 'application/json' }) };
		} else {
			const parsed = parseBackup(await request.file.text());
			if (parsed.ok) {
				response = { type: 'parsed', id, backup: parsed.value };
				transfer = parsed.value.data.screenshots.map((shot) => shot.bytes);
			} else {
				response = { type: 'refused', id, error: parsed.error };
			}
		}
	} catch (error) {
		response = {
			type: 'error',
			id,
			message: error instanceof Error ? error.message : String(error)
		};
	}
	self.postMessage(response, { transfer });
}

// One backup at a time: two 50 MB files in memory at once could run out of it.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<BackupJobRequest>) => {
	queue = queue.then(() => handle(event.data));
};
