import { describe, expect, it } from 'vitest';
import { createImageJobs } from './image-jobs.ts';
import type { CompressedImage, ImageJobRequest, ImageJobResponse } from './messages.ts';

/** A stand-in Worker that records requests and lets the test answer them. */
class FakeWorker {
	onmessage: ((event: MessageEvent<ImageJobResponse>) => void) | null = null;
	onerror: ((event: ErrorEvent) => void) | null = null;
	requests: ImageJobRequest[] = [];
	terminated = false;

	postMessage(request: ImageJobRequest): void {
		this.requests.push(request);
	}

	terminate(): void {
		this.terminated = true;
	}

	answer(response: ImageJobResponse): void {
		this.onmessage?.({ data: response } as MessageEvent<ImageJobResponse>);
	}

	fail(message: string): void {
		this.onerror?.({ message, preventDefault() {} } as ErrorEvent);
	}
}

function setup() {
	const workers: FakeWorker[] = [];
	const jobs = createImageJobs(() => {
		const worker = new FakeWorker();
		workers.push(worker);
		return worker as unknown as Worker;
	});
	return { jobs, workers };
}

const image: CompressedImage = {
	bytes: new ArrayBuffer(3),
	type: 'image/webp',
	width: 1920,
	height: 1080,
	firstFrameOnly: false
};

describe('createImageJobs', () => {
	it('creates the worker on the first image only (T-059)', async () => {
		const { jobs, workers } = setup();
		expect(workers).toHaveLength(0);

		const file = new Blob([], { type: 'image/png' });
		const first = jobs.compress(file, 'a.png');
		const second = jobs.compress(file, 'b.png');

		expect(workers).toHaveLength(1);
		expect(workers[0].requests).toEqual([
			{ type: 'compress', id: 1, name: 'a.png', file },
			{ type: 'compress', id: 2, name: 'b.png', file }
		]);
		workers[0].answer({ type: 'done', id: 2, image });
		workers[0].answer({ type: 'refused', id: 1, error: { kind: 'not-image', file: 'a.png' } });

		expect(await first).toEqual({ ok: false, error: { kind: 'not-image', file: 'a.png' } });
		expect(await second).toEqual({ ok: true, value: image });
	});

	it('rejects on an error response and ignores answers to unknown jobs', async () => {
		const { jobs, workers } = setup();
		const job = jobs.compress(new Blob([]), 'a.png');

		workers[0].answer({ type: 'done', id: 99, image });
		workers[0].answer({ type: 'error', id: 1, message: 'No canvas' });

		await expect(job).rejects.toThrow('No canvas');
	});

	it('rejects every pending job when the worker fails, then starts a new worker', async () => {
		const { jobs, workers } = setup();
		const first = jobs.compress(new Blob([]), 'a.png');
		const second = jobs.compress(new Blob([]), 'b.png');

		workers[0].fail('');
		await expect(first).rejects.toThrow('The worker failed.');
		await expect(second).rejects.toThrow('The worker failed.');
		expect(workers[0].terminated).toBe(true);

		void jobs.compress(new Blob([]), 'c.png');
		expect(workers).toHaveLength(2);
	});

	it('dispose terminates the worker and cancels pending jobs', async () => {
		const { jobs, workers } = setup();
		const job = jobs.compress(new Blob([]), 'a.png');

		jobs.dispose();

		await expect(job).rejects.toThrow('Cancelled.');
		expect(workers[0].terminated).toBe(true);
	});
});
