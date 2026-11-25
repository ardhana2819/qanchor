import type { AddressRow, GenerateOptions } from '#lib/core/chains/catalog.ts';
import type { DummyRow } from '#lib/core/dummy/rows.ts';
import type { Settings } from '#lib/core/dummy/settings.ts';
import type { ScreenshotError, ScreenshotType } from '#lib/core/qa/screenshots.ts';

// Typed message protocol for the workers (ADR-004). Messages carry addresses only: key material
// never leaves the worker (NFR-012).

export interface AddressJobRequest {
	type: 'generate';
	/** Matches a response to its request; a newer job makes older answers stale. */
	id: number;
	payload: GenerateOptions;
}

export type AddressJobResponse =
	{ type: 'done'; id: number; rows: AddressRow[] } | { type: 'error'; id: number; message: string };

export interface DummyJobRequest {
	type: 'generate';
	id: number;
	payload: { settings: Settings; seed: string };
}

export type DummyJobResponse =
	| { type: 'progress'; id: number; done: number; total: number }
	| { type: 'done'; id: number; rows: DummyRow[] }
	| { type: 'error'; id: number; message: string };

export interface ImageJobRequest {
	type: 'compress';
	id: number;
	/** A pasted image has no name; the page passes the one its messages use. */
	name: string;
	file: Blob;
}

/** A compressed screenshot (FR-112 AC-2). `bytes` is transferred, not copied. */
export interface CompressedImage {
	bytes: ArrayBuffer;
	type: ScreenshotType;
	width: number;
	height: number;
	/** A GIF keeps only its first frame, which the thumbnail states (EC-030). */
	firstFrameOnly: boolean;
}

export type ImageJobResponse =
	| { type: 'done'; id: number; image: CompressedImage }
	/** An expected failure: the page shows its message (design 13.7). */
	| { type: 'refused'; id: number; error: ScreenshotError }
	| { type: 'error'; id: number; message: string };
