import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Dummy data page (T-031): FR-080, FR-081 AC-8, AC-9, FR-082 AC-2, FR-083, FR-084, US-009,
// NFR-005, NFR-019. Field rules, presets, and exporters are unit-tested in src/lib/core; this
// checks the page, the worker, and the downloads.

async function open(page: Page): Promise<void> {
	await page.goto('/dummy-data');
	await appOpened(page);
}

const textbox = (page: Page, name: string) => page.getByRole('textbox', { name, exact: true });
const combobox = (page: Page, name: string) => page.getByRole('combobox', { name, exact: true });
const generate = (page: Page) => page.getByRole('button', { name: /^Generat/ });
const table = (page: Page) => page.getByRole('table', { name: 'Generated dummy data' });
const bodyRows = (page: Page) => table(page).locator('tbody tr');

async function run(page: Page, rows: number, seed?: string): Promise<void> {
	await textbox(page, 'Rows').fill(String(rows));
	if (seed !== undefined) await textbox(page, 'Seed').fill(seed);
	await generate(page).click();
	// toHaveCount, not toBeVisible: in Firefox a toBeVisible check on this page followed by an axe
	// scan crashes the content process every time (Playwright 1.65, seen in T-031); toHaveCount
	// waits for the same thing without it.
	await expect(page.getByText(/^Showing (all|the first)/)).toHaveCount(1);
}

async function download(page: Page): Promise<{ name: string; text: string }> {
	const [file] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Download' }).click()
	]);
	return { name: file.suggestedFilename(), text: await readFile((await file.path())!, 'utf8') };
}

test('Dummy data is in the Data group of the navigation and on the index', async ({ page }) => {
	await page.goto('/');
	const data = page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'Data' });
	await expect(data.getByRole('link')).toHaveText(['Dummy data', 'Checklists']);

	await page.getByRole('main').getByRole('link', { name: 'Dummy data' }).click();

	await expect(page).toHaveTitle('Dummy data · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dummy data');
});

test('before generating: the empty state and disabled export (FR-083 AC-5)', async ({ page }) => {
	await open(page);

	await expect(page.getByText('Choose fields and a row count, then generate.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Copy all' })).toBeDisabled();
	await expect(combobox(page, 'Export format')).toBeDisabled();
	await expect(textbox(page, 'Ages as of')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/);
});

test('a bad row count, no fields, or bad ages block generation (FR-080 AC-2)', async ({ page }) => {
	await open(page);
	const rows = textbox(page, 'Rows');

	for (const value of ['0', '10001', 'abc', '1.5', '1e3', '']) {
		await rows.fill(value);
		await expect(rows).toHaveAccessibleDescription(/^Enter a whole number from 1 to 10,000\./);
		await expect(generate(page)).toBeDisabled();
	}
	await rows.fill('10000');
	await expect(generate(page)).toBeEnabled();

	for (const field of [
		'Full name',
		'Gender',
		'Birth date',
		'NIK',
		'NPWP',
		'Phone',
		'Address',
		'Bank account'
	]) {
		await page.getByRole('checkbox', { name: field, exact: true }).uncheck();
	}
	await expect(page.getByRole('group', { name: 'Fields' })).toHaveAccessibleDescription(
		'Select at least one field.'
	);
	await expect(generate(page)).toBeDisabled();
	await page.getByRole('checkbox', { name: 'NIK', exact: true }).check();

	await textbox(page, 'Youngest age').fill('30');
	await textbox(page, 'Oldest age').fill('20');
	await expect(textbox(page, 'Youngest age')).toHaveAccessibleDescription(/^Enter whole ages/);
	await expect(generate(page)).toBeDisabled();
	await textbox(page, 'Oldest age').fill('30');

	await textbox(page, 'Ages as of').fill('2026-02-30');
	await expect(textbox(page, 'Ages as of')).toHaveAccessibleDescription(/^Enter a real date/);
	await expect(generate(page)).toBeDisabled();
});

