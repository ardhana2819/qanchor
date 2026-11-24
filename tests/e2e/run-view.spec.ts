import { expect, test, type Page } from '@playwright/test';
import {
	appOpened,
	putRecords,
	readStore,
	scanA11y,
	seedCases,
	tabTo,
	testCase,
	testResult,
	testRun
} from './helpers.ts';

// Run execution (T-055; design 13.3 P2-04, 13.4; FR-111, FR-113 AC-2, AC-3, AC-5, FR-123).

interface StoredResult {
	runId: string;
	caseNumber: number;
	status: string;
	failedStep: number | null;
	actual: string;
	reason: string;
	notes: string;
	linkedIssue: string;
}

const DEPOSIT = {
	title: 'Deposit USDT on Tron',
	preconditions: 'Wallet funded with 10 TRX',
	steps: [
		{ action: 'Open Deposit and pick USDT on Tron', expected: 'A Tron address is shown' },
		{ action: 'Send 5 USDT to it', expected: '' }
	],
	expected: 'The balance rises by 5 USDT',
	priority: 'high'
};

/** A run of three cases, as the snapshots of `testCase` with the deposit case first. */
function threeCaseRun(fields: Record<string, unknown> = {}) {
	const run = testRun('run-1', [1, 2, 3], {
		name: 'Release 2.3 regression',
		release: 'v2.3.0',
		environment: 'Pixel 7, Android 14\nNetwork: Tron Nile',
		...fields
	});
	run.cases[0] = { ...run.cases[0], ...DEPOSIT };
	return run;
}

async function openRun(
	page: Page,
	{
		results = [],
		run = threeCaseRun(),
		path = '/runs/view?id=run-1'
	}: {
		results?: object[];
		run?: object;
		path?: string;
	} = {}
): Promise<void> {
	await page.goto('/runs');
	await appOpened(page);
	await seedCases(page, [testCase(1, DEPOSIT), testCase(2), testCase(3)] as { number: number }[]);
	await putRecords(page, 'runs', [run]);
	if (results.length > 0) await putRecords(page, 'results', results);
	await page.goto(path);
	await expect(page.getByTestId('run-loading')).toHaveCount(0);
}

const caseTitle = (page: Page) => page.locator('#run-case-title');
const caseKey = (page: Page) => page.getByTestId('run-case-key');
const counts = (page: Page) => page.getByTestId('run-counts');
const radio = (page: Page, name: 'Pass' | 'Fail' | 'Blocked') =>
	page.getByTestId('run-result').getByRole('radio', { name: new RegExp(`^${name}`) });
const saveStatus = (page: Page) => page.getByTestId('run-save-status');
const saveResult = (page: Page) => page.getByTestId('run-save-result');
const actual = (page: Page) => page.getByRole('textbox', { name: 'Actual result' });
const reason = (page: Page) => page.getByRole('textbox', { name: 'Reason' });
const notes = (page: Page) => page.getByRole('textbox', { name: 'Notes (optional)' });
const rows = (page: Page) => page.getByTestId('run-case-row');
const results = (page: Page) => readStore<StoredResult>(page, 'results');
const live = (page: Page) => page.locator('div.visually-hidden[aria-live="polite"]');

