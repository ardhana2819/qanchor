import type { Storage } from '#lib/storage/db.ts';

/**
 * - checking: not opened yet (also the prerendered state, so no banner flashes before the check).
 * - ready: reads and writes work.
 * - unavailable: IndexedDB is missing or blocked; tools still work, nothing is saved (EC-001).
 * - outdated: another tab upgraded the schema, or the browser closed the database; a reload
 *   reconnects (EC-003).
 */
export type StorageStatus = 'checking' | 'ready' | 'unavailable' | 'outdated';

class StorageState {
	status: StorageStatus = $state('checking');
	#connection: Promise<Storage | null> | undefined;

	/**
	 * Opens the database once per page load. The storage code (and idb) is imported here, on
	 * demand, so it stays out of the initial bundle (NFR-001). Browser only: call from onMount.
	 */
	connect(): Promise<Storage | null> {
		this.#connection ??= this.#open();
		return this.#connection;
	}

	async #open(): Promise<Storage | null> {
		const { openStorage } = await import('#lib/storage/db.ts');
		const result = await openStorage({ onClosed: () => (this.status = 'outdated') });
		this.status = result.ok ? 'ready' : 'unavailable';
		return result.ok ? result.value : null;
	}
}

export const storage = new StorageState();
