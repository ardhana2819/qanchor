import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Settings page (T-011): back up and restore (J-6, FR-003, EC-020). Guards are unit-tested in
// src/lib/storage/backup.test.ts; this checks the page against real IndexedDB.

interface Records {
	endpoints: { networkId: string; url: string }[];
	wallets: Record<string, unknown>[];
	faucets: Record<string, unknown>[];
	testCases: Record<string, unknown>[];
	runs: Record<string, unknown>[];
	results: Record<string, unknown>[];
	/** Read back with each image's bytes as an array of numbers (see `readRecords`). */
	screenshots: Record<string, unknown>[];
}

const STORES = [
	'endpoints',
	'wallets',
	'faucets',
	'testCases',
	'runs',
	'results',
	'screenshots'
] as const;
const NO_QA = { testCases: [], runs: [], results: [], screenshots: [] };

const testCase = {
	id: 'c1',
	number: 4,
	title: 'Deposit USDT on Tron',
	preconditions: '',
	steps: [{ action: 'Open Deposit', expected: 'The address is shown' }],
	expected: '',
	tags: ['deposit'],
	priority: 'high',
	createdAt: 1794500000000,
	updatedAt: 1794500000000
};
const snapshot = {
	id: testCase.id,
	number: testCase.number,
	title: testCase.title,
	preconditions: testCase.preconditions,
	steps: testCase.steps,
	expected: testCase.expected,
	tags: testCase.tags,
	priority: testCase.priority
};
const run = {
	id: 'r1',
	name: 'Smoke',
	release: 'v2.3.0',
	environment: '',
	status: 'in-progress',
	cases: [snapshot],
	createdAt: 1794500000000,
	updatedAt: 1794500000000,
	completedAt: null
};
const result = {
	runId: 'r1',
	caseNumber: 4,
	status: 'fail',
	failedStep: 1,
	actual: 'No address',
	reason: '',
	notes: '',
	linkedIssue: 'PAY-1',
	updatedAt: 1794500000000
};

const wallet = (id: string, label: string) => ({
	id,
	label,
	chain: 'evm',
	networkId: 'eth-sepolia',
	address: `0x${id.padStart(40, '0')}`,
	notes: '',
	createdAt: 1794500000000,
	updatedAt: 1794500000000
});

const STORED: Records = {
	endpoints: [],
	wallets: Array.from({ length: 12 }, (_, i) => wallet(`s${i}`, `Stored ${i + 1}`)),
	faucets: [
		{ id: 'f1', networkId: 'eth-sepolia', label: 'Team faucet', url: 'https://faucet.example.dev' }
	],
	testCases: [testCase],
	runs: [run],
	results: [result],
	screenshots: []
};

/** A Phase 1 (schema version 1) backup: no Phase 2 lists (FR-091 AC-3). */
const BACKUP = {
	app: 'qanchor',
	schemaVersion: 1,
	exportedAt: '2026-11-02T08:14:00.000Z',
	data: {
		settings: { theme: 'dark' },
		endpoints: [{ networkId: 'eth-sepolia', url: 'https://rpc.example.dev' }],
		wallets: [wallet('b1', 'QA main'), wallet('b2', 'Withdraw tests'), wallet('b3', 'Bridge')],
		faucets: []
	}
};

/** Writes or reads every store directly, as a check that does not go through the app. */
function writeRecords(page: Page, records: Records) {
	return page.evaluate(
		({ records, stores }) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction(stores, 'readwrite');
					for (const name of stores) {
						tx.objectStore(name).clear();
						for (const record of records[name]) tx.objectStore(name).put(record);
					}
					tx.oncomplete = () => (db.close(), resolve());
					tx.onerror = () => reject(tx.error);
				};
			}),
		{ records, stores: [...STORES] }
	);
}