test.describe('opening a run (FR-111 AC-1, FR-090 AC-3, EC-028)', () => {
	test('the built page holds only the loading state', async ({ request }) => {
		const html = await (await request.get('/runs/view')).text();
		expect(html).toContain('Loading run…');
	});

	test('a run URL without an ID goes to the run list', async ({ page }) => {
		await page.goto('/runs/view');
		await expect(page).toHaveURL(/\/runs$/);
	});

	test('an unknown ID shows "Run not found" with a way back', async ({ page }) => {
		await openRun(page, { path: '/runs/view?id=missing' });
		await expect(page.getByTestId('run-not-found')).toContainText('Run not found');
		await page.getByRole('link', { name: 'Back to test runs' }).click();
		await expect(page).toHaveURL(/\/runs$/);
	});

	test('the header shows the run, and the first case shows everything needed to run it', async ({
		page
	}) => {
		await openRun(page, { results: [testResult('run-1', 2, 'pass')] });

		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Release 2.3 regression');
		await expect(page.getByText('Release v2.3.0')).toBeVisible();
		await expect(page.getByTestId('run-environment').locator('summary')).toHaveText(
			'Environment: Pixel 7, Android 14'
		);
		await expect(counts(page)).toHaveText('1 passed, 0 failed, 0 blocked, 2 untested');
		await expect(
			page.getByRole('img', { name: '1 passed, 0 failed, 0 blocked, 2 untested' })
		).toBeVisible();

		await expect(page).toHaveURL(/\/runs\/view\?id=run-1&case=TC-1$/);
		await expect(caseKey(page)).toHaveText('TC-1');
		await expect(caseTitle(page)).toHaveText('Deposit USDT on Tron');
		await expect(page.getByTestId('run-case-position')).toHaveText('Case 1 of 3');
		await expect(page.getByTestId('run-preconditions')).toHaveText('Wallet funded with 10 TRX');
		const steps = page.getByRole('table', { name: 'Steps for TC-1' });
		await expect(steps.getByRole('row')).toHaveCount(3);
		await expect(steps.getByRole('row').nth(2)).toContainText('None');
		await expect(page.getByTestId('run-expected')).toHaveText('The balance rises by 5 USDT');
		await expect(page.getByTestId('run-result').getByText('Untested')).toBeVisible();
		await expect(saveStatus(page)).toHaveText('Pick a result. Pass is saved at once.');
	});

	test('Next, Previous, and the case list move between cases, and the URL keeps the case', async ({
		page
	}) => {
		await openRun(page);
		await expect(page.getByTestId('run-previous')).toBeDisabled();

		await page.getByTestId('run-next').click();
		await expect(caseKey(page)).toHaveText('TC-2');
		await expect(caseTitle(page)).toBeFocused();
		await expect(live(page)).toHaveText('Case 2 of 3: Case 2');
		await expect(page).toHaveURL(/case=TC-2$/);

		await rows(page).filter({ hasText: 'TC-3' }).click();
		await expect(caseKey(page)).toHaveText('TC-3');
		await expect(rows(page).filter({ hasText: 'TC-3' })).toHaveAttribute('aria-current', 'true');
		await expect(page.getByTestId('run-next')).toBeDisabled();

		await page.reload();
		await expect(caseKey(page)).toHaveText('TC-3');
		await page.getByTestId('run-previous').click();
		await expect(caseKey(page)).toHaveText('TC-2');
	});

	test('an unknown case in the URL opens the first case', async ({ page }) => {
		await openRun(page, { path: '/runs/view?id=run-1&case=TC-99' });
		await expect(caseKey(page)).toHaveText('TC-1');
		await expect(page).toHaveURL(/case=TC-1$/);
	});

	test('the case list can show only one result', async ({ page }) => {
		await openRun(page, {
			results: [testResult('run-1', 1, 'pass'), testResult('run-1', 3, 'fail')]
		});
		const filter = page.getByTestId('run-case-filter');
		await filter.selectOption('fail');
		await expect(rows(page)).toHaveText([/TC-3/]);
		await filter.selectOption('untested');
		await expect(rows(page)).toHaveText([/TC-2/]);
		await filter.selectOption('blocked');
		await expect(page.getByTestId('run-no-cases')).toHaveText('No case with this result.');
	});
});

