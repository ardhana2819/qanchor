import { expect, test, type Page } from '@playwright/test';
import {
	appOpened,
	putRecords,
	readStore,
	scanA11y,
	tabTo,
	testFinding,
	testRun,
	testSession
} from './helpers.ts';

// Sessions list and Start session (T-069; design 13.3 P2-06, 13.7; FR-130 AC-1, FR-090 AC-1).

interface StoredSession {
	id: string;
	charter: string;
	release: string;
	environment: string;
	timeboxMinutes: number;
	status: string;
	pausedMs: number;
	endedAt: number | null;
}

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 1);

const rows = (page: Page) => page.getByTestId('sessions-row');
const toast = (page: Page) => page.getByTestId('app-toast');
const charter = (page: Page) => page.getByRole('textbox', { name: 'Charter' });
const minutes = (page: Page) => page.getByRole('textbox', { name: 'Minutes' });
const start = (page: Page) => page.getByTestId('session-start');
const timebox = (page: Page, label: string) =>
	page.getByRole('group', { name: 'Timebox' }).getByRole('radio', { name: label });

async function seed(
	page: Page,
	{
		sessions = [],
		findings = [],
		runs = [],
		screenshots = []
	}: { sessions?: object[]; findings?: object[]; runs?: object[]; screenshots?: object[] }
): Promise<void> {
	await page.goto('/sessions');
	await appOpened(page);
	if (sessions.length > 0) await putRecords(page, 'sessions', sessions);
	if (findings.length > 0) await putRecords(page, 'findings', findings);
	if (runs.length > 0) await putRecords(page, 'runs', runs);
	if (screenshots.length > 0) await putRecords(page, 'screenshots', screenshots);
}

async function open(page: Page, path = '/sessions'): Promise<void> {
	await page.goto(path);
	await expect(page.getByTestId('sessions-loading')).toHaveCount(0);
}

const screenshot = (id: string, sessionId: string, findingId: string) => ({
	id,
	owner: ['finding', sessionId, findingId],
	n: 1,
	mediaType: 'image/png',
	width: 1,
	height: 1,
	size: 1,
	createdAt: T0,
	bytes: new Uint8Array([1]).buffer
});

