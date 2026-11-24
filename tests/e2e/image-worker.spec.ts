import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { expect, test, type Page } from '@playwright/test';
import { appOpened, recordRequests } from './helpers.ts';

// The image worker (T-059) on the /components test bed, in every browser: output size and type
// (FR-112 AC-2), refusals (AC-5), the first GIF frame (EC-030), loading on the first image only,
// and no main-thread task over 200 ms for a 12-megapixel image (NFR-023). Images are made here,
// so no large file is committed; the HEIC fixture is a 64 × 48 file made with macOS `sips`.

const HEIC = fileURLToPath(new URL('./fixtures/tiny.heic', import.meta.url));

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

/** A PNG: 8-bit gray, or gray with alpha (left half transparent) when `alpha` is set. */
function png(width: number, height: number, alpha = false): Buffer {
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

/** A 1 × 1 GIF with two frames, black then white. */
const GIF = Buffer.from(
	// Header, 1 × 1 screen with a two-colour table, then two frames (delay, image, LZW data).
	'47494638396101000100800000000000ffffff' +
		'21f904000a0000002c00000000010001000002024401' +
		'0021f904000a0000002c00000000010001000002024c01003b',
	'hex'
);

async function fixture(name: string, bytes: Buffer): Promise<string> {
	const path = test.info().outputPath(name);
	await writeFile(path, bytes);
	return path;
}

async function openBed(page: Page): Promise<void> {
	await page.goto('/components');
	await appOpened(page);
}

/** Chooses a file by path (a buffer is turned into a File by Playwright's own page script). */
async function compress(page: Page, path: string): Promise<string> {
	const result = page.getByTestId('image-compress-result');
	await page.getByLabel('Image to compress').setInputFiles(path);
	await expect(result).not.toHaveText(/^(Compressing…)?$/, { timeout: 30_000 });
	return (await result.textContent())?.trim() ?? '';
}

/** WebKit encodes no WebP, so it gets JPEG (T-057). */
/**
 * WebP, or JPEG where this browser cannot encode WebP. Asked of the browser, not assumed from
 * its name: Playwright's WebKit encodes WebP on Linux (CI) but not on macOS (T-057).
 */
const outputType = (page: Page) =>
	page.evaluate(async () => {
		const canvas = new OffscreenCanvas(1, 1);
		canvas.getContext('2d');
		const blob = await canvas.convertToBlob({ type: 'image/webp' });
		return blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
	});

/** Whether this browser decodes the bytes, asked the same way the worker decodes. */
const canDecode = (page: Page, bytes: Buffer, type: string) =>
	page.evaluate(
		async ({ data, type }) => {
			try {
				(await createImageBitmap(new Blob([new Uint8Array(data)], { type }))).close();
				return true;
			} catch {
				return false;
			}
		},
		{ data: [...bytes], type }
	);

test('the worker loads on the first image only (T-059, NFR-025)', async ({ page }) => {
	const requests = recordRequests(page);
	await openBed(page);
	await page.waitForLoadState('networkidle');
	const worker = () => requests.filter((r) => /image\.worker/.test(r.url()));
	expect(worker()).toEqual([]);

	await compress(page, await fixture('small.png', png(40, 30)));

	expect(worker()).toHaveLength(1);
});

test.describe('output (FR-112 AC-2)', () => {
	test('a 12-megapixel image comes out with a 1,920 px long edge', async ({ page }) => {
		test.slow();
		const path = await fixture('12mp.png', png(4000, 3000));
		await openBed(page);

		expect(await compress(page, path)).toMatch(
			new RegExp(`^${await outputType(page)} · 1920 × 1440 · \\d`)
		);
	});

	test('a tall capture keeps its shape, and a small image its size (EC-030)', async ({ page }) => {
		await openBed(page);
		const type = await outputType(page);

		expect(await compress(page, await fixture('tall.png', png(800, 4000)))).toMatch(
			new RegExp(`^${type} · 384 × 1920 · `)
		);
		expect(await compress(page, await fixture('small.png', png(40, 30)))).toMatch(
			new RegExp(`^${type} · 40 × 30 · `)
		);
	});

	test('a transparent PNG is compressed (on white where the output is JPEG)', async ({ page }) => {
		await openBed(page);

		expect(await compress(page, await fixture('alpha.png', png(64, 48, true)))).toMatch(
			new RegExp(`^${await outputType(page)} · 64 × 48 · `)
		);
	});

	test('a GIF keeps its first frame, and says so (EC-030)', async ({ page }) => {
		await openBed(page);

		expect(await compress(page, await fixture('loop.gif', GIF))).toMatch(
			new RegExp(`^${await outputType(page)} · 1 × 1 · .+ · first frame only$`)
		);
	});

	test('HEIC opens where the browser decodes it, and elsewhere names the file (T-057)', async ({
		page
	}) => {
		await openBed(page);
		const decodes = await canDecode(page, await readFile(HEIC), 'image/heic');
		const text = await compress(page, HEIC);

		if (decodes) expect(text).toMatch(new RegExp(`^${await outputType(page)} · 64 × 48 · `));
		else expect(text).toBe('This browser cannot open tiny.heic (HEIC).');
	});
});

test.describe('refusals (FR-112 AC-5)', () => {
	test('a file that is not an image', async ({ page }) => {
		await openBed(page);

		expect(await compress(page, await fixture('notes.txt', Buffer.from('hello')))).toBe(
			'notes.txt is not an image.'
		);
	});

	test('an image over 25 MB, refused before it is decoded', async ({ page }) => {
		await openBed(page);
		const path = await fixture('big.png', Buffer.alloc(25_000_001));

		expect(await compress(page, path)).toBe('Images up to 25 MB and 50 megapixels.');
	});

	test('an image over 50 megapixels', async ({ page }) => {
		test.slow();
		await openBed(page);
		const path = await fixture('huge.png', png(7072, 7072));

		expect(await compress(page, path)).toBe('Images up to 25 MB and 50 megapixels.');
	});
});

test('a 12-megapixel image causes no main-thread task over 200 ms (NFR-023)', async ({
	page,
	browserName
}) => {
	test.skip(browserName !== 'chromium', 'Long Tasks API is Chromium-only.');
	test.slow();
	const path = await fixture('12mp.png', png(4000, 3000));
	await openBed(page);
	await page.evaluate(() => {
		const durations: number[] = [];
		Object.defineProperty(window, '__longTasks', { value: durations });
		new PerformanceObserver((list) => {
			for (const entry of list.getEntries()) durations.push(Math.round(entry.duration));
		}).observe({ type: 'longtask' });
	});

	expect(await compress(page, path)).toMatch(/^image\/webp · 1920 × 1440 · /);

	const longTasks = await page.evaluate(
		() => (window as unknown as { __longTasks: number[] }).__longTasks
	);
	test.info().annotations.push({ type: 'long tasks (ms)', description: longTasks.join(', ') });
	expect(longTasks.filter((ms) => ms > 200)).toEqual([]);
});
