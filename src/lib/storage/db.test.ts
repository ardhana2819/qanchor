import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import type { Run, TestResult } from '#lib/core/qa/types.ts';
import { openStorage, type NewCase, type Storage } from './db.ts';
import { runMigrations } from './migrations.ts';
import { DB_NAME, DB_VERSION, type QAnchorDB, type Wallet } from './schema.ts';

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
	it('creates the schema v2 stores and their indexes', async () => {
		await open();
		const raw = await rawDatabase();

		expect(raw.version).toBe(DB_VERSION);
		expect([...raw.objectStoreNames]).toEqual([
			'endpoints',
			'faucets',
			'meta',
			'results',
			'runs',
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
				endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
				wallets: [wallet('1')],
				faucets: [{ id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' }]
			}
		});
		expect(await storage.readAll('testCases')).toEqual({ ok: true, value: [] });
		const raw = await rawDatabase();
		expect(raw.version).toBe(2);
		raw.close();
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
			endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
			wallets: [wallet('1')],
			faucets: []
		});
	});

	it('replaceRecords replaces every store, including stores the file leaves empty (FR-003 AC-3)', async () => {
		const storage = await open();
		await storage.putAll('wallets', [wallet('1'), wallet('2')]);
		await storage.putAll('faucets', [
			{ id: 'f', networkId: 'n', label: 'Drip', url: 'https://f.dev' }
		]);

		const result = await storage.replaceRecords({
			endpoints: [],
			wallets: [wallet('9')],
			faucets: []
		});

		expect(result.ok).toBe(true);
		const read = await storage.readRecords();
		expect(read.ok && read.value).toEqual({ endpoints: [], wallets: [wallet('9')], faucets: [] });
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

		const result = await storage.replaceRecords({
			endpoints: [],
			wallets: [wallet('9')],
			faucets: []
		});

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

	it('an import leaves the Phase 2 stores alone until backup v2 (T-050)', async () => {
		const storage = await open();
		await storage.putAll('runs', [run('r1')]);

		await storage.replaceRecords({ endpoints: [], wallets: [], faucets: [] });

		expect(await storage.readAll('runs')).toEqual({ ok: true, value: [run('r1')] });
	});
});