function readRecords(page: Page): Promise<Records> {
	return page.evaluate(
		(stores) =>
			new Promise<Records>((resolve) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction(stores);
					const out = {} as Records;
					for (const name of stores) {
						const all = tx.objectStore(name).getAll();
						all.onsuccess = () =>
							(out[name] = all.result.map((record) =>
								record.bytes instanceof ArrayBuffer
									? { ...record, bytes: [...new Uint8Array(record.bytes)] }
									: record
							));
					}
					tx.oncomplete = () => (db.close(), resolve(out));
				};
			}),
		[...STORES]
	);
}

/**
 * Stores screenshots of the stored result, each image `size` bytes made in the page (a test
 * argument cannot carry an ArrayBuffer). Byte i of image k is (i + k) % 256.
 */
function writeScreenshots(page: Page, sizes: number[]) {
	return page.evaluate(
		(sizes) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction('screenshots', 'readwrite');
					sizes.forEach((size, k) => {
						const bytes = new Uint8Array(size).map((_, i) => (i + k) % 256);
						tx.objectStore('screenshots').put({
							id: `shot-${k + 1}`,
							owner: ['result', 'r1', 4],
							n: k + 1,
							mediaType: k % 2 ? 'image/jpeg' : 'image/webp',
							width: 1920,
							height: 1080,
							size,
							createdAt: 1794500000000 + k,
							bytes: bytes.buffer
						});
					});
					tx.oncomplete = () => (db.close(), resolve());
					tx.onerror = () => reject(tx.error);
				};
			}),
		sizes
	);
}

async function openSettings(page: Page, records: Records = STORED): Promise<void> {
	await page.goto('/settings');
	await appOpened(page);
	await writeRecords(page, records);
	await expect(page.getByRole('button', { name: 'Import backup…' })).toBeEnabled();
}

const sortById = (records: Records) => ({
	...records,
	wallets: [...records.wallets].sort((a, b) => String(a.id).localeCompare(String(b.id)))
});

async function chooseFile(page: Page, name: string, contents: string): Promise<void> {
	await page
		.getByLabel('Backup file to import')
		.setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(contents) });
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Replace all data?' });

test('Settings is linked at the bottom of the sidebar and marked as the current page', async ({
	page
}) => {
	await page.goto('/');
	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Settings' })
		.click();

	await expect(page).toHaveURL(/\/settings$/);
	await expect(page).toHaveTitle('Settings · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
	await expect(page.getByRole('link', { name: 'Settings' })).toHaveAttribute(
		'aria-current',
		'page'
	);
});

test('Export downloads every record with the schema version and the theme (FR-003 AC-1)', async ({
	page
}) => {
	await openSettings(page);
	await page.getByRole('main').getByRole('radio', { name: 'Dark' }).check();

	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export backup' }).click()
	]);

	expect(download.suggestedFilename()).toMatch(/^qanchor-backup-\d{4}-\d{2}-\d{2}\.json$/);
	const file = JSON.parse(await readFile((await download.path())!, 'utf8'));
	expect(file).toMatchObject({ app: 'qanchor', schemaVersion: 3 });
	expect(Date.parse(file.exportedAt)).not.toBeNaN();
	const records = Object.fromEntries(STORES.map((name) => [name, file.data[name]])) as Records;
	expect(sortById(records)).toEqual(sortById(STORED));
	// The key counter is rebuilt on import, not exported (plan finding F-5).
	expect(Object.keys(file.data).sort()).toEqual([...STORES, 'settings'].sort());
	expect(file.data.settings).toEqual({ theme: 'dark' });
	await expect(page.locator('.toast')).toHaveText(`Exported ${download.suggestedFilename()}`);
});

