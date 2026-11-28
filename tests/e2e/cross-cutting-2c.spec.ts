import { expect, test, type Page } from '@playwright/test';
import {
	appOpened,
	controlsWithoutFocusRing,
	hasCrypto,
	png,
	putRecords,
	readStore,
	recordRequests,
	scanA11y,
	scriptBodies,
	seedCases,
	testCase,
	testFinding,
	testResult,
	testRun,
	testSession
} from './helpers.ts';

// Cross-cutting checks for slice 2c (T-075): exploratory sessions, releases, checklist to test
// cases, and test data in a step, against the non-functional requirements that apply to every
// page. Per-feature behaviour lives in sessions.spec.ts, session-view.spec.ts,
// finding-report.spec.ts, releases.spec.ts, checklist-cases.spec.ts, and insert-test-data.spec.ts.

const RELEASE = 'v3.0.0';
const SESSION = '/sessions/view?id=s1';
const RELEASE_PAGE = `/releases/view?name=${RELEASE}`;

interface StoredShot {
	owner: unknown[];
}

/** A running session with one finding, another session, and a run, all in release v3.0.0. */
async function seed(page: Page): Promise<void> {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async () => undefined;
	});
	await page.goto('/');
	await appOpened(page);
	const started = Date.now() - 10 * 60_000;
	await putRecords(page, 'sessions', [
		testSession('s1', {
			charter: 'Explore withdraw limits',
			release: RELEASE,
			startedAt: started,
			createdAt: started,
			updatedAt: started
		}),
		testSession('s2', { charter: 'Explore deposit memo', release: RELEASE })
	]);
	await putRecords(page, 'findings', [
		testFinding('f1', 's1', { type: 'bug', text: 'Fee shown as 0' })
	]);
	await seedCases(page, [testCase(1), testCase(2)] as { number: number }[]);
	await putRecords(page, 'runs', [testRun('run-1', [1, 2], { name: 'Smoke', release: RELEASE })]);
	await putRecords(page, 'results', [
		testResult('run-1', 1, 'pass'),
		testResult('run-1', 2, 'fail')
	]);
}

async function open(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await appOpened(page);
	await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0);
}

const composer = (page: Page) => page.getByRole('form', { name: 'Add a finding' });
const toast = (page: Page) => page.getByTestId('app-toast');

/** Adds a finding with `count` screenshots through the composer and waits until it is stored. */
async function addFinding(page: Page, text: string, count: number): Promise<void> {
	const before = (await readStore(page, 'screenshots')).length;
	if (count > 0) {
		await composer(page)
			.getByLabel('Screenshot files')
			.setInputFiles(
				Array.from({ length: count }, (_, i) => ({
					name: `shot-${i + 1}.png`,
					mimeType: 'image/png',
					buffer: png(64, 48)
				}))
			);
		await expect(composer(page).getByRole('img')).toHaveCount(count);
	}
	await page.getByRole('textbox', { name: 'Finding', exact: true }).fill(text);
	await page.getByTestId('finding-add').click();
	await expect.poll(async () => (await readStore(page, 'screenshots')).length).toBe(before + count);
	await expect(composer(page).getByRole('img')).toHaveCount(0);
}

/** Finding screenshots whose session or finding no longer exists (NFR-024). */
async function orphans(page: Page): Promise<StoredShot[]> {
	const [shots, findings, sessions] = await Promise.all([
		readStore<StoredShot>(page, 'screenshots'),
		readStore<{ id: string; sessionId: string }>(page, 'findings'),
		readStore<{ id: string }>(page, 'sessions')
	]);
	return shots.filter(
		({ owner: [kind, sessionId, findingId] }) =>
			kind === 'finding' &&
			(!sessions.some((s) => s.id === sessionId) ||
				!findings.some((f) => f.id === findingId && f.sessionId === sessionId))
	);
}

test.describe('no network activity while idle (NFR-003)', () => {
	const idle = async (page: Page) => {
		await page.waitForLoadState('networkidle');
		const requests = recordRequests(page);
		await page.waitForTimeout(10_000);
		return requests.map((r) => r.url());
	};

	test('a running session, with its clock on the page', async ({ page }) => {
		test.slow();
		await seed(page);
		await open(page, SESSION);
		await expect(page.getByTestId('session-clock')).toBeVisible();

		expect(await idle(page)).toEqual([]);
	});

	test('the release page', async ({ page }) => {
		test.slow();
		await seed(page);
		await open(page, RELEASE_PAGE);
		await expect(page.getByTestId('release-heading')).toHaveText(RELEASE);

		expect(await idle(page)).toEqual([]);
	});
});

