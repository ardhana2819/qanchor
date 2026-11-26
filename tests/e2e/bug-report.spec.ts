import { expect, test, type Locator, type Page } from '@playwright/test';
import {
	appOpened,
	png,
	putRecords,
	scanA11y,
	seedCases,
	tabTo,
	testCase,
	testResult,
	testRun
} from './helpers.ts';

// The bug report dialog (T-065; design 13.3 P2-05, 13.7, 13.8; FR-120 AC-1 to AC-6, FR-121
// AC-1 to AC-3, FR-122 AC-1, AC-2). The clipboard is recorded; screenshots are chosen through
// the result's screenshot area, so they go through the real image worker.

const CASE = testCase(1, {
	title: 'Withdraw USDT',
	preconditions: 'A funded wallet',
	steps: [
		{ action: 'Open Withdraw', expected: 'The form shows' },
		{ action: 'Send 5 USDT', expected: 'The balance drops by 5' },
		{ action: 'Open History', expected: 'The withdrawal is listed' }
	],
	expected: 'The withdrawal completes',
	tags: ['wallet', 'tron'],
	priority: 'high'
});

/** The run keeps its own copy of each case, as a run made from them does. */
function snapshot(stored: object): object {
	const copy = { ...(stored as Record<string, unknown>) };
	delete copy.createdAt;
	delete copy.updatedAt;
	return copy;
}

const FAILED = {
	...testResult('run-1', 1, 'fail'),
	failedStep: 2,
	actual: 'The balance stays at 10\nNo error is shown',
	notes: 'Seen twice'
};

async function openRun(
	page: Page,
	{ results = [FAILED], fields = {} }: { results?: object[]; fields?: object } = {}
): Promise<void> {
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		navigator.clipboard.writeText = async (text: string) => {
			copied.push(text);
		};
	});
	await page.goto('/runs');
	await appOpened(page);
	await seedCases(page, [CASE, testCase(2), testCase(3)] as { number: number }[]);
	await putRecords(page, 'runs', [
		testRun('run-1', [1, 2, 3], {
			cases: [snapshot(CASE), snapshot(testCase(2)), snapshot(testCase(3))],
			name: 'Smoke',
			release: 'v2.3.0',
			environment: 'Pixel 7, Android 14',
			...fields
		})
	]);
	if (results.length > 0) await putRecords(page, 'results', results);
	await page.goto('/runs/view?id=run-1');
	await expect(page.getByTestId('run-loading')).toHaveCount(0);
}

const createButton = (page: Page) => page.getByTestId('run-create-report');
const dialog = (page: Page) => page.getByRole('dialog', { name: /^Bug report: / });
const discardDialog = (page: Page) =>
	page.getByRole('dialog', { name: 'Discard your edits to this report?' });
const summary = (page: Page) => dialog(page).getByRole('textbox', { name: 'Summary' });
const field = (page: Page, name: string) => dialog(page).getByRole('textbox', { name });
const format = (page: Page, name: 'Markdown' | 'Jira wiki') =>
	dialog(page).getByRole('radio', { name });
const preview = (page: Page) => page.getByTestId('bug-report-preview');
const toast = (page: Page) => page.getByTestId('app-toast');
const copied = (page: Page) =>
	page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

/** Focus and Enter: a click does not focus a button in WebKit on macOS, and focus returns here. */
async function openReport(page: Page): Promise<void> {
	await createButton(page).focus();
	await page.keyboard.press('Enter');
	await expect(dialog(page)).toBeVisible();
}

async function choose(page: Page, ...names: string[]): Promise<void> {
	await page
		.getByTestId('run-screenshots')
		.getByLabel('Screenshot files')
		.setInputFiles(names.map((name) => ({ name, mimeType: 'image/png', buffer: png(64, 48) })));
	await expect(page.getByTestId('run-screenshots').getByRole('img')).toHaveCount(names.length);
}

