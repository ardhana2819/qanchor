import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('every page has the shell landmarks and one h1', async ({ page }) => {
	await page.goto('/');

	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
	await expect(page.getByRole('main')).toBeVisible();
	await expect(page.getByRole('contentinfo')).toHaveText(/^Build \S+$/);
	await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
});

test('the prerendered HTML already contains the heading and navigation (FR-001 AC-6)', () => {
	// The Playwright web server builds the app before the tests run.
	const html = readFileSync('build/index.html', 'utf8');

	expect(html).toMatch(/<nav[^>]*aria-label="Main"/);
	expect(html).toMatch(/<h1[^>]*>QAnchor<\/h1>/);
	expect(html).toMatch(/<main[^>]*id="main"/);
});

test('the skip link is the first focusable element and moves focus to main', async ({ page }) => {
	await page.goto('/');

	await page.keyboard.press('Tab');
	const skipLink = page.getByRole('link', { name: 'Skip to content' });
	await expect(skipLink).toBeFocused();
	await expect(skipLink).toBeInViewport();

	await page.keyboard.press('Enter');
	await expect(page.getByRole('main')).toBeFocused();
});

test('Tab reaches every navigation link in order, with a visible focus ring (FR-001 AC-4)', async ({
	page
}) => {
	await page.goto('/');
	const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
	const count = await links.count();
	expect(count).toBeGreaterThan(0);

	await page.keyboard.press('Tab'); // skip link
	for (let index = 0; index < count; index++) {
		await page.keyboard.press('Tab');
		const link = links.nth(index);
		await expect(link).toBeFocused();
		await expect(link).toHaveCSS('outline-style', 'solid');
	}
});

test('Enter on the product name opens the toolkit index', async ({ page }) => {
	await page.goto('/this-page-does-not-exist');

	await page.getByRole('link', { name: 'QAnchor' }).focus();
	await page.keyboard.press('Enter');

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1, name: 'QAnchor' })).toBeVisible();
});

test('a reload keeps the route (FR-001 AC-2)', async ({ page }) => {
	await page.goto('/');
	await page.reload();

	await expect(page).toHaveURL('/');
	await expect(page.getByRole('heading', { level: 1, name: 'QAnchor' })).toBeVisible();
});

test('an unknown URL shows the not-found state inside the shell (FR-001 AC-3)', async ({
	page
}) => {
	await page.goto('/this-page-does-not-exist');

	await expect(page).toHaveTitle('Page not found · QAnchor');
	await expect(page.getByRole('heading', { level: 1, name: 'Page not found' })).toBeVisible();
	await expect(page.getByText('This address does not match any tool.')).toBeVisible();
	await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

	await page.getByRole('link', { name: 'Back to toolkit' }).click();
	await expect(page).toHaveURL('/');
});

for (const width of [375, 800]) {
	test(`at ${width} px the sidebar becomes a top bar and the page does not scroll sideways`, async ({
		page
	}) => {
		await page.setViewportSize({ width, height: 700 });
		await page.goto('/');

		const nav = await page.getByRole('navigation', { name: 'Main' }).boundingBox();
		const main = await page.getByRole('main').boundingBox();
		expect(nav && main && nav.y + nav.height <= main.y).toBe(true);

		const overflow = await page.evaluate(
			() => document.documentElement.scrollWidth - document.documentElement.clientWidth
		);
		expect(overflow).toBe(0);
	});
}
