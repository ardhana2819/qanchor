import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { snapshotCase } from '#lib/core/qa/run.ts';
import type { NewScreenshot, Run, ScreenshotOwner, TestResult } from '#lib/core/qa/types.ts';
import { openStorage, type NewCase, type Storage } from './db.ts';
import { runMigrations } from './migrations.ts';
import { DB_NAME, DB_VERSION, type QAnchorDB, type StoredRecords, type Wallet } from './schema.ts';

// fake-indexeddb implements the IndexedDB spec in Node, including transaction rollback, so the
// storage code runs here as it does in a browser. Browser-specific failures (private mode,
// blocked storage) are covered in tests/e2e/storage.spec.ts.

function wallet(id: string): Wallet {
	return {
		id,
		label: `Wallet ${id}`,
		chain: 'evm',
		networkId: 'eth-sepolia',
		address: `0x${id.padStart(40, '0')}`,
		notes: '',
		createdAt: 1,
		updatedAt: 1
	};
}

function rawDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve) => {
		const request = indexedDB.open(DB_NAME);
		request.onsuccess = () => resolve(request.result);
	});
}

const EMPTY: StoredRecords = {
	endpoints: [],
	wallets: [],
	faucets: [],
	testCases: [],
	runs: [],
	results: []
};

const newCase = (title: string): NewCase => ({
	title,
	preconditions: '',
	steps: [{ action: 'Open', expected: '' }],
	expected: 'Works',
	tags: [],
	priority: 'medium'
});

function run(id: string): Run {
	return {
		id,
		name: `Run ${id}`,
		release: '',
		environment: '',
		status: 'in-progress',
		cases: [],
		createdAt: 1,
		updatedAt: 1,
		completedAt: null
	};
}

function result(runId: string, caseNumber: number): TestResult {
	return {
		runId,
		caseNumber,
		status: 'pass',
		failedStep: null,
		actual: '',
		reason: '',
		notes: '',
		linkedIssue: '',
		updatedAt: 1
	};
}

async function open(onClosed = vi.fn()): Promise<Storage> {
	const result = await openStorage({ onClosed });
	if (!result.ok) throw new Error(`open failed: ${result.error}`);
	return result.value;
}

