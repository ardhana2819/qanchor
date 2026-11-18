import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import type { Faucet } from '#lib/storage/schema.ts';
import { storage } from './storage.svelte.ts';

/** What the form supplies; the id is set here. */
export type FaucetInput = Pick<Faucet, 'networkId' | 'label' | 'url'>;

/**
 * The user-added faucet links (FR-072), read from IndexedDB once per visit. A link belongs to a
 * network, so every wallet entry on that network lists it.
 * - loading: not read yet; only the built-in links are shown.
 * - ready: `list` is what is stored.
 * - unavailable: storage cannot be opened or read; links can be neither listed nor added.
 */
class Faucets {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	list: readonly Faucet[] = $state.raw([]);

	/** Reads the stored links. Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const read = db ? await db.readAll('faucets') : null;
		if (!read?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = read.value;
		this.status = 'ready';
	}

	/**
	 * The user's links for a network, by label then address. Records have no creation time and
	 * IndexedDB returns them by id, so this is the order that stays the same after a reload.
	 */
	forNetwork(networkId: string): Faucet[] {
		return this.list
			.filter((f) => f.networkId === networkId)
			.sort((a, b) => a.label.localeCompare(b.label) || a.url.localeCompare(b.url));
	}

	async add(input: FaucetInput): Promise<Result<Faucet, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const record: Faucet = { ...input, id: crypto.randomUUID() };
		const written = await db.putAll('faucets', [record]);
		if (!written.ok) return written;
		this.list = [...this.list, record];
		return ok(record);
	}

	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('faucets', id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((f) => f.id !== id);
		return ok(undefined);
	}
}

export const faucets = new Faucets();
