import { expect, test, type Page } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Settings, Endpoints section (T-037, FR-041 AC-1 to AC-3). URL rules are unit-tested in
// src/lib/core/endpoint-url.test.ts; this checks the page against real IndexedDB.

const row = (page: Page, networkId: string) => page.locator(`[data-network="${networkId}"]`);
const input = (page: Page) => page.getByRole('textbox', { name: /^Endpoint URL for / });

function storedEndpoints(page: Page): Promise<{ networkId: string; url: string }[]> {
	return page.evaluate(
		() =>
			new Promise((resolve) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const all = db.transaction('endpoints').objectStore('endpoints').getAll();
					all.onsuccess = () => (db.close(), resolve(all.result));
				};
			})
	);
}

async function openSettings(page: Page): Promise<void> {
	await page.goto('/settings');
	await appOpened(page);
	await expect(
		row(page, 'eth').getByRole('button', { name: 'Edit Ethereum endpoint' })
	).toBeEnabled();
}

async function saveUrl(page: Page, networkId: string, name: string, url: string): Promise<void> {
	await row(page, networkId)
		.getByRole('button', { name: `Edit ${name} endpoint` })
		.click();
	await input(page).fill(url);
	await page.getByRole('button', { name: 'Save' }).click();
}

test('every network shows its default endpoint (FR-041 AC-1)', async ({ page }) => {
	await openSettings(page);

	await expect(page.getByRole('heading', { name: 'Endpoints' })).toBeVisible();
	await expect(page.getByTestId('settings-endpoint-row')).toHaveCount(16);
	await expect(row(page, 'eth')).toContainText('https://mainnet.gateway.tenderly.co');
	await expect(row(page, 'bitcoin-testnet4')).toContainText('https://mempool.space/testnet4/api');
	await expect(row(page, 'tron-nile')).toContainText('Testnet');
	await expect(page.getByText('Custom', { exact: true })).toHaveCount(0);
	await expect(page.getByTestId('settings-endpoint-reset')).toHaveCount(0);
});

