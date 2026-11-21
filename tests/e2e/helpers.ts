import AxeBuilder from '@axe-core/playwright';
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

/** WCAG 2.1 AA scan of the whole page; returns "rule: first target" per violation (NFR-009). */
export async function scanA11y(page: Page): Promise<string[]> {
	const results = await new AxeBuilder({ page })
		.withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
		.analyze();
	return results.violations.map((v) => `${v.id}: ${v.nodes[0].target}`);
}

/**
 * Adds records to one store of the app's database directly, the way an imported backup would
 * leave them. Call once the app has opened the database, then reload so the page reads them.
 */
export function putRecords(
	page: Page,
	store: 'endpoints' | 'wallets' | 'faucets' | 'testCases' | 'runs' | 'results' | 'meta',
	records: object[]
): Promise<void> {
	return page.evaluate(
		({ store, records }) =>
			new Promise<void>((resolve, reject) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const tx = db.transaction(store, 'readwrite');
					for (const record of records) tx.objectStore(store).put(record);
					tx.oncomplete = () => (db.close(), resolve());
					tx.onerror = () => reject(tx.error);
				};
				request.onerror = () => reject(request.error);
			}),
		{ store, records }
	);
}

/** A stored test case with sensible defaults, `TC-<number>`. */
export function testCase(number: number, fields: Record<string, unknown> = {}): object {
	return {
		id: `case-${number}`,
		number,
		title: `Case ${number}`,
		preconditions: '',
		steps: [{ action: 'Open the page', expected: 'It loads' }],
		expected: '',
		tags: [],
		priority: 'medium',
		createdAt: Date.UTC(2026, 10, 1),
		updatedAt: Date.UTC(2026, 10, 1),
		...fields
	};
}

/**
 * Stores test cases with the key counter at the highest number, as the app keeps it, so a case
 * created afterwards gets the next key. Reload the page afterwards so it reads them.
 */
export async function seedCases(page: Page, cases: { number: number }[]): Promise<void> {
	await putRecords(page, 'testCases', cases);
	const highest = Math.max(0, ...cases.map((c) => c.number));
	await putRecords(page, 'meta', [{ key: 'caseCounter', value: highest }]);
}
