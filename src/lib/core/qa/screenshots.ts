import { formatKey } from './keys.ts';

// Screenshot rules shared by the image worker, storage, and the screenshot area (FR-112, FR-122,
// PRD 10.5, design 13.7). Sizes are decimal (1 MB = 1,000,000 bytes), as file managers show them.

export const SCREENSHOTS_MAX = 5;
export const SCREENSHOT_BYTES_MAX = 25_000_000;
export const SCREENSHOT_PIXELS_MAX = 50_000_000;
/** Output long edge (FR-112 AC-2). */
export const SCREENSHOT_EDGE_MAX = 1920;
export const SCREENSHOT_QUALITY = 0.8;

/** What a stored screenshot can be: WebP, or JPEG where the browser cannot encode WebP (T-057). */
export type ScreenshotType = 'image/webp' | 'image/jpeg';

const EXTENSIONS: Record<ScreenshotType, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' };

/** Extensions of image files a browser may hand over with an empty type (HEIC in Chromium). */
const IMAGE_EXTENSIONS = new Set([
	'avif',
	'bmp',
	'gif',
	'heic',
	'heif',
	'jpeg',
	'jpg',
	'png',
	'webp'
]);

export type ScreenshotError =
	| { kind: 'no-image' }
	| { kind: 'not-image'; file: string }
	| { kind: 'cannot-decode'; file: string }
	| { kind: 'too-large' }
	| { kind: 'limit' }
	/** Byte counts from `navigator.storage.estimate()`, when the browser gives them. */
	| { kind: 'storage'; usage?: number; quota?: number };

function extension(file: string): string {
	const dot = file.lastIndexOf('.');
	return dot > 0 ? file.slice(dot + 1).toLowerCase() : '';
}

/** Refuses a new screenshot when the result already has the most it may (FR-112 AC-6). */
export function checkCount(count: number): ScreenshotError | null {
	return count >= SCREENSHOTS_MAX ? { kind: 'limit' } : null;
}

/** The checks that need no decoding: an image type, and the byte limit (FR-112 AC-5). */
export function checkFile(file: {
	name: string;
	type: string;
	size: number;
}): ScreenshotError | null {
	const image =
		file.type.startsWith('image/') ||
		(file.type === '' && IMAGE_EXTENSIONS.has(extension(file.name)));
	if (!image) return { kind: 'not-image', file: file.name };
	return file.size > SCREENSHOT_BYTES_MAX ? { kind: 'too-large' } : null;
}

/** The pixel limit, checked once the image's size is known (FR-112 AC-5). */
export function checkPixels(width: number, height: number): ScreenshotError | null {
	return width * height > SCREENSHOT_PIXELS_MAX ? { kind: 'too-large' } : null;
}

/**
 * The output size: the long edge at most 1,920 px, the aspect ratio kept, never enlarged, and
 * neither side under 1 px (a very tall capture keeps its shape, EC-030).
 */
export function scaledSize(width: number, height: number): { width: number; height: number } {
	const scale = Math.min(1, SCREENSHOT_EDGE_MAX / Math.max(width, height));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale))
	};
}

/** "1.9 GB", "250 MB", "2 GB": one decimal below 10, none from 10 up. */
export function formatSize(bytes: number): string {
	const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit += 1;
	}
	const digits = unit > 0 && value < 10 ? 1 : 0;
	return `${Number(value.toFixed(digits)).toLocaleString('en')} ${units[unit]}`;
}

/** The message for each error (design 13.7); the storage one is followed by a link to Settings. */
export function screenshotErrorText(error: ScreenshotError): string {
	switch (error.kind) {
		case 'no-image':
			return 'The clipboard has no image.';
		case 'not-image':
			return `${error.file} is not an image.`;
		case 'cannot-decode': {
			const format = extension(error.file).toUpperCase();
			return `This browser cannot open ${error.file}${format ? ` (${format})` : ''}.`;
		}
		case 'too-large':
			return `Images up to ${formatSize(SCREENSHOT_BYTES_MAX)} and ${SCREENSHOT_PIXELS_MAX / 1e6} megapixels.`;
		case 'limit':
			return `${SCREENSHOTS_MAX} of ${SCREENSHOTS_MAX} screenshots`;
		case 'storage': {
			const { usage, quota } = error;
			const used =
				usage !== undefined && quota !== undefined
					? ` ${formatSize(usage)} of ${formatSize(quota)} used.`
					: '';
			return `Not enough storage to save this screenshot.${used}`;
		}
	}
}

/**
 * The download name of the n-th screenshot (1-based) of a case in a run (FR-122 AC-1):
 * `TC-12-1a2b3c4d-1.webp`, with the run id cut to its first 8 letters and digits.
 */
export function attachmentName(
	caseNumber: number,
	runId: string,
	n: number,
	type: ScreenshotType
): string {
	const short = runId
		.replace(/[^0-9a-z]/gi, '')
		.slice(0, 8)
		.toLowerCase();
	return `${formatKey(caseNumber)}-${short}-${n}.${EXTENSIONS[type]}`;
}
