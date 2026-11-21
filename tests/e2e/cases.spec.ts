import { expect, test, type Page } from '@playwright/test';
import { appOpened, putRecords, scanA11y, seedCases, testCase } from './helpers.ts';

// Test cases list (T-052; design 13.3 P2-01; FR-090, FR-101, FR-102).

// Rows a filter leaves out stay in the DOM, hidden (FR-101 AC-4).
const rows = (page: Page) => page.getByTestId('cases-row').filter({ visible: true });
const filterField = (page: Page) => page.getByRole('textbox', { name: 'Filter' });
const count = (page: Page) => page.getByTestId('cases-count');
const keys = (page: Page) => rows(page).locator('td:first-child');

const CASES = [
	testCase(3, { title: 'Withdraw ETH', priority: 'critical', tags: ['withdrawal', 'evm'] }),
	testCase(1, {
		title: 'Deposit USDT on Tron',
		priority: 'high',
		tags: ['deposit', 'tron', 'usdt', 'smoke', 'trc20'],
		steps: [
			{ action: 'Open Deposit', expected: '' },
			{ action: 'Pick USDT', expected: 'Address shown' }
		]
	}),
	testCase(2, { title: 'Deposit BTC', priority: 'low', tags: ['deposit', 'btc'] })
];

async function openWith(page: Page, cases: object[] = CASES, path = '/cases'): Promise<void> {
	await page.goto('/cases');
	await appOpened(page);
	await seedCases(page, cases as { number: number }[]);
	await page.goto(path);
	await expect(page.getByTestId('cases-loading')).toHaveCount(0);
}

test('with no cases, the page shows the empty state and no filter (FR-090 AC-4)', async ({
	page
}) => {
	await page.goto('/cases');
	await expect(page.getByTestId('cases-empty')).toContainText(
		'No test cases yet. Write one, or create them from a checklist.'
	);
	await expect(
		page.getByTestId('cases-empty').getByRole('link', { name: 'New test case' })
	).toBeVisible();
	await expect(filterField(page)).toHaveCount(0);
});

test('the built page holds only the loading state (FR-090 AC-4)', async ({ request }) => {
	const html = await (await request.get('/cases')).text();
	expect(html).toContain('Loading test cases…');
	expect(html).not.toContain('No test cases yet');
});

test('with storage unavailable, the page explains it and offers no form (FR-090 AC-5)', async ({
	page
}) => {
	await page.addInitScript(() => {
		IDBFactory.prototype.open = () => {
			throw new DOMException('The operation is insecure.', 'SecurityError');
		};
	});
	await page.goto('/cases');

	await expect(page.getByTestId('cases-unavailable')).toContainText(
		'Test cases need storage, which is unavailable in this tab'
	);
	await expect(page.locator('form')).toHaveCount(0);
});

test('each row shows key, title, priority, tags, steps, and update, sorted by key (FR-101 AC-1)', async ({
	page
}) => {
	await openWith(page);

	await expect(count(page)).toHaveText('3 test cases');
	await expect(keys(page)).toHaveText(['TC-1', 'TC-2', 'TC-3']);

	const first = rows(page).first();
	await expect(first).toContainText('Deposit USDT on Tron');
	await expect(first).toContainText('High');
	// At most three chips, then the rest as a count.
	await expect(first.locator('.chip')).toHaveText(['deposit', 'tron', 'usdt']);
	await expect(first).toContainText('+2');
	await expect(first.locator('td').nth(4)).toHaveText('2');
	await expect(first.locator('time')).toHaveAttribute('datetime', '2026-11-01T00:00:00.000Z');
});

