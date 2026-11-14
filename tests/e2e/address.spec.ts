import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Address generator, Generate tab (T-021): FR-010 AC-1, AC-3, AC-4; FR-011 AC-1, AC-4; FR-012;
// US-001, US-002; NFR-005, NFR-012, NFR-019. Encodings and variants are unit-tested in
// src/lib/core/chains; this checks the page, the worker, and the export.

async function openGenerator(page: Page): Promise<void> {
	await page.goto('/address');
	await appOpened(page);
}

const generate = (page: Page) => page.getByRole('button', { name: /^Generat/ });
const table = (page: Page) => page.getByRole('table', { name: 'Generated addresses' });
const addressCells = (page: Page) => table(page).locator('tbody tr td:nth-child(2)');
const select = (page: Page, label: string) =>
	page.getByRole('combobox', { name: label, exact: true });
const count = (page: Page) => page.getByRole('textbox', { name: 'Valid addresses' });

async function tick(page: Page, ...labels: string[]): Promise<void> {
	for (const label of labels)
		await page.getByRole('checkbox', { name: label, exact: true }).check();
}

async function run(page: Page, rows: number): Promise<void> {
	await generate(page).click();
	await expect(table(page).locator('tbody tr')).toHaveCount(rows);
}

test('Address generator is the first tool in the navigation and on the index', async ({ page }) => {
	await page.goto('/');
	// First of the Blockchain group (design S-00); later tools are added after it.
	const nav = await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link')
		.filter({ hasNotText: 'QAnchor' })
		.allTextContents();
	expect(nav[0].trim()).toBe('Address generator');
	await expect(page.getByRole('main').getByRole('link').first()).toHaveText('Address generator');

	await page.getByRole('main').getByRole('link', { name: 'Address generator' }).click();

	await expect(page).toHaveTitle('Address generator · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Address generator');
});

test('before generating: the empty state, and the output actions disabled (FR-012 AC-2)', async ({
	page
}) => {
	await openGenerator(page);

	await expect(
		page.getByText(
			'Pick a chain and a count, then generate. Add invalid variants for negative tests.'
		)
	).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Copy all' })).toBeDisabled();
	await expect(generate(page)).toBeEnabled();
});

for (const text of ['0', '-1', '501', 'ten', '']) {
	test(`a count of ${JSON.stringify(text)} blocks generation with the allowed range (FR-010 AC-3)`, async ({
		page
	}) => {
		await openGenerator(page);

		await count(page).fill(text);

		await expect(count(page)).toHaveAccessibleDescription(/^Enter a whole number from 1 to 500\./);
		await expect(generate(page)).toBeDisabled();
	});
}

test('generates exactly N EIP-55 addresses in a worker and announces them (FR-010 AC-1, NFR-005)', async ({
	page
}) => {
	const workers: string[] = [];
	page.on('worker', (worker) => workers.push(worker.url()));
	await openGenerator(page);
	// The worker starts with the first job, not with the page.
	expect(workers).toEqual([]);
	await count(page).fill('12');

	await run(page, 12);

	expect(workers).toHaveLength(1);
	expect(workers[0]).toMatch(/address\.worker/);
	for (const cell of await addressCells(page).allTextContents()) {
		expect(cell).toMatch(/^0x[0-9a-fA-F]{40}$/);
	}
	await expect(page.locator('[aria-live="polite"]')).toHaveText('12 addresses generated');
	await expect(page.getByText('12 valid', { exact: true })).toBeVisible();
});

test('generating again gives a different set (FR-010 AC-4)', async ({ page }) => {
	await openGenerator(page);
	await count(page).fill('5');
	await run(page, 5);
	const first = await addressCells(page).allTextContents();

	await generate(page).click();

	await expect.poll(() => addressCells(page).allTextContents()).not.toEqual(first);
	const second = await addressCells(page).allTextContents();
	expect(second.filter((a) => first.includes(a))).toEqual([]);
});

test('Bitcoin type and network choose the encoding', async ({ page }) => {
	await openGenerator(page);
	await select(page, 'Chain').selectOption('Bitcoin');
	await select(page, 'Address type').selectOption('P2TR (Taproot)');
	await select(page, 'Network').selectOption('Testnet');
	await count(page).fill('3');

	await run(page, 3);

	for (const cell of await addressCells(page).allTextContents()) expect(cell).toMatch(/^tb1p/);
	await expect(table(page)).toContainText('Bech32m, witness v1, 32-byte tweaked key (BIP-86).');
});

test('only variants that apply to the chain are offered (FR-011 AC-4)', async ({ page }) => {
	await openGenerator(page);
	const offered = () => page.getByRole('group', { name: 'Invalid variants' }).getByRole('checkbox');
	await expect(page.getByRole('checkbox', { name: 'Wrong EIP-55 checksum' })).toBeVisible();

	await select(page, 'Chain').selectOption('Solana');
	await expect(page.getByRole('checkbox', { name: 'Wrong EIP-55 checksum' })).toHaveCount(0);
	await expect(page.getByRole('checkbox', { name: 'Missing 0x prefix' })).toHaveCount(0);
	await expect(page.getByRole('group', { name: 'Valid but risky' })).toContainText(
		'Off-curve address'
	);

	await select(page, 'Chain').selectOption('Bitcoin');
	await select(page, 'Address type').selectOption('P2WPKH (native SegWit)');
	await expect(offered()).toHaveCount(10);
	await expect(page.getByRole('checkbox', { name: 'Bech32/Bech32m mix-up' })).toBeVisible();
	await expect(page.getByRole('group', { name: 'Valid but risky' })).toHaveCount(0);
});

