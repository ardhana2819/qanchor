import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import {
	appOpened,
	controlsWithoutFocusRing,
	hasCrypto,
	putRecords,
	recordRequests,
	scanA11y,
	scriptBodies,
	seedCases,
	testCase,
	testResult,
	testRun
} from './helpers.ts';

// Cross-cutting checks for slice 2a (T-056): the QA routes, with stored records, against the
// non-functional requirements that apply to every page. Per-page behaviour, keyboard-only
// flows included (NFR-008), lives in cases.spec.ts, case-editor.spec.ts, runs.spec.ts, and
// run-view.spec.ts.

const QA_ROUTES = [
	'/cases',
	'/cases/new',
	'/cases/edit?id=case-1',
	'/runs',
	'/runs/new',
	'/runs/view?id=run-1'
];

/** Strings only the QA pages' code contains (NFR-025: Phase 2 code loads on its own routes). */
const QA_MARKERS = ['Pass is saved at once', 'New run with these', 'Write a test case first.'];

const hasQaCode = (bodies: string[]) =>
	bodies.some((body) => QA_MARKERS.some((marker) => body.includes(marker)));

/** Three cases and a run of them with one Pass and one Fail, so every QA page has content. */
async function seedQa(page: Page): Promise<void> {
	await page.goto('/');
	await appOpened(page);
	await seedCases(page, [
		testCase(1, { title: 'Deposit USDT on Tron', tags: ['deposit'], priority: 'high' }),
		testCase(2, { title: 'Withdraw BTC', tags: ['withdrawal'] }),
		testCase(3, { title: 'Swap ETH to USDC', tags: ['swap'], priority: 'low' })
	] as { number: number }[]);
	await putRecords(page, 'runs', [
		testRun('run-1', [1, 2, 3], { name: 'Smoke', release: 'v2.3.0' })
	]);
	await putRecords(page, 'results', [
		testResult('run-1', 1, 'pass'),
		testResult('run-1', 2, 'fail')
	]);
}

/** Opens a QA route and waits until its records have been read. */
async function openQa(page: Page, path: string): Promise<void> {
	await page.goto(path);
	await appOpened(page);
	await expect(page.locator('[data-testid$="-loading"]')).toHaveCount(0);
}

/** Creates a case in the editor, a run of every case, and executes it to completion. */
async function useQaTools(page: Page): Promise<void> {
	await openQa(page, '/cases/new');
	await page.getByRole('textbox', { name: 'Title' }).fill('Stake SOL');
	await page
		.getByRole('group', { name: 'Step 1' })
		.getByRole('textbox', { name: 'Action' })
		.fill('Open Staking');
	await page.getByRole('textbox', { name: 'Expected result', exact: true }).fill('Staked');
	await page.getByRole('button', { name: 'Save' }).click();
	await expect(page).toHaveURL(/\/cases\/edit\?id=/);

	await openQa(page, '/cases?q=deposit');
	await page.getByTestId('cases-new-run').click();
	await expect(page.getByTestId('new-run-loading')).toHaveCount(0);
	await page.getByTestId('new-run-select-all').check();
	await page.getByTestId('new-run-create').click();
	await expect(page.getByTestId('run-name')).toBeVisible();

	await page.getByTestId('run-result').getByRole('radio', { name: /^Fail/ }).check();
	await page.getByRole('textbox', { name: 'Actual result' }).fill('No address is shown');
	await page.getByTestId('run-save-result').click();
	await expect(page.getByTestId('run-save-status')).toHaveText(/Saved \d/);
	await page.getByTestId('run-copy-summary').click();
	await page.getByTestId('run-complete').click();
	await page.getByTestId('run-confirm-complete').click();
	await expect(page.getByTestId('run-reopen')).toBeVisible();
}

test.describe('no network activity while idle (NFR-003)', () => {
	for (const path of QA_ROUTES) {
		test(`${path}: no request in 10 s after load`, async ({ page }) => {
			test.slow();
			await seedQa(page);
			await openQa(page, path);
			await page.waitForLoadState('networkidle');
			const requests = recordRequests(page);

			await page.waitForTimeout(10_000);

			expect(requests.map((r) => r.url())).toEqual([]);
		});
	}
});

test('every request while using the QA pages goes to this origin only (NFR-011)', async ({
	page
}) => {
	test.slow();
	await page.addInitScript(() => {
		navigator.clipboard.writeText = async () => undefined;
	});
	const requests = recordRequests(page);
	await seedQa(page);
	await useQaTools(page);

	await openQa(page, '/settings');
	await Promise.all([
		page.waitForEvent('download'),
		page.getByRole('button', { name: 'Export backup' }).click()
	]);

	const origin = new URL(page.url()).origin;
	const foreign = requests.filter(
		(r) => !r.url().startsWith(origin) && !r.url().startsWith('blob:')
	);
	expect(foreign.map((r) => r.url())).toEqual([]);
	expect(requests.length).toBeGreaterThan(0);
});

