import { expect, test } from '@playwright/test';

const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(11, 16, 23)';

function bodyBackground(page: import('@playwright/test').Page) {
	return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

test.describe('theme tokens follow the system when nothing is stored', () => {
	test('light system', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await page.goto('/');
		expect(await bodyBackground(page)).toBe(LIGHT_BG);
	});

	test('dark system', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.goto('/');
		expect(await bodyBackground(page)).toBe(DARK_BG);
	});
});

test.describe('a stored theme overrides the system', () => {
	test('stored light on a dark system', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'dark' });
		await page.addInitScript(() => localStorage.setItem('qanchor.theme', 'light'));
		await page.goto('/');
		expect(await bodyBackground(page)).toBe(LIGHT_BG);
	});

	test('stored dark on a light system', async ({ page }) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await page.addInitScript(() => localStorage.setItem('qanchor.theme', 'dark'));
		await page.goto('/');
		expect(await bodyBackground(page)).toBe(DARK_BG);
	});
});

test('reduced motion sets every motion duration to zero (NFR-006)', async ({ page }) => {
	await page.emulateMedia({ reducedMotion: 'reduce' });
	await page.goto('/');

	const durations = await page.evaluate(() => {
		const style = getComputedStyle(document.documentElement);
		return [style.getPropertyValue('--duration-fast'), style.getPropertyValue('--duration-base')];
	});

	// The CSS minifier may write 0ms as 0s; compare the duration, not the spelling.
	for (const value of durations) {
		expect(value.trim()).toMatch(/^0(m?s)?$/);
	}
});

test('Inter is loaded from the same origin', async ({ page }) => {
	const fontRequests: string[] = [];
	page.on('requestfinished', (request) => {
		if (request.resourceType() === 'font') fontRequests.push(new URL(request.url()).origin);
	});

	await page.goto('/');
	const loaded = await page.evaluate(async () => {
		await document.fonts.ready;
		return document.fonts.check('14px "Inter Variable"');
	});

	expect(loaded).toBe(true);
	expect(fontRequests.length).toBeGreaterThan(0);
	expect(new Set(fontRequests)).toEqual(new Set([new URL(page.url()).origin]));
});
