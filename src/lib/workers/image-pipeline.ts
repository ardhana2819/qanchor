import { err, ok, type Result } from '#lib/core/result.ts';
import {
	checkFile,
	checkPixels,
	scaledSize,
	SCREENSHOT_QUALITY,
	type ScreenshotError,
	type ScreenshotType
} from '#lib/core/qa/screenshots.ts';
import type { CompressedImage } from './messages.ts';

// The screenshot pipeline (FR-112 AC-2, AC-5, EC-030): check the file, decode, check the pixel
// count, scale the long edge to 1,920 px, encode WebP, and JPEG on white where the browser does
// not encode WebP. The browser calls come in as a platform, so the order of steps is unit-tested
// in Node; image.worker.ts gives the real one.

export interface ImageSource {
	width: number;
	height: number;
	close(): void;
}

export interface ImagePlatform<S extends ImageSource> {
	/** Rejects when the browser cannot decode the file (HEIC outside Safari, T-057). */
	decode(file: Blob): Promise<S>;
	resize(source: S, width: number, height: number): Promise<S>;
	/** Draws the source at its size, over `background` when given, and encodes it. */
	encode(
		source: S,
		type: ScreenshotType,
		quality: number,
		background: string | null
	): Promise<Blob>;
}

/** JPEG has no transparency: without a fill, transparent pixels turn black (T-057). */
const JPEG_BACKGROUND = '#ffffff';

const isGif = (file: Blob, name: string) =>
	file.type === 'image/gif' || (file.type === '' && /\.gif$/i.test(name));

/**
 * Compresses one image. A refused file is a value; anything unexpected (no canvas, the browser
 * running out of memory) is thrown, and the worker reports it as an error.
 */
export async function compressImage<S extends ImageSource>(
	file: Blob,
	name: string,
	platform: ImagePlatform<S>
): Promise<Result<CompressedImage, ScreenshotError>> {
	const refused = checkFile({ name, type: file.type, size: file.size });
	if (refused) return err(refused);

	let source: S;
	try {
		source = await platform.decode(file);
	} catch {
		return err({ kind: 'cannot-decode', file: name });
	}
	try {
		const tooLarge = checkPixels(source.width, source.height);
		if (tooLarge) return err(tooLarge);

		const size = scaledSize(source.width, source.height);
		if (size.width !== source.width || size.height !== source.height) {
			const scaled = await platform.resize(source, size.width, size.height);
			source.close();
			source = scaled;
		}

		// WebKit returns PNG when asked for WebP instead of failing (T-057), so the type is checked.
		let blob = await platform.encode(source, 'image/webp', SCREENSHOT_QUALITY, null);
		if (blob.type !== 'image/webp') {
			blob = await platform.encode(source, 'image/jpeg', SCREENSHOT_QUALITY, JPEG_BACKGROUND);
		}
		if (blob.type !== 'image/jpeg' && blob.type !== 'image/webp') {
			throw new Error(`The browser encoded ${blob.type || 'an unknown type'}, not WebP or JPEG.`);
		}
		return ok({
			bytes: await blob.arrayBuffer(),
			type: blob.type,
			width: source.width,
			height: source.height,
			firstFrameOnly: isGif(file, name)
		});
	} finally {
		source.close();
	}
}