test('import shows stored-now against after-import counts, then replaces everything (FR-003 AC-2, AC-3)', async ({
	page
}) => {
	await openSettings(page);

	await chooseFile(page, 'qanchor-backup-2026-11-02.json', JSON.stringify(BACKUP));

	await expect(dialog(page)).toBeVisible();
	await expect(dialog(page)).toContainText('qanchor-backup-2026-11-02.json');
	const rows = dialog(page).getByRole('row');
	await expect(rows.filter({ hasText: 'Wallets' })).toHaveText(/Wallets\s*12\s*3/);
	await expect(rows.filter({ hasText: 'Endpoint overrides' })).toHaveText(
		/Endpoint overrides\s*0\s*1/
	);
	await expect(rows.filter({ hasText: 'Faucet links' })).toHaveText(/Faucet links\s*1\s*0/);
	// A version 1 file has no Phase 2 records, so they end empty (FR-091 AC-3, EC-037).
	await expect(rows.filter({ hasText: 'Test cases' })).toHaveText(/Test cases\s*1\s*0/);
	await expect(rows.filter({ hasText: 'Test runs' })).toHaveText(/Test runs\s*1\s*0/);
	await expect(rows.filter({ hasText: 'Results' })).toHaveText(/Results\s*1\s*0/);
	await expect(rows.filter({ hasText: 'Screenshots' })).toHaveText(/Screenshots\s*0\s*0/);
	await expect(rows.filter({ hasText: 'Theme' })).toHaveText(/Theme\s*system\s*dark/);
	await expect(dialog(page)).toContainText(
		'Importing replaces all existing data. This cannot be undone.'
	);
	// The safe choice has focus first: Cancel comes first in the dialog, so the browser focuses it.
	await expect(dialog(page).getByRole('button', { name: 'Cancel' })).toBeFocused();

	await dialog(page).getByRole('button', { name: 'Replace all data' }).click();

	await expect(page.getByText('Import complete', { exact: true }).first()).toBeVisible();
	await expect(page.getByRole('main')).toContainText(
		'Imported 3 wallets, 1 endpoint override, 0 faucet links, 0 test cases, 0 test runs, 0 results, 0 screenshots, and the theme setting.'
	);
	expect(sortById(await readRecords(page))).toEqual(
		sortById({
			endpoints: BACKUP.data.endpoints,
			wallets: BACKUP.data.wallets,
			faucets: [],
			...NO_QA
		})
	);
	await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
	expect(await page.evaluate(() => localStorage.getItem('qanchor.theme'))).toBe('dark');
});

test('an export imports back to the same data (round trip)', async ({ page }) => {
	await openSettings(page);
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export backup' }).click()
	]);
	const exported = await readFile((await download.path())!, 'utf8');
	await writeRecords(page, {
		endpoints: [],
		wallets: [wallet('x', 'Other')],
		faucets: [],
		...NO_QA
	});

	await chooseFile(page, download.suggestedFilename(), exported);
	await dialog(page).getByRole('button', { name: 'Replace all data' }).click();

	await expect(page.getByRole('main')).toContainText(
		'Imported 12 wallets, 0 endpoint overrides, 1 faucet link, 1 test case, 1 test run, 1 result'
	);
	expect(sortById(await readRecords(page))).toEqual(sortById(STORED));
});