test('text, tags (all), and priorities (any) filter the list and stay in the URL (FR-101 AC-2)', async ({
	page
}) => {
	await openWith(page);

	await page.getByTestId('cases-tags').locator('summary').click();
	await page.getByRole('checkbox', { name: 'deposit' }).check();
	await expect(keys(page)).toHaveText(['TC-1', 'TC-2']);
	await page.getByRole('checkbox', { name: 'btc' }).check();
	await expect(keys(page)).toHaveText(['TC-2']);
	await expect(page.getByTestId('cases-tags').locator('summary')).toHaveAccessibleName(
		'Tags: 2 tags'
	);

	await page.getByRole('checkbox', { name: 'btc' }).uncheck();
	await page.getByRole('checkbox', { name: 'Low' }).check();
	await page.getByRole('checkbox', { name: 'High' }).check();
	await expect(keys(page)).toHaveText(['TC-1', 'TC-2']);

	await filterField(page).fill('usdt');
	await expect(keys(page)).toHaveText(['TC-1']);
	await expect(count(page)).toHaveText('1 of 3 match');
	await expect(page).toHaveURL(/\/cases\?q=usdt&tag=deposit&priority=high&priority=low$/);

	await page.reload();
	await expect(keys(page)).toHaveText(['TC-1']);
	await expect(filterField(page)).toHaveValue('usdt');
	await expect(page.getByRole('checkbox', { name: 'High' })).toBeChecked();
});

test('the key filters too, and an emptied filter leaves a clean URL', async ({ page }) => {
	await openWith(page);
	await filterField(page).fill('tc-3');
	await expect(keys(page)).toHaveText(['TC-3']);

	await filterField(page).fill('');
	await expect(keys(page)).toHaveCount(3);
	await expect(page).toHaveURL(/\/cases$/);
});

test('a filter with no match offers Clear filters, which refocuses the filter (FR-101 AC-3)', async ({
	page
}) => {
	await openWith(page, CASES, '/cases?q=nothing&priority=critical');

	await expect(page.getByTestId('cases-no-match')).toContainText(
		'No test case matches these filters.'
	);
	await expect(count(page)).toHaveText('0 of 3 match');
	await page.getByRole('button', { name: 'Clear filters' }).click();

	await expect(filterField(page)).toBeFocused();
	await expect(keys(page)).toHaveCount(3);
	await expect(page.getByRole('checkbox', { name: 'Critical' })).not.toBeChecked();
	await expect(page).toHaveURL(/\/cases$/);
});

test('a tag in the URL that no case has can still be unticked', async ({ page }) => {
	await openWith(page, CASES, '/cases?tag=gone');
	await expect(keys(page)).toHaveCount(0);

	await page.getByTestId('cases-tags').locator('summary').click();
	await page.getByRole('checkbox', { name: 'gone' }).click();
	await expect(keys(page)).toHaveCount(3);
	// Unticked, it is no longer offered: no case has it.
	await expect(page.getByRole('checkbox', { name: 'gone' })).toHaveCount(0);
});

test('Duplicate adds "Copy of" the case under the next key (FR-102 AC-1)', async ({ page }) => {
	await openWith(page);

	await page.getByRole('button', { name: 'Duplicate TC-2' }).click();

	// The copy opens in the editor (case-editor.spec.ts); back in the list it is the last row.
	await expect(page.getByTestId('app-toast')).toHaveText('Duplicated as TC-4.');
	await expect(page).toHaveURL(/\/cases\/edit\?id=/);
	await page.goBack();
	await expect(keys(page)).toHaveText(['TC-1', 'TC-2', 'TC-3', 'TC-4']);
	const copy = rows(page).last();
	await expect(copy).toContainText('Copy of Deposit BTC');
	await expect(copy).toContainText('Low');
	await expect(copy.locator('.chip')).toHaveText(['deposit', 'btc']);
	await expect(copy.locator('time')).toHaveText('just now');
});

