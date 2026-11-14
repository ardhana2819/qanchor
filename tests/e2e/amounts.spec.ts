import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { appOpened } from './helpers.ts';

// Amount edge cases (T-016): FR-020 to FR-022, US-003, design S-03. The cases themselves are
// unit-tested in src/lib/core/amount/cases.test.ts; this checks the form, table, and export.

async function openAmounts(page: Page): Promise<void> {
	await page.goto('/amounts');
	// Typing before hydration would be lost; the layout opens storage once it is live.
	await appOpened(page);
}

const field = (page: Page, label: string) =>
	page.getByRole('textbox', { name: label, exact: true });
const preset = (page: Page) => page.getByRole('combobox', { name: 'Preset' });
const generate = (page: Page) => page.getByRole('button', { name: 'Generate' });
const table = (page: Page) => page.getByRole('table', { name: 'Edge-case amounts' });
const inputColumn = (page: Page) => table(page).locator('tbody tr td:nth-child(2)');
const liveRegion = (page: Page) => page.locator('[aria-live="polite"]');

async function fill(page: Page, values: Record<string, string>): Promise<void> {
	for (const [label, value] of Object.entries(values)) await field(page, label).fill(value);
}

test('Amount edge cases is listed before the converter, in the nav and on the index', async ({
	page
}) => {
	await page.goto('/');
	await expect(
		page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link')
			.filter({ hasNotText: 'QAnchor' })
	).toHaveText(['Amount edge cases', 'Unit converter', 'Settings']);
	await expect(page.getByRole('main').getByRole('link')).toHaveText([
		'Amount edge cases',
		'Unit converter'
	]);

	await page.getByRole('main').getByRole('link', { name: 'Amount edge cases' }).click();

	await expect(page).toHaveTitle('Amount edge cases · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Amount edge cases');
});

test('before any input: the empty state, Generate and the output actions disabled', async ({
	page
}) => {
	await openAmounts(page);

	await expect(
		page.getByText("Enter the token's decimals to generate edge-case amounts.")
	).toBeVisible();
	await expect(generate(page)).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Download' })).toBeDisabled();
	await expect(page.getByRole('button', { name: 'Copy all' })).toBeDisabled();
});

test('a preset fills in the decimals; typing other decimals makes it Custom (FR-020 AC-2)', async ({
	page
}) => {
	await openAmounts(page);

	await preset(page).selectOption({ label: 'USDT on BNB Smart Chain (18)' });
	await expect(field(page, 'Decimals')).toHaveValue('18');
	await preset(page).selectOption({ label: 'USDT on Tron (6)' });
	await expect(field(page, 'Decimals')).toHaveValue('6');

	await field(page, 'Decimals').fill('7');
	await expect(preset(page)).toHaveValue('custom');
});

test('generates every case with its category and purpose, and announces the count (FR-021)', async ({
	page
}) => {
	await openAmounts(page);
	await preset(page).selectOption({ label: 'USDT on Ethereum (6)' });
	await fill(page, { Balance: '10', 'Network fee': '1.5', Minimum: '1', Maximum: '50000' });

	await generate(page).click();

	await expect(inputColumn(page)).toHaveText([
		'0.000001',
		'1.123456',
		'1.1234567',
		'0',
		'-1',
		'0001',
		'␣1␣',
		'1,5',
		'1,000.50',
		'1.000,50',
		'1e-7',
		'10',
		'10.000001',
		'8.5',
		'8.500001',
		'1.499999',
		'1',
		'0.999999',
		'50000',
		'50000.000001'
	]);
	await expect(page.getByText('20 cases', { exact: true })).toBeVisible();
	await expect(liveRegion(page)).toHaveText('20 cases generated');
	const row = table(page).getByRole('row').filter({ hasText: '8.500001' });
	await expect(row).toContainText('Balance and fee');
	await expect(row).toContainText('amount plus fee exceeds the balance');
	// Every parameter was set, so nothing is omitted.
	await expect(page.getByText(/cases? omitted/)).toHaveCount(0);
});

test('optional cases left out are listed with the reason (FR-020 AC-3)', async ({ page }) => {
	await openAmounts(page);
	await fill(page, { Decimals: '6', Balance: '10' });

	await generate(page).click();

	const note = page.locator('.omitted');
	await expect(note).toContainText('7 cases omitted');
	await expect(note).toContainText(
		'Balance minus fee, Balance minus fee plus one unit: No network fee set.'
	);
	await expect(note).toContainText('Fee greater than balance: No network fee set.');
	await expect(note).toContainText('Minimum, Minimum minus one unit: No minimum set.');
	await expect(note).toContainText('Maximum, Maximum plus one unit: No maximum set.');
});

test('decimals 0 generate no valid fractional case (EC-012)', async ({ page }) => {
	await openAmounts(page);
	await fill(page, { Decimals: '0' });

	await generate(page).click();

	await expect(inputColumn(page).first()).toHaveText('1');
	await expect(table(page)).not.toContainText('Uses all');
	await expect(
		page.getByText('Exactly 0 decimal places: With 0 decimals it is the same')
	).toBeVisible();
});