test('generates a preview with one column per field, from a seed (FR-080 AC-1, FR-082 AC-1)', async ({
	page
}) => {
	await open(page);
	await run(page, 25, 'e2e');

	await expect(bodyRows(page)).toHaveCount(25);
	await expect(page.getByTestId('dummy-preview-row')).toHaveCount(25);
	await expect(page.getByText('Showing all 25 rows.')).toBeVisible();
	await expect(table(page).locator('thead th')).toHaveText([
		'#',
		'Full name',
		'Gender',
		'Birth date',
		'NIK',
		'NPWP',
		'Phone',
		'Address',
		'Bank account'
	]);
	await expect(page.getByText('Fake data for testing only.', { exact: false })).toBeVisible();
	await expect(page.getByTestId('dummy-seed')).toHaveText('e2e');
	const first = await table(page).locator('tbody').first().innerText();

	await generate(page).click();
	await expect(page.getByText('Showing all 25 rows.')).toBeVisible();
	expect(await table(page).locator('tbody').first().innerText()).toBe(first);
});

test('an empty seed gets a random one that is shown and copyable (FR-082 AC-2)', async ({
	page
}) => {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async (text: string) => {
			(window as unknown as { copied: string[] }).copied ??= [];
			(window as unknown as { copied: string[] }).copied.push(text);
		};
	});
	await open(page);
	await run(page, 3);

	const seed = page.getByTestId('dummy-seed');
	await expect(seed).toHaveText(/^[0-9a-f]{16}$/);
	await page.getByRole('button', { name: 'Copy seed' }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { copied?: string[] }).copied))
		.toEqual([await seed.textContent()]);
});

test('10,000 rows: progress, then the first 100 in the preview (FR-080 AC-3, AC-4)', async ({
	page
}) => {
	await open(page);
	await textbox(page, 'Rows').fill('10000');
	await textbox(page, 'Seed').fill('big');
	await generate(page).click();

	await expect(page.getByRole('progressbar', { name: 'Generating 10,000 rows…' })).toBeVisible();
	await expect(page.getByText('Showing the first 100 of 10,000 rows.')).toBeVisible({
		timeout: 30_000
	});
	await expect(bodyRows(page)).toHaveCount(100);
	await expect(page.getByRole('progressbar')).toHaveCount(0);

	const csv = await download(page);
	expect(csv.name).toBe('qanchor-dummy-v1-big.csv');
	// A header and 10,000 rows (no generated value holds a line break), then the final CRLF.
	expect(csv.text.split('\r\n')).toHaveLength(10_002);
	expect(csv.text.trimEnd().split('\r\n')[0]).toBe(
		'name,gender,birth_date,nik,npwp,phone,address,address_street,address_rt,address_rw,' +
			'address_village,address_district,address_regency,address_province,address_postal_code,' +
			'bank_name,bank_code,bank_account'
	);
	await combobox(page, 'Export format').selectOption('json');
	const json = JSON.parse((await download(page)).text) as Record<string, unknown>[];
	expect(json).toHaveLength(10_000);
	expect(typeof json[0].nik).toBe('string');
});

test('a preset sets fields and options, which stay editable (FR-084 AC-1, AC-5)', async ({
	page
}) => {
	await open(page);
	const preset = combobox(page, 'Preset');

	await preset.selectOption('Underage');
	await expect(textbox(page, 'Youngest age')).toHaveValue('10');
	await expect(textbox(page, 'Oldest age')).toHaveValue('16');

	await preset.selectOption('Duplicate NIK');
	const checked = () =>
		page
			.getByRole('group', { name: 'Fields' })
			.getByRole('checkbox', { checked: true })
			.evaluateAll((boxes) => boxes.map((box) => box.parentElement!.textContent!.trim()));
	await expect.poll(checked).toEqual(['Full name', 'Birth date', 'NIK', 'Address']);
	await page.getByRole('checkbox', { name: 'Phone', exact: true }).check();
	await expect(page.getByRole('checkbox', { name: 'Phone', exact: true })).toBeChecked();

	await textbox(page, 'Rows').fill('1');
	await expect(textbox(page, 'Rows')).toHaveAccessibleDescription(
		/^This preset needs at least 2 rows\./
	);
	await expect(generate(page)).toBeDisabled();

	await run(page, 4, 'dup');
	const notes = table(page).locator('tbody tr td:last-child');
	await expect(notes).toHaveText(['', 'Same NIK as row 1.', '', 'Same NIK as row 3.']);
	const nik = (i: number) => table(page).locator('tbody tr').nth(i).locator('td').nth(3);
	await expect(nik(1)).toHaveText((await nik(0).textContent())!);
});

