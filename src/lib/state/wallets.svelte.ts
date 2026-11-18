import { err, ok, type Result } from '#lib/core/result.ts';
import type { StorageErrorCode } from '#lib/storage/db.ts';
import type { Wallet } from '#lib/storage/schema.ts';
import { storage } from './storage.svelte.ts';

/** What the form supplies; id and timestamps are set here. */
export type WalletInput = Pick<Wallet, 'label' | 'chain' | 'networkId' | 'address' | 'notes'>;

/**
 * The testnet wallet entries (FR-070), read from IndexedDB once per visit and kept in step with
 * every write.
 * - loading: not read yet ("Loading wallets…", FR-003 AC-5).
 * - ready: `list` is what is stored.
 * - unavailable: storage cannot be opened or read; nothing can be listed or saved (EC-001).
 */
class Wallets {
	status: 'loading' | 'ready' | 'unavailable' = $state('loading');
	// Raw: records go to IndexedDB, which cannot clone a Svelte proxy, and are replaced as a whole.
	list: readonly Wallet[] = $state.raw([]);

	/** Reads the stored entries, oldest first. Browser only; call from onMount. */
	async load(): Promise<void> {
		const db = await storage.connect();
		const read = db ? await db.readAll('wallets') : null;
		if (!read?.ok) {
			this.status = 'unavailable';
			return;
		}
		this.list = [...read.value].sort((a, b) => a.createdAt - b.createdAt);
		this.status = 'ready';
	}

	/** Adds an entry, or replaces the one with `id`, keeping its creation time. */
	async save(input: WalletInput, id?: string): Promise<Result<Wallet, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const now = Date.now();
		const existing = id === undefined ? undefined : this.list.find((w) => w.id === id);
		const record: Wallet = {
			...input,
			id: existing?.id ?? crypto.randomUUID(),
			createdAt: existing?.createdAt ?? now,
			updatedAt: now
		};
		const written = await db.putAll('wallets', [record]);
		if (!written.ok) return written;
		this.list = existing
			? this.list.map((w) => (w.id === record.id ? record : w))
			: [...this.list, record];
		return ok(record);
	}

	async remove(id: string): Promise<Result<void, StorageErrorCode>> {
		const db = await storage.connect();
		if (!db) return err('unavailable');
		const deleted = await db.deleteOne('wallets', id);
		if (!deleted.ok) return deleted;
		this.list = this.list.filter((w) => w.id !== id);
		return ok(undefined);
	}
}

export const wallets = new Wallets();
