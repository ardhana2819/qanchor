<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { networkById } from '#lib/config/networks.ts';
	import { CHAIN_NAMES } from '#lib/core/chains/catalog.ts';
	import { balances } from '#lib/state/balances.svelte.ts';
	import { faucets } from '#lib/state/faucets.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { wallets } from '#lib/state/wallets.svelte.ts';
	import type { Wallet } from '#lib/storage/schema.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import { amount } from '#lib/tools/tx/present.ts';
	import { balanceErrorText, clockTime, networkName, WRITE_ERRORS } from './present.ts';
	import FaucetDialog from './FaucetDialog.svelte';
	import FaucetLinks from './FaucetLinks.svelte';
	import WalletDialog from './WalletDialog.svelte';

	// Testnet wallets (FR-070, FR-071, design S-08): entries live in IndexedDB and hold a public
	// address, a label, and notes only.

	let formOpen = $state(false);
	let editing = $state<Wallet | null>(null);
	let deleteOpen = $state(false);
	let deleting = $state<Wallet | null>(null);
	let removing = $state(false);
	let faucetOpen = $state(false);
	let faucetNetwork = $state('');

	// Balance requests in flight are cancelled when the page is left (NFR-019).
	const controller = new AbortController();

	onMount(() => {
		void wallets.load();
		void faucets.load();
	});

	onDestroy(() => controller.abort());

	/** One balance request, only on this click (FR-073 AC-1, AC-2). */
	async function refresh(wallet: Wallet): Promise<void> {
		const fetched = await balances.refresh(wallet.networkId, wallet.address, controller.signal);
		if (fetched || controller.signal.aborted) return;
		// Focus moves to the error, as in tx lookup (FR-042 AC-6).
		await tick();
		document.querySelector<HTMLElement>(`[data-balance-error="${CSS.escape(wallet.id)}"]`)?.focus();
	}

	function add(): void {
		editing = null;
		formOpen = true;
	}

	function edit(wallet: Wallet): void {
		editing = wallet;
		formOpen = true;
	}

	function addFaucet(networkId: string): void {
		faucetNetwork = networkId;
		faucetOpen = true;
	}

	function confirmDelete(wallet: Wallet): void {
		deleting = wallet;
		deleteOpen = true;
	}

	async function remove(): Promise<void> {
		if (!deleting || removing) return;
		removing = true;
		const removed = await wallets.remove(deleting.id);
		removing = false;
		deleteOpen = false;
		notify.showToast(removed.ok ? `Deleted "${deleting.label}"` : WRITE_ERRORS[removed.error]);
	}

	/** The balance as plain text, for the table's text form of the cell. */
	function balanceText(wallet: Wallet): string {
		const network = networkById(wallet.networkId);
		const value = balances.get(wallet.networkId, wallet.address).value;
		return network && value ? amount(value.amount, network).display : '';
	}

	const columns: Column<Wallet>[] = [
		{ key: 'label', label: 'Label', value: (w) => w.label, cell: labelCell },
		{ key: 'chain', label: 'Chain', value: (w) => CHAIN_NAMES[w.chain] },
		{ key: 'network', label: 'Network', value: (w) => networkName(w.networkId) },
		{ key: 'address', label: 'Address', value: (w) => w.address, mono: true },
		{ key: 'balance', label: 'Balance', value: balanceText, cell: balanceCell }
	];
</script>

