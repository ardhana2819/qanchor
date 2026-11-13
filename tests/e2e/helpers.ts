import { expect, type Page } from '@playwright/test';

/**
 * Waits until /components has hydrated. Typing into a prerendered input before that can race
 * with hydration (WebKit turned "12" into "1212"). The tab indicator is only rendered by an
 * effect, so its presence means the components are live.
 */
export async function hydrated(page: Page): Promise<void> {
	await expect(page.locator('.indicator')).toBeAttached();
}

/**
 * Waits until the app has created its IndexedDB database. Opening it from a test first would
 * create an empty v1 database and hide whether the app's own upgrade ran.
 */
export async function appOpened(page: Page): Promise<void> {
	await expect
		.poll(() => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name)))
		.toContain('qanchor');
}
