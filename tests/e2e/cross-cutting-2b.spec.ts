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
	testResult,
	testRun
} from './helpers.ts';

// Cross-cutting checks for slice 2b (T-066): screenshots in a run, the image viewer, the bug
// report, and Storage in Settings, against the non-functional requirements that apply to every
// page. Per-feature behaviour lives in run-screenshots.spec.ts, screenshot-area.spec.ts,
// bug-report.spec.ts, settings-storage.spec.ts, and settings.spec.ts (backups with screenshots).

const RUN = '/runs/view?id=run-1&case=TC-2';

interface StoredShot {
	owner: [string, string, number];
}

interface StoredResult {
	runId: string;
	caseNumber: number;
}

/** Three cases and a run with a Pass and a Fail, as in cross-cutting-qa.spec.ts, plus run-2. */
async function seed(page: Page): Promise<void> {
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async () => undefined;
	});
	await page.goto('/');
	await appOpened(page);
	await seedCases(page, [testCase(1), testCase(2), testCase(3)] as { number: number }[]);
	await putRecords(page, 'runs', [
		testRun('run-1', [1, 2, 3], { name: 'Smoke', release: 'v2.3.0' }),
		testRun('run-2', [1], { name: 'Retest' })
	]);
	await putRecords(page, 'results', [
		testResult('run-1', 1, 'pass'),
		testResult('run-1', 2, 'fail'),
		testResult('run-2', 1, 'fail')
	]);
}

async function open(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await appOpened(page);
	await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0);
}

const area = (page: Page) => page.getByTestId('run-screenshots');
const thumbnails = (page: Page) => area(page).getByRole('img');

/** Chooses images in the open case's screenshot area and waits until they are stored. */
async function addShots(page: Page, count: number): Promise<void> {
	const before = (await readStore(page, 'screenshots')).length;
	await area(page)
		.getByLabel('Screenshot files')
		.setInputFiles(
			Array.from({ length: count }, (_, i) => ({
				name: `shot-${i + 1}.png`,
				mimeType: 'image/png',
				buffer: png(64, 48)
			}))
		);
	await expect.poll(async () => (await readStore(page, 'screenshots')).length).toBe(before + count);
}

/** Screenshots whose run or result no longer exists (NFR-024). */
async function orphans(page: Page): Promise<StoredShot[]> {
	const [shots, results, runs] = await Promise.all([
		readStore<StoredShot>(page, 'screenshots'),
		readStore<StoredResult>(page, 'results'),
		readStore<{ id: string }>(page, 'runs')
	]);
	return shots.filter(
		({ owner: [, runId, caseNumber] }) =>
			!runs.some((run) => run.id === runId) ||
			!results.some((r) => r.runId === runId && r.caseNumber === caseNumber)
	);
}

/** Opens the run's failed case with two screenshots, ready for the viewer and the report. */
async function runWithShots(page: Page): Promise<void> {
	await seed(page);
	await open(page, RUN);
	await addShots(page, 2);
}

const reportDialog = (page: Page) => page.getByRole('dialog', { name: 'Bug report: TC-2' });

async function openReport(page: Page): Promise<void> {
	await page.getByTestId('run-create-report').focus();
	await page.keyboard.press('Enter');
	await expect(reportDialog(page)).toBeVisible();
}

test.describe('no network activity while idle (NFR-003)', () => {
	const idle = async (page: Page) => {
		await page.waitForLoadState('networkidle');
		const requests = recordRequests(page);
		await page.waitForTimeout(10_000);
		return requests.map((r) => r.url());
	};

	test('the run page with screenshots and the bug report open', async ({ page }) => {
		test.slow();
		await runWithShots(page);
		await openReport(page);

		expect(await idle(page)).toEqual([]);
	});

	test('Settings with its Storage part', async ({ page }) => {
		test.slow();
		await open(page, '/settings');
		await expect(page.getByTestId('storage-status')).toHaveCount(0);

		expect(await idle(page)).toEqual([]);
	});
});

test('every request while adding screenshots and copying a report stays on this origin (NFR-011)', async ({
	page
}) => {
	test.slow();
	const requests = recordRequests(page);
	await runWithShots(page);
	await area(page).getByRole('button', { name: 'Open Screenshot 1 of TC-2' }).click();
	await page.keyboard.press('Escape');
	await openReport(page);
	await page.getByTestId('bug-report-copy').click();
	await expect(page.getByTestId('app-toast')).toHaveText('Copied as Markdown');
	await open(page, '/settings');

	const origin = new URL(page.url()).origin;
	const foreign = requests.filter(
		(r) => !r.url().startsWith(origin) && !r.url().startsWith('blob:')
	);
	expect(foreign.map((r) => r.url())).toEqual([]);
	expect(requests.length).toBeGreaterThan(0);
});