test.describe('Sessions list (FR-130 AC-1)', () => {
	test('the built page holds only the loading state (FR-090 AC-4)', async ({ request }) => {
		const html = await (await request.get('/sessions')).text();
		expect(html).toContain('Loading sessions…');
		expect(html).not.toContain('No sessions yet');
	});

	test('with no sessions, the form and the empty state are shown (design 13.7)', async ({
		page
	}) => {
		await open(page);
		await expect(page.getByTestId('sessions-empty')).toHaveText(
			'No sessions yet. Start one with a charter and a timebox.'
		);
		await expect(page.getByRole('form', { name: 'Start session' })).toBeVisible();
		await expect(timebox(page, '60 min')).toBeChecked();
		await expect(minutes(page)).toHaveCount(0);
	});

	test('with storage unavailable, the page explains it (FR-090 AC-5)', async ({ page }) => {
		await page.addInitScript(() => {
			IDBFactory.prototype.open = () => {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			};
		});
		await page.goto('/sessions');
		await expect(page.getByTestId('sessions-unavailable')).toContainText(
			'Sessions need storage, which is unavailable in this tab'
		);
		await expect(page.getByRole('form', { name: 'Start session' })).toHaveCount(0);
	});

	test('each row shows charter, release, status, time, and findings by type, newest first', async ({
		page
	}) => {
		await page.clock.setFixedTime(T0 + 3 * 60 * MIN);
		await seed(page, {
			sessions: [
				testSession('old', {
					charter: 'Explore deposits',
					release: 'v2.3.0',
					status: 'ended',
					endedAt: T0 + 45 * MIN,
					timeboxMinutes: 30
				}),
				testSession('mid', {
					charter: 'Explore withdraw limits',
					status: 'paused',
					pausedAt: T0 + 70 * MIN,
					pausedMs: 5 * MIN,
					createdAt: T0 + 1
				}),
				testSession('new', { charter: 'Explore fees', createdAt: T0 + 2, timeboxMinutes: 90 })
			],
			findings: [
				testFinding('f1', 'mid', { type: 'bug' }),
				testFinding('f2', 'mid', { type: 'bug' }),
				testFinding('f3', 'mid', { type: 'question' }),
				testFinding('f4', 'old', { type: 'idea' })
			]
		});
		await open(page);

		await expect(page.getByTestId('sessions-count')).toHaveText('3 sessions');
		await expect(rows(page).locator('td:first-child')).toHaveText([
			'Explore fees',
			'Explore withdraw limits',
			'Explore deposits'
		]);
		const [fees, limits, deposits] = [rows(page).nth(0), rows(page).nth(1), rows(page).nth(2)];
		await expect(fees).toContainText('None');
		await expect(fees).toContainText('Running');
		// The running clock counts from the start time, read once when the list is shown.
		await expect(fees).toContainText('3 h of 1 h 30 min');
		await expect(fees).toContainText('No findings');
		await expect(limits).toContainText('Paused');
		await expect(limits).toContainText('1 h 5 min of 1 h');
		await expect(limits).toContainText('2 bugs · 1 question');
		await expect(deposits).toContainText('v2.3.0');
		await expect(deposits).toContainText('Ended');
		await expect(deposits).toContainText('45 min of 30 min');
		await expect(deposits).toContainText('1 idea');
	});

	test('deleting a session asks first, then removes it with its findings and screenshots (NFR-024)', async ({
		page
	}) => {
		await seed(page, {
			sessions: [
				testSession('a', { charter: 'Explore limits' }),
				testSession('b', { charter: 'Other', createdAt: T0 - 1 })
			],
			findings: [testFinding('f1', 'a'), testFinding('f2', 'a'), testFinding('f3', 'b')],
			screenshots: [screenshot('s1', 'a', 'f1'), screenshot('s2', 'b', 'f3')]
		});
		await open(page);

		await rows(page).first().getByRole('button', { name: 'Delete Explore limits' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete session "Explore limits"?' });
		await expect(page.getByTestId('sessions-delete-findings')).toHaveText(
			'Its 2 findings and 1 screenshot are deleted too. This cannot be undone.'
		);
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(rows(page)).toHaveCount(2);

		await rows(page).first().getByRole('button', { name: 'Delete Explore limits' }).click();
		await page.getByTestId('sessions-confirm-delete').click();
		await expect(toast(page)).toHaveText('Deleted session "Explore limits".');
		await expect(rows(page)).toHaveCount(1);
		await expect(page.getByRole('region', { name: 'Sessions' })).toBeFocused();

		expect((await readStore<StoredSession>(page, 'sessions')).map((s) => s.id)).toEqual(['b']);
		expect((await readStore<{ id: string }>(page, 'findings')).map((f) => f.id)).toEqual(['f3']);
		expect((await readStore<{ id: string }>(page, 'screenshots')).map((s) => s.id)).toEqual(['s2']);
	});

	test('a session with no findings says so, and deleting the last one shows the empty state', async ({
		page
	}) => {
		await seed(page, { sessions: [testSession('a', { charter: 'Fresh' })] });
		await open(page);
		await page.getByRole('button', { name: 'Delete Fresh' }).click();
		await expect(page.getByTestId('sessions-delete-findings')).toHaveText(
			'It has no findings. This cannot be undone.'
		);
		await page.getByTestId('sessions-confirm-delete').click();
		await expect(page.getByTestId('sessions-empty')).toBeFocused();
	});

	test('a charter opens its session; an unknown or missing ID is handled (FR-090 AC-3)', async ({
		page
	}) => {
		await seed(page, {
			sessions: [
				testSession('a', {
					charter: 'Explore limits',
					release: 'v2.3.0',
					environment: 'Android 14\nSepolia',
					timeboxMinutes: 45
				})
			]
		});
		await open(page);
		await page.getByRole('link', { name: 'Explore limits' }).click();
		await expect(page).toHaveURL(/\/sessions\/view\?id=a$/);
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Explore limits');
		await expect(page.getByRole('heading', { level: 1 })).toContainText('Running');
		await expect(page.getByTestId('session-meta')).toContainText('Timebox 45 min');
		await expect(page.getByTestId('session-meta')).toContainText('Release v2.3.0');
		await expect(page.getByTestId('session-environment-line')).toContainText(
			'Environment: Android 14'
		);
		await expect(page).toHaveTitle('Explore limits · QAnchor');

		await page.goto('/sessions/view?id=nope');
		await expect(page.getByTestId('session-not-found')).toContainText('Session not found');
		await page.getByRole('link', { name: 'Back to sessions' }).click();
		await expect(page).toHaveURL(/\/sessions$/);

		await page.goto('/sessions/view');
		await expect(page).toHaveURL(/\/sessions$/);
	});

	test('Sessions is in the QA group of the navigation and on the index (FR-090 AC-1)', async ({
		page
	}) => {
		await page.goto('/');
		const qa = page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'QA' });
		await expect(qa.getByRole('link', { name: 'Sessions' })).toBeVisible();
		await expect(page.getByRole('main').getByRole('link', { name: 'Sessions' })).toBeVisible();
		await qa.getByRole('link', { name: 'Sessions' }).click();
		await expect(page).toHaveURL(/\/sessions$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sessions');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`no WCAG 2.1 AA violations with sessions in ${colorScheme} mode (NFR-009)`, async ({
			page
		}) => {
			await page.emulateMedia({ colorScheme });
			await seed(page, {
				sessions: [
					testSession('a', { release: 'v2.3.0' }),
					testSession('b', { status: 'paused', pausedAt: T0 + MIN, createdAt: T0 + 1 }),
					testSession('c', { status: 'ended', endedAt: T0 + MIN, createdAt: T0 + 2 })
				],
				findings: [testFinding('f1', 'a', { type: 'bug' })]
			});
			await open(page);
			await timebox(page, 'Custom').check();
			await start(page).click();
			// toHaveCount, not toBeVisible, before a scan: see scanA11y.
			await expect(page.getByText('Enter a charter.')).toHaveCount(1);
			expect(await scanA11y(page)).toEqual([]);

			await page.goto('/sessions/view?id=a');
			await expect(page.getByTestId('session-meta')).toHaveCount(1);
			expect(await scanA11y(page)).toEqual([]);
		});
	}
});