/**
 * The names `count` downloads are saved under. Firefox saves a WebP file, then opens it in a new
 * tab instead of reporting a download (its default for images it can show).
 */
async function savedNames(page: Page, button: Locator, count: number): Promise<string[]> {
	const names: string[] = [];
	const onDownload = (download: { suggestedFilename(): string }) =>
		names.push(download.suggestedFilename());
	// Once Firefox opened such a tab, Playwright's Firefox stalls on the page, so each test
	// downloads once, last. The context closes the tabs after the test.
	// The tab shows the saved file, which Firefox renames `TC-1-run1-2-1.webp` when an earlier
	// test of this worker saved `TC-1-run1-2.webp`; only that added `-<k>` is taken off.
	const onTab = (tab: Page) => {
		const saved = decodeURIComponent(new URL(tab.url()).pathname.split('/').pop() ?? '');
		names.push(saved.replace(/^(TC-\d+-[0-9a-z]+-\d+)-\d+(\.\w+)$/, '$1$2'));
	};
	page.on('download', onDownload);
	page.context().on('page', onTab);
	// Not click(), which waits for the navigation Firefox's new tab starts, nor dispatchEvent(),
	// which crashes Playwright's Firefox inside this dialog.
	await button.focus();
	await page.keyboard.press('Enter');
	await expect.poll(() => names.length).toBe(count);
	page.off('download', onDownload);
	page.context().off('page', onTab);
	return names.sort();
}

test.describe('Create bug report', () => {
	test('is offered on a saved failure only, also in a completed run', async ({ page }) => {
		await openRun(page, { results: [FAILED, testResult('run-1', 2, 'pass')] });
		await expect(createButton(page)).toBeVisible();

		await page.getByTestId('run-next').click();
		await expect(page.getByTestId('run-case-key')).toHaveText('TC-2');
		await expect(createButton(page)).toHaveCount(0);

		// A failure not yet saved has nothing to report from.
		await page.getByTestId('run-next').click();
		await page.getByRole('radio', { name: /^Fail/ }).check();
		await expect(page.getByTestId('run-save-result')).toBeVisible();
		await expect(createButton(page)).toHaveCount(0);
	});

	test('stays available in a completed run', async ({ page }) => {
		await openRun(page, {
			fields: { status: 'completed', completedAt: Date.UTC(2026, 10, 3) }
		});
		await openReport(page);
		await expect(summary(page)).toBeEditable();
	});
});

test('the report is pre-filled from the result (FR-120 AC-1, AC-2, AC-4, AC-6)', async ({
	page
}) => {
	await openRun(page);
	await openReport(page);

	await expect(dialog(page).getByRole('heading', { level: 2 })).toHaveText('Bug report: TC-1');
	await expect(summary(page)).toBeFocused();
	await expect(summary(page)).toHaveValue('Withdraw USDT: The balance stays at 10');
	await expect(dialog(page).getByRole('combobox', { name: 'Priority' })).toHaveValue('high');
	await expect(field(page, 'Labels')).toHaveValue('wallet, tron');
	await expect(field(page, 'Environment')).toHaveValue('Pixel 7, Android 14');
	await expect(field(page, 'Preconditions')).toHaveValue('A funded wallet');
	// Steps 1 to the failed step, and that step's expected result.
	await expect(field(page, 'Steps to reproduce')).toHaveValue('1. Open Withdraw\n2. Send 5 USDT');
	await expect(field(page, 'Expected result')).toHaveValue('The balance drops by 5');
	await expect(field(page, 'Actual result')).toHaveValue(
		'The balance stays at 10\nNo error is shown'
	);
	await expect(field(page, 'Notes')).toHaveValue('Seen twice\nRun: Smoke (v2.3.0), case TC-1.');
	await expect(dialog(page).getByText('No screenshots on this result.')).toBeVisible();
});

