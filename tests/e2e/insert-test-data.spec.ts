import { expect, test, type Page, type Worker } from '@playwright/test';
import { generateAmountCases } from '#lib/core/amount/cases.ts';
import type { TestCase } from '#lib/core/qa/types.ts';
import {
	appOpened,
	hasCrypto,
	readStore,
	recordRequests,
	scanA11y,
	scriptBodies
} from './helpers.ts';

// Insert test data into a step (T-074; design 13.3 P2-02; FR-151, NFR-012, NFR-015).

const MARKER = 'Kind of test data';
const EIP55 = /^0x[0-9a-fA-F]{40}$/;

const step = (page: Page, n: number) => page.getByRole('group', { name: `Step ${n}` });
const action = (page: Page, n = 1) => step(page, n).getByRole('textbox', { name: 'Action' });
const stepExpected = (page: Page, n = 1) =>
	step(page, n).getByRole('textbox', { name: 'Expected result (optional)' });
const insertButton = (page: Page, n = 1) =>
	page.getByRole('button', { name: `Insert test data into step ${n}` });
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Insert test data' });
const preview = (page: Page) => page.getByTestId('case-editor-insert-preview');
const confirm = (page: Page) => page.getByTestId('case-editor-insert-confirm');
const select = (page: Page, name: string) => dialog(page).getByRole('combobox', { name });

async function openNew(page: Page): Promise<void> {
	await page.goto('/cases/new');
	await appOpened(page);
	await expect(action(page)).toBeVisible();
}

/** Types into a step field and leaves the caret at `caret`. */
async function fillAt(
	page: Page,
	field: ReturnType<typeof action>,
	text: string,
	caret: number
): Promise<void> {
	await field.fill(text);
	await field.evaluate((el: HTMLTextAreaElement, at) => el.setSelectionRange(at, at), caret);
}

/** Opens the dialog from the keyboard: a click does not focus a button in WebKit on macOS. */
async function openDialog(page: Page, n = 1): Promise<void> {
	await insertButton(page, n).focus();
	await page.keyboard.press('Enter');
	await expect(dialog(page)).toBeVisible();
}

async function waitForValue(page: Page): Promise<string> {
	await expect(confirm(page)).toBeEnabled();
	return (await preview(page).textContent())!.trim();
}

const caretOf = (field: ReturnType<typeof action>) =>
	field.evaluate((el: HTMLTextAreaElement) => [el.selectionStart, el.selectionEnd]);