test('every request across the slice 2c journeys stays on this origin (NFR-011)', async ({
	page
}) => {
	test.slow();
	const requests = recordRequests(page);
	await seed(page);
	await open(page, SESSION);
	await addFinding(page, 'Limit not shown', 1);
	await page.getByTestId('session-copy').click();
	await expect(toast(page)).toHaveText('Copied session');

	await open(page, '/releases');
	await open(page, RELEASE_PAGE);
	await page.getByRole('button', { name: 'Copy summary' }).click();
	await expect(toast(page)).toHaveText('Copied release summary');

	await open(page, '/checklists/deposit');
	await page.getByTestId('checklists-create-cases').click();
	await page.getByTestId('checklists-create-confirm').click();
	await expect(page.getByTestId('checklists-created')).toContainText('Created');

	await open(page, '/cases/new');
	await page.getByRole('button', { name: 'Insert test data into step 1' }).click();
	await expect(page.getByTestId('case-editor-insert-confirm')).toBeEnabled();
	await page.getByTestId('case-editor-insert-confirm').click();

	const origin = new URL(page.url()).origin;
	const foreign = requests.filter(
		(r) => !r.url().startsWith(origin) && !r.url().startsWith('blob:')
	);
	expect(foreign.map((r) => r.url())).toEqual([]);
	expect(requests.length).toBeGreaterThan(0);
});

test('Sessions and Releases load no crypto chunk (NFR-015, NFR-025)', async ({ page }) => {
	const requests = recordRequests(page);
	await seed(page);
	for (const path of ['/sessions', SESSION, '/releases', RELEASE_PAGE]) await open(page, path);
	await page.waitForLoadState('networkidle');

	expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);
});

test.describe('accessibility in both themes (NFR-009)', () => {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`the sessions and releases lists with records in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await seed(page);
			for (const path of ['/sessions', '/releases']) {
				await open(page, path);
				expect(await scanA11y(page), path).toEqual([]);
			}
		});
	}
});

test.describe('focus rings (NFR-008)', () => {
	test('a running session', async ({ page }) => {
		await seed(page);
		await open(page, SESSION);
		await page.getByTestId('session-charter-heading').focus();

		expect(await controlsWithoutFocusRing(page)).toEqual([]);
	});

	test('the release page', async ({ page }) => {
		await seed(page);
		await open(page, RELEASE_PAGE);
		await page.getByTestId('release-heading').focus();

		expect(await controlsWithoutFocusRing(page)).toEqual([]);
	});
});

test.describe('motion (NFR-006)', () => {
	const moving = (page: Page) =>
		page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => Number(a.effect?.getComputedTiming().activeDuration ?? 0) > 0)
				.map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
		);

	test('with reduced motion, nothing animates through a finding, a release, and a dialog', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await seed(page);
		await open(page, SESSION);
		await addFinding(page, 'Limit not shown', 1);
		expect(await moving(page)).toEqual([]);

		await open(page, RELEASE_PAGE);
		await page.getByText(/^Show \d+ passed/).click();
		expect(await moving(page)).toEqual([]);

		await open(page, '/cases/new');
		await page.getByRole('button', { name: 'Insert test data into step 1' }).click();
		await expect(page.getByTestId('case-editor-insert-confirm')).toBeEnabled();
		await page.getByRole('radio', { name: 'Amount' }).check();
		expect(await moving(page)).toEqual([]);
	});

	test('no animation keeps running on a running session', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await seed(page);
		await open(page, SESSION);
		await page.waitForTimeout(1500);

		const running = await page.evaluate(() =>
			document.getAnimations().map((a) => ({
				state: a.playState,
				iterations: a.effect?.getComputedTiming().iterations
			}))
		);
		expect(running.filter((a) => a.state === 'running' || a.iterations === Infinity)).toEqual([]);
	});
});

test('no finding screenshot outlives its owner after each kind of delete (NFR-024, EC-034)', async ({
	page
}) => {
	test.slow();
	await seed(page);
	// A backup from before any screenshot, to import over them at the end.
	await open(page, '/settings');
	const [backup] = await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export backup' }).click()
	]);

	// Deleting a finding deletes its screenshots, and only its own.
	await open(page, SESSION);
	await addFinding(page, 'First', 2);
	await addFinding(page, 'Second', 1);
	await page
		.getByTestId('finding')
		.filter({ hasText: 'First' })
		.getByRole('button', { name: /^Delete the finding at/ })
		.click();
	await page.getByTestId('finding-confirm-delete').click();
	await expect(toast(page)).toHaveText('Finding deleted.');
	await expect.poll(async () => (await readStore(page, 'screenshots')).length).toBe(1);
	expect(await orphans(page)).toEqual([]);

	// Deleting a session deletes its findings' screenshots, and only its own.
	await open(page, '/sessions/view?id=s2');
	await addFinding(page, 'Memo field missing', 1);
	await open(page, '/sessions');
	await page.getByRole('button', { name: 'Delete Explore withdraw limits' }).click();
	await page.getByTestId('sessions-confirm-delete').click();
	await expect(toast(page)).toHaveText('Deleted session "Explore withdraw limits".');
	const left = await readStore<StoredShot>(page, 'screenshots');
	expect(left.map((shot) => shot.owner.slice(0, 2))).toEqual([['finding', 's2']]);
	expect(await orphans(page)).toEqual([]);

	// Importing a backup replaces every screenshot, sessions and findings included.
	await open(page, '/settings');
	await page.getByLabel('Backup file to import').setInputFiles((await backup.path())!);
	await page
		.getByRole('dialog', { name: 'Replace all data?' })
		.getByRole('button', { name: 'Replace all data' })
		.click();
	await expect(page.getByText('Import complete', { exact: true }).first()).toBeVisible();
	expect(await readStore(page, 'screenshots')).toEqual([]);
	expect((await readStore<{ id: string }>(page, 'findings')).map((f) => f.id)).toEqual(['f1']);
});
