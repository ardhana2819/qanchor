import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Storage layer in real browsers (T-010, EC-001, EC-003). Data rules (migrations, rollback on a
// quota error) are unit-tested in src/lib/storage/db.test.ts.

const UNAVAILABLE =
	'Storage is unavailable in this browser session. Tools still work, but nothing will be saved.';
const unavailableBanner = (page: Page) => page.getByText(UNAVAILABLE);
const outdatedBanner = (page: Page) => page.getByText('QAnchor was updated in another tab');

/** Opens the qanchor database the way another tab would, and returns its version and stores. */
function rawOpen(page: Page, version?: number) {
	return page.evaluate(
		(version) =>
			new Promise<{ version: number; stores: string[] }>((resolve, reject) => {
				const request = indexedDB.open('qanchor', version);
				request.onsuccess = () => {
					const db = request.result;
					const info = { version: db.version, stores: [...db.objectStoreNames].sort() };
					db.close();
					resolve(info);
				};
				request.onerror = () => reject(request.error);
			}),
		version
	);
}

const V2_STORES = ['endpoints', 'faucets', 'meta', 'results', 'runs', 'testCases', 'wallets'];

test('a normal visit opens schema v2 and shows no banner', async ({ page }) => {
	await page.goto('/');
	await appOpened(page);

	expect(await rawOpen(page)).toEqual({ version: 2, stores: V2_STORES });
	await expect(unavailableBanner(page)).toBeHidden();
	await expect(outdatedBanner(page)).toBeHidden();
});

test('the prerendered HTML has no storage banner, so none flashes before the check', async () => {
	const html = await readFile('build/index.html', 'utf8');
	expect(html).not.toContain('Storage is unavailable');
});

const blocked = {
	'IndexedDB refuses to open (Safari with storage blocked)': () => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	},
	'IndexedDB does not exist': () => {
		Object.defineProperty(window, 'indexedDB', { get: () => undefined });
	}
};

for (const [name, block] of Object.entries(blocked)) {
	test(`${name}: a banner explains it and tools still work (EC-001)`, async ({ page }) => {
		const errors: string[] = [];
		page.on('pageerror', (error) => errors.push(error.message));
		await page.addInitScript(block);

		await page.goto('/components');

		await expect(unavailableBanner(page)).toBeVisible();
		await page.getByRole('tab', { name: 'Validate' }).click();
		await expect(page.getByRole('tab', { name: 'Validate' })).toHaveAttribute(
			'aria-selected',
			'true'
		);
		expect(errors).toEqual([]);
	});
}

test('an open request that fails later is also reported as unavailable', async ({ page }) => {
	await page.goto('/');
	// A database from a newer version makes opening v2 fail asynchronously with VersionError.
	await page.evaluate(
		() =>
			new Promise<void>((resolve) => {
				indexedDB.deleteDatabase('qanchor').onsuccess = () => {
					const request = indexedDB.open('qanchor', 99);
					request.onsuccess = () => {
						request.result.close();
						resolve();
					};
				};
			})
	);

	await page.reload();

	await expect(unavailableBanner(page)).toBeVisible();
});

test('a schema upgrade in another tab asks this tab to reload (EC-003)', async ({
	page,
	context
}) => {
	await page.goto('/');
	await appOpened(page);

	const other = await context.newPage();
	await other.goto('/');
	// The other tab only completes its upgrade if this tab closes its connection.
	expect(await rawOpen(other, 3)).toMatchObject({ version: 3 });

	await expect(outdatedBanner(page)).toBeVisible();
	await expect(page.getByText('Reload this tab to keep saving your changes.')).toBeVisible();
	await Promise.all([
		page.waitForEvent('load'),
		page.getByRole('button', { name: 'Reload' }).click()
	]);
});

test('a v1 database from Phase 1 upgrades to v2 with every record kept (FR-091 AC-1)', async ({
	page
}) => {
	await page.goto('/');
	await appOpened(page);
	// Replace the app's database with a v1 one holding a record in each store. Deleting it makes
	// the app close its connection (the "updated in another tab" path), so the delete can run.
	const seeded = await page.evaluate(
		() =>
			new Promise<number>((resolve, reject) => {
				const removal = indexedDB.deleteDatabase('qanchor');
				removal.onerror = () => reject(removal.error);
				removal.onsuccess = () => {
					const request = indexedDB.open('qanchor', 1);
					request.onupgradeneeded = () => {
						const db = request.result;
						db.createObjectStore('endpoints', { keyPath: 'networkId' });
						const wallets = db.createObjectStore('wallets', { keyPath: 'id' });
						wallets.createIndex('byNetworkAddress', ['networkId', 'address']);
						db.createObjectStore('faucets', { keyPath: 'id' });
						const tx = request.transaction!;
						tx.objectStore('endpoints').put({
							networkId: 'eth-sepolia',
							url: 'https://rpc.example.dev'
						});
						tx.objectStore('wallets').put({
							id: 'w1',
							label: 'QA main',
							chain: 'evm',
							networkId: 'eth-sepolia',
							address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
							notes: '',
							createdAt: 1,
							updatedAt: 1
						});
						tx.objectStore('faucets').put({
							id: 'f1',
							networkId: 'eth-sepolia',
							label: 'Drip',
							url: 'https://faucet.example.dev'
						});
					};
					request.onsuccess = () => {
						const version = request.result.version;
						request.result.close();
						resolve(version);
					};
					request.onerror = () => reject(request.error);
				};
			})
	);
	expect(seeded).toBe(1);

	await page.goto('/wallets');
	await expect(page.getByText('QA main').first()).toBeVisible();

	expect(await rawOpen(page)).toEqual({ version: 2, stores: V2_STORES });
	const counts = await page.evaluate(
		() =>
			new Promise<Record<string, number>>((resolve, reject) => {
				const request = indexedDB.open('qanchor');
				request.onerror = () => reject(request.error);
				request.onsuccess = () => {
					const db = request.result;
					const names = [...db.objectStoreNames];
					const tx = db.transaction(names);
					const out: Record<string, number> = {};
					for (const name of names) {
						const count = tx.objectStore(name).count();
						count.onsuccess = () => (out[name] = count.result);
					}
					tx.oncomplete = () => (db.close(), resolve(out));
				};
			})
	);
	expect(counts).toEqual({
		endpoints: 1,
		faucets: 1,
		meta: 0,
		results: 0,
		runs: 0,
		testCases: 0,
		wallets: 1
	});
});