test.describe('Start session (FR-130 AC-1)', () => {
	test('needs a charter, and focuses it', async ({ page }) => {
		await open(page);
		await start(page).click();
		await expect(charter(page)).toBeFocused();
		await expect(page.getByText('Enter a charter.')).toBeVisible();
		expect(await readStore(page, 'sessions')).toEqual([]);
	});

	test('a custom timebox of 4 or 481 minutes, or none, cannot start (PRD 10.5)', async ({
		page
	}) => {
		await open(page);
		await charter(page).fill('Explore withdraw limits');
		await timebox(page, 'Custom').check();
		await expect(minutes(page)).toBeFocused();

		for (const value of ['', '4', '481', '4.5']) {
			await minutes(page).fill(value);
			await start(page).click();
			await expect(minutes(page)).toBeFocused();
			await expect(page.getByText('Timebox from 5 to 480 minutes.')).toBeVisible();
		}
		expect(await readStore(page, 'sessions')).toEqual([]);
	});

	test('starting opens the session page and stores a running session', async ({ page }) => {
		await open(page);
		await charter(page).fill('  Explore withdraw limits  ');
		await timebox(page, 'Custom').check();
		await minutes(page).fill('45');
		await page.getByRole('combobox', { name: 'Release (optional)' }).fill(' v2.3.0 ');
		await page.getByRole('textbox', { name: 'Environment (optional)' }).fill('Android 14');
		await start(page).click();

		await expect(page).toHaveURL(/\/sessions\/view\?id=[0-9a-f-]{36}$/);
		await expect(page.getByTestId('session-charter-heading')).toHaveText('Explore withdraw limits');
		await expect(page.getByTestId('session-meta')).toContainText('Timebox 45 min');

		const [stored] = await readStore<StoredSession>(page, 'sessions');
		expect(stored).toMatchObject({
			charter: 'Explore withdraw limits',
			release: 'v2.3.0',
			environment: 'Android 14',
			timeboxMinutes: 45,
			status: 'running',
			pausedMs: 0,
			endedAt: null
		});
		await page.goBack();
		await expect(rows(page)).toHaveCount(1);
		await expect(rows(page)).toContainText('Running');
	});

	test('a preset needs no minutes, at 5 and 480 a custom value starts', async ({ page }) => {
		await open(page);
		await charter(page).fill('Preset');
		await timebox(page, '30 min').check();
		await start(page).click();
		await expect(page.getByTestId('session-meta')).toContainText('Timebox 30 min');

		for (const [value, shown] of [
			['5', '5 min'],
			['480', '8 h']
		]) {
			await open(page);
			await charter(page).fill(`Custom ${value}`);
			await timebox(page, 'Custom').check();
			await minutes(page).fill(value);
			await start(page).click();
			await expect(page.getByTestId('session-meta')).toContainText(`Timebox ${shown}`);
		}
	});

	test('suggests the releases of runs and sessions once, in their first spelling (EC-031)', async ({
		page
	}) => {
		await seed(page, {
			runs: [
				testRun('r1', [], { release: 'v2.3.0' }),
				testRun('r2', [], { release: 'V2.3.0 ', createdAt: T0 + 1 })
			],
			sessions: [testSession('a', { release: 'v2.4.0' }), testSession('b', { release: 'v2.3.0' })]
		});
		await open(page);
		const options = page.locator('datalist option');
		await expect(options).toHaveCount(2);
		expect(
			await options.evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value))
		).toEqual(['v2.3.0', 'v2.4.0']);
	});

	test('a session can be started with the keyboard only (NFR-008)', async ({ page }) => {
		await open(page);
		await tabTo(page, charter(page));
		await page.keyboard.type('Keyboard session');
		await tabTo(page, timebox(page, '60 min'));
		await page.keyboard.press('ArrowRight');
		await expect(timebox(page, '90 min')).toBeChecked();
		await tabTo(page, start(page));
		await page.keyboard.press('Enter');
		await expect(page.getByTestId('session-charter-heading')).toHaveText('Keyboard session');
		await expect(page.getByTestId('session-meta')).toContainText('Timebox 1 h 30 min');
	});
});
