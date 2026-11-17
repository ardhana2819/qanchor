import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import type { EndpointOverride } from '#lib/storage/schema.ts';
import { storage } from './storage.svelte.ts';

/**
 * The user's endpoint overrides (FR-041), read from IndexedDB once and kept in step with every
 * write, so Settings, an import, and tx lookup see the same list.
 * - loading: not read yet.
 * - ready: `list` is what is stored.
 * - unavailable: storage cannot be opened or read; defaults are used and nothing can be saved.
 */
class EndpointOverrides {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	list: readonly EndpointOverride[] = $state.raw([]);

	/** Reads the stored overrides. Browser only; call again after an import replaces them. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const read = db ? await db.readAll('endpoints') : null;
		if (!read?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = read.value;
		this.status = 'ready';
	}

	/** Saves an already validated URL for the network (FR-041 AC-3). */
	async save(networkId: string, url: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const record: EndpointOverride = { networkId, url };
		const written = await db.putAll('endpoints', [record]);
		if (!written.ok) return written;
		this.list = [...this.list.filter((o) => o.networkId !== networkId), record];
		return ok(undefined);
	}

	/** Removes the network's override, so the default applies again ("Reset to default"). */
	async reset(networkId: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('endpoints', networkId);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((o) => o.networkId !== networkId);
		return ok(undefined);
	}
}

export const endpointOverrides = new EndpointOverrides();
