import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { hydrated } from './helpers.ts';

// Output actions (T-009, FR-004, EC-023) on /components: Copy, Copy all, Download, and the
// fallback when the clipboard cannot be used.

type ClipboardMode = 'granted' | 'denied' | 'missing';

/**
 * Replaces navigator.clipboard.writeText before the app loads. "granted" records each value
 * (browsers differ in whether a test can read the real clipboard back); "denied" rejects like a
 * browser that refuses; "missing" removes the API, as on an insecure origin.
 */
async function setClipboard(page: Page, mode: ClipboardMode): Promise<void> {
	await page.addInitScript((mode) => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		if (mode === 'missing') {
			Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined });
			return;
		}
		navigator.clipboard.writeText = async (text: string) => {
			if (mode === 'denied') throw new DOMException('Write permission denied.', 'NotAllowedError');
			copied.push(text);
		};
	}, mode);
}

const copiedValues = (page: Page) =>
	page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

async function open(page: Page, mode: ClipboardMode): Promise<void> {
	await setClipboard(page, mode);
	await page.goto('/components');
	await hydrated(page);
}

async function generateRows(page: Page, total: number): Promise<void> {
	await page.getByRole('textbox', { name: 'Count' }).fill(String(total));
	await page
		.getByRole('form', { name: 'Example form' })
		.getByRole('button', { name: /^Generat/ })
		.click();
	await expect(page.locator('tbody tr')).toHaveCount(total);
}

/** The rows as the table shows them, in export field order. */
function tableRows(page: Page): Promise<string[][]> {
	return page
		.locator('tbody tr')
		.evaluateAll((rows) =>
			rows.map((row) =>
				[...row.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent!.trim())
			)
		);
}

const toolbarButton = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const format = (page: Page) => page.getByRole('combobox', { name: 'Export format' });
const liveRegion = (page: Page) => page.locator('[aria-live="polite"]');

test('output actions are disabled until there is output (FR-012 AC-2)', async ({ page }) => {
	await open(page, 'granted');

	await expect(page.getByText('No rows yet')).toBeVisible();
	await expect(toolbarButton(page, 'Copy all')).toBeDisabled();
	await expect(toolbarButton(page, 'Download')).toBeDisabled();
	await expect(format(page)).toBeDisabled();

	await generateRows(page, 3);
	await expect(page.getByText('3 rows', { exact: true })).toBeVisible();
	await expect(toolbarButton(page, 'Copy all')).toBeEnabled();
});

test('Copy puts the exact value on the clipboard and confirms it (FR-004 AC-1)', async ({
	page
}) => {
	await page.clock.install();
	await open(page, 'granted');
	await page
		.getByRole('form', { name: 'Example form' })
		.getByRole('button', { name: /^Generat/ })
		.click();
	// The example Generate waits 1.2 s on a timer, which the fake clock has to advance.
	await page.clock.runFor(1300);
	await expect(page.locator('tbody tr')).toHaveCount(12);
	const address = await page.locator('tbody tr').nth(2).locator('td').nth(1).textContent();
	const button = page.getByRole('button', { name: 'Copy address 3' });
	// Stop the fake clock from also moving in real time, so only runFor() advances the timer. The
	// pause point is 1 s ahead: with 10 ms a slow CI runner had already passed it ("Cannot
	// fast-forward to the past"). No timer is pending in that second; Copy has not been clicked.
	await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));

	await button.click();

	expect(await copiedValues(page)).toEqual([address]);
	await expect(liveRegion(page)).toHaveText('Copied');
	await expect(page.locator('.toast')).toHaveText('Copied');
	// The check replaces the copy icon at the pointer, then the copy icon returns after 1.4 s.
	const icons = button.locator('.icons');
	const check = button.locator('.check');
	await expect.poll(() => check.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
	await page.clock.runFor(1300);
	await expect(icons).toHaveClass(/copied/, { timeout: 0 });
	await page.clock.runFor(200);
	await expect(icons).not.toHaveClass(/copied/, { timeout: 0 });
	await expect.poll(() => check.evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
});

