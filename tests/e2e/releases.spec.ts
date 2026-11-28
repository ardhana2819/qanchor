import { expect, test, type Page } from '@playwright/test';
import {
	findRelease,
	groupReleases,
	releaseSummaryMarkdown,
	type ReleaseData
} from '#lib/core/qa/release.ts';
import type { Finding, Run, Session, TestResult } from '#lib/core/qa/types.ts';
import {
	appOpened,
	putRecords,
	scanA11y,
	testFinding,
	testResult,
	testRun,
	testSession
} from './helpers.ts';

// Releases (T-072; design 13.3 P2-07, 13.7; FR-140, FR-141, FR-090 AC-1, EC-031). The copied
// summary is compared with T-067's core output for the same stored records.

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 10, 20);
const result = (runId: string, n: number, status: string, fields: Partial<TestResult> = {}) => ({
	...testResult(runId, n, status),
	...fields
});

// Release v2.3.0: run Smoke (cases 1 to 4) and its retest (cases 1 and 5), and a session spelled
// " V2.3.0 " (EC-031). Latest per case: 1 passed on retest, 2 passed, 3 blocked, 4 untested,
// 5 failed: 2 passed of 4 executed.
const RUNS = [
	testRun('r1', [1, 2, 3, 4], {
		name: 'Smoke',
		release: 'v2.3.0',
		status: 'completed',
		createdAt: T0,
		updatedAt: T0
	}),
	testRun('r2', [1, 5], {
		name: 'Retest',
		release: 'v2.3.0',
		createdAt: T0 + DAY,
		updatedAt: T0 + DAY
	}),
	testRun('r3', [1], { name: 'Untagged run', createdAt: T0, updatedAt: T0 })
] as Run[];
const RESULTS = [
	result('r1', 1, 'fail', { actual: 'Fee shown as 0', updatedAt: T0 + 1 }),
	result('r1', 2, 'pass', { updatedAt: T0 + 2 }),
	result('r1', 3, 'blocked', {
		reason: 'No testnet funds\nFaucet is down',
		linkedIssue: 'https://issues.example.com/PAY-7',
		updatedAt: T0 + 3
	}),
	result('r2', 1, 'pass', { updatedAt: T0 + DAY + 1 }),
	result('r2', 5, 'fail', {
		actual: 'Memo dropped',
		linkedIssue: 'PAY-12',
		updatedAt: T0 + DAY + 2
	})
] as TestResult[];
const SESSIONS = [
	testSession('s1', {
		charter: 'Explore withdraw limits',
		release: ' V2.3.0 ',
		status: 'ended',
		startedAt: T0,
		endedAt: T0 + 45 * 60_000,
		createdAt: T0 + 10,
		updatedAt: T0 + 10
	}),
	testSession('s2', {
		charter: 'Explore staking',
		release: 'v2.4.0',
		status: 'ended',
		startedAt: T0,
		endedAt: T0 + 30 * 60_000,
		createdAt: T0 + 2 * DAY,
		updatedAt: T0 + 2 * DAY
	})
] as Session[];
const FINDINGS = [
	testFinding('f1', 's1', { type: 'bug', updatedAt: T0 + 11 }),
	testFinding('f2', 's1', { type: 'question', updatedAt: T0 + 12 })
] as Finding[];
const DATA: ReleaseData = { runs: RUNS, results: RESULTS, sessions: SESSIONS, findings: FINDINGS };

const toast = (page: Page) => page.getByTestId('app-toast');
const copied = (page: Page) =>
	page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);
const listRows = (page: Page) => page.getByTestId('releases-row');

async function seed(page: Page, data: ReleaseData = DATA): Promise<void> {
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		navigator.clipboard.writeText = async (text: string) => {
			copied.push(text);
		};
	});
	await page.goto('/releases');
	await appOpened(page);
	await putRecords(page, 'runs', data.runs as object[]);
	await putRecords(page, 'results', data.results as object[]);
	await putRecords(page, 'sessions', data.sessions as object[]);
	await putRecords(page, 'findings', data.findings as object[]);
}

async function openRelease(page: Page, query: string): Promise<void> {
	await page.goto(`/releases/view?${query}`);
	await expect(page.getByTestId('release-heading')).toBeVisible();
}

