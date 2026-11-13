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

test('a normal visit opens schema v1 and shows no banner', async ({ page }) => {
	await page.goto('/');
	await appOpened(page);

	expect(await rawOpen(page)).toEqual({
		version: 1,
		stores: ['endpoints', 'faucets', 'wallets']
	});
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
	// A database from a newer version makes opening v1 fail asynchronously with VersionError.
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
	expect(await rawOpen(other, 2)).toMatchObject({ version: 2 });

	await expect(outdatedBanner(page)).toBeVisible();
	await expect(page.getByText('Reload this tab to keep saving your changes.')).toBeVisible();
	await Promise.all([
		page.waitForEvent('load'),
		page.getByRole('button', { name: 'Reload' }).click()
	]);
});
