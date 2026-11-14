import type { AddressRow, GenerateOptions } from '#lib/core/chains/catalog.ts';

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