test.describe('code loads only where it is needed (FR-001 AC-5, NFR-015, NFR-025)', () => {
	test('the QA pages load no crypto chunk', async ({ page }) => {
		await seedQa(page);
		const requests = recordRequests(page);
		for (const path of QA_ROUTES) {
			await openQa(page, path);
			await page.waitForLoadState('networkidle');
		}
		expect(hasCrypto(await scriptBodies(page, requests))).toBe(false);
	});

	test('the default route, a Phase 1 tool, and Settings load no QA page code', async ({ page }) => {
		const requests = recordRequests(page);
		for (const path of ['/', '/address', '/settings']) {
			await page.goto(path);
			await appOpened(page);
			await page.waitForLoadState('networkidle');
		}
		const bodies = await scriptBodies(page, requests);
		expect(bodies.length).toBeGreaterThan(0);
		expect(hasQaCode(bodies)).toBe(false);

		// The markers do mark the QA code: the run page loads them.
		await seedQa(page);
		await openQa(page, '/runs/view?id=run-1');
		await page.waitForLoadState('networkidle');
		expect(hasQaCode(await scriptBodies(page, requests))).toBe(true);
	});
});

test.describe('accessibility in both themes with stored records (NFR-009)', () => {
	for (const colorScheme of ['light', 'dark'] as const) {
		for (const path of QA_ROUTES) {
			test(`${path} in ${colorScheme}`, async ({ page }) => {
				await page.emulateMedia({ colorScheme });
				await seedQa(page);
				await openQa(page, path);
				// Scan the settled page, as in cross-cutting.spec.ts (T-043).
				await page.evaluate(() =>
					Promise.allSettled(document.getAnimations().map((a) => a.finished))
				);

				expect(await scanA11y(page)).toEqual([]);
			});
		}
	}
});

test.describe('motion (NFR-006)', () => {
	test('with reduced motion, nothing animates for any length of time', async ({ page }) => {
		test.slow();
		await page.addInitScript(() => {
			navigator.clipboard.writeText = async () => undefined;
		});
		await page.emulateMedia({ reducedMotion: 'reduce' });
		await seedQa(page);
		await useQaTools(page);
		await page.getByTestId('run-reopen').click();
		await page.getByTestId('run-case-filter').selectOption('fail');

		const moving = await page.evaluate(() =>
			document
				.getAnimations()
				.filter((a) => Number(a.effect?.getComputedTiming().activeDuration ?? 0) > 0)
				.map((a) => (a as CSSAnimation).animationName ?? a.constructor.name)
		);
		expect(moving).toEqual([]);
	});

	for (const path of QA_ROUTES) {
		test(`${path}: no animation keeps running while idle`, async ({ page }) => {
			await page.emulateMedia({ reducedMotion: 'no-preference' });
			await seedQa(page);
			await openQa(page, path);
			await page.waitForTimeout(1500);

			const running = await page.evaluate(() =>
				document.getAnimations().map((a) => ({
					state: a.playState,
					iterations: a.effect?.getComputedTiming().iterations
				}))
			);
			expect(running.filter((a) => a.state === 'running' || a.iterations === Infinity)).toEqual([]);
		});
	}
});

test.describe('focus rings (NFR-008)', () => {
	for (const path of QA_ROUTES) {
		test(`${path}: every focusable control shows a focus ring`, async ({ page }) => {
			await seedQa(page);
			await openQa(page, path);

			expect(await controlsWithoutFocusRing(page)).toEqual([]);
		});
	}
});

