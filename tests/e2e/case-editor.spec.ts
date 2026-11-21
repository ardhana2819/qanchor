import { expect, test, type Page } from '@playwright/test';
import { appOpened, putRecords, scanA11y, seedCases, testCase } from './helpers.ts';

// Test case editor (T-053; design 13.3 P2-02; FR-100, FR-102, FR-090, EC-028).

const title = (page: Page) => page.getByRole('textbox', { name: 'Title' });
const expected = (page: Page) =>
	page.getByRole('textbox', { name: 'Expected result', exact: true });
const steps = (page: Page) => page.getByTestId('case-editor-step');
const action = (page: Page, n: number) =>
	page.getByRole('group', { name: `Step ${n}` }).getByRole('textbox', { name: 'Action' });
const stepExpected = (page: Page, n: number) =>
	page
		.getByRole('group', { name: `Step ${n}` })
		.getByRole('textbox', { name: 'Expected result (optional)' });
const stepActions = (page: Page) =>
	page
		.getByTestId('case-editor-step-action')
		.evaluateAll((els) => els.map((el) => (el as HTMLTextAreaElement).value));
const save = (page: Page) => page.getByRole('button', { name: 'Save' });
const toast = (page: Page) => page.getByTestId('app-toast');
const tagInput = (page: Page) => page.getByTestId('case-editor-tags-input');
const chips = (page: Page) => page.getByTestId('case-editor-tags-chip');

async function openNew(page: Page): Promise<void> {
	await page.goto('/cases/new');
	await expect(title(page)).toBeVisible();
}

async function seeded(page: Page, cases: object[], path: string): Promise<void> {
	await page.goto('/cases');
	await appOpened(page);
	await seedCases(page, cases as { number: number }[]);
	await page.goto(path);
}

const STORED = testCase(4, {
	id: 'stored',
	title: 'Deposit USDT on Tron',
	preconditions: 'Wallet funded',
	steps: [
		{ action: 'Open Deposit', expected: '' },
		{ action: 'Pick USDT', expected: 'Address shown' }
	],
	tags: ['deposit', 'tron'],
	priority: 'high'
});