test('the invalid formats preset marks the output as negative-test data (FR-084 AC-3)', async ({
	page
}) => {
	await open(page);
	await combobox(page, 'Preset').selectOption('Invalid formats');
	await run(page, 12, 'neg');

	await expect(page.getByTestId('dummy-negative-note')).toContainText('Negative-test data');
	await expect(table(page).locator('thead th').last()).toHaveText('Note');
	for (const note of await table(page).locator('tbody tr td:last-child').allTextContents()) {
		expect(note).toMatch(/^(NIK|Phone)/);
	}
});

test('non-colliding identifiers come with a warning (FR-081 AC-9)', async ({ page }) => {
	await open(page);
	await expect(page.getByText('Stricter validators may reject these')).toHaveCount(0);

	await combobox(page, 'Identifier realism').selectOption('Non-colliding');

	await expect(page.getByText('Stricter validators may reject these')).toBeVisible();
	await run(page, 5, 'safe');
	for (const nik of await table(page).locator('tbody tr td:nth-child(5)').allTextContents()) {
		expect(nik).toMatch(/^00\d{14}$/);
	}
});

test('SQL export needs a valid table name and records the run (FR-083 AC-3, AC-4)', async ({
	page
}) => {
	await open(page);
	await run(page, 6, "seed with 'quote'");
	await combobox(page, 'Export format').selectOption('sql');
	const table = textbox(page, 'Table name');

	for (const name of ['', 'my-table', 'users;drop']) {
		await table.fill(name);
		await expect(table).toHaveAttribute('aria-invalid', 'true');
		await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
		await expect(page.getByRole('button', { name: 'Copy all' })).toBeDisabled();
	}
	await table.fill('kyc_users');
	await combobox(page, 'SQL quoting').selectOption('MySQL');

	const sql = await download(page);
	expect(sql.name).toBe('qanchor-dummy-v1-seed-with-quote.sql');
	const lines = sql.text.trimEnd().split('\n');
	expect(lines.slice(0, 3)).toEqual([
		'-- QAnchor dummy data: fake, for testing only. Generator version 1.',
		"-- Seed: seed with 'quote'",
		expect.stringMatching(/^-- Ages as of: \d{4}-\d{2}-\d{2}$/)
	]);
	expect(lines.slice(3)).toHaveLength(6);
	for (const line of lines.slice(3)) expect(line).toMatch(/^INSERT INTO `kyc_users` \(`name`, /);
});

test('leaving the page stops the worker (NFR-019)', async ({ page }) => {
	await open(page);
	const workerStarted = page.waitForEvent('worker');
	await run(page, 1, 'w');
	const worker = await workerStarted;
	const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));

	await page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Unit converter' })
		.click();

	await expect(page).toHaveURL(/\/units$/);
	await closed;
});

test('no WCAG 2.1 AA violations, with results, notes, and field errors', async ({ page }) => {
	await open(page);
	await combobox(page, 'Preset').selectOption('Invalid formats');
	await combobox(page, 'Identifier realism').selectOption('Non-colliding');
	await run(page, 12, 'a11y');
	await combobox(page, 'Export format').selectOption('sql');
	await textbox(page, 'Table name').fill('bad name');
	await textbox(page, 'Youngest age').fill('x');
	await table(page).evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);

	expect(await scanA11y(page)).toEqual([]);
});

test('on a phone the form stacks and the page does not scroll sideways', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await open(page);
	await run(page, 3, 'phone');

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBe(0);
});
