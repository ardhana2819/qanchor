import { compressImage, type ImagePlatform } from './image-pipeline.ts';
import type { ImageJobRequest, ImageJobResponse } from './messages.ts';

// Screenshot compression off the main thread (FR-112 AC-2, NFR-023, ADR-004). It never touches
// storage or the network.

const platform: ImagePlatform<ImageBitmap> = {
	decode: (file) => createImageBitmap(file),
	resize: (source, resizeWidth, resizeHeight) =>
		createImageBitmap(source, { resizeWidth, resizeHeight, resizeQuality: 'high' }),
	async encode(source, type, quality, background) {
		const canvas = new OffscreenCanvas(source.width, source.height);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('This browser gives no 2D canvas in a worker.');
		if (background) {
			context.fillStyle = background;
			context.fillRect(0, 0, source.width, source.height);
		}
		context.drawImage(source, 0, 0);
		return canvas.convertToBlob({ type, quality });
	}
};

async function handle({ id, name, file }: ImageJobRequest): Promise<void> {
	let response: ImageJobResponse;
	let transfer: Transferable[] = [];
	try {
		const result = await compressImage(file, name, platform);
		if (result.ok) {
			response = { type: 'done', id, image: result.value };
			transfer = [result.value.bytes];
		} else {
			response = { type: 'refused', id, error: result.error };
		}
	} catch (error) {
		response = {
			type: 'error',
			id,
			message: error instanceof Error ? error.message : String(error)
		};
	}
	self.postMessage(response, { transfer });
}

// One image at a time: a few 50-megapixel images decoded at once could run out of memory.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<ImageJobRequest>) => {
	queue = queue.then(() => handle(event.data));
};