test.describe('saving results (FR-111 AC-2 to AC-6)', () => {
	test('Pass is saved at once with its time, and the counts update (AC-2)', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Pass').check();

		await expect(saveStatus(page)).toHaveText(/Saved \d\d:\d\d$/);
		await expect(counts(page)).toHaveText('1 passed, 0 failed, 0 blocked, 2 untested');
		await expect(rows(page).first()).toContainText('Pass');
		await expect(live(page)).toHaveText(
			'TC-1 marked Passed. 1 passed, 0 failed, 0 blocked, 2 untested.'
		);
		expect(await results(page)).toMatchObject([{ runId: 'run-1', caseNumber: 1, status: 'pass' }]);
	});

	test('Fail needs the actual result before it is saved; until then the case keeps its status (AC-3)', async ({
		page
	}) => {
		await openRun(page);
		await radio(page, 'Fail').check();

		await expect(saveStatus(page)).toHaveText('Not saved yet: write the actual result, then save.');
		await expect(rows(page).first()).toContainText('Untested');
		await expect(page.getByRole('combobox', { name: 'Failed step' })).toHaveValue('2');
		await expect(
			page.getByRole('combobox', { name: 'Failed step' }).getByRole('option')
		).toHaveText([
			'Step 1: Open Deposit and pick USDT…',
			'Step 2: Send 5 USDT to it',
			'Not step-specific'
		]);

		await saveResult(page).click();
		await expect(actual(page)).toBeFocused();
		await expect(actual(page)).toHaveAccessibleDescription(
			'Write the actual result to save a failure.'
		);
		expect(await results(page)).toEqual([]);

		await page.getByRole('combobox', { name: 'Failed step' }).selectOption('1');
		await actual(page).fill('No address is shown');
		await saveResult(page).click();

		await expect(page.getByTestId('app-toast')).toHaveText('Saved TC-1.');
		await expect(saveStatus(page)).toHaveText(/Saved \d\d:\d\d$/);
		await expect(saveResult(page)).toHaveCount(0);
		await expect(rows(page).first()).toContainText('Fail');
		await expect(page.getByTestId('run-step').first()).toHaveClass(/failed/);
		expect(await results(page)).toMatchObject([
			{ status: 'fail', failedStep: 1, actual: 'No address is shown' }
		]);
	});

	test('Blocked needs the reason (AC-4)', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Blocked').check();
		await expect(saveStatus(page)).toHaveText('Not saved yet: write the reason, then save.');
		await saveResult(page).click();
		await expect(reason(page)).toBeFocused();
		await expect(reason(page)).toHaveAccessibleDescription('Write the reason to save a block.');

		await reason(page).fill('The Nile faucet is down');
		await saveResult(page).click();
		await expect(rows(page).first()).toContainText('Blocked');
		expect(await results(page)).toMatchObject([
			{ status: 'blocked', reason: 'The Nile faucet is down' }
		]);
	});

	test('notes and a changed field of a stored result save when the field is left (AC-5)', async ({
		page
	}) => {
		await openRun(page);
		await radio(page, 'Pass').check();
		await expect(saveStatus(page)).toHaveText(/Saved \d/);

		await notes(page).fill('Checked on a slow network too');
		await expect(saveStatus(page)).toHaveText('Not saved yet.');
		await notes(page).blur();
		await expect(saveStatus(page)).toHaveText(/Saved \d/);
		expect(await results(page)).toMatchObject([
			{ status: 'pass', notes: 'Checked on a slow network too' }
		]);
	});

	test('changing a saved status keeps the old fields until saved, so it can be undone (AC-6)', async ({
		page
	}) => {
		await openRun(page, {
			results: [{ ...testResult('run-1', 1, 'fail'), actual: 'No address is shown' }]
		});
		await expect(actual(page)).toHaveValue('No address is shown');

		await radio(page, 'Blocked').check();
		await expect(actual(page)).toHaveCount(0);
		await expect(rows(page).first()).toContainText('Fail');
		await radio(page, 'Fail').check();
		await expect(actual(page)).toHaveValue('No address is shown');
		await expect(saveStatus(page)).toHaveText(/Saved \d/);

		// Pass replaces the failure; there is no result history.
		await radio(page, 'Pass').check();
		await expect(rows(page).first()).toContainText('Pass');
		expect(await results(page)).toMatchObject([{ status: 'pass' }]);
		expect(await results(page)).toHaveLength(1);
	});

	test('an unsaved form is kept while moving to another case and back', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();
		await actual(page).fill('Half written');
		await page.getByTestId('run-next').click();
		await expect(caseKey(page)).toHaveText('TC-2');
		await expect(page.getByTestId('run-result').getByText('Untested')).toBeVisible();
		await page.getByTestId('run-previous').click();
		await expect(actual(page)).toHaveValue('Half written');
		await expect(saveResult(page)).toBeVisible();
	});

	test('two tabs saving different cases keep both results; the same case keeps the last (AC-8)', async ({
		page,
		context
	}) => {
		await openRun(page);
		const other = await context.newPage();
		await other.goto('/runs/view?id=run-1&case=TC-2');
		await expect(other.getByTestId('run-case-key')).toHaveText('TC-2');

		await radio(page, 'Pass').check();
		await expect(saveStatus(page)).toHaveText(/Saved \d/);
		await radio(other, 'Pass').check();
		await expect(saveStatus(other)).toHaveText(/Saved \d/);
		expect((await results(page)).map((r) => r.caseNumber).sort()).toEqual([1, 2]);

		await other.getByTestId('run-previous').click();
		await radio(other, 'Blocked').check();
		await reason(other).fill('Later write');
		await saveResult(other).click();
		await expect(saveStatus(other)).toHaveText(/Saved \d/);
		const first = (await results(page)).find((r) => r.caseNumber === 1);
		expect(first).toMatchObject({ status: 'blocked', reason: 'Later write' });
	});
});

