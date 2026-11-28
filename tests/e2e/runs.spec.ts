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

// Test runs list and New run (T-054; design 13.3 P2-03, P2-03a; FR-110, FR-113 AC-1, AC-4).

interface StoredRun {
	id: string;
	name: string;
	release: string;
	environment: string;
	status: string;
	cases: { number: number; title: string }[];
}

const runRows = (page: Page) => page.getByTestId('runs-row');
const pickerRows = (page: Page) => page.getByTestId('new-run-row').filter({ visible: true });
const toast = (page: Page) => page.getByTestId('app-toast');
const create = (page: Page) => page.getByTestId('new-run-create');
const pick = (page: Page, key: string) => page.getByRole('checkbox', { name: `Select ${key}` });
const selectAll = (page: Page) => page.getByTestId('new-run-select-all');

const CASES = [
	testCase(1, { title: 'Deposit USDT on Tron', tags: ['deposit', 'tron'], priority: 'high' }),
	testCase(2, { title: 'Deposit BTC', tags: ['deposit', 'btc'], priority: 'low' }),
	testCase(3, { title: 'Withdraw ETH', tags: ['withdrawal'], priority: 'critical' })
];

async function seed(
	page: Page,
	{
		cases = CASES,
		runs = [],
		results = []
	}: { cases?: object[]; runs?: object[]; results?: object[] }
): Promise<void> {
	await page.goto('/runs');
	await appOpened(page);
	await seedCases(page, cases as { number: number }[]);
	if (runs.length > 0) await putRecords(page, 'runs', runs);
	if (results.length > 0) await putRecords(page, 'results', results);
}

async function openNewRun(page: Page, path = '/runs/new'): Promise<void> {
	await page.goto(path);
	await expect(page.getByTestId('new-run-loading')).toHaveCount(0);
}