test.describe('Insert test data (FR-151)', () => {
	test('a valid address lands at the caret of the Action field (AC-1, AC-2)', async ({ page }) => {
		await openNew(page);
		await fillAt(page, action(page), 'Send 1 ETH to  now', 14);
		await openDialog(page);
		await expect(page.getByTestId('case-editor-insert-target')).toHaveText(
			'Into step 1, Action, at the cursor.'
		);
		await expect(dialog(page).getByRole('radio', { name: 'Address' })).toBeChecked();
		await expect(select(page, 'Sample')).toHaveValue('valid');
		const address = await waitForValue(page);
		expect(address).toMatch(EIP55);

		await confirm(page).click();
		await expect(dialog(page)).toBeHidden();
		await expect(action(page)).toHaveValue(`Send 1 ETH to ${address} now`);
		await expect(action(page)).toBeFocused();
		expect(await caretOf(action(page))).toEqual([14 + address.length, 14 + address.length]);
	});

	test('an invalid sample goes into the focused Expected field with its reason (AC-2)', async ({
		page
	}) => {
		await openNew(page);
		await fillAt(page, stepExpected(page), 'Rejected: ', 10);
		await openDialog(page);
		await expect(page.getByTestId('case-editor-insert-target')).toHaveText(
			'Into step 1, Expected result, at the cursor.'
		);
		await select(page, 'Chain').selectOption({ label: 'Tron' });
		await select(page, 'Sample').selectOption({ label: 'Invalid: Wrong length' });
		const value = await waitForValue(page);
		expect(value).toMatch(/^\S+ \(.+\.\)$/);

		await confirm(page).click();
		await expect(stepExpected(page)).toHaveValue(`Rejected: ${value}`);
		await expect(stepExpected(page)).toBeFocused();
		await expect(action(page)).toHaveValue('');
	});

	test('a selection is replaced, and the last choices are kept for the next step', async ({
		page
	}) => {
		await openNew(page);
		await action(page).fill('Enter AMOUNT here');
		await action(page).evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(6, 12));
		await openDialog(page);
		await dialog(page).getByRole('radio', { name: 'Amount' }).check();
		await select(page, 'Token (decimals)').selectOption({ label: 'BTC (8)' });
		const dust = generateAmountCases({ decimals: 8 }).cases[0].input;
		expect(await waitForValue(page)).toBe(dust);
		await expect(page.getByTestId('case-editor-insert-another')).toHaveCount(0);
		await confirm(page).click();
		await expect(action(page)).toHaveValue(`Enter ${dust} here`);

		await page.getByTestId('case-editor-add-step').click();
		await action(page, 2).fill('Type ');
		await openDialog(page, 2);
		await expect(page.getByTestId('case-editor-insert-target')).toHaveText(
			'Into step 2, Action, at the cursor.'
		);
		await expect(dialog(page).getByRole('radio', { name: 'Amount' })).toBeChecked();
		await confirm(page).click();
		await expect(action(page, 2)).toHaveValue(`Type ${dust}`);
	});

	test('one dummy-data field, and Generate another gives a new value (AC-1)', async ({ page }) => {
		await openNew(page);
		await openDialog(page);
		await dialog(page).getByRole('radio', { name: 'Dummy data' }).check();
		await select(page, 'Field').selectOption({ label: 'NIK' });
		await expect(preview(page)).toHaveText(/^\s*\d{16}\s*$/);
		const first = await waitForValue(page);
		await page.getByTestId('case-editor-insert-another').click();
		await expect(preview(page)).not.toHaveText(first);
		const second = await waitForValue(page);
		expect(second).toMatch(/^\d{16}$/);
		await confirm(page).click();
		await expect(action(page)).toHaveValue(second);
	});

	test('Escape and Cancel change nothing and return focus to the button', async ({ page }) => {
		await openNew(page);
		await action(page).fill('Unchanged');
		await openDialog(page);
		await waitForValue(page);
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(insertButton(page)).toBeFocused();

		await page.keyboard.press('Enter');
		await expect(dialog(page)).toBeVisible();
		await dialog(page).getByRole('button', { name: 'Cancel' }).click();
		await expect(dialog(page)).toBeHidden();
		await expect(action(page)).toHaveValue('Unchanged');
	});
});

test.describe('loading and key material (AC-3, AC-4)', () => {
	test('no generator code loads before the dialog opens', async ({ page }) => {
		const workers: string[] = [];
		page.on('worker', (worker) => workers.push(worker.url()));
		const requests = recordRequests(page);
		await openNew(page);
		await page.waitForLoadState('networkidle');
		const before = await scriptBodies(page, requests);
		expect(before.length).toBeGreaterThan(0);
		expect(before.some((body) => body.includes(MARKER))).toBe(false);
		expect(hasCrypto(before)).toBe(false);
		expect(workers).toEqual([]);

		await openDialog(page);
		await waitForValue(page);
		expect((await scriptBodies(page, requests)).some((body) => body.includes(MARKER))).toBe(true);
		expect(workers).toHaveLength(1);
		expect(workers[0]).toMatch(/address\.worker/);
	});

	test('closing the dialog stops the workers; the case stores only the address', async ({
		page
	}) => {
		await openNew(page);
		await page.getByRole('textbox', { name: 'Title' }).fill('Withdraw to a fresh address');
		await page.getByRole('textbox', { name: 'Expected result', exact: true }).fill('Sent');
		await action(page).fill('Paste ');

		const started = page.waitForEvent('worker');
		await openDialog(page);
		const worker: Worker = await started;
		const closed = new Promise<void>((resolve) => worker.once('close', () => resolve()));
		const address = await waitForValue(page);
		await confirm(page).click();
		await closed;

		await page.getByRole('button', { name: 'Save' }).click();
		await expect(page).toHaveURL(/\/cases\/edit\?id=/);
		const [stored] = await readStore<TestCase>(page, 'testCases');
		expect(stored.steps[0].action).toBe(`Paste ${address}`);
		// No private key (32 bytes as hex) or mnemonic anywhere in the record (NFR-012).
		expect(JSON.stringify(stored)).not.toMatch(/[0-9a-f]{64}/i);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations in the dialog in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openNew(page);
		expect(await scanA11y(page)).toEqual([]);
		await openDialog(page);
		await select(page, 'Chain').selectOption({ label: 'Bitcoin' });
		await select(page, 'Sample').selectOption({ index: 1 });
		await waitForValue(page);
		expect(await scanA11y(page)).toEqual([]);
	});
}