test.describe('linked issue (FR-123)', () => {
	test('a URL becomes a link that opens in a new tab; a key stays text', async ({ page }) => {
		await openRun(page);
		await radio(page, 'Fail').check();
		await page.getByRole('textbox', { name: 'Linked issue (optional)' }).fill(' PAY-123 ');
		await actual(page).fill('Wrong amount');
		await saveResult(page).click();
		await expect(saveStatus(page)).toHaveText(/Saved \d/);
		await expect(page.getByTestId('run-issue-link')).toHaveCount(0);
		expect(await results(page)).toMatchObject([{ linkedIssue: 'PAY-123' }]);

		const field = page.getByRole('textbox', { name: 'Linked issue (optional)' });
		await field.fill('https://jira.example.com/browse/PAY-123');
		await field.blur();
		const link = page.getByTestId('run-issue-link');
		await expect(link).toHaveAttribute('href', 'https://jira.example.com/browse/PAY-123');
		await expect(link).toHaveAttribute('target', '_blank');
		await expect(link).toHaveAttribute('rel', 'noopener noreferrer');

		await field.fill('javascript:alert(1)');
		await field.blur();
		await expect(saveStatus(page)).toHaveText(/Saved \d/);
		await expect(page.getByTestId('run-issue-link')).toHaveCount(0);
	});
});

test.describe('keyboard shortcuts (FR-111 AC-7, design 13.4)', () => {
	test('P, F, B set the result; J, K move; ? lists them', async ({ page }) => {
		await openRun(page);
		await caseTitle(page).focus();

		await page.keyboard.press('p');
		await expect(rows(page).first()).toContainText('Pass');
		await page.keyboard.press('j');
		await expect(caseKey(page)).toHaveText('TC-2');

		await page.keyboard.press('f');
		await expect(actual(page)).toBeFocused();
		// Typing in a text field never triggers a shortcut.
		await page.keyboard.type('jk pfb');
		await expect(actual(page)).toHaveValue('jk pfb');
		await expect(caseKey(page)).toHaveText('TC-2');
		await caseTitle(page).focus();

		await page.keyboard.press('b');
		await expect(reason(page)).toBeFocused();
		await caseTitle(page).focus();
		await page.keyboard.press('k');
		await expect(caseKey(page)).toHaveText('TC-1');

		await page.keyboard.press('?');
		const dialog = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
		await expect(dialog).toBeVisible();
		await expect(page.getByTestId('run-shortcut-list')).toContainText('Next case, previous case');
		// Not while a dialog is open.
		await page.keyboard.press('j');
		await expect(caseKey(page)).toHaveText('TC-1');
		await page.keyboard.press('Escape');
		await expect(dialog).toBeHidden();
	});

	test('a shortcut with Ctrl, Alt, or Cmd does nothing', async ({ page }) => {
		await openRun(page);
		await caseTitle(page).focus();
		await page.keyboard.press('Alt+p');
		await page.keyboard.press('Control+j');
		await expect(caseKey(page)).toHaveText('TC-1');
		expect(await results(page)).toEqual([]);
	});

	test('the Keyboard shortcuts button opens the list', async ({ page }) => {
		await openRun(page);
		await page.getByTestId('run-shortcuts').click();
		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
	});

	test('a whole run can be executed with the keyboard only (NFR-008)', async ({ page }) => {
		await openRun(page);
		await tabTo(page, radio(page, 'Pass'));
		await page.keyboard.press('Space');
		await expect(rows(page).first()).toContainText('Pass');
		await tabTo(page, page.getByTestId('run-next'), 60, 'Shift+Tab');
		await page.keyboard.press('Enter');
		await expect(caseKey(page)).toHaveText('TC-2');
		await page.keyboard.press('b');
		await page.keyboard.type('No funds');
		await tabTo(page, saveResult(page));
		await page.keyboard.press('Enter');
		await expect(rows(page).nth(1)).toContainText('Blocked');
		await caseTitle(page).focus();
		await page.keyboard.press('j');
		await page.keyboard.press('f');
		await page.keyboard.type('Broken');
		await tabTo(page, saveResult(page));
		await page.keyboard.press('Enter');
		await expect(counts(page)).toHaveText('1 passed, 1 failed, 1 blocked, 0 untested');
	});
});

