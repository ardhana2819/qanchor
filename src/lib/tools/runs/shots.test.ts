import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { err, ok } from '#lib/core/result.ts';
import type { ImageJobs } from '#lib/workers/image-jobs.ts';
import { addedText, pasteAction, shotName } from './screenshots.ts';

// The run page's screenshots (FR-112, plan finding F-7) against the real runs state and a fake
// image worker: `bad.txt` is refused, `boom.png` makes the worker fail, a `.gif` keeps its
// first frame, and anything else compresses to a 3-byte WebP.

function fakeJobs() {
	const names: string[] = [];
	const jobs: ImageJobs & { disposed: boolean } = {
		disposed: false,
		async compress(_file, name) {
			names.push(name);
			if (name === 'boom.png') throw new Error('The worker failed.');
			if (name.endsWith('.txt')) return err({ kind: 'not-image', file: name });
			return ok({
				bytes: new Uint8Array(3).buffer,
				type: 'image/webp',
				width: 10,
				height: 10,
				firstFrameOnly: name.endsWith('.gif')
			});
		},
		dispose() {
			this.disposed = true;
		}
	};
	return { jobs, names };
}

const file = (name: string) => new File([new Uint8Array(4)], name, { type: 'image/png' });

async function setup() {
	vi.resetModules();
	const { runs } = await import('#lib/state/runs.svelte.ts');
	const { RunShots } = await import('./shots.svelte.ts');
	await runs.load();
	const created = await runs.create({ name: 'R', release: '', environment: '' }, []);
	if (!created.ok) throw new Error('no run');
	const runId = created.value.id;
	const { jobs, names } = fakeJobs();
	const shots = new RunShots(jobs);
	const result = {
		runId,
		caseNumber: 1,
		status: 'fail' as const,
		failedStep: null,
		actual: 'Broken',
		reason: '',
		notes: '',
		linkedIssue: ''
	};
	return { runs, shots, runId, jobs, names, result };
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('pasteAction (EC-029)', () => {
	const image = new File([], 'shot.png', { type: 'image/png' });
	const pdf = new File([], 'spec.pdf', { type: 'application/pdf' });

	it('adds an image, also in a text field', () => {
		expect(pasteAction([image], true)).toBe('add');
		expect(pasteAction([pdf, image], false)).toBe('add');
	});

	it('keeps a paste without an image in a text field as it is', () => {
		expect(pasteAction([], true)).toBe('default');
		expect(pasteAction([pdf], true)).toBe('default');
	});

	it('refuses a paste without an image elsewhere, naming a file that is not one', () => {
		expect(pasteAction([], false)).toBe('no-image');
		expect(pasteAction([pdf], false)).toBe('add');
	});
});

describe('copy (design 13.7, 13.8)', () => {
	it('names a screenshot and announces an add', () => {
		expect(shotName(12, 2)).toBe('Screenshot 2 of TC-12');
		expect(addedText(2)).toBe('Screenshot added, 2 of 5.');
	});
});

describe('RunShots (FR-112, plan finding F-7)', () => {
	it('keeps a screenshot waiting until the result is first saved, then stores it', async () => {
		const { runs, shots, runId, result } = await setup();
		await shots.open(runId, 1);

		expect(await shots.add(runId, 1, [file('a.png')])).toEqual({ error: null, note: null });
		const [waiting] = shots.itemsOf(runId, 1);
		expect(waiting.name).toBe('Screenshot 1 of TC-1');
		expect(waiting.fileName).toMatch(/^TC-1-[0-9a-f]{8}-1\.webp$/);
		expect(runs.screenshots).toEqual([]);

		const pending = shots.pendingOf(1);
		expect((await runs.saveResult(result, pending)).ok).toBe(true);
		// Stored and still waiting until `saved`: listed once (each key unique).
		expect(shots.itemsOf(runId, 1)).toEqual([waiting]);
		expect(await shots.saved(runId, 1, pending)).toBeNull();

		expect(shots.pendingOf(1)).toEqual([]);
		expect(runs.screenshotsOf(runId, 1).map((meta) => meta.id)).toEqual([waiting.id]);
		// The same image, so the thumbnail does not play the added transition again.
		expect(shots.itemsOf(runId, 1)).toEqual([waiting]);
	});

	it('stores a screenshot of a saved result at once', async () => {
		const { runs, shots, runId, result } = await setup();
		await runs.saveResult(result);
		await shots.open(runId, 1);

		await shots.add(runId, 1, [file('a.png')]);

		expect(shots.pendingOf(1)).toEqual([]);
		expect(runs.screenshotsOf(runId, 1)).toHaveLength(1);
		expect(shots.itemsOf(runId, 1)).toHaveLength(1);
	});

	it('adds up to the limit and refuses the rest (FR-112 AC-6, EC-029)', async () => {
		const { shots, runId, names } = await setup();
		await shots.open(runId, 1);
		await shots.add(
			runId,
			1,
			['1', '2', '3', '4'].map((n) => file(`${n}.png`))
		);

		const outcome = await shots.add(runId, 1, [file('5.png'), file('6.png')]);

		expect(outcome.error).toEqual({ kind: 'limit' });
		expect(shots.pendingOf(1)).toHaveLength(5);
		expect(names).not.toContain('6.png');
	});

	it('goes on after a refused file and reports the refusal (FR-112 AC-5)', async () => {
		const { shots, runId } = await setup();
		await shots.open(runId, 1);

		const outcome = await shots.add(runId, 1, [file('notes.txt'), file('a.png')]);

		expect(outcome.error).toEqual({ kind: 'not-image', file: 'notes.txt' });
		expect(shots.pendingOf(1)).toHaveLength(1);
	});

	it('reports a failed worker and clears the placeholder', async () => {
		const { shots, runId } = await setup();
		await shots.open(runId, 1);

		const outcome = await shots.add(runId, 1, [file('boom.png')]);

		expect(outcome.error).toBe('failed');
		expect(shots.compressingOf(1)).toBe(0);
		expect(shots.pendingOf(1)).toEqual([]);
	});

	it('says a GIF kept its first frame (EC-030)', async () => {
		const { shots, runId } = await setup();
		await shots.open(runId, 1);

		expect((await shots.add(runId, 1, [file('loop.gif')])).note).toBe(
			'Only the first frame of loop.gif was added.'
		);
	});

	it('stores a screenshot added while the first save ran', async () => {
		const { runs, shots, runId, result } = await setup();
		await shots.open(runId, 1);
		await shots.add(runId, 1, [file('a.png')]);
		const pending = shots.pendingOf(1);
		await runs.saveResult(result, pending);
		await shots.add(runId, 1, [file('b.png')]);

		expect(await shots.saved(runId, 1, pending)).toBeNull();

		expect(shots.pendingOf(1)).toEqual([]);
		expect(runs.screenshotsOf(runId, 1)).toHaveLength(2);
	});

	it('frees the images of the case left, but keeps the waiting ones of every case', async () => {
		const { runs, shots, runId, result } = await setup();
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		await runs.saveResult(result);
		await shots.open(runId, 1);
		await shots.add(runId, 1, [file('stored.png')]);
		await shots.open(runId, 2);
		await shots.add(runId, 2, [file('waiting.png')]);
		const [stored] = runs.screenshotsOf(runId, 1);

		await shots.open(runId, 3);

		expect(revoke).toHaveBeenCalledTimes(1);
		expect(shots.itemsOf(runId, 1).map((item) => item.id)).not.toContain(stored.id);
		expect(shots.itemsOf(runId, 2)).toHaveLength(1);

		await shots.open(runId, 1);
		expect(shots.itemsOf(runId, 1).map((item) => item.id)).toEqual([stored.id]);
	});

	it('removes a waiting screenshot from memory and a stored one with its image (AC-4)', async () => {
		const { runs, shots, runId, result } = await setup();
		await shots.open(runId, 1);
		await shots.add(runId, 1, [file('a.png')]);
		const [waiting] = shots.itemsOf(runId, 1);
		expect((await shots.remove(1, waiting.id)).ok).toBe(true);
		expect(shots.itemsOf(runId, 1)).toEqual([]);

		await runs.saveResult(result);
		await shots.add(runId, 1, [file('b.png')]);
		const [stored] = shots.itemsOf(runId, 1);
		expect((await shots.remove(1, stored.id)).ok).toBe(true);

		expect(shots.itemsOf(runId, 1)).toEqual([]);
		expect(runs.screenshots).toEqual([]);
		expect(await runs.images(runId, 1)).toEqual({ ok: true, value: [] });
	});

	it('frees every image and the worker when the page goes away', async () => {
		const { shots, runId, jobs } = await setup();
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		await shots.open(runId, 1);
		await shots.add(runId, 1, [file('a.png'), file('b.png')]);

		shots.dispose();

		expect(revoke).toHaveBeenCalledTimes(2);
		expect(shots.pendingOf(1)).toEqual([]);
		expect(jobs.disposed).toBe(true);
	});
});