test.describe('screenshots in the backup (FR-091 AC-2, AC-4)', () => {
	const sizeDialog = (page: Page) => page.getByRole('dialog', { name: 'Download backup?' });

	test('the file size shows before the download, and Cancel downloads nothing', async ({
		page
	}) => {
		await openSettings(page);
		await writeScreenshots(page, [300_000, 200_000]);
		const downloads: string[] = [];
		page.on('download', (d) => downloads.push(d.suggestedFilename()));

		await page.getByRole('button', { name: 'Export backup' }).click();

		await expect(sizeDialog(page)).toBeVisible();
		await expect(page.getByTestId('settings-export-size')).toHaveText(
			/^qanchor-backup-\d{4}-\d{2}-\d{2}\.json, 672 KB, with 2 screenshots\.$/
		);
		await sizeDialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(sizeDialog(page)).toBeHidden();
		await expect(page.getByRole('button', { name: 'Export backup' })).toBeEnabled();
		expect(downloads).toEqual([]);
	});

	test('Download saves a file of that size with each image as base64', async ({ page }) => {
		await openSettings(page);
		await writeScreenshots(page, [3, 4]);
		await page.getByRole('button', { name: 'Export backup' }).click();
		const shown = await page.getByTestId('settings-export-size').textContent();

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			sizeDialog(page).getByRole('button', { name: 'Download' }).click()
		]);

		const bytes = await readFile((await download.path())!);
		// Shown as file managers show it: decimal kilobytes, one decimal below 10.
		expect(shown).toContain(
			`, ${Number((bytes.length / 1000).toFixed(1))} KB, with 2 screenshots.`
		);
		const file = JSON.parse(bytes.toString('utf8'));
		expect(file.data.screenshots).toEqual([
			{
				id: 'shot-1',
				owner: ['result', 'r1', 4],
				n: 1,
				mediaType: 'image/webp',
				width: 1920,
				height: 1080,
				createdAt: 1794500000000,
				data: Buffer.from([0, 1, 2]).toString('base64')
			},
			expect.objectContaining({ id: 'shot-2', mediaType: 'image/jpeg', data: 'AQIDBA==' })
		]);
		await expect(page.locator('.toast')).toHaveText(`Exported ${download.suggestedFilename()}`);
	});

	test('an export with screenshots imports back to the same images', async ({ page }) => {
		await openSettings(page);
		await writeScreenshots(page, [5, 6]);
		const before = await readRecords(page);
		await page.getByRole('button', { name: 'Export backup' }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			sizeDialog(page).getByRole('button', { name: 'Download' }).click()
		]);
		await writeRecords(page, { endpoints: [], wallets: [], faucets: [], ...NO_QA });

		await page.getByLabel('Backup file to import').setInputFiles((await download.path())!);
		const rows = dialog(page).getByRole('row');
		await expect(rows.filter({ hasText: 'Screenshots' })).toHaveText(/Screenshots\s*0\s*2/);
		await dialog(page).getByRole('button', { name: 'Replace all data' }).click();

		await expect(page.getByRole('main')).toContainText('1 result, 2 screenshots, and the theme');
		expect(sortById(await readRecords(page))).toEqual(sortById(before));
	});

	test('a v2 file from slice 2a imports with no screenshots (EC-037)', async ({ page }) => {
		await openSettings(page);
		await writeScreenshots(page, [3]);
		const v2 = { ...BACKUP, schemaVersion: 2, data: { ...BACKUP.data, ...STORED } };
		delete (v2.data as Partial<Records>).screenshots;

		await chooseFile(page, 'qanchor-backup-v2.json', JSON.stringify(v2));
		const rows = dialog(page).getByRole('row');
		await expect(rows.filter({ hasText: 'Screenshots' })).toHaveText(/Screenshots\s*1\s*0/);
		await dialog(page).getByRole('button', { name: 'Replace all data' }).click();

		await expect(page.getByText('Import complete', { exact: true }).first()).toBeVisible();
		expect((await readRecords(page)).screenshots).toEqual([]);
	});

	test('the download dialog has no WCAG 2.1 AA violations', async ({ page }) => {
		await openSettings(page);
		await writeScreenshots(page, [3]);
		await page.getByRole('button', { name: 'Export backup' }).click();
		await expect(sizeDialog(page)).toBeVisible();
		await sizeDialog(page).evaluate((el) =>
			Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
		);

		expect(await scan(page)).toEqual([]);
	});
});

for (const how of ['Cancel', 'Escape'] as const) {
	test(`${how} closes the confirmation and changes nothing`, async ({ page }) => {
		await openSettings(page);
		await chooseFile(page, 'backup.json', JSON.stringify(BACKUP));
		await expect(dialog(page)).toBeVisible();

		if (how === 'Cancel') await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		else await page.keyboard.press('Escape');

		await expect(dialog(page)).toBeHidden();
		await expect(page.locator('.toast')).toHaveText('Import cancelled. Nothing was changed.');
		expect(sortById(await readRecords(page))).toEqual(sortById(STORED));
		await expect(page.locator('html')).not.toHaveAttribute('data-theme');
	});
}