test.describe('navigation (FR-090 AC-1)', () => {
	test('the sidebar lists Test cases under QA, after the Phase 1 groups', async ({ page }) => {
		await page.goto('/');
		const nav = page.getByRole('navigation', { name: 'Main' });
		await expect(nav.getByRole('heading')).toHaveText(['Blockchain', 'Data', 'QA']);
		await nav.getByRole('link', { name: 'Test cases' }).click();
		await expect(page).toHaveURL(/\/cases$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test cases');
	});

	test('the index lists Test cases, and the entry stays current inside the editor', async ({
		page
	}) => {
		await page.goto('/');
		await expect(page.getByRole('main').getByRole('link', { name: 'Test cases' })).toBeVisible();
		await openNew(page);
		await expect(
			page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Test cases' })
		).toHaveAttribute('aria-current', 'true');
	});
});

test('an empty list offers New test case, which opens the editor (FR-100 AC-1)', async ({
	page
}) => {
	await page.goto('/cases');
	await page.getByTestId('cases-empty').getByRole('link', { name: 'New test case' }).click();
	await expect(page).toHaveURL(/\/cases\/new$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('New test case');
});

test('a new case defaults to Medium and offers four priorities (FR-100 AC-6)', async ({ page }) => {
	await openNew(page);
	const priority = page.getByRole('combobox', { name: 'Priority' });
	await expect(priority).toHaveValue('medium');
	await expect(priority.locator('option')).toHaveText(['Critical', 'High', 'Medium', 'Low']);
});

test('a saved case gets the next key, persists, and keeps its key when edited (FR-100 AC-2)', async ({
	page
}) => {
	await openNew(page);
	await title(page).fill('Deposit BTC');
	await action(page, 1).fill('Open Deposit');
	await stepExpected(page, 1).fill('Address shown');
	await save(page).click();

	await expect(toast(page)).toHaveText('Saved TC-1.');
	await expect(page).toHaveURL(/\/cases\/edit\?id=/);
	await expect(page.getByTestId('case-editor-key')).toHaveText('TC-1');
	await expect(page.getByTestId('case-editor-status')).toHaveCount(0);

	await page.reload();
	await expect(title(page)).toHaveValue('Deposit BTC');
	await title(page).fill('Deposit BTC on testnet');
	await expect(page.getByTestId('case-editor-status')).toHaveText('Unsaved changes');
	await save(page).click();
	await expect(toast(page)).toHaveText('Saved TC-1.');

	await page.goto('/cases');
	await expect(page.getByTestId('cases-row')).toHaveCount(1);
	await expect(page.getByTestId('cases-row')).toContainText('Deposit BTC on testnet');
});

test('keys are never reused after a delete and continue from the highest stored key (FR-100 AC-2)', async ({
	page
}) => {
	await seeded(page, [STORED], '/cases/new');
	await title(page).fill('After TC-4');
	await action(page, 1).fill('Open');
	await expected(page).fill('Works');
	await save(page).click();
	await expect(toast(page)).toHaveText('Saved TC-5.');

	await page.getByTestId('case-editor-delete').click();
	await page.getByTestId('case-editor-confirm-delete').click();
	await expect(page).toHaveURL(/\/cases$/);

	await page.goto('/cases/new');
	await title(page).fill('Next');
	await action(page, 1).fill('Open');
	await expected(page).fill('Works');
	await save(page).click();
	await expect(toast(page)).toHaveText('Saved TC-6.');
});

test.describe('validation (FR-100 AC-3)', () => {
	test('an empty form names every problem and focuses the first', async ({ page }) => {
		await openNew(page);
		await save(page).click();

		await expect(title(page)).toBeFocused();
		await expect(title(page)).toHaveAccessibleDescription('Enter a title.');
		await expect(action(page, 1)).toHaveAccessibleDescription('Describe what to do in step 1.');
		await expect(expected(page)).toHaveAccessibleDescription(
			'Add an expected result to a step or to the case. Required if no step has an expected result.'
		);
		await expect(page).toHaveURL(/\/cases\/new$/);
	});

	test('focus goes to the first remaining problem, and errors clear as they are fixed', async ({
		page
	}) => {
		await openNew(page);
		await title(page).fill('Title only');
		await save(page).click();
		await expect(action(page, 1)).toBeFocused();

		await action(page, 1).fill('Open');
		await save(page).click();
		await expect(expected(page)).toBeFocused();

		await expected(page).fill('Works');
		await expect(expected(page)).not.toHaveAttribute('aria-invalid');
		await save(page).click();
		await expect(toast(page)).toHaveText('Saved TC-1.');
	});

	test('a limit from PRD 10.5 blocks saving with its own message', async ({ page }) => {
		await openNew(page);
		await title(page).fill('a'.repeat(201));
		await expected(page).fill('Works');
		await page
			.getByRole('group', { name: 'Step 1' })
			.getByRole('button', { name: /Remove/ })
			.click();
		await save(page).click();

		await expect(title(page)).toBeFocused();
		await expect(title(page)).toHaveAccessibleDescription('Up to 200 characters.');
	});

	test('an invalid tag is named, and focus goes to the tags field', async ({ page }) => {
		await openNew(page);
		await title(page).fill('Tags');
		await expected(page).fill('Works');
		await page
			.getByRole('group', { name: 'Step 1' })
			.getByRole('button', { name: /Remove/ })
			.click();
		await tagInput(page).fill('a/b');
		await tagInput(page).press('Enter');
		await save(page).click();

		await expect(tagInput(page)).toBeFocused();
		await expect(tagInput(page)).toHaveAccessibleDescription(
			/"a\/b" is not a valid tag\. A tag can be up to 32 characters/
		);
	});
});

test('steps are added, moved, and removed by keyboard, with focus kept (FR-100 AC-4)', async ({
	page
}) => {
	await openNew(page);
	await action(page, 1).fill('first');

	await page.getByRole('button', { name: 'Add step' }).focus();
	await page.keyboard.press('Enter');
	await expect(action(page, 2)).toBeFocused();
	await page.keyboard.type('second');
	await page.getByRole('button', { name: 'Add step' }).focus();
	await page.keyboard.press('Enter');
	await page.keyboard.type('third');

	// Move the third step up twice: focus stays on it, then falls back to its Move down button.
	await page.getByRole('button', { name: 'Move step 3 up' }).focus();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Move step 2 up' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Move step 1 down' })).toBeFocused();
	await expect(page.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
	expect(await stepActions(page)).toEqual(['third', 'first', 'second']);

	await page.keyboard.press('Enter');
	await expect(page.getByRole('button', { name: 'Move step 2 down' })).toBeFocused();
	expect(await stepActions(page)).toEqual(['first', 'third', 'second']);

	// Removing a step focuses the step that takes its place, or the one before the last.
	await page.getByRole('button', { name: 'Remove step 2' }).focus();
	await page.keyboard.press('Enter');
	await expect(action(page, 2)).toBeFocused();
	await expect(action(page, 2)).toHaveValue('second');
	await page.getByRole('button', { name: 'Remove step 2' }).click();
	await expect(action(page, 1)).toBeFocused();
	await page.getByRole('button', { name: 'Remove step 1' }).click();
	await expect(steps(page)).toHaveCount(0);
	await expect(page.getByRole('button', { name: 'Add step' })).toBeFocused();
	await expect(page.locator('[aria-live="polite"]')).toHaveText('Step 1 removed.');
});

