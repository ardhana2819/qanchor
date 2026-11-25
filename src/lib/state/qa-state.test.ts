import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewScreenshot, TestCase } from '#lib/core/qa/types.ts';
import { CASES_MAX } from '#lib/core/qa/validation.ts';
import type { NewCase } from '#lib/storage/db.ts';

// Fake timers fake Date only: fake-indexeddb schedules its work with real timers. The state
// modules are singletons with a cached connection, so each test imports fresh copies
// against an empty database.

async function fresh() {
	vi.resetModules();
	const { testCases } = await import('./test-cases.svelte.ts');
	const { runs } = await import('./runs.svelte.ts');
	return { testCases, runs };
}

const fields = (title: string, tags: string[] = []): NewCase => ({
	title,
	preconditions: '',
	steps: [{ action: 'Open', expected: 'Opens' }],
	expected: '',
	tags,
	priority: 'medium'
});

const ok = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
	if (!result.ok) throw new Error(`expected ok, got ${String(result.error)}`);
	return result.value;
};

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.useRealTimers();
	vi.unstubAllGlobals();
});

describe('testCases state', () => {
	it('loads an empty list, then keeps created cases in key order across a reload', async () => {
		const { testCases } = await fresh();
		await testCases.load();
		expect([testCases.status, testCases.list]).toEqual(['ready', []]);

		ok(await testCases.create(fields('A')));
		ok(await testCases.create(fields('B')));
		expect(testCases.list.map((c) => [c.number, c.title])).toEqual([
			[1, 'A'],
			[2, 'B']
		]);

		const reloaded = (await fresh()).testCases;
		await reloaded.load();
		expect(reloaded.list.map((c) => c.number)).toEqual([1, 2]);
	});

	it('update keeps the key and creation time and changes the rest', async () => {
		vi.useFakeTimers({ now: 1000, toFake: ['Date'] });
		const { testCases } = await fresh();
		await testCases.load();
		const created = ok(await testCases.create(fields('A')));

		vi.setSystemTime(2000);
		const updated = ok(await testCases.update(created.id, fields('A2', ['smoke'])));

		expect(updated).toMatchObject({
			id: created.id,
			number: 1,
			title: 'A2',
			tags: ['smoke'],
			createdAt: 1000,
			updatedAt: 2000
		});
		expect(testCases.list).toEqual([updated]);
	});

	it('update of an unknown case fails without writing', async () => {
		const { testCases } = await fresh();
		await testCases.load();
		expect(await testCases.update('nope', fields('A'))).toEqual({ ok: false, error: 'failed' });
	});

	it('remove deletes the case; the next case still gets a new key', async () => {
		const { testCases } = await fresh();
		await testCases.load();
		const a = ok(await testCases.create(fields('A')));
		ok(await testCases.remove(a.id));
		expect(testCases.list).toEqual([]);
		expect(ok(await testCases.create(fields('B'))).number).toBe(2);
	});

	it('refuses a new case at the database limit (PRD 10.5)', async () => {
		const { testCases } = await fresh();
		await testCases.load();
		testCases.list = Array.from({ length: CASES_MAX }, () => ({}) as TestCase);
		expect(await testCases.create(fields('A'))).toEqual({ ok: false, error: 'limit' });
	});

	it('reports unavailable storage (EC-001)', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const { testCases } = await fresh();
		await testCases.load();
		expect(testCases.status).toBe('unavailable');
		expect(await testCases.create(fields('A'))).toEqual({ ok: false, error: 'unavailable' });
	});
});