test('a saved override is stored, survives a reload, and resets to the default (FR-041 AC-3)', async ({
	page
}) => {
	await openSettings(page);

	await saveUrl(page, 'eth-sepolia', 'Ethereum Sepolia', '  https://rpc.example.dev/v3/abc//  ');

	await expect(page.locator('.toast')).toHaveText('Ethereum Sepolia endpoint saved');
	await expect(input(page)).toHaveCount(0);
	await expect(row(page, 'eth-sepolia')).toContainText('https://rpc.example.dev/v3/abc');
	await expect(row(page, 'eth-sepolia')).toContainText('Custom');
	expect(await storedEndpoints(page)).toEqual([
		{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev/v3/abc' }
	]);

	await page.reload();
	await expect(row(page, 'eth-sepolia')).toContainText('https://rpc.example.dev/v3/abc');
	await expect(row(page, 'eth-sepolia')).toContainText('Custom');

	await row(page, 'eth-sepolia')
		.getByRole('button', { name: 'Reset Ethereum Sepolia endpoint to default' })
		.click();

	await expect(page.locator('.toast')).toHaveText('Ethereum Sepolia uses the default endpoint');
	await expect(row(page, 'eth-sepolia')).toContainText('https://sepolia.gateway.tenderly.co');
	await expect(row(page, 'eth-sepolia')).not.toContainText('Custom');
	await expect(
		row(page, 'eth-sepolia').getByRole('button', { name: 'Edit Ethereum Sepolia endpoint' })
	).toBeFocused();
	expect(await storedEndpoints(page)).toEqual([]);
});

test('typing the default URL back removes the override', async ({ page }) => {
	await openSettings(page);
	await saveUrl(page, 'bitcoin', 'Bitcoin', 'https://esplora.example.dev/api');
	await expect(row(page, 'bitcoin')).toContainText('Custom');

	await saveUrl(page, 'bitcoin', 'Bitcoin', 'https://mempool.space/api/');

	await expect(page.locator('.toast')).toHaveText('Bitcoin uses the default endpoint');
	await expect(row(page, 'bitcoin')).not.toContainText('Custom');
	expect(await storedEndpoints(page)).toEqual([]);
});

const BAD_URLS: [string, string, string, string][] = [
	['eth', 'Ethereum', '', 'Enter an endpoint URL, or cancel to keep the current one.'],
	['eth', 'Ethereum', 'rpc.example.dev', 'Enter a full URL, for example https://rpc.example.com.'],
	[
		'eth',
		'Ethereum',
		'http://rpc.example.dev',
		'Use an https:// URL. Plain http:// is allowed only for http://localhost.'
	],
	[
		'eth',
		'Ethereum',
		'https://user:secret@rpc.example.dev',
		'Remove the user name and password from the URL.'
	],
	[
		'bitcoin',
		'Bitcoin',
		'https://esplora.example.dev/api?key=1',
		'it cannot have a query or #fragment.'
	]
];

for (const [networkId, name, url, message] of BAD_URLS) {
	test(`"${url}" for ${name} is refused with a field error and nothing is stored (FR-041 AC-2)`, async ({
		page
	}) => {
		await openSettings(page);

		await saveUrl(page, networkId, name, url);

		await expect(input(page)).toHaveAccessibleDescription(new RegExp(escape(message)));
		await expect(input(page)).toHaveAttribute('aria-invalid', 'true');
		expect(await storedEndpoints(page)).toEqual([]);

		await input(page).fill('https://ok.example.dev');
		await expect(input(page)).not.toHaveAttribute('aria-invalid', 'true');
	});
}

test('http://localhost is allowed for a local node', async ({ page }) => {
	await openSettings(page);
	await saveUrl(page, 'eth', 'Ethereum', 'http://localhost:8545');
	await expect(row(page, 'eth')).toContainText('http://localhost:8545');
	expect(await storedEndpoints(page)).toEqual([{ networkId: 'eth', url: 'http://localhost:8545' }]);
});

test('the editor works from the keyboard: Escape cancels, Enter saves, focus returns', async ({
	page
}) => {
	await openSettings(page);
	const edit = row(page, 'polygon').getByRole('button', { name: 'Edit Polygon endpoint' });
	await edit.focus();

	await page.keyboard.press('Enter');
	await expect(input(page)).toBeFocused();
	await expect(input(page)).toHaveValue('https://polygon.gateway.tenderly.co');
	await page.keyboard.type('https://polygon.example.dev');
	await page.keyboard.press('Escape');
	await expect(input(page)).toHaveCount(0);
	await expect(edit).toBeFocused();
	expect(await storedEndpoints(page)).toEqual([]);

	await page.keyboard.press('Enter');
	await page.keyboard.type('https://polygon.example.dev');
	await page.keyboard.press('Enter');
	await expect(row(page, 'polygon')).toContainText('https://polygon.example.dev');
	await expect(edit).toBeFocused();
});

test('an import shows the imported overrides at once', async ({ page }) => {
	await openSettings(page);
	const backup = {
		app: 'qanchor',
		schemaVersion: 1,
		exportedAt: '2026-11-02T08:14:00.000Z',
		data: {
			settings: { theme: 'system' },
			endpoints: [{ networkId: 'base', url: 'https://base.example.dev' }],
			wallets: [],
			faucets: []
		}
	};
	await page.getByLabel('Backup file to import').setInputFiles({
		name: 'backup.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(backup))
	});
	await page.getByRole('button', { name: 'Replace all data' }).click();

	await expect(row(page, 'base')).toContainText('https://base.example.dev');
	await expect(row(page, 'base')).toContainText('Custom');
});

test('with storage unavailable, the defaults are shown and editing is disabled (EC-001)', async ({
	page
}) => {
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await page.goto('/settings');

	await expect(page.getByTestId('settings-endpoints-status')).toHaveText(
		'Custom endpoints need storage, which is unavailable in this tab. The defaults are used.'
	);
	await expect(row(page, 'eth')).toContainText('https://mainnet.gateway.tenderly.co');
	await expect(page.getByRole('button', { name: 'Edit Ethereum endpoint' })).toBeDisabled();
});

test('the Endpoints section has no WCAG 2.1 AA violations, editor and error open', async ({
	page
}) => {
	await openSettings(page);
	await saveUrl(page, 'tron', 'Tron', 'ftp://tron.example.dev');
	await expect(input(page)).toHaveAttribute('aria-invalid', 'true');

	expect(await scanA11y(page)).toEqual([]);
});

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}