test('tags are trimmed, lowercased, de-duplicated, and suggested from other cases (FR-100 AC-5)', async ({
	page
}) => {
	await seeded(page, [STORED], '/cases/new');
	await tagInput(page).fill('  Smoke ');
	await tagInput(page).press('Enter');
	await tagInput(page).pressSequentially('SMOKE,Regression,');
	await expect(chips(page)).toHaveText(['smoke', 'regression']);

	await tagInput(page).fill('tr');
	await expect(page.locator('datalist option')).toHaveAttribute('value', 'tron');
});

test('free text is stored exactly as typed and shown as text (FR-100 AC-8)', async ({ page }) => {
	const markup = '  <img src=x onerror=alert(1)> **bold** ';
	await openNew(page);
	await title(page).fill(markup);
	await expected(page).fill('<b>ok</b>');
	await action(page, 1).fill('Open');
	await save(page).click();
	await expect(toast(page)).toHaveText('Saved TC-1.');

	await page.reload();
	await expect(title(page)).toHaveValue(markup);
	await expect(expected(page)).toHaveValue('<b>ok</b>');
	await page.goto('/cases');
	await expect(page.getByTestId('cases-row').getByRole('link')).toHaveText(markup.trim());
	await expect(page.locator('img[src="x"]')).toHaveCount(0);
});

test.describe('unsaved changes (FR-100 AC-7)', () => {
	test('an in-app link asks first; Keep editing stays, Discard leaves', async ({ page }) => {
		await openNew(page);
		await title(page).fill('Half done');
		const link = page
			.getByRole('navigation', { name: 'Main' })
			.getByRole('link', { name: 'Checklists' });

		await link.click();
		const dialog = page.getByRole('dialog', { name: 'Discard this new test case?' });
		await expect(dialog).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Keep editing' })).toBeFocused();
		await dialog.getByRole('button', { name: 'Keep editing' }).click();
		await expect(page).toHaveURL(/\/cases\/new$/);
		await expect(title(page)).toHaveValue('Half done');

		await link.click();
		await page.getByTestId('case-editor-discard').click();
		await expect(page).toHaveURL(/\/checklists$/);
	});

	test('Cancel and Back ask too; an unchanged form leaves without asking', async ({ page }) => {
		await seeded(page, [STORED], '/cases');
		await page.getByRole('link', { name: 'Deposit USDT on Tron' }).click();
		await expect(title(page)).toHaveValue('Deposit USDT on Tron');

		await page.getByTestId('case-editor-cancel').click();
		await expect(page).toHaveURL(/\/cases$/);

		await page.goBack();
		await title(page).fill('Changed');
		await page.goBack();
		await expect(page.getByRole('dialog', { name: 'Discard your changes to TC-4?' })).toBeVisible();
		await page.getByTestId('case-editor-keep-editing').click();
		await expect(title(page)).toHaveValue('Changed');
	});

	test('a reload with unsaved changes gets the browser prompt', async ({ page }) => {
		await openNew(page);
		await title(page).fill('Half done');
		const prompt = page.waitForEvent('dialog');
		// The reload never finishes: the prompt is dismissed, so the page stays.
		void page.reload().catch(() => undefined);
		const dialog = await prompt;
		expect(dialog.type()).toBe('beforeunload');
		await dialog.dismiss();
		await expect(title(page)).toHaveValue('Half done');
	});
});

test('Duplicate in the list and in the editor opens the copy in the editor (FR-102 AC-1)', async ({
	page
}) => {
	await seeded(page, [STORED], '/cases');
	await page.getByRole('button', { name: 'Duplicate TC-4' }).click();

	await expect(toast(page)).toHaveText('Duplicated as TC-5.');
	await expect(page.getByTestId('case-editor-key')).toHaveText('TC-5');
	await expect(title(page)).toHaveValue('Copy of Deposit USDT on Tron');
	await expect(page.getByRole('combobox', { name: 'Priority' })).toHaveValue('high');
	await expect(chips(page)).toHaveText(['deposit', 'tron']);

	await page.getByTestId('case-editor-duplicate').click();
	await expect(toast(page)).toHaveText('Duplicated as TC-6.');
	await expect(page.getByTestId('case-editor-key')).toHaveText('TC-6');
	await expect(title(page)).toHaveValue('Copy of Copy of Deposit USDT on Tron');
	await expect(steps(page)).toHaveCount(2);
});