const BAD_FILES: [string, string, string][] = [
	['wallets.csv', 'label,address\nQA main,0x5a\n', 'The file is not valid JSON.'],
	['qanchor-backup-cut.json', JSON.stringify(BACKUP).slice(0, 120), 'The file is not valid JSON.'],
	[
		'metamask-state-logs.json',
		JSON.stringify({ metamask: {} }),
		'This is not a QAnchor backup file.'
	],
	[
		'qanchor-backup-2027-01-15.json',
		JSON.stringify({ ...BACKUP, schemaVersion: 4 }),
		'Unknown schema version 4. This backup comes from a newer version of QAnchor.'
	],
	[
		'qanchor-backup-hand-edited.json',
		JSON.stringify({
			...BACKUP,
			data: {
				...BACKUP.data,
				wallets: [BACKUP.data.wallets[0], { ...BACKUP.data.wallets[1], address: undefined }]
			}
		}),
		'Wallet 2 of 2 ("Withdraw tests") has no address.'
	],
	[
		'qanchor-backup-orphan-result.json',
		JSON.stringify({
			...BACKUP,
			schemaVersion: 2,
			data: { ...BACKUP.data, ...STORED, results: [{ ...result, caseNumber: 7 }] }
		}),
		'Result 1 of 1 ("TC-7") in run "Smoke" is for a case that is not in the run.'
	],
	[
		'qanchor-backup-bad-image.json',
		JSON.stringify({
			...BACKUP,
			schemaVersion: 3,
			data: {
				...BACKUP.data,
				...STORED,
				screenshots: [
					{
						id: 's1',
						owner: ['result', 'r1', 4],
						n: 1,
						mediaType: 'image/webp',
						width: 10,
						height: 10,
						createdAt: 1,
						data: 'not base64!'
					}
				]
			}
		}),
		'Screenshot 1 of 1 ("TC-4") has image data that is not valid base64.'
	]
];

for (const [name, contents, reason] of BAD_FILES) {
	test(`${name}: the error names the reason and nothing is written (FR-003 AC-4, EC-020)`, async ({
		page
	}) => {
		await openSettings(page);

		await chooseFile(page, name, contents);

		const alert = page.getByRole('alert');
		await expect(alert).toContainText('Import failed. Nothing was changed.');
		await expect(alert).toContainText(`${name}: ${reason}`);
		await expect(alert).toBeFocused();
		await expect(dialog(page)).toBeHidden();
		expect(sortById(await readRecords(page))).toEqual(sortById(STORED));
	});
}

test('Import backup opens the file chooser from the keyboard', async ({ page }) => {
	await openSettings(page);
	await page.getByRole('button', { name: 'Import backup…' }).focus();

	const [chooser] = await Promise.all([
		page.waitForEvent('filechooser'),
		page.keyboard.press('Enter')
	]);

	expect(chooser.isMultiple()).toBe(false);
});

test('with storage unavailable, export and import are disabled with the reason (EC-001)', async ({
	page
}) => {
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await page.goto('/settings');

	await expect(
		page.getByText('Export and import need storage, which is unavailable in this tab.')
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Export backup' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Import backup…' })).toBeDisabled();
});

const scan = async (page: Page) =>
	(
		await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
	).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);

test('the Settings page has no WCAG 2.1 AA violations', async ({ page }) => {
	await openSettings(page);
	expect(await scan(page)).toEqual([]);
});

// A separate test: in Firefox, choosing a file after axe has run in the page crashes the page
// (a Playwright/Firefox issue, not the app), so the file is chosen before the scan.
test('the import confirmation has no WCAG 2.1 AA violations', async ({ page }) => {
	await openSettings(page);
	await chooseFile(page, 'backup.json', JSON.stringify(BACKUP));
	await expect(dialog(page)).toBeVisible();
	await dialog(page).evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);

	expect(await scan(page)).toEqual([]);
});