beforeEach(() => {
	globalThis.indexedDB = new IDBFactory();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe('openStorage', () => {
	it('creates the schema v3 stores and their indexes', async () => {
		await open();
		const raw = await rawDatabase();

		expect(raw.version).toBe(DB_VERSION);
		expect([...raw.objectStoreNames]).toEqual([
			'endpoints',
			'faucets',
			'meta',
			'results',
			'runs',
			'screenshots',
			'testCases',
			'wallets'
		]);
		const tx = raw.transaction([...raw.objectStoreNames]);
		const wallets = tx.objectStore('wallets');
		expect(wallets.keyPath).toBe('id');
		expect(wallets.index('byNetworkAddress').keyPath).toEqual(['networkId', 'address']);
		const byNumber = tx.objectStore('testCases').index('byNumber');
		expect([byNumber.keyPath, byNumber.unique]).toEqual(['number', true]);
		expect(tx.objectStore('results').keyPath).toEqual(['runId', 'caseNumber']);
		expect(tx.objectStore('results').indexNames.length).toBe(0);
		expect(tx.objectStore('runs').keyPath).toBe('id');
		expect(tx.objectStore('meta').keyPath).toBe('key');
		const screenshots = tx.objectStore('screenshots');
		expect(screenshots.keyPath).toBe('id');
		expect([...screenshots.indexNames]).toEqual(['byOwner']);
		expect(screenshots.index('byOwner').keyPath).toBe('owner');
		raw.close();
	});

	it('upgrades a v1 database and keeps every v1 record (FR-091 AC-1, NFR-016)', async () => {
		const v1 = await openDB<QAnchorDB>(DB_NAME, 1, {
			upgrade: (db, oldVersion, newVersion, tx) => runMigrations(db, tx, oldVersion, 1)
		});
		await v1.put('wallets', wallet('1'));
		await v1.put('endpoints', { networkId: 'eth-sepolia', url: 'https://rpc.example.dev' });
		await v1.put('faucets', { id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' });
		v1.close();

		const storage = await open();

		expect(await storage.readRecords()).toEqual({
			ok: true,
			value: {
				...EMPTY,
				endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
				wallets: [wallet('1')],
				faucets: [{ id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' }]
			}
		});
		expect(await storage.readAll('testCases')).toEqual({ ok: true, value: [] });
		const raw = await rawDatabase();
		expect(raw.version).toBe(DB_VERSION);
		raw.close();
	});

	it('upgrades a v2 database and keeps every record (NFR-016)', async () => {
		const v2 = await openDB<QAnchorDB>(DB_NAME, 2, {
			upgrade: (db, oldVersion, newVersion, tx) => runMigrations(db, tx, oldVersion, 2)
		});
		await v2.put('wallets', wallet('1'));
		await v2.put('testCases', { ...newCase('A'), id: 'c1', number: 7, createdAt: 1, updatedAt: 1 });
		await v2.put('runs', run('r1'));
		await v2.put('results', result('r1', 7));
		await v2.put('meta', { key: 'caseCounter', value: 7 });
		v2.close();

		const storage = await open();

		const read = await storage.readRecords();
		expect(read.ok && read.value).toMatchObject({
			wallets: [wallet('1')],
			testCases: [{ id: 'c1', number: 7 }],
			runs: [run('r1')],
			results: [result('r1', 7)]
		});
		expect(await storage.readScreenshotMeta()).toEqual({ ok: true, value: [] });
		// The counter survived: the next case continues after TC-7.
		const next = await storage.createCase(newCase('B'), 2);
		expect(next.ok && next.value.number).toBe(8);
	});

	it('reports unavailable when IndexedDB does not exist (EC-001)', async () => {
		vi.stubGlobal('indexedDB', undefined);
		expect(await openStorage({ onClosed: vi.fn() })).toEqual({ ok: false, error: 'unavailable' });
		vi.unstubAllGlobals();
	});

	it('reports unavailable when the browser refuses to open it (EC-001)', async () => {
		vi.spyOn(indexedDB, 'open').mockImplementation(() => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		});
		expect(await openStorage({ onClosed: vi.fn() })).toEqual({ ok: false, error: 'unavailable' });
	});
});

describe('Storage', () => {
	it('reads back what it wrote', async () => {
		const storage = await open();

		expect(await storage.putAll('wallets', [wallet('1'), wallet('2')])).toEqual({
			ok: true,
			value: undefined
		});
		const read = await storage.readAll('wallets');
		expect(read.ok && read.value.map((w) => w.id)).toEqual(['1', '2']);
	});

	it('a quota error saves none of the batch and keeps existing data (EC-002)', async () => {
		const storage = await open();
		await storage.putAll('wallets', [wallet('1')]);
		const put = IDBObjectStore.prototype.put;
		let calls = 0;
		vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
			this: IDBObjectStore,
			...args
		) {
			calls += 1;
			if (calls === 2) throw new DOMException('Quota exceeded.', 'QuotaExceededError');
			return put.apply(this, args);
		});

		const result = await storage.putAll('wallets', [wallet('2'), wallet('3'), wallet('4')]);

		expect(result).toEqual({ ok: false, error: 'quota' });
		vi.restoreAllMocks();
		const read = await storage.readAll('wallets');
		expect(read.ok && read.value.map((w) => w.id)).toEqual(['1']);
	});

	it('a failing record rolls back the records written before it in the same batch', async () => {
		const storage = await open();
		// Missing keyPath value: the request fails asynchronously, inside the transaction.
		const broken = { ...wallet('x'), id: undefined } as unknown as Wallet;

		const result = await storage.putAll('wallets', [wallet('5'), broken]);

		expect(result.ok).toBe(false);
		const read = await storage.readAll('wallets');
		expect(read.ok && read.value).toEqual([]);
	});

	it('closes and reports outdated when another tab opens a newer schema (EC-003)', async () => {
		const onClosed = vi.fn();
		const storage = await open(onClosed);

		await new Promise<void>((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION + 1);
			request.onsuccess = () => {
				request.result.close();
				resolve();
			};
			request.onerror = () => reject(request.error);
		});

		expect(onClosed).toHaveBeenCalledWith('outdated');
		expect(await storage.readAll('wallets')).toEqual({ ok: false, error: 'closed' });
	});

	it('deleteOne removes one record and ignores a key that is not stored', async () => {
		const storage = await open();
		await storage.putAll('endpoints', [
			{ networkId: 'eth', url: 'https://a.example.dev' },
			{ networkId: 'polygon', url: 'https://b.example.dev' }
		]);

		expect(await storage.deleteOne('endpoints', 'eth')).toEqual({ ok: true, value: undefined });
		expect(await storage.deleteOne('endpoints', 'nope')).toEqual({ ok: true, value: undefined });

		expect(await storage.readAll('endpoints')).toEqual({
			ok: true,
			value: [{ networkId: 'polygon', url: 'https://b.example.dev' }]
		});
	});

	it('readRecords returns every store', async () => {
		const storage = await open();
		await storage.putAll('wallets', [wallet('1')]);
		await storage.putAll('endpoints', [
			{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }
		]);

		const read = await storage.readRecords();

		expect(read.ok && read.value).toEqual({
			...EMPTY,
			endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
			wallets: [wallet('1')]
		});
	});

	it('replaceRecords replaces every store, including stores the file leaves empty (FR-003 AC-3)', async () => {
		const storage = await open();
		await storage.putAll('wallets', [wallet('1'), wallet('2')]);
		await storage.putAll('faucets', [
			{ id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' }
		]);

		const result = await storage.replaceRecords({ ...EMPTY, wallets: [wallet('9')] });

		expect(result.ok).toBe(true);
		const read = await storage.readRecords();
		expect(read.ok && read.value).toEqual({ ...EMPTY, wallets: [wallet('9')] });
	});

	it('a quota error during replaceRecords leaves the old data in every store (EC-002)', async () => {
		const storage = await open();
		await storage.putAll('wallets', [wallet('1')]);
		await storage.putAll('faucets', [
			{ id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' }
		]);
		const before = await storage.readRecords();
		const put = IDBObjectStore.prototype.put;
		vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
			this: IDBObjectStore,
			...args
		) {
			if (this.name === 'wallets') throw new DOMException('Quota exceeded.', 'QuotaExceededError');
			return put.apply(this, args);
		});

		const result = await storage.replaceRecords({ ...EMPTY, wallets: [wallet('9')] });

		expect(result).toEqual({ ok: false, error: 'quota' });
		vi.restoreAllMocks();
		expect(await storage.readRecords()).toEqual(before);
	});
});

describe('test cases (FR-100 AC-2, ADR-015)', () => {
	async function numbers(storage: Storage): Promise<number[]> {
		const read = await storage.readAll('testCases');
		return read.ok ? read.value.map((c) => c.number).sort((a, b) => a - b) : [];
	}

	it('gives each new case the next key and sets id and timestamps', async () => {
		const storage = await open();
		const first = await storage.createCase(newCase('A'), 100);
		const second = await storage.createCase(newCase('B'), 200);

		expect(first.ok && first.value).toMatchObject({
			title: 'A',
			number: 1,
			createdAt: 100,
			updatedAt: 100
		});
		expect(second.ok && second.value.number).toBe(2);
		expect(first.ok && second.ok && first.value.id !== second.value.id).toBe(true);
		expect(await storage.readAll('meta')).toEqual({
			ok: true,
			value: [{ key: 'caseCounter', value: 2 }]
		});
	});

	it('never reuses a key, also after deleting the last case and reopening', async () => {
		const storage = await open();
		await storage.createCase(newCase('A'), 1);
		const last = await storage.createCase(newCase('B'), 1);
		if (!last.ok) throw new Error('create failed');
		await storage.deleteOne('testCases', last.value.id);

		const again = await (await open()).createCase(newCase('C'), 1);

		expect(again.ok && again.value.number).toBe(3);
	});

	it('assigns different keys to cases created at the same time (EC-033)', async () => {
		const [a, b] = await Promise.all([open(), open()]);
		const created = await Promise.all([
			a.createCase(newCase('A'), 1),
			b.createCase(newCase('B'), 1),
			a.createCase(newCase('C'), 1)
		]);

		expect(created.every((c) => c.ok)).toBe(true);
		expect(await numbers(a)).toEqual([1, 2, 3]);
	});

	it('a key already taken fails the save and leaves the counter as it was', async () => {
		const storage = await open();
		// A case stored with key 1 while the counter is still 0 (only a broken import could do this).
		await storage.putAll('testCases', [
			{ ...newCase('Old'), id: 'x', number: 1, createdAt: 1, updatedAt: 1 }
		]);

		const created = await storage.createCase(newCase('New'), 1);

		expect(created).toEqual({ ok: false, error: 'failed' });
		expect(await storage.readAll('meta')).toEqual({ ok: true, value: [] });
		expect(await numbers(storage)).toEqual([1]);
	});

	it('a quota error saves neither the case nor the counter (NFR-026)', async () => {
		const storage = await open();
		vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(() => {
			throw new DOMException('Quota exceeded.', 'QuotaExceededError');
		});

		expect(await storage.createCase(newCase('A'), 1)).toEqual({ ok: false, error: 'quota' });
		vi.restoreAllMocks();
		expect(await storage.readAll('meta')).toEqual({ ok: true, value: [] });
		expect(await numbers(storage)).toEqual([]);
	});

	it('a second case with a stored key is refused by the unique index', async () => {
		const storage = await open();
		const created = await storage.createCase(newCase('A'), 1);
		if (!created.ok) throw new Error('create failed');

		const clash = await storage.putAll('testCases', [{ ...created.value, id: 'other' }]);

		expect(clash).toEqual({ ok: false, error: 'failed' });
	});
});

describe('runs and results (FR-111, FR-113 AC-4, NFR-024)', () => {
	it('keeps one result per case in a run: a new save replaces it (FR-111 AC-6)', async () => {
		const storage = await open();
		await storage.putAll('results', [result('r1', 1)]);
		await storage.putAll('results', [{ ...result('r1', 1), status: 'fail', actual: 'x' }]);

		const read = await storage.readAll('results');
		expect(read.ok && read.value.map((r) => [r.runId, r.caseNumber, r.status])).toEqual([
			['r1', 1, 'fail']
		]);
	});

	it('deletes a run with its results and leaves other runs alone', async () => {
		const storage = await open();
		await storage.putAll('runs', [run('r1'), run('r2'), run('r10')]);
		await storage.putAll('results', [
			result('r1', 1),
			result('r1', 250),
			result('r2', 1),
			result('r10', 1)
		]);

		expect(await storage.deleteRun('r1')).toEqual({ ok: true, value: undefined });

		const runs = await storage.readAll('runs');
		const results = await storage.readAll('results');
		expect(runs.ok && runs.value.map((r) => r.id).sort()).toEqual(['r10', 'r2']);
		expect(results.ok && results.value.map((r) => r.runId).sort()).toEqual(['r10', 'r2']);
	});

	it('a failing cascade delete keeps the run and its results (NFR-026)', async () => {
		const storage = await open();
		await storage.putAll('runs', [run('r1')]);
		await storage.putAll('results', [result('r1', 1)]);
		const remove = IDBObjectStore.prototype.delete;
		vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
			this: IDBObjectStore,
			...args
		) {
			if (this.name === 'results') throw new DOMException('Disk full.', 'UnknownError');
			return remove.apply(this, args);
		});

		expect(await storage.deleteRun('r1')).toEqual({ ok: false, error: 'failed' });
		vi.restoreAllMocks();
		expect((await storage.readAll('runs')).ok && (await storage.readAll('runs'))).toMatchObject({
			value: [run('r1')]
		});
		expect(await storage.readAll('results')).toEqual({ ok: true, value: [result('r1', 1)] });
	});

	it('an import replaces the Phase 2 stores too (FR-091 AC-3)', async () => {
		const storage = await open();
		await storage.putAll('runs', [run('r1')]);
		await storage.putAll('results', [result('r1', 1)]);
		await storage.createCase(newCase('A'), 1);

		await storage.replaceRecords({ ...EMPTY, wallets: [wallet('1')] });

		const read = await storage.readRecords();
		expect(read.ok && read.value).toEqual({ ...EMPTY, wallets: [wallet('1')] });
	});
});

