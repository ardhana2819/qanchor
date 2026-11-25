import { describe, expect, it } from 'vitest';
import { SCREENSHOT_BYTES_MAX } from '#lib/core/qa/screenshots.ts';
import { compressImage, type ImagePlatform, type ImageSource } from './image-pipeline.ts';

interface FakeSource extends ImageSource {
	label: string;
	closed: boolean;
}

const source = (label: string, width: number, height: number): FakeSource => ({
	label,
	width,
	height,
	closed: false,
	close() {
		this.closed = true;
	}
});

/** A platform that records each call; `webp` is false for a browser that returns PNG (WebKit). */
function fakePlatform(size: { width: number; height: number }, options = { webp: true }) {
	const calls: string[] = [];
	const made: FakeSource[] = [];
	const platform: ImagePlatform<FakeSource> = {
		async decode() {
			calls.push('decode');
			const decoded = source('decoded', size.width, size.height);
			made.push(decoded);
			return decoded;
		},
		async resize(from, width, height) {
			calls.push(`resize ${from.label} ${width}x${height}`);
			const scaled = source('scaled', width, height);
			made.push(scaled);
			return scaled;
		},
		async encode(from, type, quality, background) {
			calls.push(`encode ${from.label} ${type} ${quality} ${background ?? 'none'}`);
			const out = type === 'image/webp' && !options.webp ? 'image/png' : type;
			return new Blob([new Uint8Array([1, 2, 3])], { type: out });
		}
	};
	return { platform, calls, made };
}

const png = (size = 1000) => new Blob([new Uint8Array(size)], { type: 'image/png' });

describe('compressImage (FR-112 AC-2)', () => {
	it('scales the long edge to 1,920 px and encodes WebP at 0.8 over no fill', async () => {
		const { platform, calls, made } = fakePlatform({ width: 4000, height: 3000 });
		const result = await compressImage(png(), 'shot.png', platform);

		expect(result).toEqual({
			ok: true,
			value: {
				bytes: new Uint8Array([1, 2, 3]).buffer,
				type: 'image/webp',
				width: 1920,
				height: 1440,
				firstFrameOnly: false
			}
		});
		expect(calls).toEqual([
			'decode',
			'resize decoded 1920x1440',
			'encode scaled image/webp 0.8 none'
		]);
		expect(made.every((item) => item.closed)).toBe(true);
	});

	it('does not resize an image already within the limit', async () => {
		const { platform, calls } = fakePlatform({ width: 1920, height: 1080 });
		const result = await compressImage(png(), 'shot.png', platform);

		expect(result.ok && [result.value.width, result.value.height]).toEqual([1920, 1080]);
		expect(calls).toEqual(['decode', 'encode decoded image/webp 0.8 none']);
	});

	it('falls back to JPEG on white where the browser does not encode WebP (T-057, EC-030)', async () => {
		const { platform, calls } = fakePlatform({ width: 800, height: 600 }, { webp: false });
		const result = await compressImage(png(), 'shot.png', platform);

		expect(result.ok && result.value.type).toBe('image/jpeg');
		expect(calls).toEqual([
			'decode',
			'encode decoded image/webp 0.8 none',
			'encode decoded image/jpeg 0.8 #ffffff'
		]);
	});

	it('marks a GIF as first frame only, by type or by name (EC-030)', async () => {
		const { platform } = fakePlatform({ width: 10, height: 10 });
		const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
		const untyped = new Blob([new Uint8Array(10)]);
		const first = await compressImage(gif, 'loop.gif', platform);
		const second = await compressImage(untyped, 'LOOP.GIF', platform);

		expect(first.ok && first.value.firstFrameOnly).toBe(true);
		expect(second.ok && second.value.firstFrameOnly).toBe(true);
	});
});

describe('compressImage refusals (FR-112 AC-5)', () => {
	it('refuses a file that is not an image before decoding it', async () => {
		const { platform, calls } = fakePlatform({ width: 10, height: 10 });
		const text = new Blob(['hello'], { type: 'text/plain' });

		expect(await compressImage(text, 'notes.txt', platform)).toEqual({
			ok: false,
			error: { kind: 'not-image', file: 'notes.txt' }
		});
		expect(calls).toEqual([]);
	});

	it('refuses a file over 25 MB before decoding it', async () => {
		const { platform, calls } = fakePlatform({ width: 10, height: 10 });

		expect(await compressImage(png(SCREENSHOT_BYTES_MAX + 1), 'big.png', platform)).toEqual({
			ok: false,
			error: { kind: 'too-large' }
		});
		expect(calls).toEqual([]);
	});

	it('names the file the browser cannot decode', async () => {
		const { platform } = fakePlatform({ width: 10, height: 10 });
		platform.decode = async () => {
			throw new DOMException('The source image could not be decoded.', 'InvalidStateError');
		};

		expect(await compressImage(new Blob([]), 'IMG_1.HEIC', platform)).toEqual({
			ok: false,
			error: { kind: 'cannot-decode', file: 'IMG_1.HEIC' }
		});
	});

	it('refuses an image over 50 megapixels after decoding, and frees it', async () => {
		const { platform, calls, made } = fakePlatform({ width: 7072, height: 7072 });

		expect(await compressImage(png(), 'huge.png', platform)).toEqual({
			ok: false,
			error: { kind: 'too-large' }
		});
		expect(calls).toEqual(['decode']);
		expect(made[0].closed).toBe(true);
	});

	it('throws when the browser encodes neither WebP nor JPEG, and frees the image', async () => {
		const { platform, made } = fakePlatform({ width: 10, height: 10 });
		platform.encode = async () => new Blob([], { type: 'image/png' });

		await expect(compressImage(png(), 'shot.png', platform)).rejects.toThrow(
			'The browser encoded image/png, not WebP or JPEG.'
		);
		expect(made[0].closed).toBe(true);
	});

	it('lets an unexpected failure through, freeing both images', async () => {
		const { platform, made } = fakePlatform({ width: 4000, height: 3000 });
		platform.encode = async () => {
			throw new Error('Out of memory');
		};

		await expect(compressImage(png(), 'shot.png', platform)).rejects.toThrow('Out of memory');
		expect(made.map((item) => item.closed)).toEqual([true, true]);
	});
});
