<script lang="ts">
	import { tick } from 'svelte';
	import type { ChainId } from '#lib/core/chains/types.ts';
	import { checkWalletAddress, findDuplicate, LABEL_MAX, NOTES_MAX } from '#lib/core/wallets.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { wallets } from '#lib/state/wallets.svelte.ts';
	import type { Wallet } from '#lib/storage/schema.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Field from '#lib/ui/Field.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import {
		addressProblemText,
		CHAIN_OPTIONS,
		networkName,
		networkOptions,
		WRITE_ERRORS
	} from './present.ts';

	// Add or edit one wallet entry (FR-070 AC-2 to AC-6, FR-071 AC-1). There is deliberately no
	// field for a private key or mnemonic.

	interface Props {
		open: boolean;
		/** The entry being edited, or null to add one. */
		editing: Wallet | null;
	}

	let { open = $bindable(), editing }: Props = $props();

	const formId = $props.id();

	let label = $state('');
	let chain = $state<ChainId>('evm');
	let networkId = $state('');
	let address = $state('');
	let notes = $state('');
	let errors = $state<{ label?: string; address?: string; notes?: string }>({});
	/** The entry this one would duplicate, once the user has been warned (FR-070 AC-6). */
	let duplicate = $state<Wallet | null>(null);
	let saveError = $state<string | null>(null);
	let saving = $state(false);
	let form: HTMLFormElement | undefined = $state();

	// An imported entry may be on a network the form does not offer (a mainnet); keep it selectable.
	const networks = $derived.by(() => {
		const list = networkOptions(chain);
		if (editing?.chain === chain && !list.some((o) => o.value === editing.networkId)) {
			list.push({ value: editing.networkId, label: networkName(editing.networkId) });
		}
		return list;
	});

	// Fill the form each time the dialog opens.
	$effect(() => {
		if (!open) return;
		// Read through a local, not `chain`: this effect must not rerun when the chain changes.
		const startChain = editing?.chain ?? 'evm';
		label = editing?.label ?? '';
		chain = startChain;
		networkId = editing?.networkId ?? networkOptions(startChain)[0].value;
		address = editing?.address ?? '';
		notes = editing?.notes ?? '';
		errors = {};
		duplicate = null;
		saveError = null;
	});

	function changeChain(): void {
		networkId = networks[0]?.value ?? '';
		changed();
	}

	/** Any edit withdraws a duplicate warning: the question was about the previous values. */
	function changed(): void {
		duplicate = null;
		saveError = null;
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		const trimmedLabel = label.trim();
		const checked = checkWalletAddress(chain, address);
		errors = {
			label:
				trimmedLabel === ''
					? 'Give the wallet a label.'
					: trimmedLabel.length > LABEL_MAX
						? `Keep the label to ${LABEL_MAX} characters.`
						: undefined,
			address: checked.ok ? undefined : addressProblemText(checked.error, chain),
			notes: notes.length > NOTES_MAX ? `Keep notes to ${NOTES_MAX} characters.` : undefined
		};
		if (!checked.ok || errors.label || errors.notes) {
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		const input = { label: trimmedLabel, chain, networkId, address: checked.value, notes };
		const other = findDuplicate(wallets.list, { ...input, id: editing?.id });
		if (other && duplicate?.id !== other.id) {
			// First save: warn and let the user cancel or keep it.
			duplicate = other;
			return;
		}
		saving = true;
		const saved = await wallets.save(input, editing?.id);
		saving = false;
		if (!saved.ok) {
			saveError = WRITE_ERRORS[saved.error];
			return;
		}
		open = false;
		notify.showToast(editing ? `Saved "${saved.value.label}"` : `Added "${saved.value.label}"`);
	}
</script>

<Dialog bind:open title={editing ? 'Edit wallet' : 'Add wallet'}>
	<form id={formId} bind:this={form} onsubmit={submit} novalidate data-testid="wallets-form">
		<Field label="Label" error={errors.label}>
			{#snippet children(control)}
				<TextInput
					{...control}
					bind:value={label}
					oninput={() => ((errors.label = undefined), changed())}
					data-testid="wallets-label"
				/>
			{/snippet}
		</Field>
		<div class="pair">
			<Field label="Chain">
				{#snippet children(control)}
					<Select
						{...control}
						options={CHAIN_OPTIONS}
						bind:value={chain}
						onchange={changeChain}
						data-testid="wallets-chain"
					/>
				{/snippet}
			</Field>
			<Field label="Network">
				{#snippet children(control)}
					<Select
						{...control}
						options={networks}
						bind:value={networkId}
						onchange={changed}
						data-testid="wallets-network"
					/>
				{/snippet}
			</Field>
		</div>
		<Field
			label="Address"
			hint={chain === 'bitcoin'
				? 'Testnet addresses only: tb1…, m…, n…, or 2….'
				: 'Mainnet and testnet addresses look the same on this chain, so the network is what you pick above.'}
			error={errors.address}
		>
			{#snippet children(control)}
				<TextInput
					{...control}
					mono
					bind:value={address}
					oninput={() => ((errors.address = undefined), changed())}
					data-testid="wallets-address"
				/>
			{/snippet}
		</Field>
		<Field
			label="Notes (optional)"
			hint="Never paste a private key or seed phrase here. Notes are stored as typed and included in exports."
			error={errors.notes}
		>
			{#snippet children(control)}
				<Textarea
					{...control}
					rows={3}
					bind:value={notes}
					oninput={() => ((errors.notes = undefined), changed())}
					data-testid="wallets-notes"
				/>
			{/snippet}
		</Field>
		{#if duplicate}
			<div data-testid="wallets-duplicate">
				<Callout variant="warning" title="Already saved">
					"{duplicate.label}" has the same address on {networkName(duplicate.networkId)}. Save
					another entry for it anyway?
				</Callout>
			</div>
		{/if}
		{#if saveError}
			<Callout variant="danger" role="alert">{saveError}</Callout>
		{/if}
	</form>

	{#snippet actions()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			type="submit"
			form={formId}
			variant="primary"
			loading={saving}
			data-testid="wallets-save"
		>
			{duplicate ? 'Save anyway' : 'Save'}
		</Button>
	{/snippet}
</Dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: var(--space-4);
	}

	@media (max-width: 480px) {
		.pair {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
