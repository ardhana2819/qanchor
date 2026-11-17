import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openStorage, type Storage } from './db.ts';
import { DB_NAME, DB_VERSION, type Wallet } from './schema.ts';

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
	it('creates the schema v1 stores and the wallet index', async () => {
		await open();
		const raw = await new Promise<IDBDatabase>((resolve) => {
			const request = indexedDB.open(DB_NAME);
			request.onsuccess = () => resolve(request.result);
		});

		expect(raw.version).toBe(DB_VERSION);
		expect([...raw.objectStoreNames]).toEqual(['endpoints', 'faucets', 'wallets']);
		const wallets = raw.transaction('wallets').objectStore('wallets');
		expect(wallets.keyPath).toBe('id');
		expect(wallets.index('byNetworkAddress').keyPath).toEqual(['networkId', 'address']);
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