test.describe('Test runs list (FR-113)', () => {
	test('the built page holds only the loading state (FR-090 AC-4)', async ({ request }) => {
		const html = await (await request.get('/runs')).text();
		expect(html).toContain('Loading runs…');
		expect(html).not.toContain('No runs yet');
	});

	test('with no runs and no cases, New run is disabled with the reason (design 13.7)', async ({
		page
	}) => {
		await page.goto('/runs');
		const empty = page.getByTestId('runs-empty');
		await expect(empty).toContainText('No runs yet. Start one from your test cases.');
		const button = empty.getByRole('button', { name: 'New run' });
		await expect(button).toBeDisabled();
		await expect(button).toHaveAccessibleDescription('Write a test case first.');
	});

	test('with cases but no runs, the empty state links to New run', async ({ page }) => {
		await seed(page, {});
		await page.goto('/runs');
		await page.getByTestId('runs-empty').getByRole('link', { name: 'New run' }).click();
		await expect(page).toHaveURL(/\/runs\/new$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('New run');
	});

	test('with storage unavailable, the page explains it (FR-090 AC-5)', async ({ page }) => {
		await page.addInitScript(() => {
			IDBFactory.prototype.open = () => {
				throw new DOMException('The operation is insecure.', 'SecurityError');
			};
		});
		await page.goto('/runs');
		await expect(page.getByTestId('runs-unavailable')).toContainText(
			'Test runs need storage, which is unavailable in this tab'
		);
	});

	test('each row shows name, release, status, progress, and created date, newest first (FR-113 AC-1)', async ({
		page
	}) => {
		await seed(page, {
			runs: [
				testRun('old', [1, 2, 3], { name: 'Regression', release: 'v2.3.0' }),
				testRun('new', [1, 2], {
					name: 'Smoke',
					status: 'completed',
					createdAt: Date.UTC(2026, 10, 3),
					completedAt: Date.UTC(2026, 10, 4)
				})
			],
			results: [
				testResult('old', 1, 'pass'),
				testResult('old', 2, 'fail'),
				testResult('new', 1, 'pass'),
				testResult('new', 2, 'blocked')
			]
		});
		await page.goto('/runs');

		await expect(page.getByTestId('runs-count')).toHaveText('2 runs');
		await expect(runRows(page).locator('td:first-child')).toHaveText(['Smoke', 'Regression']);
		const [smoke, regression] = [runRows(page).first(), runRows(page).last()];
		await expect(smoke).toContainText('None');
		await expect(smoke).toContainText('Completed');
		await expect(smoke).toContainText('2 / 2');
		await expect(smoke.getByRole('img')).toHaveAccessibleName(
			'1 passed, 0 failed, 1 blocked, 0 untested'
		);
		await expect(regression).toContainText('v2.3.0');
		await expect(regression).toContainText('In progress');
		await expect(regression).toContainText('2 / 3');
		await expect(regression.getByRole('img')).toHaveAccessibleName(
			'1 passed, 1 failed, 0 blocked, 1 untested'
		);
		await expect(smoke.locator('time')).toHaveAttribute(
			'datetime',
			new Date(Date.UTC(2026, 10, 3)).toISOString()
		);
	});

	test('deleting a run asks first, then removes it with its results (FR-113 AC-4)', async ({
		page
	}) => {
		await seed(page, {
			runs: [
				testRun('a', [1, 2], { name: 'Smoke' }),
				testRun('b', [3], { name: 'Other', createdAt: Date.UTC(2026, 9, 1) })
			],
			results: [testResult('a', 1, 'pass'), testResult('a', 2, 'fail'), testResult('b', 3, 'pass')]
		});
		await page.goto('/runs');

		await runRows(page).first().getByRole('button', { name: 'Delete Smoke' }).click();
		const dialog = page.getByRole('dialog', { name: 'Delete run "Smoke"?' });
		await expect(page.getByTestId('runs-delete-results')).toHaveText(
			'Its 2 results are deleted too. This cannot be undone.'
		);
		await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
		await dialog.getByRole('button', { name: 'Cancel' }).click();
		await expect(runRows(page)).toHaveCount(2);

		await runRows(page).first().getByRole('button', { name: 'Delete Smoke' }).click();
		await page.getByTestId('runs-confirm-delete').click();
		await expect(toast(page)).toHaveText('Deleted run "Smoke".');
		await expect(runRows(page)).toHaveCount(1);
		await expect(page.getByRole('region', { name: 'Test runs' })).toBeFocused();

		expect((await readStore<StoredRun>(page, 'runs')).map((r) => r.id)).toEqual(['b']);
		expect((await readStore<{ runId: string }>(page, 'results')).map((r) => r.runId)).toEqual([
			'b'
		]);
	});

	test('a run with no results says so before it is deleted', async ({ page }) => {
		await seed(page, { runs: [testRun('a', [1], { name: 'Fresh' })] });
		await page.goto('/runs');
		await page.getByRole('button', { name: 'Delete Fresh' }).click();
		await expect(page.getByTestId('runs-delete-results')).toHaveText(
			'It has no results yet. This cannot be undone.'
		);
		await page.getByTestId('runs-confirm-delete').click();
		await expect(page.getByTestId('runs-empty')).toBeVisible();
		await expect(
			page.getByTestId('runs-empty').getByRole('link', { name: 'New run' })
		).toBeFocused();
	});

	test('Test runs is in the QA group of the navigation and on the index (FR-090 AC-1)', async ({
		page
	}) => {
		await page.goto('/');
		const qa = page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'QA' });
		await expect(qa.getByRole('link')).toHaveText([
			'Test cases',
			'Test runs',
			'Sessions',
			'Releases'
		]);
		await expect(page.getByRole('main').getByRole('link', { name: 'Test runs' })).toBeVisible();
		await qa.getByRole('link', { name: 'Test runs' }).click();
		await expect(page).toHaveURL(/\/runs$/);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText('Test runs');
	});

	test('a run name opens the run', async ({ page }) => {
		await seed(page, { runs: [testRun('a', [1, 2], { name: 'Smoke' })] });
		await page.goto('/runs');
		await runRows(page).getByRole('link', { name: 'Smoke' }).click();
		await expect(page).toHaveURL(/\/runs\/view\?id=a&case=TC-1$/);
		await expect(page.getByTestId('run-name')).toHaveText('Smoke');
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`no WCAG 2.1 AA violations with runs in ${colorScheme} mode (NFR-009)`, async ({
			page
		}) => {
			await page.emulateMedia({ colorScheme });
			await seed(page, {
				runs: [testRun('a', [1, 2, 3], { name: 'Smoke', release: 'v1' })],
				results: [testResult('a', 1, 'pass'), testResult('a', 2, 'blocked')]
			});
			await page.goto('/runs');
			await expect(runRows(page)).toHaveCount(1);
			expect(await scanA11y(page)).toEqual([]);
		});
	}
});

