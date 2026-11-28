import { expect, test, type Page } from '@playwright/test';
import { renderReport } from '#lib/core/qa/report.ts';
import { buildFindingReport, sessionMarkdown } from '#lib/core/qa/session.ts';
import type { Finding, Session } from '#lib/core/qa/types.ts';
import {
	appOpened,
	png,
	putRecords,
	savedNames,
	scanA11y,
	testFinding,
	testSession
} from './helpers.ts';

// Bug report from a Bug finding and Copy session (T-071; design 13.3 P2-05, P2-06; FR-131 AC-3,
// FR-132, FR-121, FR-122; plan finding F-17). The clipboard is recorded; the expected text is
// the T-067 core output for the stored records.

const MIN = 60_000;
const NOW = Date.UTC(2026, 10, 27, 9, 0);
const STARTED = NOW - 45 * MIN;

const SESSION = testSession('s1', {
	charter: 'Explore withdraw limits',
	release: 'v2.3.0',
	environment: 'Android 14 · Sepolia',
	status: 'ended',
	startedAt: STARTED,
	endedAt: NOW,
	createdAt: STARTED,
	updatedAt: NOW
}) as Session;

const BUG = testFinding('f-bug-1', 's1', {
	type: 'bug',
	text: 'Max button ignores the fee\nSeen on USDT TRC-20',
	at: 12 * MIN
}) as Finding;
const NOTE = testFinding('f-note-1', 's1', { type: 'note', text: 'Memo is optional', at: 2 * MIN });

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Bug report: / });
const toast = (page: Page) => page.getByTestId('app-toast');
const copied = (page: Page) =>
	page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
const createButton = (page: Page) =>
	page.getByRole('button', { name: 'Create bug report of the finding at 12 min' });

async function openSession(page: Page, findings: object[] = [BUG, NOTE]): Promise<void> {
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		navigator.clipboard.writeText = async (text: string) => {
			copied.push(text);
		};
	});
	await page.goto('/sessions');
	await appOpened(page);
	await putRecords(page, 'sessions', [SESSION]);
	await putRecords(page, 'findings', findings);
	await page.goto('/sessions/view?id=s1');
	await expect(page.getByTestId('session-charter-heading')).toBeVisible();
}

/** Focus and Enter: a click does not focus a button in WebKit on macOS, and focus returns here. */
async function openReport(page: Page): Promise<void> {
	await createButton(page).focus();
	await page.keyboard.press('Enter');
	await expect(dialog(page)).toBeVisible();
}

test.describe('bug report from a finding (FR-131 AC-3)', () => {
	test('is offered on Bug findings only', async ({ page }) => {
		await openSession(page, [
			BUG,
			NOTE,
			testFinding('q', 's1', { type: 'question', at: 3 * MIN }),
			testFinding('i', 's1', { type: 'idea', at: 4 * MIN })
		]);
		await expect(page.getByTestId('finding-create-report')).toHaveCount(1);
		await expect(createButton(page)).toBeVisible();
	});

	test('opens with the finding as the actual result and empty steps, and copies T-067 output', async ({
		page
	}) => {
		await openSession(page);
		await openReport(page);
		await expect(dialog(page)).toHaveAccessibleName('Bug report: finding at 12 min');
		const field = (name: string) => dialog(page).getByRole('textbox', { name, exact: true });
		await expect(field('Summary')).toHaveValue('Max button ignores the fee');
		await expect(field('Environment')).toHaveValue('Android 14 · Sepolia');
		await expect(field('Steps to reproduce')).toHaveValue('');
		await expect(field('Expected result')).toHaveValue('');
		await expect(field('Actual result')).toHaveValue(
			'Max button ignores the fee\nSeen on USDT TRC-20'
		);
		await expect(field('Notes')).toHaveValue(
			'Session: Explore withdraw limits (v2.3.0), at 12 min.'
		);
		await expect(dialog(page)).toContainText('No screenshots on this finding.');

		await page.getByTestId('bug-report-copy').click();
		await expect(toast(page)).toHaveText('Copied as Markdown');
		expect(await copied(page)).toEqual([
			renderReport(buildFindingReport(SESSION, BUG), [], 'markdown')
		]);

		// Closing without edits returns focus to the finding's button.
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(createButton(page)).toBeFocused();
	});

	test('is built from the finding as edited, each time it opens', async ({ page }) => {
		await openSession(page);
		await page.getByRole('button', { name: 'Edit the finding at 12 min' }).click();
		const edit = page.getByRole('form', { name: 'Edit the finding at 12 min' });
		await edit.getByRole('textbox', { name: 'Finding' }).fill('Fee shown as 0');
		await edit.getByRole('button', { name: 'Save' }).click();
		await openReport(page);
		await expect(dialog(page).getByRole('textbox', { name: 'Summary' })).toHaveValue(
			'Fee shown as 0'
		);
	});

	test("lists the finding's screenshots as attachments and downloads them (FR-122)", async ({
		page
	}) => {
		await openSession(page);
		await page.getByRole('button', { name: 'Edit the finding at 12 min' }).click();
		const edit = page.getByRole('form', { name: 'Edit the finding at 12 min' });
		await edit.getByLabel('Screenshot files').setInputFiles([
			{ name: 'a.png', mimeType: 'image/png', buffer: png(64, 48) },
			{ name: 'b.png', mimeType: 'image/png', buffer: png(64, 48) }
		]);
		await expect(edit.getByRole('img')).toHaveCount(2);
		await edit.getByRole('button', { name: 'Save' }).click();

		await openReport(page);
		const attachments = dialog(page).getByTestId('bug-report-attachment');
		await expect(attachments).toHaveCount(2);
		// The finding's id starts "f-bug-1", cut to its first 8 letters and digits.
		const names = /^finding-fbug1-[12]\.(webp|jpg)$/;
		// One by one: allTextContents() runs evaluateAll, which crashes Playwright's Firefox inside
		// a modal dialog (T-063).
		const shown = [
			`${await attachments.nth(0).locator('.file').textContent()}`,
			`${await attachments.nth(1).locator('.file').textContent()}`
		];
		expect(shown.every((name) => names.test(name))).toBe(true);

		await page.getByTestId('bug-report-copy').click();
		const [text] = await copied(page);
		for (const name of shown) expect(text).toContain(name);

		expect(await savedNames(page, page.getByTestId('bug-report-download-all'), 2)).toEqual(
			[...shown].sort()
		);
	});
});

test.describe('Copy session (FR-132)', () => {
	test('copies the session as Markdown with its findings grouped by type', async ({ page }) => {
		await openSession(page);
		await page.getByTestId('session-copy').click();
		await expect(toast(page)).toHaveText('Copied session');
		const [text] = await copied(page);
		expect(text).toBe(sessionMarkdown(SESSION, [BUG, NOTE as Finding], NOW));
		expect(text).toContain('### Bugs (1)\n- at 12 min: Max button ignores the fee Seen on');
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations in a finding's bug report in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		// Reduced motion: the dialog's opening fade would otherwise be scanned half-way.
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openSession(page);
		await openReport(page);
		expect(await scanA11y(page)).toEqual([]);
	});
}
