import { generateRows } from '#lib/core/chains/rows.ts';
import type { AddressJobRequest, AddressJobResponse } from './messages.ts';

// Address generation off the main thread (NFR-005, ADR-004). Runs lib/core only; it never
// touches storage or the network.

self.onmessage = (event: MessageEvent<AddressJobRequest>) => {
	const { id, payload } = event.data;
	let response: AddressJobResponse;
	try {
		response = { type: 'done', id, rows: generateRows(payload) };
	} catch (error) {
		response = {
			type: 'error',
			id,
			message: error instanceof Error ? error.message : String(error)
		};
	}
	self.postMessage(response);
};