describe('the key counter after an import (FR-100 AC-2, plan finding F-5)', () => {
	const stored = (number: number) => ({
		...newCase(`Case ${number}`),
		id: `c${number}`,
		number,
		createdAt: 1,
		updatedAt: 1
	});
	const snapshotOf = (number: number) => snapshotCase(stored(number));

	it('continues after the highest key among cases and run snapshots', async () => {
		const storage = await open();
		await storage.replaceRecords({
			...EMPTY,
			testCases: [stored(5), stored(2)],
			// TC-9 was deleted before the export but survives in a run.
			runs: [{ ...run('r1'), cases: [snapshotOf(2), snapshotOf(9)] }]
		});

		const created = await storage.createCase(newCase('Next'), 1);

		expect(created.ok && created.value.number).toBe(10);
	});

	it('replaces a higher counter from before the import', async () => {
		const storage = await open();
		for (const title of ['A', 'B', 'C']) await storage.createCase(newCase(title), 1);

		await storage.replaceRecords({ ...EMPTY, testCases: [stored(1)] });
		const created = await storage.createCase(newCase('Next'), 1);

		expect(created.ok && created.value.number).toBe(2);
	});

	it('starts again at TC-1 after importing a file with no cases (EC-037)', async () => {
		const storage = await open();
		await storage.createCase(newCase('A'), 1);

		await storage.replaceRecords(EMPTY);
		const created = await storage.createCase(newCase('Next'), 1);

		expect(created.ok && created.value.number).toBe(1);
	});

	it('a failed import keeps the old counter with the old data (EC-032)', async () => {
		const storage = await open();
		await storage.createCase(newCase('A'), 1);
		const put = IDBObjectStore.prototype.put;
		vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (
			this: IDBObjectStore,
			...args
		) {
			if (this.name === 'meta') throw new DOMException('Quota exceeded.', 'QuotaExceededError');
			return put.apply(this, args);
		});

		expect(await storage.replaceRecords({ ...EMPTY, testCases: [stored(7)] })).toEqual({
			ok: false,
			error: 'quota'
		});
		vi.restoreAllMocks();
		const created = await storage.createCase(newCase('B'), 1);
		expect(created.ok && created.value.number).toBe(2);
		const cases = await storage.readAll('testCases');
		expect(cases.ok && cases.value.map((c) => c.number).sort()).toEqual([1, 2]);
	});
});

