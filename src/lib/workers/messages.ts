import type { AddressRow, GenerateOptions } from '#lib/core/chains/catalog.ts';
import type { DummyRow } from '#lib/core/dummy/rows.ts';
import type { Settings } from '#lib/core/dummy/settings.ts';

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