test('Delete names the runs that keep their copy, then removes only the case (FR-102 AC-2)', async ({
	page
}) => {
	await page.goto('/cases');
	await appOpened(page);
	const snapshot = { ...testCase(1, { title: 'Deposit USDT on Tron' }) } as Record<string, unknown>;
	for (const field of ['createdAt', 'updatedAt']) delete snapshot[field];
	await putRecords(page, 'runs', [
		{
			id: 'run-1',
			name: 'Smoke',
			release: '',
			environment: '',
			status: 'in-progress',
			cases: [snapshot],
			createdAt: 1,
			updatedAt: 1,
			completedAt: null
		}
	]);
	await openWith(page);

	await page.getByRole('button', { name: 'Delete TC-1' }).click();
	const dialog = page.getByRole('dialog', { name: 'Delete TC-1?' });
	await expect(dialog).toContainText('It is in 1 run. That run keeps its own copy.');
	await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();

	await page.getByTestId('cases-confirm-delete').click();

	await expect(page.getByTestId('app-toast')).toHaveText('Deleted TC-1.');
	await expect(keys(page)).toHaveText(['TC-2', 'TC-3']);
	await expect(filterField(page)).toBeFocused();
	const runCases = await page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const open = indexedDB.open('qanchor');
				open.onsuccess = () => {
					const get = open.result.transaction('runs').objectStore('runs').get('run-1');
					get.onsuccess = () => resolve(get.result.cases.length);
				};
			})
	);
	expect(runCases).toBe(1);
});

test('Delete of a case in no run says so, and Cancel keeps it', async ({ page }) => {
	await openWith(page);

	await page.getByRole('button', { name: 'Delete TC-3' }).click();
	await expect(page.getByTestId('cases-delete-runs')).toHaveText('It is not in any run.');
	await page.getByRole('button', { name: 'Cancel' }).click();

	await expect(keys(page)).toHaveCount(3);
	await expect(page.getByRole('button', { name: 'Delete TC-3' })).toBeFocused();
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations with cases in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme });
		await openWith(page);
		await page.getByTestId('cases-tags').locator('summary').click();
		await expect(keys(page)).toHaveCount(3);
		// Rows fade in; a half-transparent badge would fail the contrast check.
		await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));

		expect(await scanA11y(page)).toEqual([]);
	});
}

test.describe('1,000 cases (FR-101 AC-4)', () => {
	test.skip(({ browserName }) => browserName !== 'chromium', 'Long Tasks API is Chromium-only.');

	test('loading the list and typing in the filter cause no main-thread task over 200 ms', async ({
		page
	}) => {
		test.slow();
		const many = Array.from({ length: 1000 }, (_, i) =>
			testCase(i + 1, {
				title: `Case ${i + 1} ${['deposit', 'withdraw', 'swap', 'stake'][i % 4]}`,
				tags: [['deposit', 'withdrawal', 'swap', 'staking'][i % 4], 'smoke'],
				priority: ['critical', 'high', 'medium', 'low'][i % 4]
			})
		);
		// Recorded from the start of each page load, so rendering 1,000 rows counts too.
		await page.addInitScript(() => {
			const durations: number[] = [];
			Object.defineProperty(window, '__longTasks', { value: durations });
			new PerformanceObserver((list) => {
				for (const entry of list.getEntries()) durations.push(Math.round(entry.duration));
			}).observe({ type: 'longtask', buffered: true });
		});
		await openWith(page, many);
		await expect(count(page)).toHaveText('1,000 test cases');

		await filterField(page).pressSequentially('case 1', { delay: 30 });
		await expect(count(page)).toHaveText('112 of 1,000 match');
		for (let i = 0; i < 6; i++) await filterField(page).press('Backspace');
		await expect(count(page)).toHaveText('1,000 test cases');
		await expect(rows(page)).toHaveCount(1000);

		const longTasks = await page.evaluate(
			() => (window as unknown as { __longTasks: number[] }).__longTasks
		);
		test.info().annotations.push({ type: 'long tasks (ms)', description: longTasks.join(', ') });
		expect(longTasks.filter((ms) => ms > 200)).toEqual([]);
	});
});
