<script lang="ts">
	import { onMount } from 'svelte';
	import { CHAIN_NAMES } from '#lib/core/chains/catalog.ts';
	import { faucets } from '#lib/state/faucets.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { wallets } from '#lib/state/wallets.svelte.ts';
	import type { Wallet } from '#lib/storage/schema.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import { networkName, WRITE_ERRORS } from './present.ts';
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

	onMount(() => {
		void wallets.load();
		void faucets.load();
	});

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

	const columns: Column<Wallet>[] = [
		{ key: 'label', label: 'Label', value: (w) => w.label, cell: labelCell },
		{ key: 'chain', label: 'Chain', value: (w) => CHAIN_NAMES[w.chain] },
		{ key: 'network', label: 'Network', value: (w) => networkName(w.networkId) },
		{ key: 'address', label: 'Address', value: (w) => w.address, mono: true }
	];
</script>

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

	.label {
		display: block;
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