test.describe('New run (FR-110)', () => {
	test('the built page holds only the loading state', async ({ request }) => {
		const html = await (await request.get('/runs/new')).text();
		expect(html).toContain('Loading test cases…');
	});

	test('with no cases, it links to New test case (design 13.7)', async ({ page }) => {
		await page.goto('/runs/new');
		const state = page.getByTestId('new-run-no-cases');
		await expect(state).toContainText('There are no test cases to run yet.');
		await state.getByRole('link', { name: 'New test case' }).click();
		await expect(page).toHaveURL(/\/cases\/new$/);
	});

	test('the name defaults to today, and Create run waits for a case (FR-110 AC-1)', async ({
		page
	}) => {
		await seed(page, {});
		await openNewRun(page);

		const today = await page.evaluate(() => {
			const d = new Date();
			const pad = (n: number) => String(n).padStart(2, '0');
			return `Run ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
		});
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue(today);
		await expect(pickerRows(page).locator('td:nth-child(2)')).toHaveText(['TC-1', 'TC-2', 'TC-3']);
		await expect(create(page)).toBeDisabled();
		await expect(create(page)).toHaveAccessibleDescription('Select at least one test case.');
		await expect(page.getByTestId('new-run-selected')).toHaveText('0 selected');

		await pick(page, 'TC-2').check();
		await expect(create(page)).toBeEnabled();
		await expect(page.getByTestId('new-run-count')).toHaveText('3 test cases · 1 selected');
		await pick(page, 'TC-2').uncheck();
		await expect(create(page)).toBeDisabled();
	});

	test('clicking a title selects its case', async ({ page }) => {
		await seed(page, {});
		await openNewRun(page);
		await pickerRows(page).getByText('Deposit BTC', { exact: true }).click();
		await expect(pick(page, 'TC-2')).toBeChecked();
	});

	test('creating a run stores a snapshot of each case in key order, all untested (FR-110 AC-2)', async ({
		page
	}) => {
		await seed(page, {});
		await openNewRun(page);

		await page.getByRole('textbox', { name: 'Name' }).fill('  Release 2.3 regression');
		await page.getByRole('combobox', { name: 'Release (optional)' }).fill('  v2.3.0 ');
		await page.getByRole('textbox', { name: 'Environment (optional)' }).fill('Pixel 8, Chrome 131');
		await pick(page, 'TC-3').check();
		await pick(page, 'TC-1').check();
		await create(page).click();

		await expect(toast(page)).toHaveText('Created run "  Release 2.3 regression".');
		// The new run opens on its first case, untested (FR-110 AC-2).
		const [run] = await readStore<StoredRun>(page, 'runs');
		await expect(page).toHaveURL(new RegExp(`/runs/view\\?id=${run.id}&case=TC-1$`));
		await expect(page.getByTestId('run-counts')).toHaveText(
			'0 passed, 0 failed, 0 blocked, 2 untested'
		);
		await page.goto('/runs');
		await expect(runRows(page)).toHaveCount(1);
		await expect(runRows(page)).toContainText('0 / 2');
		await expect(runRows(page)).toContainText('In progress');

		expect(run.name).toBe('  Release 2.3 regression');
		expect(run.release).toBe('v2.3.0');
		expect(run.environment).toBe('Pixel 8, Chrome 131');
		expect(run.status).toBe('in-progress');
		expect(run.cases.map((c) => c.number)).toEqual([1, 3]);
		expect(await readStore(page, 'results')).toEqual([]);
	});

	test('editing or deleting a case afterwards leaves the run unchanged (FR-110 AC-3)', async ({
		page
	}) => {
		await seed(page, {});
		await openNewRun(page);
		await pick(page, 'TC-1').check();
		await pick(page, 'TC-2').check();
		await create(page).click();
		await expect(page.getByTestId('run-name')).toBeVisible();

		await page.goto('/cases/edit?id=case-1');
		await page.getByRole('textbox', { name: 'Title' }).fill('Deposit USDT on Tron, edited');
		await page.getByRole('button', { name: 'Save' }).click();
		await expect(toast(page)).toHaveText('Saved TC-1.');
		await page.goto('/cases');
		await page.getByRole('button', { name: 'Delete TC-2' }).click();
		await expect(page.getByTestId('cases-delete-runs')).toHaveText(
			'It is in 1 run. That run keeps its own copy.'
		);
		await page.getByTestId('cases-confirm-delete').click();
		await expect(toast(page)).toHaveText('Deleted TC-2.');

		const [run] = await readStore<StoredRun>(page, 'runs');
		expect(run.cases.map((c) => [c.number, c.title])).toEqual([
			[1, 'Deposit USDT on Tron'],
			[2, 'Deposit BTC']
		]);
		await page.goto('/runs');
		await expect(runRows(page)).toContainText('0 / 2');
	});

	test('a missing name is refused with focus on it (FR-110, design 13.7)', async ({ page }) => {
		await seed(page, {});
		await openNewRun(page);
		await page.getByRole('textbox', { name: 'Name' }).fill('   ');
		await pick(page, 'TC-1').check();
		await create(page).click();

		await expect(page.getByRole('textbox', { name: 'Name' })).toBeFocused();
		await expect(page.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
			'Enter a name.'
		);
		expect(await readStore(page, 'runs')).toEqual([]);
	});

	test('the filter narrows the picker, and Select all matching takes only those (FR-110 AC-1)', async ({
		page
	}) => {
		await seed(page, {});
		await openNewRun(page);
		await pick(page, 'TC-3').check();

		await page.getByRole('textbox', { name: 'Filter' }).fill('deposit');
		await expect(page).toHaveURL(/\/runs\/new\?q=deposit$/);
		await expect(pickerRows(page)).toHaveCount(2);
		await expect(selectAll(page)).toHaveAccessibleName('Select all matching (2)');
		await expect(selectAll(page)).not.toBeChecked();

		await selectAll(page).check();
		await expect(pick(page, 'TC-1')).toBeChecked();
		await expect(pick(page, 'TC-2')).toBeChecked();
		// The case selected before the filter stays selected while hidden.
		await expect(page.getByTestId('new-run-count')).toHaveText('2 of 3 match · 3 selected');

		await selectAll(page).uncheck();
		await expect(page.getByTestId('new-run-count')).toHaveText('2 of 3 match · 1 selected');

		await pick(page, 'TC-1').check();
		await expect(selectAll(page)).toHaveJSProperty('indeterminate', true);

		await page.reload();
		await expect(page.getByRole('textbox', { name: 'Filter' })).toHaveValue('deposit');
		await expect(pickerRows(page)).toHaveCount(2);
	});

	test('"New run with these" on the case list carries its filter to the picker', async ({
		page
	}) => {
		await seed(page, {});
		await page.goto('/cases?q=deposit');
		await page.getByTestId('cases-new-run').click();
		await expect(page).toHaveURL(/\/runs\/new\?q=deposit$/);
		await expect(page.getByTestId('new-run-loading')).toHaveCount(0);
		await expect(pickerRows(page)).toHaveCount(2);

		await page.goto('/cases?q=nothing');
		await expect(page.getByTestId('cases-no-match')).toBeVisible();
		await expect(page.getByTestId('cases-new-run')).toHaveCount(0);
	});

	test('a filter with no match says so', async ({ page }) => {
		await seed(page, {});
		await openNewRun(page, '/runs/new?q=nothing');
		await expect(page.getByTestId('new-run-no-match')).toHaveText(
			'No test case matches these filters.'
		);
		await expect(selectAll(page)).toBeDisabled();
	});

	test('release suggestions come from earlier runs, once per release (FR-110 AC-4, EC-031)', async ({
		page
	}) => {
		await seed(page, {
			runs: [
				testRun('a', [1], { release: 'v2.3.0', createdAt: Date.UTC(2026, 9, 1) }),
				testRun('b', [1], { release: 'V2.3.0 ', createdAt: Date.UTC(2026, 9, 2) }),
				testRun('c', [1], { release: '2.3.0', createdAt: Date.UTC(2026, 9, 3) }),
				testRun('d', [1], { release: '' })
			]
		});
		await openNewRun(page);
		const releaseField = page.getByRole('combobox', { name: 'Release (optional)' });
		const listId = await releaseField.getAttribute('list');
		await expect(page.locator(`datalist[id="${listId}"] option`)).toHaveCount(2);
		const values = await page
			.locator(`datalist[id="${listId}"] option`)
			.evaluateAll((options) => options.map((o) => (o as HTMLOptionElement).value));
		expect(values).toEqual(['v2.3.0', '2.3.0']);
	});

	test('a run takes at most 500 cases (FR-110, PRD 10.5)', async ({ page }) => {
		test.slow();
		const many = Array.from({ length: 501 }, (_, i) => testCase(i + 1));
		await seed(page, { cases: many });
		await openNewRun(page);

		await selectAll(page).check();
		await expect(page.getByTestId('new-run-selected')).toHaveText('501 selected');
		await expect(page.getByTestId('new-run-problem')).toHaveText('Up to 500 test cases per run.');
		await expect(create(page)).toBeDisabled();

		await pick(page, 'TC-501').uncheck();
		await expect(create(page)).toBeEnabled();
		await create(page).click();
		await expect(page.getByTestId('run-counts')).toHaveText(
			'0 passed, 0 failed, 0 blocked, 500 untested'
		);
		const [run] = await readStore<StoredRun>(page, 'runs');
		expect(run.cases).toHaveLength(500);
	});

	test('a run can be created with the keyboard only (NFR-008)', async ({ page }) => {
		await seed(page, {});
		await openNewRun(page);
		await page.getByRole('textbox', { name: 'Name' }).focus();
		await page.keyboard.press('ControlOrMeta+a');
		await page.keyboard.type('Keyboard run');

		await tabTo(page, selectAll(page));
		await page.keyboard.press('Space');
		await expect(page.getByTestId('new-run-selected')).toHaveText('3 selected');
		await tabTo(page, create(page));
		await page.keyboard.press('Enter');

		await expect(toast(page)).toHaveText('Created run "Keyboard run".');
		await expect(page.getByTestId('run-name')).toHaveText('Keyboard run');
	});

	test('Cancel goes back to the run list', async ({ page }) => {
		await seed(page, {});
		await openNewRun(page);
		await page.getByTestId('new-run-cancel').click();
		await expect(page).toHaveURL(/\/runs$/);
	});

	for (const colorScheme of ['light', 'dark'] as const) {
		test(`no WCAG 2.1 AA violations on New run in ${colorScheme} mode (NFR-009)`, async ({
			page
		}) => {
			await page.emulateMedia({ colorScheme });
			await seed(page, {});
			await openNewRun(page);
			await pick(page, 'TC-1').check();
			await page.getByTestId('new-run-tags').locator('summary').click();
			expect(await scanA11y(page)).toEqual([]);
		});
	}
});