test('"Not step-specific" lists every step with the case expected result (FR-120 AC-3)', async ({
	page
}) => {
	await openRun(page, { results: [{ ...FAILED, failedStep: 0 }] });
	await openReport(page);

	await expect(field(page, 'Steps to reproduce')).toHaveValue(
		'1. Open Withdraw\n2. Send 5 USDT\n3. Open History'
	);
	await expect(field(page, 'Expected result')).toHaveValue('The withdrawal completes');
});

test('the copy is the previewed text with the edits, in the chosen format (FR-120 AC-5, FR-121)', async ({
	page
}) => {
	await openRun(page);
	await openReport(page);
	await expect(format(page, 'Markdown')).toBeChecked();
	await summary(page).fill('Withdraw keeps the balance {at} 10');
	await field(page, 'Steps to reproduce').fill('1. Open Withdraw\n2. Send *5* USDT');

	await page.getByTestId('bug-report-copy').click();

	await expect(toast(page)).toHaveText('Copied as Markdown');
	let [text] = await copied(page);
	expect(text).toContain('**Summary:** Withdraw keeps the balance {at} 10\n');
	expect(text).toContain('### Steps to reproduce\n1. Open Withdraw\n2. Send \\*5\\* USDT\n');
	expect(text).toContain('**Priority:** High · **Labels:** wallet, tron');
	await dialog(page).getByText('Preview the copied text').click();
	expect(`${await preview(page).textContent()}`).toBe(text);

	const hint = dialog(page).getByTestId('bug-report-jira-hint');
	await expect(hint).toBeHidden();
	await format(page, 'Jira wiki').check();
	// The Jira Cloud editor does not read wiki markup (owner check, 2026-11-26).
	await expect(hint).toHaveText('For Jira Cloud, use Markdown.');
	await page.getByTestId('bug-report-copy').click();

	await expect(toast(page)).toHaveText('Copied as Jira wiki markup');
	[, text] = await copied(page);
	expect(text).toContain('*Summary:* Withdraw keeps the balance \\{at\\} 10\n');
	expect(text).toContain('h3. Steps to reproduce\n# Open Withdraw\n# Send \\*5\\* USDT\n');
	expect(`${await preview(page).textContent()}`).toBe(text);
});

test('the format is remembered and reopening starts from the result (FR-121 AC-1, FR-120 AC-5)', async ({
	page
}) => {
	await openRun(page);
	await openReport(page);
	await format(page, 'Jira wiki').check();
	await summary(page).fill('Edited');
	await page.getByTestId('bug-report-close').click();
	await page.getByTestId('bug-report-discard').click();
	await expect(dialog(page)).toBeHidden();

	await page.reload();
	await openReport(page);

	await expect(format(page, 'Jira wiki')).toBeChecked();
	await expect(summary(page)).toHaveValue('Withdraw USDT: The balance stays at 10');
	expect(await page.evaluate(() => localStorage.getItem('qanchor.reportFormat'))).toBe('jira');
});

test.describe('closing (FR-120 AC-5)', () => {
	test('closes at once without an edit, and focus returns to Create bug report', async ({
		page
	}) => {
		await openRun(page);
		await openReport(page);
		// A format choice is not an edit of the report.
		await format(page, 'Jira wiki').check();

		await page.getByTestId('bug-report-close').click();

		await expect(dialog(page)).toBeHidden();
		await expect(discardDialog(page)).toBeHidden();
		await expect(createButton(page)).toBeFocused();
	});

	test('asks first after an edit: Keep editing keeps it, Discard drops it', async ({ page }) => {
		await openRun(page);
		await openReport(page);
		await field(page, 'Notes').fill('More detail');

		await page.getByTestId('bug-report-close').click();
		await expect(discardDialog(page)).toBeVisible();
		await expect(discardDialog(page).getByRole('button', { name: 'Keep editing' })).toBeFocused();
		await discardDialog(page).getByRole('button', { name: 'Keep editing' }).click();
		await expect(discardDialog(page)).toBeHidden();
		await expect(field(page, 'Notes')).toHaveValue('More detail');

		await page.getByTestId('bug-report-close').click();
		await page.getByTestId('bug-report-discard').click();

		await expect(dialog(page)).toBeHidden();
		await expect(createButton(page)).toBeFocused();
		await openReport(page);
		await expect(field(page, 'Notes')).toHaveValue('Seen twice\nRun: Smoke (v2.3.0), case TC-1.');
	});

	test('Escape after an edit asks too', async ({ page }) => {
		await openRun(page);
		await openReport(page);
		await summary(page).fill('Edited');

		await page.keyboard.press('Escape');

		await expect(discardDialog(page)).toBeVisible();
		await expect(dialog(page)).toBeVisible();
		await page.keyboard.press('Escape');
		await expect(discardDialog(page)).toBeHidden();
		await expect(summary(page)).toHaveValue('Edited');
	});
});