test('Delete in the editor names the runs, then returns to the list (FR-102 AC-2)', async ({
	page
}) => {
	await page.goto('/cases');
	await appOpened(page);
	await putRecords(page, 'runs', [
		{
			id: 'run-1',
			name: 'Smoke',
			release: '',
			environment: '',
			status: 'completed',
			cases: [{ ...STORED, createdAt: undefined, updatedAt: undefined }],
			createdAt: 1,
			updatedAt: 1,
			completedAt: 1
		}
	]);
	await seeded(page, [STORED], '/cases/edit?id=stored');

	await page.getByTestId('case-editor-delete').click();
	const dialog = page.getByRole('dialog', { name: 'Delete TC-4?' });
	await expect(dialog).toContainText('It is in 1 run. That run keeps its own copy.');
	await page.getByTestId('case-editor-confirm-delete').click();

	await expect(page).toHaveURL(/\/cases$/);
	await expect(toast(page)).toHaveText('Deleted TC-4.');
	await expect(page.getByTestId('cases-empty')).toBeVisible();
});

test.describe('record URLs (FR-090 AC-2, AC-3, EC-028)', () => {
	test('the built edit page holds only the loading state', async ({ request }) => {
		const html = await (await request.get('/cases/edit')).text();
		expect(html).toContain('Loading test case…');
		expect(html).not.toContain('Test case not found');
	});

	test('an edit URL without an ID goes to the list, and Back skips it', async ({ page }) => {
		await page.goto('/');
		await page.goto('/cases/edit');
		await expect(page).toHaveURL(/\/cases$/);
		await page.goBack();
		await expect(page).toHaveURL(/\/$/);
	});

	test('an unknown ID shows a not-found state with a link to the list', async ({ page }) => {
		await page.goto('/cases/edit?id=nope');
		await expect(page.getByRole('heading', { name: 'Test case not found' })).toBeVisible();
		await expect(page.getByTestId('case-editor-not-found')).toContainText(
			'It may have been deleted, or it was created in another browser.'
		);
		await page.getByRole('link', { name: 'Back to test cases' }).click();
		await expect(page).toHaveURL(/\/cases$/);
	});

	test('a title link opens the case, and the ID survives a reload', async ({ page }) => {
		await seeded(page, [STORED], '/cases');
		await page.getByRole('link', { name: 'Deposit USDT on Tron' }).click();
		await expect(page).toHaveURL(/\/cases\/edit\?id=stored$/);
		await page.reload();
		await expect(page.getByTestId('case-editor-key')).toHaveText('TC-4');
		await expect(stepExpected(page, 2)).toHaveValue('Address shown');
	});
});

test('with storage unavailable, the editor explains it and shows no form (FR-090 AC-5)', async ({
	page
}) => {
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await page.goto('/cases/new');
	await expect(page.getByTestId('case-editor-unavailable')).toContainText(
		'Test cases need storage'
	);
	await expect(page.locator('form')).toHaveCount(0);
});

test('a case can be written and saved with the keyboard only (NFR-008)', async ({ page }) => {
	await openNew(page);
	await title(page).focus();
	await page.keyboard.type('Keyboard only');
	await page.keyboard.press('Tab');
	await page.keyboard.press('Tab');
	await expect(tagInput(page)).toBeFocused();
	await page.keyboard.type('smoke');
	await page.keyboard.press('Enter');
	await page.keyboard.press('Tab');
	await page.keyboard.type('None');
	await page.keyboard.press('Tab');
	await expect(action(page, 1)).toBeFocused();
	await page.keyboard.type('Open');
	await page.keyboard.press('Tab');
	await page.keyboard.type('Opens');
	// Ctrl/Cmd+Enter in a text area submits the form.
	await page.keyboard.press('ControlOrMeta+Enter');

	await expect(toast(page)).toHaveText('Saved TC-1.');
	await expect(chips(page)).toHaveText(['smoke']);
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations with errors shown in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme });
		await seeded(page, [STORED], '/cases/edit?id=stored');
		await title(page).fill('');
		await save(page).click();
		await expect(title(page)).toBeFocused();

		expect(await scanA11y(page)).toEqual([]);
	});
}