test.describe('Releases list (FR-140 AC-1, AC-5)', () => {
	test('is in the QA group and on the index (FR-090 AC-1)', async ({ page }) => {
		await page.goto('/');
		await appOpened(page);
		await expect(page.getByRole('main').getByRole('link', { name: 'Releases' })).toBeVisible();
		await page.getByRole('navigation').getByRole('link', { name: 'Releases' }).click();
		await expect(page).toHaveURL(/\/releases$/);
		await expect(page.getByRole('heading', { level: 1, name: 'Releases' })).toBeVisible();
	});

	test('shows the empty state with no release used', async ({ page }) => {
		await page.goto('/releases');
		await appOpened(page);
		await expect(page.getByTestId('releases-empty')).toHaveText(
			'No releases yet. Add a release to a run or a session to see it here.'
		);
	});

	test('lists each release once, latest activity first, "No release" last (EC-031)', async ({
		page
	}) => {
		await seed(page);
		await page.reload();
		await expect(listRows(page)).toHaveCount(3);
		await expect(page.getByTestId('releases-count')).toHaveText('3 releases');
		const cells = (i: number) => listRows(page).nth(i).getByRole('cell');
		// v2.4.0 (a session two days in) is the latest; v2.3.0 in its first spelling, both kinds.
		await expect(cells(0)).toHaveText(['v2.4.0', '0', '1', 'n/a', / ago$|2026$/]);
		await expect(cells(1)).toHaveText(['v2.3.0', '2', '1', '50.0%', / ago$|2026$/]);
		await expect(cells(2)).toHaveText(['No release', '1', '0', 'n/a', / ago$|2026$/]);

		await listRows(page).nth(1).getByRole('link', { name: 'v2.3.0' }).click();
		await expect(page).toHaveURL(/\/releases\/view\?name=v2\.3\.0$/);
		await expect(page.getByTestId('release-heading')).toHaveText('v2.3.0');
	});
});

