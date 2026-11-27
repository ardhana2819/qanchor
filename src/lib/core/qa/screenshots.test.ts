import { describe, expect, it } from 'vitest';
import {
	attachmentName,
	findingAttachmentName,
	checkCount,
	checkFile,
	checkPixels,
	formatSize,
	scaledSize,
	screenshotErrorText,
	SCREENSHOT_BYTES_MAX,
	SCREENSHOT_EDGE_MAX,
	SCREENSHOT_PIXELS_MAX,
	SCREENSHOTS_MAX
} from './screenshots.ts';

describe('screenshot limits (PRD 10.5)', () => {
	it('match the PRD', () => {
		expect([
			SCREENSHOTS_MAX,
			SCREENSHOT_BYTES_MAX,
			SCREENSHOT_PIXELS_MAX,
			SCREENSHOT_EDGE_MAX
		]).toEqual([5, 25_000_000, 50_000_000, 1920]);
	});
});

describe('checkCount (FR-112 AC-6)', () => {
	it('allows a fifth screenshot and refuses a sixth', () => {
		expect(checkCount(0)).toBeNull();
		expect(checkCount(4)).toBeNull();
		expect(checkCount(5)).toEqual({ kind: 'limit' });
		expect(checkCount(6)).toEqual({ kind: 'limit' });
	});
});

describe('checkFile (FR-112 AC-5)', () => {
	const file = (name: string, type: string, size = 1000) => ({ name, type, size });

	it('accepts any image type, up to the byte limit', () => {
		expect(checkFile(file('a.png', 'image/png'))).toBeNull();
		expect(checkFile(file('a.heic', 'image/heic'))).toBeNull();
		expect(checkFile(file('a.png', 'image/png', SCREENSHOT_BYTES_MAX))).toBeNull();
		expect(checkFile(file('a.png', 'image/png', SCREENSHOT_BYTES_MAX + 1))).toEqual({
			kind: 'too-large'
		});
	});

	it('accepts an image extension with no type, which Chromium gives a HEIC file', () => {
		expect(checkFile(file('IMG_1.HEIC', ''))).toBeNull();
		expect(checkFile(file('shot.webp', ''))).toBeNull();
	});

	it('refuses a file that is not an image, naming it', () => {
		expect(checkFile(file('notes.pdf', 'application/pdf'))).toEqual({
			kind: 'not-image',
			file: 'notes.pdf'
		});
		expect(checkFile(file('notes.txt', ''))).toEqual({ kind: 'not-image', file: 'notes.txt' });
		expect(checkFile(file('png', ''))).toEqual({ kind: 'not-image', file: 'png' });
		// The type wins over the name.
		expect(checkFile(file('fake.png', 'text/plain'))).toEqual({
			kind: 'not-image',
			file: 'fake.png'
		});
	});

	it('checks the type before the size', () => {
		expect(checkFile(file('big.zip', 'application/zip', SCREENSHOT_BYTES_MAX + 1))).toEqual({
			kind: 'not-image',
			file: 'big.zip'
		});
	});
});

describe('checkPixels (FR-112 AC-5)', () => {
	it('allows 50 megapixels and refuses one pixel more', () => {
		expect(checkPixels(10_000, 5_000)).toBeNull();
		expect(checkPixels(5_000_001, 10)).toEqual({ kind: 'too-large' });
		expect(checkPixels(50_000_001, 1)).toEqual({ kind: 'too-large' });
	});
});

describe('scaledSize (FR-112 AC-2, EC-030)', () => {
	it('scales the long edge to 1,920 px and keeps the aspect ratio', () => {
		expect(scaledSize(3840, 2160)).toEqual({ width: 1920, height: 1080 });
		expect(scaledSize(1080, 2400)).toEqual({ width: 864, height: 1920 });
		expect(scaledSize(8000, 6000)).toEqual({ width: 1920, height: 1440 });
	});

	it('leaves an image at or under the limit as it is', () => {
		expect(scaledSize(1920, 1200)).toEqual({ width: 1920, height: 1200 });
		expect(scaledSize(1921, 1)).toEqual({ width: 1920, height: 1 });
		expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
		expect(scaledSize(1, 1)).toEqual({ width: 1, height: 1 });
	});

	it('keeps a very tall capture tall, never under 1 px wide', () => {
		expect(scaledSize(1200, 20_000)).toEqual({ width: 115, height: 1920 });
		expect(scaledSize(1, 50_000)).toEqual({ width: 1, height: 1920 });
	});
});

describe('formatSize', () => {
	it('uses decimal units, one decimal below 10', () => {
		expect(formatSize(0)).toBe('0 bytes');
		expect(formatSize(999)).toBe('999 bytes');
		expect(formatSize(1000)).toBe('1 KB');
		expect(formatSize(250_000_000)).toBe('250 MB');
		expect(formatSize(1_900_000_000)).toBe('1.9 GB');
		expect(formatSize(1_949_000_000)).toBe('1.9 GB');
		expect(formatSize(2_000_000_000)).toBe('2 GB');
		expect(formatSize(25_000_000)).toBe('25 MB');
	});
});

describe('screenshotErrorText (design 13.7)', () => {
	it('gives the copy of each error', () => {
		expect(screenshotErrorText({ kind: 'no-image' })).toBe('The clipboard has no image.');
		expect(screenshotErrorText({ kind: 'not-image', file: 'notes.pdf' })).toBe(
			'notes.pdf is not an image.'
		);
		expect(screenshotErrorText({ kind: 'cannot-decode', file: 'IMG_1.heic' })).toBe(
			'This browser cannot open IMG_1.heic (HEIC).'
		);
		expect(screenshotErrorText({ kind: 'cannot-decode', file: 'pasted' })).toBe(
			'This browser cannot open pasted.'
		);
		expect(screenshotErrorText({ kind: 'too-large' })).toBe(
			'Images up to 25 MB and 50 megapixels.'
		);
		expect(screenshotErrorText({ kind: 'limit' })).toBe('5 of 5 screenshots');
		expect(
			screenshotErrorText({ kind: 'storage', usage: 1_900_000_000, quota: 2_000_000_000 })
		).toBe('Not enough storage to save this screenshot. 1.9 GB of 2 GB used.');
		expect(screenshotErrorText({ kind: 'storage' })).toBe(
			'Not enough storage to save this screenshot.'
		);
	});
});

describe('attachmentName (FR-122 AC-1)', () => {
	const runId = '1A2B3C4D-5e6f-4789-8abc-def012345678';

	it('is <case key>-<run id short>-<n>.<ext>', () => {
		expect(attachmentName(12, runId, 1, 'image/webp')).toBe('TC-12-1a2b3c4d-1.webp');
		expect(attachmentName(12, runId, 5, 'image/jpeg')).toBe('TC-12-1a2b3c4d-5.jpg');
	});

	it('skips the dashes of a short run id', () => {
		expect(attachmentName(3, 'run-1', 2, 'image/webp')).toBe('TC-3-run1-2.webp');
	});
});

describe('findingAttachmentName (FR-131 AC-1, FR-122 AC-1)', () => {
	it('is finding-<finding id short>-<n>.<ext>', () => {
		expect(findingAttachmentName('9F8E7D6C-5b4a-4321-8abc-def012345678', 2, 'image/webp')).toBe(
			'finding-9f8e7d6c-2.webp'
		);
		expect(findingAttachmentName('f-1', 1, 'image/jpeg')).toBe('finding-f1-1.jpg');
	});
});
