<script lang="ts">
	import { onDestroy } from 'svelte';
	import { formatSize } from '#lib/core/qa/screenshots.ts';
	import { backupFileName, describeImportError, type BackupFile } from '#lib/storage/backup.ts';
	import type { BackupStoreName, StoredRecords } from '#lib/storage/schema.ts';
	import type { StorageErrorCode } from '#lib/storage/db.ts';
	import { endpointOverrides } from '#lib/state/endpoints.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { storage } from '#lib/state/storage.svelte.ts';
	import { theme } from '#lib/state/theme.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { downloadBlob } from '#lib/ui/download.ts';
	import { createBackupJobs } from '#lib/workers/backup-jobs.ts';

	// Back up and restore (J-6, FR-003, FR-091). The confirmation compares what is stored now with what the
	// import leaves (owner's choice after the prototype, 2026-11-13).

	type Outcome = { kind: 'success' | 'danger'; title: string; message: string };
	interface Pending {
		fileName: string;
		backup: BackupFile;
		now: Record<BackupStoreName, number>;
	}
	/** A built export with screenshots, waiting for Download (FR-091 AC-4). */
	interface Ready {
		name: string;
		file: Blob;
		screenshots: number;
	}

	const WRITE_ERRORS: Record<StorageErrorCode, string> = {
		quota: 'Storage is full. Free up space in this browser, then try again.',
		unavailable: 'Storage is unavailable in this browser session.',
		closed: 'QAnchor was updated in another tab. Reload this tab, then try again.',
		failed: 'The data could not be written.'
	};

	let busy: 'preparing' | 'reading' | 'writing' | null = $state(null);
	let outcome: Outcome | null = $state(null);
	// Raw, not deeply reactive: the records go to IndexedDB, which cannot clone a Svelte proxy
	// (DataCloneError). They are only replaced as a whole, never edited.
	let pending: Pending | null = $state.raw(null);
	let dialogOpen = $state(false);
	let ready: Ready | null = $state.raw(null);
	let downloadOpen = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let outcomeBox: HTMLDivElement | undefined = $state();

	const available = $derived(storage.status === 'ready');
	// Building and reading files run in a worker, created on the first export or import (F-9).
	const jobs = createBackupJobs();
	onDestroy(() => jobs.dispose());

	async function show(next: Outcome): Promise<void> {
		outcome = next;
		if (next.kind === 'danger') {
			// Errors take focus so keyboard and screen-reader users land on the reason (NFR-008).
			await Promise.resolve();
			outcomeBox?.querySelector<HTMLElement>('[role="alert"]')?.focus();
		}
	}

	async function exportBackup(): Promise<void> {
		outcome = null;
		busy = 'preparing';
		try {
			const db = await storage.connect();
			const records = db ? await db.readRecords() : null;
			if (!records?.ok) {
				await show({
					kind: 'danger',
					title: 'Export failed',
					message: 'The stored data could not be read.'
				});
				return;
			}
			const now = new Date();
			const screenshots = records.value.screenshots.length;
			const file = await jobs.build(
				{ settings: { theme: theme.preference }, ...records.value },
				now
			);
			const next = { name: backupFileName(now), file, screenshots };
			// With screenshots the file can be large, so its size is shown before it downloads.
			if (screenshots === 0) save(next);
			else {
				ready = next;
				downloadOpen = true;
			}
		} catch {
			await show({
				kind: 'danger',
				title: 'Export failed',
				message: 'The backup file could not be built in this browser.'
			});
		} finally {
			busy = null;
		}
	}

	function save({ name, file }: Ready): void {
		downloadBlob(name, file);
		notify.showToast(`Exported ${name}`);
	}

	function closeDownload(confirmed: boolean): void {
		if (!downloadOpen) return;
		downloadOpen = false;
		if (confirmed && ready) save(ready);
		ready = null;
	}

	async function readFile(file: File): Promise<void> {
		outcome = null;
		busy = 'reading';
		try {
			const parsed = await jobs.read(file);
			if (!parsed.ok) {
				await show({
					kind: 'danger',
					title: 'Import failed. Nothing was changed.',
					message: `${file.name}: ${describeImportError(parsed.error)}`
				});
				return;
			}
			const db = await storage.connect();
			const now = db ? await db.countRecords() : null;
			if (!now?.ok) {
				await show({
					kind: 'danger',
					title: 'Import failed. Nothing was changed.',
					message: 'The stored data could not be read.'
				});
				return;
			}
			pending = { fileName: file.name, backup: parsed.value, now: now.value };
			dialogOpen = true;
		} catch {
			await show({
				kind: 'danger',
				title: 'Import failed. Nothing was changed.',
				message: `${file.name}: The file could not be read in this browser.`
			});
		} finally {
			busy = null;
		}
	}

	function onFileChosen(event: Event & { currentTarget: HTMLInputElement }): void {
		const file = event.currentTarget.files?.[0];
		// Cleared so choosing the same file again still fires a change.
		event.currentTarget.value = '';
		if (file) void readFile(file);
	}

	function closeDialog(cancelled: boolean): void {
		if (!dialogOpen) return;
		dialogOpen = false;
		if (cancelled) {
			pending = null;
			notify.showToast('Import cancelled. Nothing was changed.');
		}
	}

	async function confirmImport(): Promise<void> {
		const job = pending;
		if (!job) return;
		closeDialog(false);
		pending = null;
		busy = 'writing';
		const db = await storage.connect();
		const { settings, ...records } = job.backup.data;
		const written = db ? await db.replaceRecords(records) : null;
		busy = null;
		if (!written?.ok) {
			await show({
				kind: 'danger',
				title: 'Import failed. Nothing was changed.',
				message: WRITE_ERRORS[written?.error ?? 'unavailable']
			});
			return;
		}
		// The theme is written only after the records are committed (architecture 3.2).
		theme.set(settings.theme);
		// The Endpoints section above shows the imported overrides at once.
		await endpointOverrides.load();
		await show({ kind: 'success', title: 'Import complete', message: summary(records) });
		notify.showToast('Import complete');
	}

	function count(n: number, one: string, many: string): string {
		return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
	}

	const ROWS: { label: string; key: BackupStoreName; one: string; many: string }[] = [
		{ label: 'Wallets', key: 'wallets', one: 'wallet', many: 'wallets' },
		{
			label: 'Endpoint overrides',
			key: 'endpoints',
			one: 'endpoint override',
			many: 'endpoint overrides'
		},
		{ label: 'Faucet links', key: 'faucets', one: 'faucet link', many: 'faucet links' },
		{ label: 'Test cases', key: 'testCases', one: 'test case', many: 'test cases' },
		{ label: 'Test runs', key: 'runs', one: 'test run', many: 'test runs' },
		{ label: 'Results', key: 'results', one: 'result', many: 'results' },
		{ label: 'Sessions', key: 'sessions', one: 'session', many: 'sessions' },
		{ label: 'Findings', key: 'findings', one: 'finding', many: 'findings' },
		{ label: 'Screenshots', key: 'screenshots', one: 'screenshot', many: 'screenshots' }
	];

	function summary(records: StoredRecords): string {
		const parts = ROWS.map((row) => count(records[row.key].length, row.one, row.many));
		return `Imported ${parts.join(', ')}, and the theme setting.`;
	}

	function exportedAt(iso: string): string {
		return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<section class="section" aria-labelledby="data">
	<h2 id="data">Data</h2>
	<p class="intro">
		Everything QAnchor saves stays in this browser. Export it to keep a backup or to move to another
		browser; importing a backup replaces what is stored here.
	</p>

	<div class="actions">
		<Button
			disabled={!available || busy !== null}
			onclick={exportBackup}
			data-testid="settings-export"
		>
			Export backup
		</Button>
		<Button
			disabled={!available || busy !== null}
			onclick={() => fileInput?.click()}
			data-testid="settings-import"
		>
			Import backup…
		</Button>
		<input
			bind:this={fileInput}
			class="visually-hidden"
			type="file"
			accept="application/json,.json"
			aria-label="Backup file to import"
			tabindex="-1"
			data-testid="settings-import-file"
			onchange={onFileChosen}
		/>
	</div>

	{#if storage.status === 'checking'}
		<p class="status" data-testid="settings-status">Checking storage…</p>
	{:else if !available}
		<p class="status" data-testid="settings-status">
			Export and import need storage, which is unavailable in this tab.
		</p>
	{:else if busy === 'preparing'}
		<p class="status" data-testid="settings-status">Preparing backup…</p>
	{:else if busy === 'reading'}
		<p class="status" data-testid="settings-status">Reading file…</p>
	{:else if busy === 'writing'}
		<p class="status" data-testid="settings-status">Importing…</p>
	{/if}

	<div class="outcome" bind:this={outcomeBox} data-testid="settings-outcome">
		{#if outcome}
			<Callout
				variant={outcome.kind === 'danger' ? 'danger' : 'info'}
				title={outcome.title}
				role={outcome.kind === 'danger' ? 'alert' : undefined}
			>
				<p>{outcome.message}</p>
			</Callout>
		{/if}
	</div>
</section>

<Dialog
	bind:open={() => dialogOpen, (next) => (next ? undefined : closeDialog(true))}
	title="Replace all data?"
	destructive
>
	{#if pending}
		<p>
			From <span class="file-name">{pending.fileName}</span>, exported {exportedAt(
				pending.backup.exportedAt
			)}.
		</p>
		<table class="counts" data-testid="settings-import-counts">
			<caption class="visually-hidden">Stored now and after the import</caption>
			<thead>
				<tr>
					<th scope="col">Type</th>
					<th scope="col" class="num">Stored now</th>
					<th scope="col" class="num">After import</th>
				</tr>
			</thead>
			<tbody>
				{#each ROWS as row (row.key)}
					{@const before = pending.now[row.key]}
					{@const after = pending.backup.data[row.key].length}
					<tr>
						<th scope="row">{row.label}</th>
						<td class="num">{before.toLocaleString('en-US')}</td>
						<td class="num" class:loss={after < before}>{after.toLocaleString('en-US')}</td>
					</tr>
				{/each}
				<tr>
					<th scope="row">Theme</th>
					<td class="num">{theme.preference}</td>
					<td class="num">{pending.backup.data.settings.theme}</td>
				</tr>
			</tbody>
		</table>
		<p class="warning">Importing replaces all existing data. This cannot be undone.</p>
	{/if}
	{#snippet actions()}
		<Button onclick={() => closeDialog(true)}>Cancel</Button>
		<Button variant="danger" onclick={confirmImport} data-testid="settings-confirm-import">
			Replace all data
		</Button>
	{/snippet}
</Dialog>

<Dialog
	bind:open={() => downloadOpen, (next) => (next ? undefined : closeDownload(false))}
	title="Download backup?"
>
	{#if ready}
		<p data-testid="settings-export-size">
			<span class="file-name">{ready.name}</span>, {formatSize(ready.file.size)}, with {count(
				ready.screenshots,
				'screenshot',
				'screenshots'
			)}.
		</p>
	{/if}
	{#snippet actions()}
		<Button onclick={() => closeDownload(false)}>Cancel</Button>
		<Button variant="primary" onclick={() => closeDownload(true)} data-testid="settings-download">
			Download
		</Button>
	{/snippet}
</Dialog>

<style>
	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.intro,
	.status {
		max-width: 64ch;
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.status {
		margin-top: var(--space-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	.outcome:not(:empty) {
		margin-top: var(--space-4);
	}

	.file-name {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}

	.counts {
		width: 100%;
		margin-top: var(--space-4);
		border-collapse: collapse;
	}

	.counts th,
	.counts td {
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
		text-align: left;
	}

	.counts thead th {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.counts tbody th {
		color: var(--color-text);
		font-weight: 400;
	}

	.counts .num {
		padding-left: var(--space-4);
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	/* What the import removes, so the loss is visible before confirming. */
	.counts .loss {
		color: var(--color-danger);
		font-weight: 600;
	}

	.warning {
		margin-top: var(--space-4) !important;
		color: var(--color-danger);
		font-weight: 500;
	}
</style>