{#snippet balanceCell(wallet: Wallet)}
	{@const network = networkById(wallet.networkId)}
	{@const state = balances.get(wallet.networkId, wallet.address)}
	<span class="balance" aria-live="polite" data-testid="wallets-balance">
		{#if !network}
			<span class="muted">No endpoint for this network</span>
		{:else}
			{#if state.value}
				<span class="amount">{amount(state.value.amount, network).display}</span>
				<span class="fetched">
					{#if state.error}<Badge variant="warning">stale</Badge>{/if}
					<time datetime={new Date(state.value.fetchedAt).toISOString()}
						>fetched {clockTime(state.value.fetchedAt)}</time
					>
				</span>
			{:else if !state.refreshing && !state.error}
				<span class="muted">Not fetched</span>
			{/if}
			{#if state.refreshing}
				<span class="muted">Refreshing…</span>
			{:else if state.error}
				<span
					class="error"
					role="alert"
					tabindex="-1"
					data-balance-error={wallet.id}
					data-testid="wallets-balance-error"
				>
					{balanceErrorText(state.error, network)}
				</span>
			{/if}
		{/if}
	</span>
{/snippet}

{#snippet labelCell(wallet: Wallet)}
	<span class="label">{wallet.label}</span>
	{#if wallet.notes.trim()}<span class="notes">{wallet.notes}</span>{/if}
	<FaucetLinks networkId={wallet.networkId} walletLabel={wallet.label} onadd={addFaucet} />
{/snippet}

<div class="toolbar">
	<span class="count" aria-live="polite" data-testid="wallets-count">
		{#if wallets.status === 'ready' && wallets.list.length > 0}
			{wallets.list.length} {wallets.list.length === 1 ? 'wallet' : 'wallets'}
		{/if}
	</span>
	<Button
		variant="primary"
		onclick={add}
		disabled={wallets.status !== 'ready'}
		data-testid="wallets-add"
	>
		Add wallet
	</Button>
</div>

{#if wallets.status === 'loading'}
	<p class="muted" data-testid="wallets-loading">Loading wallets…</p>
{:else if wallets.status === 'unavailable'}
	<Callout variant="warning" title="Storage unavailable">
		Saving wallets needs browser storage, which is unavailable in this tab, for example in a private
		window.
	</Callout>
{:else if wallets.list.length === 0}
	<div data-testid="wallets-empty">
		<EmptyState>No wallets yet. Add a testnet address to keep it at hand.</EmptyState>
	</div>
{:else}
	<DataTable
		caption="Testnet wallets"
		{columns}
		rows={wallets.list}
		rowKey={(w) => w.id}
		rowTestId="wallets-row"
	>
		{#snippet actions(wallet)}
			<span class="actions">
				{#if networkById(wallet.networkId)}
					{@const state = balances.get(wallet.networkId, wallet.address)}
					<Button
						size="sm"
						onclick={() => refresh(wallet)}
						aria-disabled={state.refreshing || undefined}
						data-testid="wallets-refresh"
					>
						{state.error ? 'Retry' : 'Refresh'}
						<span class="visually-hidden">balance of {wallet.label}</span>
					</Button>
				{/if}
				<CopyButton label="Copy address of {wallet.label}" value={wallet.address} size="sm" />
				<Button size="sm" onclick={() => edit(wallet)} data-testid="wallets-edit">
					Edit<span class="visually-hidden"> {wallet.label}</span>
				</Button>
				<Button size="sm" onclick={() => confirmDelete(wallet)} data-testid="wallets-delete">
					Delete<span class="visually-hidden"> {wallet.label}</span>
				</Button>
			</span>
		{/snippet}
	</DataTable>
{/if}

<WalletDialog bind:open={formOpen} {editing} />

<FaucetDialog bind:open={faucetOpen} networkId={faucetNetwork} />

<Dialog bind:open={deleteOpen} title={`Delete "${deleting?.label ?? ''}"?`} destructive>
	<p>
		The entry is removed from this browser. The address itself, and anything sent to it, is not
		affected.
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			loading={removing}
			onclick={remove}
			data-testid="wallets-confirm-delete"
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.count,
	.muted,
	.notes {
		color: var(--color-text-muted);
	}

	.balance {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 12ch;
		max-width: 32ch;
	}

	.amount {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.fetched {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.error {
		color: var(--color-danger);
		font-size: var(--text-xs);
	}

	.label {
		display: block;
		min-width: 12ch;
		font-weight: 500;
	}

	.notes {
		display: block;
		max-width: 40ch;
		overflow: hidden;
		font-size: var(--text-xs);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.actions {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	p {
		margin: 0;
	}
</style>
