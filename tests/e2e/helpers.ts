import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

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

type Store = Parameters<typeof putRecords>[1];

/** Every record in one store of the app's database. */
export function readStore<T = Record<string, unknown>>(page: Page, store: Store): Promise<T[]> {
	return page.evaluate(
		(store) =>
			new Promise<T[]>((resolve, reject) => {
				const request = indexedDB.open('qanchor');
				request.onsuccess = () => {
					const db = request.result;
					const all = db.transaction(store).objectStore(store).getAll();
					all.onsuccess = () => (db.close(), resolve(all.result as T[]));
					all.onerror = () => reject(all.error);
				};
				request.onerror = () => reject(request.error);
			}),
		store
	);
}

/** A stored run of the given cases (snapshots of `testCase`), in progress unless overridden. */
export function testRun(id: string, caseNumbers: number[], fields: Record<string, unknown> = {}) {
	return {
		id,
		name: `Run ${id}`,
		release: '',
		environment: '',
		status: 'in-progress',
		cases: caseNumbers.map((n) => {
			const snapshot = { ...(testCase(n) as Record<string, unknown>) };
			delete snapshot.createdAt;
			delete snapshot.updatedAt;
			return snapshot;
		}),
		createdAt: Date.UTC(2026, 10, 1),
		updatedAt: Date.UTC(2026, 10, 1),
		completedAt: null,
		...fields
	};
}

/** A stored result of one case in a run. */
export function testResult(runId: string, caseNumber: number, status: string): object {
	return {
		runId,
		caseNumber,
		status,
		failedStep: status === 'fail' ? 0 : null,
		actual: status === 'fail' ? 'It broke' : '',
		reason: status === 'blocked' ? 'No funds' : '',
		notes: '',
		linkedIssue: '',
		updatedAt: Date.UTC(2026, 10, 2)
	};
}

/** Presses Tab (or Shift+Tab) until `target` has focus; fails after `limit` presses. */
export async function tabTo(page: Page, target: Locator, limit = 60, key = 'Tab'): Promise<void> {
	for (let i = 0; i < limit; i++) {
		if (await target.evaluate((el) => el === document.activeElement)) return;
		await page.keyboard.press(key);
	}
	throw new Error(`${key} never reached ${target}`);
}
