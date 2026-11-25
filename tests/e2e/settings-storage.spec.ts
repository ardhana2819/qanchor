import { expect, test, type Page } from '@playwright/test';
import { appOpened, scanA11y } from './helpers.ts';

// Storage in Settings (T-064; design 13.3 S-10, 13.7; FR-092 AC-1, AC-2). `navigator.storage`
// is replaced before the page loads, so each browser answer from T-057 can be shown in every
// browser: granted, refused, a prompt still open (Firefox), an error, and no API at all.

interface StubOptions {
	persisted?: boolean;
	answer?: boolean | 'prompt' | 'error';
	missing?: boolean;
}

async function openSettings(
	page: Page,
	{ persisted = false, answer = false, missing = false }: StubOptions = {}
): Promise<void> {
	await page.addInitScript(
		({ persisted, answer, missing }) => {
			const calls = { persist: 0 };
			let settle: ((granted: boolean) => void) | undefined;
			Object.assign(window, {
				__persistCalls: calls,
				__answerPrompt: (granted: boolean) => settle?.(granted)
			});
			const storage = missing
				? undefined
				: {
						estimate: async () => ({ usage: 38_000_000, quota: 2_000_000_000 }),
						persisted: async () => persisted,
						persist: () => {
							calls.persist += 1;
							if (answer === 'error') return Promise.reject(new Error('Not allowed'));
							if (answer === 'prompt') return new Promise<boolean>((r) => (settle = r));
							return Promise.resolve(answer);
						}
					};
			Object.defineProperty(Navigator.prototype, 'storage', {
				configurable: true,
				get: () => storage
			});
		},
		{ persisted, answer, missing }
	);
	await page.goto('/settings');
	await appOpened(page);
	await expect(page.getByTestId('storage-status')).toHaveCount(missing ? 1 : 0);
}

const section = (page: Page) => page.getByTestId('settings-storage');
const keep = (page: Page) => section(page).getByRole('button', { name: 'Keep data persistent' });
const persistCalls = (page: Page) =>
	page.evaluate(
		() => (window as unknown as { __persistCalls: { persist: number } }).__persistCalls.persist
	);

test('shows the storage used and that it is not persistent, asking nothing (FR-092 AC-1)', async ({
	page
}) => {
	await openSettings(page);

	await expect(section(page).getByTestId('storage-usage')).toContainText(
		'38 MB of about 2 GB used'
	);
	await expect(section(page).getByRole('progressbar')).toHaveAttribute('value', '38000000');
	await expect(page.getByTestId('storage-persistence')).toHaveText(
		/Not persistent\s*The browser may delete this data when disk space runs low\./
	);
	await expect(keep(page)).toBeVisible();
	expect(await persistCalls(page)).toBe(0);
});

test('Keep data persistent asks once, and a yes says so (FR-092 AC-2)', async ({ page }) => {
	await openSettings(page, { answer: true });

	await keep(page).click();

	await expect(page.getByTestId('storage-persistence')).toContainText('Persistent');
	await expect(page.getByTestId('storage-persistence')).not.toContainText('Not persistent');
	await expect(keep(page)).toHaveCount(0);
	await expect(page.locator('[aria-live="polite"]').first()).toContainText(
		'Storage is now persistent.'
	);
	expect(await persistCalls(page)).toBe(1);
});

test('a no names the refusal and how browsers decide (design 13.7)', async ({ page }) => {
	await openSettings(page, { answer: false });

	await keep(page).click();

	const callout = section(page).locator('.callout');
	await expect(callout).toContainText('The browser did not make storage persistent.');
	await expect(callout).toContainText('Firefox asks you.');
	await expect(callout).toBeFocused();
	await expect(page.getByTestId('storage-persistence')).toContainText('Not persistent');
	await expect(keep(page)).toBeEnabled();
});

test("an open prompt keeps the page waiting for the browser's answer (Firefox, T-057)", async ({
	page
}) => {
	await openSettings(page, { answer: 'prompt' });

	await keep(page).click();

	await expect(section(page).getByTestId('storage-asking')).toHaveText(
		"Waiting for the browser's answer…"
	);
	await page.evaluate(() =>
		(window as unknown as { __answerPrompt: (granted: boolean) => void }).__answerPrompt(true)
	);
	await expect(section(page).getByTestId('storage-asking')).toHaveCount(0);
	await expect(page.getByTestId('storage-persistence')).not.toContainText('Not persistent');
	expect(await persistCalls(page)).toBe(1);
});

test('a failed request is an error', async ({ page }) => {
	await openSettings(page, { answer: 'error' });

	await keep(page).click();

	await expect(section(page).getByRole('alert')).toContainText('The browser could not be asked.');
});

test('persistent storage needs no button', async ({ page }) => {
	await openSettings(page, { persisted: true });

	await expect(page.getByTestId('storage-persistence')).toContainText('Persistent');
	await expect(keep(page)).toHaveCount(0);
});

test('without the Storage API the section says so (degrades)', async ({ page }) => {
	await openSettings(page, { missing: true });

	await expect(page.getByTestId('storage-status')).toHaveText(
		'This browser does not report how much storage is used or whether it is persistent.'
	);
	await expect(keep(page)).toHaveCount(0);
	await expect(page.getByTestId('settings-export')).toBeEnabled();
});

test("the browser's own API is read without asking", async ({ page }) => {
	await page.goto('/settings');
	await appOpened(page);

	await expect(section(page).getByTestId('storage-usage')).toContainText(
		/ of about [\d.]+ [KMGT]?B used/
	);
	await expect(page.getByTestId('storage-persistence')).toContainText('persistent');
});

for (const colorScheme of ['light', 'dark'] as const) {
	test(`has no WCAG 2.1 AA violations in ${colorScheme} mode`, async ({ page }) => {
		await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
		await openSettings(page, { answer: false });
		await keep(page).click();
		await expect(section(page).locator('.callout')).toBeVisible();

		expect(await scanA11y(page)).toEqual([]);
	});
}
