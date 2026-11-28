import { expect, test, type Page } from '@playwright/test';
import { CHECKLISTS, itemCount } from '#lib/content/checklists/index.ts';
import { checklistItems, sectionTag } from '#lib/core/qa/from-checklist.ts';
import type { TestCase } from '#lib/core/qa/types.ts';
import {
	appOpened,
	readStore,
	recordRequests,
	scanA11y,
	scriptBodies,
	seedCases,
	testCase
} from './helpers.ts';

// Create test cases from a checklist (T-073; design 13.3 S-07, 13.7; FR-150, NFR-025, NFR-026).

const DEPOSIT = CHECKLISTS.find((c) => c.slug === 'deposit')!;
const TOTAL = itemCount(DEPOSIT);
const ITEMS = checklistItems(DEPOSIT);

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Create test cases from Deposit' });
const confirm = (page: Page) => page.getByTestId('checklists-create-confirm');
const openButton = (page: Page) => page.getByTestId('checklists-create-cases');

async function openChecklist(page: Page): Promise<void> {
	await page.goto('/checklists/deposit');
	await appOpened(page);
}

async function openDialog(page: Page): Promise<void> {
	await openButton(page).click();
	await expect(dialog(page)).toBeVisible();
	await expect(confirm(page)).toBeVisible();
}

/** Creates every item but the first two, through the dialog. */
async function createAllButTwo(page: Page): Promise<void> {
	await openDialog(page);
	const boxes = dialog(page).getByRole('checkbox');
	await boxes.nth(0).uncheck();
	await boxes.nth(1).uncheck();
	await expect(confirm(page)).toHaveText(`Create ${TOTAL - 2} test cases`);
	await confirm(page).click();
	await expect(dialog(page)).toBeHidden();
}

test.describe('Create test cases from a checklist (FR-150)', () => {
	test('offers every item, ticked and grouped by section (AC-1)', async ({ page }) => {
		await openChecklist(page);
		// Focus and Enter: a click does not focus a button in WebKit on macOS, and focus returns here.
		await openButton(page).focus();
		await page.keyboard.press('Enter');
		await expect(confirm(page)).toBeVisible();
		await expect(dialog(page).getByTestId('checklists-create-section')).toHaveCount(
			DEPOSIT.sections.length
		);
		const first = DEPOSIT.sections[0];
		await expect(
			dialog(page).getByRole('group', { name: first.heading }).getByRole('checkbox')
		).toHaveCount(first.items.length);
		await expect(dialog(page).getByRole('checkbox', { checked: true })).toHaveCount(TOTAL);
		await expect(page.getByTestId('checklists-create-selected')).toHaveText(
			`${TOTAL} of ${TOTAL} selected`
		);
		await expect(confirm(page)).toHaveText(`Create ${TOTAL} test cases`);

		await page.getByTestId('checklists-create-none').click();
		await expect(confirm(page)).toBeDisabled();
		await expect(dialog(page)).toContainText('Select at least one item.');
		await page.getByTestId('checklists-create-all').click();
		await expect(confirm(page)).toBeEnabled();

		// Escape closes it and returns focus to the button.
		await page.keyboard.press('Escape');
		await expect(dialog(page)).toBeHidden();
		await expect(openButton(page)).toBeFocused();
	});

	test('stores one case per item, in one go, and links to them (AC-2, AC-4)', async ({ page }) => {
		await openChecklist(page);
		await seedCases(page, [testCase(1, { title: 'Older case' })] as { number: number }[]);
		await createAllButTwo(page);

		const created = page.getByTestId('checklists-created');
		await expect(created).toContainText(`Created ${TOTAL - 2} test cases.`);
		const stored = (await readStore<TestCase>(page, 'testCases')).sort(
			(a, b) => a.number - b.number
		);
		expect(stored).toHaveLength(TOTAL - 1);
		const third = ITEMS[2];
		expect(stored[1]).toMatchObject({
			number: 2,
			title: third.text,
			expected: third.text,
			preconditions: '',
			steps: [],
			tags: ['deposit', sectionTag(third.heading)],
			priority: 'medium'
		});
		expect(stored.map((c) => c.number)).toEqual(stored.map((_, i) => i + 1));

		await created.getByRole('link', { name: 'View them' }).click();
		await expect(page).toHaveURL(/\/cases\?tag=deposit$/);
		// The list keeps filtered-out rows in the page, hidden (FR-101 AC-4).
		await expect(page.getByTestId('cases-row').filter({ visible: true })).toHaveCount(TOTAL - 2);
	});

	test('converting again warns how many exist; Skip creates none of them (AC-3)', async ({
		page
	}) => {
		await openChecklist(page);
		await createAllButTwo(page);

		await openDialog(page);
		await expect(page.getByTestId('checklists-create-duplicates')).toContainText(
			`${TOTAL - 2} of these items already exist as test cases with the tag deposit.`
		);
		await expect(dialog(page).getByRole('radio', { name: 'Skip existing' })).toBeChecked();
		await expect(confirm(page)).toHaveText('Create 2 test cases');
		await confirm(page).click();
		await expect(page.getByTestId('checklists-created')).toContainText('Created 2 test cases.');
		expect(await readStore(page, 'testCases')).toHaveLength(TOTAL);

		// Every item exists now: Skip leaves nothing to create; Create anyway duplicates them.
		await openDialog(page);
		await expect(page.getByTestId('checklists-create-duplicates')).toContainText(
			`${TOTAL} of these items already exist`
		);
		await expect(confirm(page)).toBeDisabled();
		await expect(confirm(page)).toHaveText('Create test cases');
		await expect(dialog(page)).toContainText('Every selected item already exists as a test case.');
		await dialog(page).getByRole('radio', { name: 'Create anyway' }).check();
		await expect(confirm(page)).toHaveText(`Create ${TOTAL} test cases`);
		await confirm(page).click();
		await expect(page.getByTestId('checklists-created')).toContainText(
			`Created ${TOTAL} test cases.`
		);
		expect(await readStore(page, 'testCases')).toHaveLength(TOTAL * 2);
	});

	test('the dialog code loads only when it is opened (NFR-025)', async ({ page }) => {
		const marker = 'Items that already exist';
		const requests = recordRequests(page);
		await openChecklist(page);
		await page.waitForLoadState('networkidle');
		const before = await scriptBodies(page, requests);
		expect(before.length).toBeGreaterThan(0);
		expect(before.some((body) => body.includes(marker))).toBe(false);

		await openDialog(page);
		expect((await scriptBodies(page, requests)).some((body) => body.includes(marker))).toBe(true);
	});

	test('an empty Test cases list links to Checklists (design 13.7)', async ({ page }) => {
		await page.goto('/cases');
		await appOpened(page);
		await page.getByTestId('cases-empty-checklists').click();
		await expect(page).toHaveURL(/\/checklists$/);
	});
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`no WCAG 2.1 AA violations in the dialog in ${colorScheme} mode (NFR-009)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openChecklist(page);
		await createAllButTwo(page);
		expect(await scanA11y(page)).toEqual([]);

		await openDialog(page);
		await expect(page.getByTestId('checklists-create-duplicates')).toBeVisible();
		expect(await scanA11y(page)).toEqual([]);
	});
}