test.describe('attachments (FR-122)', () => {
	async function openWithShots(page: Page): Promise<string[]> {
		await openRun(page);
		await choose(page, 'a.png', 'b.png');
		await openReport(page);
		const items = page.getByTestId('bug-report-attachment');
		await expect(items).toHaveCount(2);
		// One by one: allTextContents() runs evaluateAll, which crashes Playwright's Firefox inside
		// a modal dialog (T-063).
		return [
			`${await items.nth(0).textContent()}`.trim(),
			`${await items.nth(1).textContent()}`.trim()
		];
	}

	test('are listed and named in the text by their file names (AC-1)', async ({ page }) => {
		const names = await openWithShots(page);
		expect(names).toEqual([
			expect.stringMatching(/^TC-1-run1-1\.(webp|jpg)$/),
			expect.stringMatching(/^TC-1-run1-2\.(webp|jpg)$/)
		]);

		await page.getByTestId('bug-report-copy').click();

		const [text] = await copied(page);
		expect(text).toContain(`### Attachments\n- ${names[0]}\n- ${names[1]}\n`);
	});

	test('a download carries the file name (AC-2)', async ({ page }) => {
		const names = await openWithShots(page);
		const button = dialog(page).getByRole('button', { name: `Download ${names[1]}` });

		expect(await savedNames(page, button, 1)).toEqual([names[1]]);
	});

	test('Download all saves each file under its name (AC-2)', async ({ page }) => {
		const names = await openWithShots(page);

		expect(await savedNames(page, page.getByTestId('bug-report-download-all'), 2)).toEqual(names);
	});
});

test('keyboard only, from Create bug report to Copy report (NFR-008)', async ({ page }) => {
	await openRun(page);
	await tabTo(page, createButton(page));
	await page.keyboard.press('Enter');
	await expect(summary(page)).toBeFocused();
	// WebKit puts the caret at the start of an autofocused field, the others at the end.
	await page.keyboard.press('End');
	await page.keyboard.type(' (again)');

	await tabTo(page, page.getByTestId('bug-report-copy'));
	await page.keyboard.press('Enter');

	await expect(toast(page)).toHaveText('Copied as Markdown');
	const [text] = await copied(page);
	expect(text).toContain('**Summary:** Withdraw USDT: The balance stays at 10 (again)\n');
});

test('is full-screen below 640 px (design 13.8)', async ({ page }) => {
	await page.setViewportSize({ width: 390, height: 800 });
	await openRun(page);
	await openReport(page);

	await expect
		.poll(() => dialog(page).boundingBox())
		.toEqual({ x: 0, y: 0, width: 390, height: 800 });
	await expect(page.getByTestId('bug-report-copy')).toBeInViewport();
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`the bug report has no WCAG 2.1 AA violations in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openRun(page);
		await choose(page, 'a.png', 'b.png');
		await openReport(page);
		await dialog(page).getByText('Preview the copied text').click();
		await expect(preview(page)).toBeVisible();

		expect(await scanA11y(page)).toEqual([]);
	});
}
