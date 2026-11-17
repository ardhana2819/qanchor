import { expect, test, type Page } from '@playwright/test';
import { CHECKLISTS, itemCount } from '#lib/content/checklists/index.ts';
import { appOpened, scanA11y } from './helpers.ts';

// Checklists pages (T-033): FR-060, FR-061, US-007. Filtering and the Markdown format are
// unit-tested in src/lib/tools/checklists; this checks the pages, navigation, and copying.

const deposit = CHECKLISTS[0]!;
const memoTag = CHECKLISTS.find((c) => c.slug === 'memo-tag')!;
const rows = (page: Page) => page.getByRole('list', { name: 'Checklists' }).locator(':scope > li');
const filter = (page: Page) => page.getByRole('textbox', { name: 'Filter' });

async function open(page: Page, path = '/checklists'): Promise<void> {
	await page.goto(path);
	await appOpened(page);
}

/** Records each value written to the clipboard (browsers differ in reading it back). */
async function recordClipboard(page: Page): Promise<void> {
	await page.addInitScript(() => {
		const copied: string[] = [];
		Object.defineProperty(window, '__copied', { value: copied });
		navigator.clipboard.writeText = async (text: string) => {
			copied.push(text);
		};
	});
}

const copiedValues = (page: Page) =>
	page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

test('Checklists is in the Data group of the navigation and on the index', async ({ page }) => {
	await page.goto('/');
	const data = page.getByRole('navigation', { name: 'Main' }).getByRole('region', { name: 'Data' });
	await expect(data.getByRole('link')).toHaveText(['Dummy data', 'Checklists']);

	await page.getByRole('main').getByRole('link', { name: 'Checklists' }).click();

	await expect(page).toHaveTitle('Checklists · QAnchor');
	await expect(page.getByRole('heading', { level: 1 })).toHaveText('Checklists');
});

test('the list shows each decided topic with its item count (FR-060 AC-1)', async ({ page }) => {
	await open(page);

	await expect(rows(page).getByRole('link')).toHaveText(CHECKLISTS.map((c) => c.title));
	for (const [i, checklist] of CHECKLISTS.entries()) {
		await expect(rows(page).nth(i)).toContainText(`${itemCount(checklist)} items`);
		await expect(rows(page).nth(i)).toContainText(checklist.summary);
	}
});

test('the filter keeps matching checklists and items, highlighted (FR-060 AC-3)', async ({
	page
}) => {
	await open(page);

	await filter(page).fill('4294967295');

	await expect(rows(page)).toHaveCount(1);
	await expect(rows(page).getByRole('link')).toHaveText(memoTag.title);
	const items = page.getByRole('list', { name: `Matching items in ${memoTag.title}` });
	await expect(items.getByRole('listitem')).not.toHaveCount(0);
	await expect(items.locator('mark').first()).toHaveText('4294967295');
	await expect(page.getByText('Showing 1 of 7 checklists.')).toBeVisible();

	// A title match keeps the checklist whole, without an item list.
	await filter(page).fill('staking');
	await expect(rows(page).getByRole('link', { name: 'Staking' })).toBeVisible();
	await expect(page.getByRole('list', { name: 'Matching items in Staking' })).toHaveCount(0);
});

test('a filter with no match shows the empty state, and Clear restores the list', async ({
	page
}) => {
	await open(page);

	await filter(page).fill('  zzz-no-such-text ');

	await expect(page.getByText('No checklist or item contains "zzz-no-such-text".')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Checklists' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Clear filter' }).click();

	await expect(rows(page)).toHaveCount(CHECKLISTS.length);
	await expect(filter(page)).toHaveValue('');
	await expect(filter(page)).toBeFocused();
});

test('a checklist page shows its items under headings (FR-060 AC-2)', async ({ page }) => {
	await open(page);

	await rows(page).getByRole('link', { name: deposit.title }).click();

	await expect(page).toHaveURL(`/checklists/${deposit.slug}`);
	await expect(page).toHaveTitle(`${deposit.title} checklist · QAnchor`);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(deposit.title);
	await expect(page.getByRole('main').getByRole('heading', { level: 2 })).toHaveText(
		deposit.sections.map((s) => s.heading)
	);
	const first = deposit.sections[0]!;
	await expect(page.getByRole('region', { name: first.heading }).getByRole('listitem')).toHaveText([
		...first.items
	]);
	await expect(
		page.getByText(`${itemCount(deposit)} items in ${deposit.sections.length} sections`)
	).toBeVisible();

	// The sidebar keeps Checklists highlighted inside it, without calling it the current page.
	const nav = page
		.getByRole('navigation', { name: 'Main' })
		.getByRole('link', { name: 'Checklists' });
	await expect(nav).toHaveAttribute('aria-current', 'true');

	await page.getByRole('link', { name: 'Checklists' }).first().click();
	await expect(page).toHaveURL('/checklists');
});

test('every checklist has its own page, and a deep link loads it', async ({ page }) => {
	for (const checklist of CHECKLISTS) {
		await page.goto(`/checklists/${checklist.slug}`);
		await expect(page.getByRole('heading', { level: 1 })).toHaveText(checklist.title);
		await expect(page.locator('main li')).toHaveCount(itemCount(checklist));
	}
});

test('an unknown checklist shows the not-found page', async ({ page }) => {
	await page.goto('/checklists/no-such-checklist');

	await expect(page).toHaveTitle('Page not found · QAnchor');
});

test('Copy as Markdown copies a task list with headings (FR-061 AC-1)', async ({ page }) => {
	await recordClipboard(page);
	await open(page, `/checklists/${deposit.slug}`);

	await page.getByRole('button', { name: 'Copy as Markdown' }).click();

	await expect(page.locator('.toast')).toHaveText('Copied as Markdown');
	const [markdown] = await copiedValues(page);
	const lines = markdown!.split('\n');
	expect(lines[0]).toBe(`# ${deposit.title}`);
	expect(lines.filter((l) => l.startsWith('## '))).toEqual(
		deposit.sections.map((s) => `## ${s.heading}`)
	);
	expect(lines.filter((l) => l.startsWith('- [ ] '))).toEqual(
		deposit.sections.flatMap((s) => s.items.map((item) => `- [ ] ${item}`))
	);
});

test('keyboard only: filter, open a checklist, and copy it', async ({ page }) => {
	await recordClipboard(page);
	await open(page);

	await filter(page).focus();
	await page.keyboard.type('withdraw');
	await page.keyboard.press('Tab');
	await expect(rows(page).getByRole('link', { name: 'Withdraw' })).toBeFocused();
	await page.keyboard.press('Enter');
	await expect(page).toHaveURL('/checklists/withdraw');

	const copy = page.getByRole('button', { name: 'Copy as Markdown' });
	await copy.focus();
	await page.keyboard.press('Enter');
	await expect.poll(() => copiedValues(page)).toHaveLength(1);
});

test('the filtered list has no WCAG 2.1 AA violations', async ({ page }) => {
	await open(page);
	await filter(page).fill('memo');
	await expect(page.locator('mark').first()).toBeAttached();

	expect(await scanA11y(page)).toEqual([]);
});

test('the empty state has no WCAG 2.1 AA violations', async ({ page }) => {
	await open(page);
	await filter(page).fill('zzz');
	await expect(page.getByRole('button', { name: 'Clear filter' })).toBeAttached();

	expect(await scanA11y(page)).toEqual([]);
});