for (const kind of ['csv', 'json'] as const) {
	test(`Copy all copies every row as ${kind.toUpperCase()} (FR-004 AC-2)`, async ({ page }) => {
		await open(page, 'granted');
		await generateRows(page, 30);
		const rows = await tableRows(page);
		await format(page).selectOption(kind);

		await toolbarButton(page, 'Copy all').click();

		const [text] = await copiedValues(page);
		if (kind === 'csv') {
			const lines = text.split('\r\n');
			expect(lines[0]).toBe('index,address,variant');
			expect(lines.slice(1, -1)).toEqual(rows.map((row) => row.join(',')));
			expect(lines.at(-1)).toBe('');
		} else {
			expect(JSON.parse(text)).toEqual(
				rows.map(([index, address, variant]) => ({ index, address, variant }))
			);
		}
	});
}

for (const kind of ['csv', 'json'] as const) {
	test(`Download saves every row as ${kind.toUpperCase()} (FR-004 AC-2)`, async ({ page }) => {
		await open(page, 'granted');
		await generateRows(page, 30);
		const rows = await tableRows(page);
		await format(page).selectOption(kind);

		const [download] = await Promise.all([
			page.waitForEvent('download'),
			toolbarButton(page, 'Download').click()
		]);

		expect(download.suggestedFilename()).toBe(`example-rows.${kind}`);
		const text = await readFile((await download.path())!, 'utf8');
		if (kind === 'csv') {
			expect(text.split('\r\n').slice(1, -1)).toEqual(rows.map((row) => row.join(',')));
		} else {
			expect(JSON.parse(text)).toHaveLength(30);
			expect(JSON.parse(text)[29]).toEqual({
				index: rows[29][0],
				address: rows[29][1],
				variant: rows[29][2]
			});
		}
	});
}

for (const mode of ['denied', 'missing'] as const) {
	test(`with the clipboard ${mode}, Copy shows the error and the value selected (FR-004 AC-3, EC-023)`, async ({
		page
	}) => {
		await open(page, mode);
		const hash = page.getByRole('button', { name: 'Copy example hash' });

		await hash.click();

		const dialog = page.getByRole('dialog', { name: 'Could not copy' });
		await expect(dialog).toBeVisible();
		await expect(dialog).toContainText('Select the value and copy it manually.');
		const field = dialog.getByRole('textbox', { name: 'Value to copy' });
		await expect(field).toBeFocused();
		await expect(field).toHaveValue(
			'0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060'
		);
		const value = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
		await expect
			.poll(() => field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]))
			.toEqual([0, value.length]);
		await expect(page.locator('.toast')).toBeHidden();

		await dialog.getByRole('button', { name: 'Close' }).click();
		await expect(dialog).toBeHidden();
		await expect(hash).toBeFocused();
	});
}

test('with the clipboard denied, Copy all offers every row for a manual copy', async ({ page }) => {
	await open(page, 'denied');
	await generateRows(page, 30);

	await toolbarButton(page, 'Copy all').click();

	const field = page.getByRole('textbox', { name: 'Value to copy' });
	await expect(field).toBeFocused();
	// A textarea normalises CRLF to LF, so a manual copy has LF line breaks; the rows are intact.
	const lines = (await field.inputValue()).split('\n');
	expect(lines[0]).toBe('index,address,variant');
	expect(lines).toHaveLength(32);
});

test('the clipboard fallback dialog has no WCAG 2.1 AA violations', async ({ page }) => {
	await open(page, 'denied');
	await page.getByRole('button', { name: 'Copy example hash' }).click();
	const dialog = page.getByRole('dialog', { name: 'Could not copy' });
	await expect(dialog).toBeVisible();
	await dialog.evaluate((el) =>
		Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished))
	);

	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();

	expect(results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`)).toEqual([]);
});

test('Copy writes to the real clipboard (Chromium)', async ({ page, context, browserName }) => {
	test.skip(browserName !== 'chromium', 'Only Chromium lets a test read the clipboard back.');
	await context.grantPermissions(['clipboard-read', 'clipboard-write']);
	await page.goto('/components');
	await hydrated(page);

	await page.getByRole('button', { name: 'Copy example hash' }).click();
	await expect(page.locator('.toast')).toHaveText('Copied');

	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
		'0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060'
	);
});