test.describe('export and import of the performance data set (FR-091 AC-6, NFR-005, NFR-023)', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'Long Tasks API is Chromium-only.');

	/**
	 * PRD 10.5: 1,000 cases, 20 runs of 100 cases, and 200 screenshots, five on each of two
	 * failed results per run. Each image is 200 KB of random bytes (a compressed 1,920 px
	 * screenshot is about that size, and random bytes do not shrink), so the file is about 55 MB.
	 */
	async function seedDataSet(page: Page): Promise<void> {
		await page.goto('/');
		await appOpened(page);
		const cases = Array.from({ length: 1000 }, (_, i) =>
			testCase(i + 1, {
				title: `Case ${i + 1}: deposit and withdraw on a busy network`,
				preconditions: 'A funded testnet wallet',
				steps: [
					{ action: 'Open the deposit screen', expected: 'An address is shown' },
					{ action: 'Send the minimum amount', expected: 'The balance rises' },
					{ action: 'Withdraw it again', expected: 'The balance falls' }
				],
				expected: 'Both transfers settle',
				tags: ['deposit', 'withdrawal', 'regression'],
				priority: ['critical', 'high', 'medium', 'low'][i % 4]
			})
		);
		await seedCases(page, cases as { number: number }[]);
		const runs = Array.from({ length: 20 }, (_, r) => {
			const numbers = Array.from({ length: 100 }, (_, i) => r * 45 + i + 1);
			const run = testRun(`run-${r + 1}`, numbers, { name: `Regression ${r + 1}` });
			run.cases = numbers.map((n) => {
				const { createdAt, updatedAt, ...snapshot } = cases[n - 1] as Record<string, unknown>;
				void createdAt;
				void updatedAt;
				return snapshot;
			});
			return run;
		});
		await putRecords(page, 'runs', runs);
		const statuses = ['pass', 'pass', 'pass', 'fail', 'blocked'];
		await putRecords(
			page,
			'results',
			runs.flatMap((run) =>
				run.cases.map((c, i) =>
					testResult(run.id, c.number as number, statuses[i % statuses.length])
				)
			)
		);
		// Made in the page: an argument cannot carry 40 MB of ArrayBuffers.
		await page.evaluate(
			(owners) =>
				new Promise<void>((resolve, reject) => {
					const request = indexedDB.open('qanchor');
					request.onsuccess = () => {
						const db = request.result;
						const tx = db.transaction('screenshots', 'readwrite');
						owners.forEach(([runId, caseNumber], k) => {
							const bytes = new Uint8Array(200_000);
							for (let i = 0; i < bytes.length; i += 65_536)
								crypto.getRandomValues(bytes.subarray(i, i + 65_536));
							tx.objectStore('screenshots').put({
								id: `shot-${k}`,
								owner: ['result', runId, caseNumber],
								n: (k % 5) + 1,
								mediaType: 'image/webp',
								width: 1920,
								height: 1080,
								size: bytes.length,
								createdAt: k,
								bytes: bytes.buffer
							});
						});
						tx.oncomplete = () => (db.close(), resolve());
						tx.onerror = () => reject(tx.error);
					};
				}),
			runs.flatMap((run) =>
				[run.cases[3], run.cases[8]].flatMap((c) =>
					Array.from({ length: 5 }, () => [run.id, c.number as number] as const)
				)
			)
		);
	}

	test('neither causes a main-thread task over 200 ms', async ({ page }) => {
		test.slow();
		await seedDataSet(page);
		// Recorded from the start of each page load, so reading the database counts too.
		await page.addInitScript(() => {
			const durations: number[] = [];
			Object.defineProperty(window, '__longTasks', { value: durations });
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) durations.push(Math.round(entry.duration));
			}).observe({ type: 'longtask', buffered: true });
		});
		await openQa(page, '/settings');
		await expect(page.getByRole('button', { name: 'Import backup…' })).toBeEnabled();

		await page.getByRole('button', { name: 'Export backup' }).click();
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page
				.getByRole('dialog', { name: 'Download backup?' })
				.getByRole('button', { name: 'Download' })
				.click({ timeout: 60_000 })
		]);
		const path = (await download.path()) as string;
		const file = await readFile(path);
		const backup = JSON.parse(file.toString('utf8'));
		expect(backup.data.testCases).toHaveLength(1000);
		expect(backup.data.runs).toHaveLength(20);
		expect(backup.data.results).toHaveLength(2000);
		expect(backup.data.screenshots).toHaveLength(200);

		// A path, not a buffer: a 3 MB buffer is turned into a File by script in the page, a long
		// task of Playwright's own (found by profiling in T-056).
		await page.getByLabel('Backup file to import').setInputFiles(path);
		await page
			.getByRole('dialog', { name: 'Replace all data?' })
			.getByRole('button', { name: 'Replace all data' })
			.click();
		await expect(page.getByText('Import complete', { exact: true }).first()).toBeVisible({
			timeout: 60_000
		});
		await expect(page.getByRole('main')).toContainText('2,000 results, 200 screenshots');

		const longTasks = await page.evaluate(
			() => (window as unknown as { __longTasks: number[] }).__longTasks
		);
		test.info().annotations.push({
			type: 'long tasks (ms)',
			description: `${(file.length / 1e6).toFixed(1)} MB file; ${longTasks.join(', ')}`
		});
		expect(longTasks.filter((ms) => ms > 200)).toEqual([]);
	});
});