describe('runs state', () => {
	async function withCases() {
		const state = await fresh();
		await state.testCases.load();
		await state.runs.load();
		const created = [];
		for (const title of ['A', 'B', 'C'])
			created.push(ok(await state.testCases.create(fields(title))));
		return { ...state, created };
	}

	it('creates an in-progress run with snapshots in key order (FR-110 AC-2, AC-3)', async () => {
		const { runs, testCases, created } = await withCases();
		const [a, b, c] = created as [TestCase, TestCase, TestCase];

		const run = ok(await runs.create({ name: 'Smoke', release: 'v1', environment: '' }, [c, a, b]));
		ok(await testCases.update(a.id, fields('A edited')));

		expect(run).toMatchObject({ name: 'Smoke', status: 'in-progress', completedAt: null });
		expect(run.cases.map((s) => [s.number, s.title])).toEqual([
			[1, 'A'],
			[2, 'B'],
			[3, 'C']
		]);
		expect(runs.runsWith(a.id)).toEqual([run]);
		expect(runs.runsWith('other')).toEqual([]);
	});

	it('lists runs newest first and suggests releases in their first spelling', async () => {
		vi.useFakeTimers({ now: 1000, toFake: ['Date'] });
		const { runs, created } = await withCases();
		ok(await runs.create({ name: 'One', release: 'v2.3.0', environment: '' }, created));
		vi.setSystemTime(2000);
		ok(await runs.create({ name: 'Two', release: ' V2.3.0 ', environment: '' }, created));
		vi.setSystemTime(3000);
		ok(await runs.create({ name: 'Three', release: '', environment: '' }, created));

		expect(runs.list.map((r) => r.name)).toEqual(['Three', 'Two', 'One']);
		expect(runs.releases).toEqual(['v2.3.0']);
	});

	it('saves the latest result per case and keeps it across a reload (FR-111 AC-2, AC-6)', async () => {
		const { runs, created } = await withCases();
		const run = ok(await runs.create({ name: 'R', release: '', environment: '' }, created));
		const base = {
			runId: run.id,
			caseNumber: 1,
			failedStep: null,
			actual: '',
			reason: '',
			notes: '',
			linkedIssue: ''
		};

		ok(await runs.saveResult({ ...base, status: 'pass' }));
		ok(await runs.saveResult({ ...base, status: 'fail', failedStep: 1, actual: 'Broken' }));
		ok(await runs.saveResult({ ...base, caseNumber: 2, status: 'blocked', reason: 'No env' }));

		const reloaded = (await fresh()).runs;
		await reloaded.load();
		expect(reloaded.results.map((r) => [r.caseNumber, r.status]).sort()).toEqual([
			[1, 'fail'],
			[2, 'blocked']
		]);
		expect(runs.results.map((r) => [r.caseNumber, r.status]).sort()).toEqual([
			[1, 'fail'],
			[2, 'blocked']
		]);
	});

	it('completes and reopens a run (FR-113 AC-2, AC-3)', async () => {
		vi.useFakeTimers({ now: 1000, toFake: ['Date'] });
		const { runs, created } = await withCases();
		const run = ok(await runs.create({ name: 'R', release: '', environment: '' }, created));

		vi.setSystemTime(5000);
		const done = ok(await runs.setStatus(run.id, 'completed'));
		expect([done.status, done.completedAt, done.updatedAt]).toEqual(['completed', 5000, 5000]);

		const reopened = ok(await runs.setStatus(run.id, 'in-progress'));
		expect([reopened.status, reopened.completedAt]).toEqual(['in-progress', null]);
		expect(await runs.setStatus('nope', 'completed')).toEqual({ ok: false, error: 'failed' });
	});

	it('removes a run with its results (FR-113 AC-4)', async () => {
		const { runs, created } = await withCases();
		const keep = ok(await runs.create({ name: 'Keep', release: '', environment: '' }, created));
		const drop = ok(await runs.create({ name: 'Drop', release: '', environment: '' }, created));
		const result = {
			caseNumber: 1,
			status: 'pass' as const,
			failedStep: null,
			actual: '',
			reason: '',
			notes: '',
			linkedIssue: ''
		};
		ok(await runs.saveResult({ ...result, runId: keep.id }));
		ok(await runs.saveResult({ ...result, runId: drop.id }));

		ok(await runs.remove(drop.id));

		expect(runs.list.map((r) => r.name)).toEqual(['Keep']);
		expect(runs.results.map((r) => r.runId)).toEqual([keep.id]);
		const reloaded = (await fresh()).runs;
		await reloaded.load();
		expect(reloaded.results.map((r) => r.runId)).toEqual([keep.id]);
	});

	it('reports unavailable storage (EC-001)', async () => {
		vi.stubGlobal('indexedDB', undefined);
		const { runs } = await fresh();
		await runs.load();
		expect(runs.status).toBe('unavailable');
	});
});