test.describe('Release page (FR-140 AC-2 to AC-4, FR-141)', () => {
	test('totals come from the latest result per case, with each run its own counts', async ({
		page
	}) => {
		await seed(page);
		// Any spelling opens the release.
		await openRelease(page, 'name=V2.3.0');
		await expect(page.getByTestId('release-heading')).toHaveText('v2.3.0');
		await expect(page.getByTestId('release-meta')).toHaveText('2 runs · 1 session');
		await expect(page.getByTestId('release-executed')).toHaveText('4');
		await expect(page.getByTestId('release-pass-rate')).toHaveText('50.0%');
		await expect(page.getByTestId('release-pass-rate-detail')).toHaveText('from 2 of 4 executed');
		await expect(page.getByTestId('release-failed')).toHaveText('1');
		await expect(page.getByTestId('release-blocked')).toHaveText('1');
		await expect(page.getByTestId('release-untested')).toHaveText('1');

		const runRows = page.getByTestId('release-run-row');
		await expect(runRows).toHaveCount(2);
		await expect(runRows.nth(0)).toContainText('Smoke');
		await expect(runRows.nth(0)).toContainText('1 passed, 1 failed, 1 blocked, 1 untested');
		await expect(runRows.nth(1)).toContainText('1 passed, 1 failed, 0 blocked, 0 untested');
		await expect(runRows.nth(0).getByRole('img')).toHaveAccessibleName(
			'1 passed, 1 failed, 1 blocked, 1 untested'
		);
	});

	test('lists failed and blocked first; the rest is behind "Show …" (AC-3, AC-4)', async ({
		page
	}) => {
		await seed(page);
		await openRelease(page, 'name=v2.3.0');
		const open = page.getByTestId('release-open-row');
		await expect(open).toHaveCount(2);
		await expect(open.nth(0).getByRole('cell')).toHaveText([
			'TC-3',
			'Case 3',
			'Blocked',
			'No testnet funds',
			'https://issues.example.com/PAY-7'
		]);
		await expect(open.nth(0).getByRole('link')).toHaveAttribute(
			'href',
			'https://issues.example.com/PAY-7'
		);
		await expect(open.nth(1).getByRole('cell')).toHaveText([
			'TC-5',
			'Case 5',
			'Fail',
			'Memo dropped',
			'PAY-12'
		]);

		// Case 1 failed in Smoke but passed on retest: not an open failure.
		const others = page.getByTestId('release-others');
		await expect(others.locator('summary')).toHaveText('Show 2 passed and 1 untested');
		await expect(page.getByTestId('release-other-row').first()).toBeHidden();
		await others.locator('summary').click();
		await expect(page.getByTestId('release-other-row')).toHaveCount(3);
		await expect(page.getByTestId('release-other-row').nth(0)).toContainText('TC-1');
		await expect(page.getByTestId('release-other-row').nth(0)).toContainText('Pass');
	});

	test('lists the sessions with their findings counts', async ({ page }) => {
		await seed(page);
		await openRelease(page, 'name=v2.3.0');
		const sessionRow = page.getByTestId('release-session-row');
		await expect(sessionRow).toHaveCount(1);
		await expect(sessionRow.getByRole('cell')).toHaveText([
			'Explore withdraw limits',
			'Ended',
			'45 min',
			'1 bug · 1 question'
		]);
		await sessionRow.getByRole('link').click();
		await expect(page).toHaveURL(/\/sessions\/view\?id=s1$/);
	});

	test("copies T-067's Markdown summary (FR-141)", async ({ page }) => {
		await seed(page);
		await openRelease(page, 'name=v2.3.0');
		await page.getByTestId('release-copy').click();
		await expect(toast(page)).toHaveText('Copied release summary');
		const group = findRelease(groupReleases(DATA), 'v2.3.0');
		expect(group).not.toBeNull();
		const [text] = await copied(page);
		expect(text).toBe(releaseSummaryMarkdown(group!, DATA, Date.now()));
		expect(text).toContain('**Pass rate:** 50.0% (2 passed of 4 executed;');
	});

	test('a release with sessions only shows no broken figure', async ({ page }) => {
		await seed(page);
		await openRelease(page, 'name=v2.4.0');
		await expect(page.getByTestId('release-meta')).toHaveText('0 runs · 1 session');
		await expect(page.getByTestId('release-executed')).toHaveText('0');
		await expect(page.getByTestId('release-pass-rate')).toHaveText('n/a');
		await expect(page.getByTestId('release-pass-rate-detail')).toHaveText('No case executed yet');
		await expect(page.getByTestId('release-no-runs')).toHaveText('No run uses this release.');
		await expect(page.getByRole('heading', { name: 'Latest result per case' })).toHaveCount(0);
		await expect(page.getByTestId('release-session-row')).toHaveCount(1);
		await expect(page.locator('main')).not.toContainText(/NaN|undefined|Infinity/);
	});

	test('a release whose runs have no result yet shows them all untested', async ({ page }) => {
		await seed(page, {
			runs: [testRun('r9', [1, 2], { release: 'v3.0.0' })] as Run[],
			results: [],
			sessions: [],
			findings: []
		});
		await openRelease(page, 'name=v3.0.0');
		await expect(page.getByTestId('release-pass-rate')).toHaveText('n/a');
		await expect(page.getByTestId('release-untested')).toHaveText('2');
		await expect(page.getByTestId('release-no-open')).toHaveText('No case failed or is blocked.');
		await expect(page.getByTestId('release-others').locator('summary')).toHaveText(
			'Show 2 untested'
		);
		await expect(page.getByTestId('release-no-sessions')).toHaveText(
			'No session uses this release.'
		);
		await expect(page.locator('main')).not.toContainText(/NaN|undefined|Infinity/);
	});

	test('"No release" holds the runs and sessions without one (AC-5)', async ({ page }) => {
		await seed(page);
		await openRelease(page, 'none');
		await expect(page.getByTestId('release-heading')).toHaveText('No release');
		await expect(page.getByTestId('release-run-row')).toHaveText(/Untagged run/);
	});

	test('an unknown release says so and links back (design 13.7)', async ({ page }) => {
		await seed(page);
		await page.goto('/releases/view?name=v9.9.9');
		const notFound = page.getByTestId('release-not-found');
		await expect(notFound).toContainText('No run or session uses the release "v9.9.9".');
		await notFound.getByRole('link', { name: 'Back to releases' }).click();
		await expect(page).toHaveURL(/\/releases$/);
	});

	test('a URL that names no release goes to the list (EC-028)', async ({ page }) => {
		await page.goto('/releases/view');
		await expect(page).toHaveURL(/\/releases$/);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations on Releases in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await seed(page);
		await page.reload();
		await expect(listRows(page)).toHaveCount(3);
		expect(await scanA11y(page)).toEqual([]);

		await openRelease(page, 'name=v2.3.0');
		await page.getByTestId('release-others').locator('summary').click();
		await expect(page.getByTestId('release-other-row')).toHaveCount(3);
		expect(await scanA11y(page)).toEqual([]);
	});
}
