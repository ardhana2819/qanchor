import { expect, test, type Page } from '@playwright/test';

const LIGHT_BG = 'rgb(255, 255, 255)';
const DARK_BG = 'rgb(11, 16, 23)';

const html = (page: Page) => page.locator('html');
const radio = (page: Page, name: string) =>
	page.getByRole('group', { name: 'Theme' }).getByRole('radio', { name });
const bodyBackground = (page: Page) =>
	page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const storedTheme = (page: Page) => page.evaluate(() => localStorage.getItem('qanchor.theme'));

test('defaults to System and follows the OS', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');

	await expect(radio(page, 'System')).toBeChecked();
	await expect(html(page)).not.toHaveAttribute('data-theme');
	expect(await bodyBackground(page)).toBe(DARK_BG);
});

test('choosing a theme applies it immediately and keeps it after reload (FR-002 AC-2)', async ({
	page
}) => {
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.goto('/');

	await radio(page, 'Light').check();
	await expect(html(page)).toHaveAttribute('data-theme', 'light');
	expect(await bodyBackground(page)).toBe(LIGHT_BG);
	expect(await storedTheme(page)).toBe('light');

	await page.reload();
	await expect(radio(page, 'Light')).toBeChecked();
	expect(await bodyBackground(page)).toBe(LIGHT_BG);
});

test('choosing System again clears the stored choice', async ({ page }) => {
	await page.addInitScript(() => {
		if (!sessionStorage.getItem('seeded')) {
			localStorage.setItem('qanchor.theme', 'dark');
			sessionStorage.setItem('seeded', '1');
		}
	});
	await page.goto('/');
	await expect(radio(page, 'Dark')).toBeChecked();

	await radio(page, 'System').check();

	await expect(html(page)).not.toHaveAttribute('data-theme');
	expect(await storedTheme(page)).toBeNull();
});

test('System follows an OS theme change without a reload (FR-002 AC-3)', async ({ page }) => {
	await page.emulateMedia({ colorScheme: 'light' });
	await page.goto('/');
	expect(await bodyBackground(page)).toBe(LIGHT_BG);

	await page.emulateMedia({ colorScheme: 'dark' });

	await expect.poll(() => bodyBackground(page)).toBe(DARK_BG);
});

for (const path of ['/', '/this-page-does-not-exist']) {
	test(`a stored dark theme is painted before any app script runs on ${path} (FR-002 AC-1)`, async ({
		page
	}) => {
		await page.emulateMedia({ colorScheme: 'light' });
		await page.addInitScript(() => {
			localStorage.setItem('qanchor.theme', 'dark');
			// Read the colour the moment <body> is inserted: the head has been parsed, but no module
			// script has run yet, so only the inline pre-paint script can have set the theme.
			const observer = new MutationObserver(() => {
				if (!document.body) return;
				observer.disconnect();
				Object.defineProperty(window, '__firstBackground', {
					value: getComputedStyle(document.body).backgroundColor
				});
			});
			observer.observe(document, { childList: true, subtree: true });
		});

		await page.goto(path);

		const first = await page.evaluate(
			() => (window as unknown as { __firstBackground: string }).__firstBackground
		);
		expect(first).toBe(DARK_BG);
	});
}

test('the control works with the keyboard', async ({ page }) => {
	await page.goto('/');

	await radio(page, 'System').focus();
	await page.keyboard.press('ArrowRight');

	await expect(radio(page, 'Light')).toBeChecked();
	await expect(radio(page, 'Light')).toBeFocused();
	await expect(html(page)).toHaveAttribute('data-theme', 'light');
});

test('blocked storage still applies the choice for this visit', async ({ page }) => {
	await page.addInitScript(() => {
		Storage.prototype.setItem = () => {
			throw new DOMException('Blocked', 'SecurityError');
		};
	});
	const errors: string[] = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.goto('/');

	await radio(page, 'Dark').check();

	await expect(html(page)).toHaveAttribute('data-theme', 'dark');
	expect(errors).toEqual([]);
});