test.describe('completing a run (FR-113 AC-2, AC-3)', () => {
	test('Complete asks first with the untested count, then the run is read-only', async ({
		page
	}) => {
		await openRun(page, { results: [testResult('run-1', 1, 'pass')] });
		await page.getByTestId('run-complete').click();
		const dialog = page.getByRole('dialog', { name: 'Complete this run?' });
		await expect(page.getByTestId('run-complete-body')).toHaveText(
			'2 test cases are still untested. They will stay untested in the run and the release summary.'
		);
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await page.getByTestId('run-confirm-complete').click();

		await expect(page.getByTestId('app-toast')).toHaveText(
			'Run completed: 1 passed, 0 failed, 0 blocked.'
		);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Completed');
		await expect(radio(page, 'Fail')).toBeDisabled();
		await expect(saveStatus(page)).toHaveText(
			'This run is completed. Reopen it to change results.'
		);
		await caseTitle(page).focus();
		await page.keyboard.press('f');
		await expect(actual(page)).toHaveCount(0);
		expect((await readStore<{ status: string }>(page, 'runs'))[0].status).toBe('completed');

		await page.getByTestId('run-reopen').click();
		await expect(page.getByTestId('app-toast')).toHaveText('Run reopened.');
		await expect(radio(page, 'Fail')).toBeEnabled();
		expect((await readStore<{ status: string }>(page, 'runs'))[0].status).toBe('in-progress');
	});

	test('a completed run opens read-only, with its notes shown as text', async ({ page }) => {
		await openRun(page, {
			run: threeCaseRun({ status: 'completed', completedAt: Date.UTC(2026, 10, 3) }),
			results: [{ ...testResult('run-1', 1, 'pass'), notes: 'All good' }]
		});
		await expect(notes(page)).toHaveValue('All good');
		await expect(notes(page)).toHaveAttribute('readonly', '');
		await expect(page.getByTestId('run-reopen')).toBeVisible();
	});
});

test('Copy summary copies the run as Markdown (FR-113 AC-5)', async ({ page }) => {
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		navigator.clipboard.writeText = async (text: string) => {
			copied.push(text);
		};
	});
	await openRun(page, {
		results: [
			testResult('run-1', 1, 'pass'),
			{ ...testResult('run-1', 2, 'fail'), actual: 'Shows 0 USDT', linkedIssue: 'PAY-9' }
		]
	});
	await page.getByTestId('run-copy-summary').click();
	await expect(page.getByTestId('app-toast')).toHaveText('Copied run summary');
	const [copied] = await page.evaluate(
		() => (window as unknown as { __copied: string[] }).__copied
	);
	expect(copied).toBe(
		[
			'## Run: Release 2.3 regression',
			'',
			'- Release: v2.3.0',
			'- Environment: Pixel 7, Android 14 Network: Tron Nile',
			'',
			'1 passed, 1 failed, 0 blocked, 1 untested (3 cases)',
			'',
			'### Failed and blocked',
			'- TC-2 Case 2: Failed. Shows 0 USDT (PAY-9)',
			''
		].join('\n')
	);
});

test('below 1024 px the case list is a disclosure above the case', async ({ page }) => {
	await page.setViewportSize({ width: 600, height: 900 });
	await openRun(page);
	const toggle = page.getByTestId('run-case-list-toggle');
	await expect(toggle).toHaveText('Case 1 of 3 · show all');
	await expect(rows(page).first()).toBeHidden();
	await toggle.click();
	await rows(page).nth(1).click();
	await expect(caseKey(page)).toHaveText('TC-2');
	await expect(rows(page).first()).toBeHidden();
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations on a run in ${colorScheme} mode (NFR-009)`, async ({ page }) => {
		await page.emulateMedia({ colorScheme });
		await openRun(page, {
			results: [testResult('run-1', 2, 'pass'), testResult('run-1', 3, 'blocked')]
		});
		await radio(page, 'Fail').check();
		await saveResult(page).click();
		await page.evaluate(() => Promise.allSettled(document.getAnimations().map((a) => a.finished)));
		expect(await scanA11y(page)).toEqual([]);
	});
}