const owner = (runId: string, caseNumber: number): ScreenshotOwner => ['result', runId, caseNumber];

const image = (size = 3): NewScreenshot => ({
	mediaType: 'image/webp',
	width: 1920,
	height: 1080,
	bytes: new Uint8Array(size).fill(7).buffer
});

/** A spy that makes the n-th add to the screenshots store throw a quota error (EC-032). */
function quotaOnAdd(nth = 1) {
	const add = IDBObjectStore.prototype.add;
	let calls = 0;
	vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function (
		this: IDBObjectStore,
		...args
	) {
		if (this.name === 'screenshots' && ++calls === nth)
			throw new DOMException('Quota exceeded.', 'QuotaExceededError');
		return add.apply(this, args);
	});
}

async function count(store: 'results' | 'screenshots'): Promise<number> {
	const raw = await rawDatabase();
	const n = await new Promise<number>((resolve) => {
		const request = raw.transaction(store).objectStore(store).count();
		request.onsuccess = () => resolve(request.result);
	});
	raw.close();
	return n;
}

describe('screenshots (FR-112, plan findings F-7, F-8)', () => {
	async function withResult() {
		const storage = await open();
		await storage.putAll('runs', [run('r1')]);
		await storage.putAll('results', [result('r1', 1)]);
		return storage;
	}

	it('adds a screenshot to a stored result with its size, number, and time', async () => {
		const storage = await withResult();

		const added = await storage.addScreenshot(owner('r1', 1), image(10), 500);

		expect(added).toEqual({
			ok: true,
			value: {
				id: expect.any(String),
				owner: ['result', 'r1', 1],
				n: 1,
				mediaType: 'image/webp',
				width: 1920,
				height: 1080,
				size: 10,
				createdAt: 500,
				bytes: image(10).bytes
			}
		});
		const read = await storage.screenshotsOf(owner('r1', 1));
		expect(read.ok && read.value.map((s) => new Uint8Array(s.bytes)[0])).toEqual([7]);
	});

	it('refuses a screenshot of a result that is not stored, so none is an orphan', async () => {
		const storage = await withResult();

		expect(await storage.addScreenshot(owner('r1', 2), image(), 1)).toEqual({
			ok: false,
			error: 'missing'
		});
		expect(await storage.addScreenshot(owner('gone', 1), image(), 1)).toEqual({
			ok: false,
			error: 'missing'
		});
		expect(await count('screenshots')).toBe(0);
	});

	it('refuses the sixth screenshot of a result (FR-112 AC-6)', async () => {
		const storage = await withResult();
		for (let i = 0; i < 5; i++) await storage.addScreenshot(owner('r1', 1), image(), i);

		expect(await storage.addScreenshot(owner('r1', 1), image(), 9)).toEqual({
			ok: false,
			error: 'limit'
		});
		expect(await count('screenshots')).toBe(5);
	});

	it('refuses the sixth screenshot also when two tabs add the fifth at once', async () => {
		const first = await withResult();
		const second = await open();
		for (let i = 0; i < 4; i++) await first.addScreenshot(owner('r1', 1), image(), i);

		const both = await Promise.all([
			first.addScreenshot(owner('r1', 1), image(), 10),
			second.addScreenshot(owner('r1', 1), image(), 11)
		]);

		expect(both.map((r) => r.ok || r.error).sort()).toEqual([true, 'limit'].sort());
		expect(await count('screenshots')).toBe(5);
	});

	it('numbers after the highest, so a removal keeps the other file names (FR-122)', async () => {
		const storage = await withResult();
		const ids = [];
		for (let i = 0; i < 3; i++) {
			const added = await storage.addScreenshot(owner('r1', 1), image(), i);
			if (added.ok) ids.push(added.value.id);
		}

		await storage.deleteOne('screenshots', ids[1]);
		await storage.addScreenshot(owner('r1', 1), image(), 9);
		await storage.deleteOne('screenshots', ids[0]);

		const read = await storage.screenshotsOf(owner('r1', 1));
		expect(read.ok && read.value.map((s) => s.n)).toEqual([3, 4]);
	});

	it('lists one result in the order added and reads metadata without images', async () => {
		const storage = await withResult();
		await storage.putAll('results', [result('r1', 2)]);
		await storage.addScreenshot(owner('r1', 2), image(), 1);
		await storage.addScreenshot(owner('r1', 1), image(4), 2);
		await storage.addScreenshot(owner('r1', 1), image(5), 3);

		const one = await storage.screenshotsOf(owner('r1', 1));
		expect(one.ok && one.value.map((s) => [s.n, s.size])).toEqual([
			[1, 4],
			[2, 5]
		]);
		const meta = await storage.readScreenshotMeta();
		expect(meta.ok && meta.value).toHaveLength(3);
		expect(meta.ok && meta.value.every((s) => !('bytes' in s))).toBe(true);
	});

	it('a quota error on add writes nothing (EC-032)', async () => {
		const storage = await withResult();
		quotaOnAdd();

		expect(await storage.addScreenshot(owner('r1', 1), image(), 1)).toEqual({
			ok: false,
			error: 'quota'
		});
		vi.restoreAllMocks();
		expect(await count('screenshots')).toBe(0);
	});

	describe('saveResult with pending screenshots (F-7)', () => {
		it('writes a new result and its screenshots together', async () => {
			const storage = await open();

			const saved = await storage.saveResult(result('r1', 3), [image(1), image(2)], 40);

			expect(saved.ok && saved.value.map((s) => [s.owner, s.n, s.size, s.createdAt])).toEqual([
				[['result', 'r1', 3], 1, 1, 40],
				[['result', 'r1', 3], 2, 2, 40]
			]);
			expect(await storage.readAll('results')).toEqual({ ok: true, value: [result('r1', 3)] });
		});

		it('keeps stored screenshots when the result changes (F-11)', async () => {
			const storage = await withResult();
			await storage.addScreenshot(owner('r1', 1), image(), 1);

			const saved = await storage.saveResult({ ...result('r1', 1), status: 'fail' }, [image()], 2);

			expect(saved.ok && saved.value.map((s) => s.n)).toEqual([2]);
			expect(await count('screenshots')).toBe(2);
		});

		it('refuses more than five in all and writes neither the result nor any image', async () => {
			const storage = await withResult();
			for (let i = 0; i < 4; i++) await storage.addScreenshot(owner('r1', 1), image(), i);
			const changed = { ...result('r1', 1), status: 'fail' as const, actual: 'Broken' };

			expect(await storage.saveResult(changed, [image(), image()], 9)).toEqual({
				ok: false,
				error: 'limit'
			});
			expect(await storage.readAll('results')).toEqual({ ok: true, value: [result('r1', 1)] });
			expect(await count('screenshots')).toBe(4);
		});

		it('a quota error on the second image writes nothing (NFR-026, EC-032)', async () => {
			const storage = await open();
			quotaOnAdd(2);

			expect(await storage.saveResult(result('r1', 1), [image(), image()], 1)).toEqual({
				ok: false,
				error: 'quota'
			});
			vi.restoreAllMocks();
			expect(await count('results')).toBe(0);
			expect(await count('screenshots')).toBe(0);
		});
	});

	it("deleting a run deletes its screenshots and no other run's (FR-113 AC-4, EC-034)", async () => {
		const storage = await withResult();
		await storage.putAll('runs', [run('r10')]);
		await storage.putAll('results', [result('r1', 250), result('r10', 1)]);
		await storage.addScreenshot(owner('r1', 1), image(), 1);
		await storage.addScreenshot(owner('r1', 250), image(), 2);
		await storage.addScreenshot(owner('r10', 1), image(), 3);

		expect(await storage.deleteRun('r1')).toEqual({ ok: true, value: undefined });

		const meta = await storage.readScreenshotMeta();
		expect(meta.ok && meta.value.map((s) => s.owner)).toEqual([['result', 'r10', 1]]);
	});

	it("a failing cascade delete keeps the run's screenshots (NFR-026)", async () => {
		const storage = await withResult();
		await storage.addScreenshot(owner('r1', 1), image(), 1);
		const remove = IDBObjectStore.prototype.delete;
		vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (
			this: IDBObjectStore,
			...args
		) {
			if (this.name === 'screenshots') throw new DOMException('Disk full.', 'UnknownError');
			return remove.apply(this, args);
		});

		expect(await storage.deleteRun('r1')).toEqual({ ok: false, error: 'failed' });
		vi.restoreAllMocks();
		expect(await count('screenshots')).toBe(1);
		expect(await count('results')).toBe(1);
	});

	it('an import clears the screenshots with the results they belong to (NFR-024)', async () => {
		const storage = await withResult();
		await storage.addScreenshot(owner('r1', 1), image(), 1);

		expect(await storage.replaceRecords(EMPTY)).toEqual({ ok: true, value: undefined });

		expect(await count('screenshots')).toBe(0);
	});
});