describe('runs state: screenshots (FR-112, plan finding F-7)', () => {
	const image = (): NewScreenshot => ({
		id: crypto.randomUUID(),
		mediaType: 'image/webp',
		width: 64,
		height: 48,
		bytes: new Uint8Array(5).buffer
	});

	async function withRun() {
		const state = await fresh();
		await state.runs.load();
		const run = ok(await state.runs.create({ name: 'R', release: '', environment: '' }, []));
		const result = {
			runId: run.id,
			caseNumber: 1,
			status: 'fail' as const,
			failedStep: 0,
			actual: 'Broken',
			reason: '',
			notes: '',
			linkedIssue: ''
		};
		return { ...state, run, result };
	}

	it('keeps metadata without images, also across a reload', async () => {
		const { runs, run, result } = await withRun();

		ok(await runs.saveResult(result, [image()]));
		const added = ok(await runs.addScreenshot(run.id, 1, image()));

		expect(added).toMatchObject({ owner: ['result', run.id, 1], n: 2, size: 5 });
		expect(runs.screenshotsOf(run.id, 1).map((s) => s.n)).toEqual([1, 2]);
		expect(runs.screenshots.some((s) => 'bytes' in s)).toBe(false);
		const reloaded = (await fresh()).runs;
		await reloaded.load();
		expect(reloaded.screenshotsOf(run.id, 1).map((s) => s.n)).toEqual([1, 2]);
		expect(reloaded.screenshots.some((s) => 'bytes' in s)).toBe(false);
		const images = ok(await reloaded.images(run.id, 1));
		expect(images.map((s) => s.bytes.byteLength)).toEqual([5, 5]);
	});

	it('removes one screenshot, and a run with all of its own', async () => {
		const { runs, run, result } = await withRun();
		const other = ok(await runs.create({ name: 'O', release: '', environment: '' }, []));
		ok(await runs.saveResult(result, [image(), image()]));
		ok(await runs.saveResult({ ...result, runId: other.id }, [image()]));
		const [first] = runs.screenshotsOf(run.id, 1);

		ok(await runs.removeScreenshot(first.id));
		expect(runs.screenshotCount(run.id)).toBe(1);

		ok(await runs.remove(run.id));
		expect(runs.screenshotCount(run.id)).toBe(0);
		expect(runs.screenshotCount(other.id)).toBe(1);
		const reloaded = (await fresh()).runs;
		await reloaded.load();
		expect(reloaded.screenshots.map((s) => s.owner[1])).toEqual([other.id]);
	});

	it('refuses the sixth screenshot with the limit error (FR-112 AC-6)', async () => {
		const { runs, run, result } = await withRun();
		ok(await runs.saveResult(result, [image(), image(), image(), image(), image()]));

		expect(await runs.addScreenshot(run.id, 1, image())).toEqual({
			ok: false,
			error: { kind: 'limit' }
		});
		expect(await runs.saveResult(result, [image()])).toEqual({
			ok: false,
			error: { kind: 'limit' }
		});
		expect(runs.screenshotCount(run.id)).toBe(5);
	});

	it('a screenshot of an unsaved result fails as a storage error, writing nothing', async () => {
		const { runs, run } = await withRun();

		expect(await runs.addScreenshot(run.id, 1, image())).toEqual({ ok: false, error: 'failed' });
		expect(runs.screenshots).toEqual([]);
	});

	describe('a quota error (EC-032, FR-092 AC-3)', () => {
		function quotaOnScreenshots() {
			const add = IDBObjectStore.prototype.add;
			vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
				this: IDBObjectStore,
				...args
			) {
				if (this.name === 'screenshots')
					throw new DOMException('Quota exceeded.', 'QuotaExceededError');
				return add.apply(this, args);
			});
		}

		afterEach(() => vi.restoreAllMocks());

		it('names the storage used when the browser says', async () => {
			const { runs, run, result } = await withRun();
			ok(await runs.saveResult(result));
			vi.stubGlobal('navigator', {
				storage: { estimate: async () => ({ usage: 1.9e9, quota: 2e9 }) }
			});
			quotaOnScreenshots();

			expect(await runs.addScreenshot(run.id, 1, image())).toEqual({
				ok: false,
				error: { kind: 'storage', usage: 1.9e9, quota: 2e9 }
			});
			expect(await runs.saveResult({ ...result, actual: 'Changed' }, [image()])).toEqual({
				ok: false,
				error: { kind: 'storage', usage: 1.9e9, quota: 2e9 }
			});
			// The result text saved before stays as it was (EC-032).
			expect(runs.results.map((r) => r.actual)).toEqual(['Broken']);
			expect(runs.screenshots).toEqual([]);
		});

		it('still fails as a storage error where the browser gives no estimate', async () => {
			const { runs, run, result } = await withRun();
			ok(await runs.saveResult(result));
			vi.stubGlobal('navigator', {});
			quotaOnScreenshots();

			expect(await runs.addScreenshot(run.id, 1, image())).toEqual({
				ok: false,
				error: { kind: 'storage', usage: undefined, quota: undefined }
			});
		});

		it('on a result without screenshots keeps the plain storage error', async () => {
			const { runs, result } = await withRun();
			const put = IDBObjectStore.prototype.put;
			vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
				this: IDBObjectStore,
				...args
			) {
				if (this.name === 'results') throw new DOMException('Quota.', 'QuotaExceededError');
				return put.apply(this, args);
			});

			expect(await runs.saveResult(result)).toEqual({ ok: false, error: 'quota' });
		});
	});
});