test('invalid decimals show the allowed format and block Generate (FR-020 AC-1)', async ({
	page
}) => {
	await openAmounts(page);

	await field(page, 'Decimals').fill('37');

	await expect(field(page, 'Decimals')).toHaveAttribute('aria-invalid', 'true');
	await expect(field(page, 'Decimals')).toHaveAccessibleDescription(
		/^Decimals must be a whole number from 0 to 36\./
	);
	await expect(generate(page)).toBeDisabled();
});

test('a parameter with too many decimal places blocks Generate with a field error (FR-020 AC-5)', async ({
	page
}) => {
	await openAmounts(page);
	await fill(page, { Decimals: '6', Balance: '1.1234567' });

	await expect(field(page, 'Balance')).toHaveAccessibleDescription(
		/^Balance has more than 6 decimal places\./
	);
	await expect(generate(page)).toBeDisabled();

	await field(page, 'Balance').fill('1.123456');
	await expect(field(page, 'Balance')).not.toHaveAttribute('aria-invalid');
	await expect(generate(page)).toBeEnabled();
});

test('changing the decimals rechecks the parameters', async ({ page }) => {
	await openAmounts(page);
	await fill(page, { Decimals: '6', Minimum: '0.5' });
	await expect(generate(page)).toBeEnabled();

	await field(page, 'Decimals').fill('0');

	await expect(field(page, 'Minimum')).toHaveAccessibleDescription(
		/^Minimum cannot have decimal places with 0 decimals\./
	);
	await expect(generate(page)).toBeDisabled();
});

test('78-digit limits are computed exactly (FR-021 AC-6)', async ({ page }) => {
	await openAmounts(page);
	const max = (2n ** 256n - 1n).toString();
	await fill(page, { Decimals: '0', Maximum: max });

	await generate(page).click();

	await expect(inputColumn(page).last()).toHaveText((2n ** 256n).toString());
});

test('Enter in a field generates', async ({ page }) => {
	await openAmounts(page);
	await field(page, 'Decimals').fill('8');

	await field(page, 'Decimals').press('Enter');

	await expect(inputColumn(page).first()).toHaveText('0.00000001');
});

for (const kind of ['csv', 'json'] as const) {
	test(`${kind.toUpperCase()} export keeps every input string byte for byte (FR-022 AC-1)`, async ({
		page
	}) => {
		await openAmounts(page);
		await fill(page, { Decimals: '6' });
		await generate(page).click();
		await page.getByRole('combobox', { name: 'Export format' }).selectOption(kind);

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: 'Download' }).click()
		]);

		expect(download.suggestedFilename()).toBe(`amount-cases-d6.${kind}`);
		const text = await readFile((await download.path())!, 'utf8');
		if (kind === 'csv') {
			const lines = text.split('\r\n');
			expect(lines[0]).toBe('input,category,purpose');
			expect(lines).toContain(' 1 ,Format,Surrounding whitespace (a space before and after).');
			expect(lines).toContain('"1,5",Comma vs dot,Comma as the decimal separator.');
			expect(lines).toContain(
				'"1,000.50",Comma vs dot,"Comma as the thousands separator, dot as the decimal separator."'
			);
		} else {
			const records = JSON.parse(text) as { input: string }[];
			expect(records.map((r) => r.input)).toEqual([
				'0.000001',
				'1.123456',
				'1.1234567',
				'0',
				'-1',
				'0001',
				' 1 ',
				'1,5',
				'1,000.50',
				'1.000,50',
				'1e-7'
			]);
			expect(Object.keys(records[0])).toEqual(['input', 'category', 'purpose']);
		}
	});
}

test('Copy on a row copies the literal input, spaces included', async ({ page }) => {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async (text: string) => {
			(window as unknown as { copied: string[] }).copied ??= [];
			(window as unknown as { copied: string[] }).copied.push(text);
		};
	});
	await openAmounts(page);
	await fill(page, { Decimals: '6' });
	await generate(page).click();

	await page.getByRole('button', { name: 'Copy input 7' }).click();

	await expect(page.locator('.toast')).toHaveText('Copied');
	expect(await page.evaluate(() => (window as unknown as { copied: string[] }).copied)).toEqual([
		' 1 '
	]);
});

test('on a phone the form stacks and the page does not scroll sideways', async ({ page }) => {
	await page.setViewportSize({ width: 375, height: 800 });
	await openAmounts(page);
	await fill(page, { Decimals: '18' });
	await generate(page).click();
	await expect(inputColumn(page).first()).toBeVisible();

	const overflow = await page.evaluate(
		() => document.documentElement.scrollWidth - document.documentElement.clientWidth
	);
	expect(overflow).toBe(0);
	const decimals = await field(page, 'Decimals').boundingBox();
	const balance = await field(page, 'Balance').boundingBox();
	expect(decimals && balance && balance.y > decimals.y).toBe(true);
});

const scan = async (page: Page) =>
	(
		await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
	).violations.map((v) => `${v.id}: ${v.nodes[0].target}`);

test('the page has no WCAG 2.1 AA violations with results and the omitted note', async ({
	page
}) => {
	await openAmounts(page);
	await fill(page, { Decimals: '6', Balance: '10' });
	await generate(page).click();
	await table(page).evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);

	expect(await scan(page)).toEqual([]);
});

test('the page has no WCAG 2.1 AA violations with field errors', async ({ page }) => {
	await openAmounts(page);
	await fill(page, { Decimals: '6', Balance: '1,5', Maximum: '1.1234567' });

	expect(await scan(page)).toEqual([]);
});