test.describe('code loads only where it is needed (NFR-015, NFR-025)', () => {
	test('the image worker starts with the first image, not with the run page', async ({ page }) => {
		await seed(page);
		await open(page, RUN);
		await page.waitForLoadState('networkidle');
		const imageWorkers = () => page.workers().filter((w) => w.url().includes('image.worker'));
		expect(imageWorkers()).toEqual([]);

		await addShots(page, 1);

		expect(imageWorkers()).toHaveLength(1);
	});

	test('screenshots and the bug report load no crypto chunk', async ({ page }) => {
		const requests = recordRequests(page);
		await runWithShots(page);
		await openReport(page);
		await open(page, '/settings');
		await page.waitForLoadState('networkidle');

		expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);
	});
});

test.describe('accessibility in both themes (NFR-009)', () => {
	for (const colorScheme of ['light', 'dark'] as const) {
		test(`the image viewer in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await runWithShots(page);
			await area(page).getByRole('button', { name: 'Open Screenshot 2 of TC-2' }).click();
			await expect(page.getByRole('dialog', { name: 'Screenshot 2 of TC-2' })).toBeVisible();

			expect(await scanA11y(page)).toEqual([]);
		});

		test(`Settings with Storage in ${colorScheme}`, async ({ page }) => {
			await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
			await open(page, '/settings');
			await expect(page.getByTestId('settings-storage')).toBeVisible();

			expect(await scanA11y(page)).toEqual([]);
		});
	}
});

test.describe('focus rings (NFR-008)', () => {
	test('the run page with screenshots', async ({ page }) => {
		await runWithShots(page);
		// From the case title, so the walk covers the result panel and its screenshots.
		await page.getByRole('heading', { level: 2, name: 'Case 2' }).focus();

		expect(await controlsWithoutFocusRing(page)).toEqual([]);
	});

	test('the bug report', async ({ page }) => {
		await runWithShots(page);
		await openReport(page);

		expect(await controlsWithoutFocusRing(page, 30)).toEqual([]);
	});
});

test.describe('motion (NFR-006)', () => {
	test('with reduced motion, nothing animates through add, view, report, and remove', async ({
		page
	}) => {
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await runWithShots(page);
		await area(page).getByRole('button', { name: 'Open Screenshot 1 of TC-2' }).click();
		await page.keyboard.press('Escape');
		await openReport(page);
		await page.getByTestId('bug-report-close').click();
		await area(page).getByRole('button', { name: 'Remove Screenshot 1 of TC-2' }).click();
		await page.getByTestId('run-remove-screenshot').click();
		await expect(thumbnails(page)).toHaveCount(1);

		const moving = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => Number(a.effect?.getComputedTiming().activeDuration ?? 0) > 0)
				.map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
		);
		expect(moving).toEqual([]);
	});

	test('no animation keeps running on the run page with screenshots', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'no-preference' });
		await runWithShots(page);
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

test('no screenshot outlives its owner after each kind of delete (NFR-024, EC-034)', async ({
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

	// Removing one screenshot.
	await open(page, RUN);
	await addShots(page, 2);
	await area(page).getByRole('button', { name: 'Remove Screenshot 1 of TC-2' }).click();
	await page.getByTestId('run-remove-screenshot').click();
	await expect.poll(async () => (await readStore(page, 'screenshots')).length).toBe(1);
	expect(await orphans(page)).toEqual([]);

	// Deleting a run deletes its screenshots, and only its own.
	await open(page, '/runs/view?id=run-2&case=TC-1');
	await addShots(page, 1);
	await open(page, '/runs');
	await page.getByRole('button', { name: 'Delete Smoke' }).click();
	await page.getByTestId('runs-confirm-delete').click();
	await expect(page.getByTestId('app-toast')).toHaveText('Deleted run "Smoke".');
	const left = await readStore<StoredShot>(page, 'screenshots');
	expect(left.map((shot) => shot.owner)).toEqual([['result', 'run-2', 1]]);
	expect(await orphans(page)).toEqual([]);

	// Importing a backup replaces every screenshot.
	await open(page, '/settings');
	await page.getByLabel('Backup file to import').setInputFiles((await backup.path())!);
	await page
		.getByRole('dialog', { name: 'Replace all data?' })
		.getByRole('button', { name: 'Replace all data' })
		.click();
	await expect(page.getByText('Import complete', { exact: true }).first()).toBeVisible();
	expect(await readStore(page, 'screenshots')).toEqual([]);
});
