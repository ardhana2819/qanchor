import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { deflateSync } from 'node:zlib';

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
	store:
		| 'endpoints'
		| 'wallets'
		| 'faucets'
		| 'testCases'
		| 'runs'
		| 'results'
		| 'sessions'
		| 'findings'
		| 'screenshots'
		| 'meta',
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

/** A stored session, running since 2026-11-01 unless overridden. */
export function testSession(id: string, fields: Record<string, unknown> = {}) {
	return {
		id,
		charter: `Charter ${id}`,
		release: '',
		environment: '',
		timeboxMinutes: 60,
		status: 'running',
		startedAt: Date.UTC(2026, 10, 1),
		pausedAt: null,
		pausedMs: 0,
		endedAt: null,
		createdAt: Date.UTC(2026, 10, 1),
		updatedAt: Date.UTC(2026, 10, 1),
		...fields
	};
}

/** A stored finding of a session, a note at 0 min unless overridden. */
export function testFinding(id: string, sessionId: string, fields: Record<string, unknown> = {}) {
	return {
		id,
		sessionId,
		type: 'note',
		text: `Finding ${id}`,
		at: 0,
		createdAt: Date.UTC(2026, 10, 1),
		updatedAt: Date.UTC(2026, 10, 1),
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

/** Every request the page makes from now on. */
export function recordRequests(page: Page): Request[] {
	const requests: Request[] = [];
	page.on('request', (request) => requests.push(request));
	return requests;
}

/** Strings that only appear in crypto code (our Taproot tag, noble's scalar check). */
const CRYPTO_MARKERS = ['TapTweak', 'invalid scalar'];

/**
 * Every script the page requested, fetched again by URL: Chromium does not keep the response
 * body of a worker script, and worker scripts must be checked too.
 */
export async function scriptBodies(page: Page, requests: Request[]): Promise<string[]> {
	const urls = new Set(
		requests
			.filter((r) => r.resourceType() === 'script' || r.url().endsWith('.js'))
			.map((r) => r.url())
	);
	return Promise.all([...urls].map(async (url) => (await page.request.get(url)).text()));
}

export const hasCrypto = (bodies: string[]): boolean =>
	bodies.some((body) => CRYPTO_MARKERS.some((marker) => body.includes(marker)));

/** Tabs through the page `presses` times and names each focused control that shows no ring. */
export async function controlsWithoutFocusRing(page: Page, presses = 40): Promise<string[]> {
	const missing: string[] = [];
	for (let i = 0; i < presses; i++) {
		await page.keyboard.press('Tab');
		const ring = await page.evaluate(() => {
			const el = document.activeElement as HTMLElement | null;
			if (!el || el === document.body) return null;
			const style = getComputedStyle(el);
			// Native radios and checkboxes inside custom controls draw the ring on a sibling; the
			// tag input draws it on its wrapper (`:has(input:focus-visible)`).
			const sibling = el.nextElementSibling ? getComputedStyle(el.nextElementSibling) : null;
			const parent = el.parentElement ? getComputedStyle(el.parentElement) : null;
			const visible = (s: CSSStyleDeclaration | null) =>
				!!s && ((s.outlineStyle !== 'none' && s.outlineWidth !== '0px') || s.boxShadow !== 'none');
			return {
				name: `${el.tagName} ${el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30)}`,
				ok: visible(style) || visible(sibling) || visible(parent)
			};
		});
		if (ring && !ring.ok) missing.push(ring.name);
	}
	return missing;
}

function crc32(bytes: Uint8Array): number {
	let crc = ~0;
	for (const byte of bytes) {
		crc ^= byte;
		for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
	}
	return ~crc >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
	const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
	const length = Buffer.alloc(4);
	length.writeUInt32BE(data.length);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(body));
	return Buffer.concat([length, body, crc]);
}

/**
 * A PNG made in the test, so no image file is committed: 8-bit gray, or gray with alpha (left
 * half transparent) when `alpha` is set.
 */
export function png(width: number, height: number, alpha = false): Buffer {
	const channels = alpha ? 2 : 1;
	const row = Buffer.alloc(1 + width * channels);
	for (let x = 0; x < width; x++) {
		row[1 + x * channels] = x % 256;
		if (alpha) row[2 + x * channels] = x < width / 2 ? 0 : 255;
	}
	const header = Buffer.alloc(13);
	header.writeUInt32BE(width, 0);
	header.writeUInt32BE(height, 4);
	header[8] = 8;
	header[9] = alpha ? 4 : 0;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(Buffer.concat(Array(height).fill(row)), { level: 1 })),
		chunk('IEND', Buffer.alloc(0))
	]);
}