test('variant rows show the address, status, label, and reason (FR-011 AC-1, AC-3, AC-5)', async ({
	page
}) => {
	await openGenerator(page);
	await count(page).fill('2');
	await tick(page, 'Wrong EIP-55 checksum', 'Look-alike from another chain', 'Zero address');
	await expect(
		page.getByText('5 rows: 2 valid addresses plus one row per selected variant.')
	).toBeVisible();

	await run(page, 5);

	const rows = table(page).locator('tbody tr');
	await expect(rows.nth(2)).toContainText('Invalid');
	await expect(rows.nth(2)).toContainText('Wrong EIP-55 checksum');
	await expect(rows.nth(3)).toContainText('Source chain: Tron. Valid there, not an EVM address.');
	await expect(addressCells(page).nth(3)).toHaveText(/^T/);
	await expect(rows.nth(4)).toContainText('Risky');
	await expect(rows.nth(4)).toContainText('Zero address');
	await expect(page.getByText('1 risky', { exact: true })).toBeVisible();
});

test('a variant ticked for one chain is not generated for another', async ({ page }) => {
	await openGenerator(page);
	await count(page).fill('1');
	await tick(page, 'Missing 0x prefix');
	await select(page, 'Chain').selectOption('Tron');

	await run(page, 1);

	await select(page, 'Chain').selectOption('EVM');
	await expect(page.getByRole('checkbox', { name: 'Missing 0x prefix' })).toBeChecked();
});

for (const kind of ['csv', 'json'] as const) {
	test(`${kind.toUpperCase()} export has every FR-012 field, values byte for byte`, async ({
		page
	}) => {
		await openGenerator(page);
		await count(page).fill('2');
		await tick(page, 'Leading/trailing whitespace', 'Zero address');
		await run(page, 4);
		await page.getByRole('combobox', { name: 'Export format' }).selectOption(kind);

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download' }).click()
		]);

		expect(download.suggestedFilename()).toBe(`addresses-evm.${kind}`);
		const text = await readFile((await download.path())!, 'utf8');
		if (kind === 'csv') {
			const lines = text.split('\r\n');
			expect(lines[0]).toBe('address,chain,type,network,validity,variantId,reason');
			expect(lines[1]).toMatch(/^0x[0-9a-fA-F]{40},evm,standard,any,valid,evm\.valid,20 bytes/);
			expect(lines[3]).toMatch(/^ 0x[0-9a-fA-F]{40} ,evm,standard,any,invalid,evm\.whitespace,/);
			expect(lines[4]).toMatch(/,valid-but-risky,evm\.zero-address,/);
		} else {
			const records = JSON.parse(text) as Record<string, string>[];
			expect(Object.keys(records[0])).toEqual([
				'address',
				'chain',
				'type',
				'network',
				'validity',
				'variantId',
				'reason'
			]);
			expect(records[2].address).toMatch(/^ 0x[0-9a-fA-F]{40} $/);
			expect(records[3]).toMatchObject({
				address: `0x${'0'.repeat(40)}`,
				validity: 'valid-but-risky'
			});
		}
	});
}

test('invisible characters are shown in the table and copied as they are', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async (text: string) => {
			(window as unknown as { copied: string[] }).copied ??= [];
			(window as unknown as { copied: string[] }).copied.push(text);
		};
	});
	await openGenerator(page);
	await count(page).fill('1');
	await tick(page, 'Zero-width character', 'Empty string');
	await run(page, 3);

	await expect(addressCells(page).nth(1)).toContainText('⟨ZWSP⟩');
	await expect(addressCells(page).nth(2)).toHaveText('(empty)');
	await page.getByRole('button', { name: 'Copy address 2' }).click();

	const [copied] = await page.evaluate(() => (window as unknown as { copied: string[] }).copied);
	expect(copied).toContain('\u200b');
	expect(copied).not.toContain('⟨');
});

test('no private key appears on the page (NFR-012)', async ({ page }) => {
	await openGenerator(page);
	await count(page).fill('20');
	await run(page, 20);

	// A secp256k1 or ed25519 private key is 32 bytes: 64 hex digits.
	expect(await page.locator('body').innerText()).not.toMatch(/[0-9a-fA-F]{64}/);
});

test('leaving the page stops the worker (NFR-019)', async ({ page }) => {
	await openGenerator(page);
	const workerStarted = page.waitForEvent('worker');
	await count(page).fill('1');
	await run(page, 1);
	const worker = await workerStarted;
	const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Unit converter' })
		.click();

	await expect(page).toHaveURL(/\/units$/);
	await closed;
});

test('500 addresses generate and render (FR-010 AC-3)', async ({ page }) => {
	await openGenerator(page);
	await count(page).fill('500');

	await run(page, 500);

	await expect(page.getByText('500 addresses', { exact: true })).toBeVisible();
});

test('on a phone the form stacks and the page does not scroll sideways', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await openGenerator(page);
	await count(page).fill('3');
	await run(page, 3);

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBe(0);
});

const scan = async (page: Page) =>
	(
		await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
	).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);

test('the Generate tab has no WCAG 2.1 AA violations, with results and a count error', async ({
	page
}) => {
	await openGenerator(page);
	await tick(page, 'Wrong length', 'All-lowercase');
	await run(page, 12);
	await table(page).evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);
	await count(page).fill('0');

	expect(await scan(page)).toEqual([]);
});
