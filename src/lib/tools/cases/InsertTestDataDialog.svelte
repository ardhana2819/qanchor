<script lang="ts">
	import { generateAmountCases } from '#lib/core/amount/cases.ts';
	import {
		invalidVariantsFor,
		type AddressTarget,
		type VariantId
	} from '#lib/core/chains/catalog.ts';
	import type { ChainId } from '#lib/core/chains/types.ts';
	import { defaultSettings, type FieldId } from '#lib/core/dummy/settings.ts';
	import {
		BITCOIN_NETWORKS,
		BITCOIN_TYPES,
		CHAIN_OPTIONS,
		targetFor,
		visibleAddress,
		type BitcoinNetworkValue,
		type BitcoinTypeValue
	} from '#lib/tools/address/form.ts';
	import { createAddressJobs } from '#lib/tools/address/jobs.ts';
	import { PRESETS } from '#lib/tools/amounts/form.ts';
	import { FIELD_OPTIONS, today } from '#lib/tools/dummy/form.ts';
	import { createDummyJobs } from '#lib/tools/dummy/jobs.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Field from '#lib/ui/Field.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import {
		addressText,
		dummyText,
		freshSeed,
		GENERATE_ERROR,
		KIND_OPTIONS,
		targetText,
		type Caret,
		type DataKind
	} from './test-data.ts';

	// Insert test data into a step (FR-151). Loaded only when first opened, so the test case editor
	// carries no generator code (AC-3, NFR-015). Addresses and dummy people are made in the Phase 1
	// workers; only the public address comes back, and closing the dialog stops both workers, so
	// no key material outlives it (AC-4, NFR-012).

	interface Props {
		/** The text to insert, after the dialog has closed. */
		oninsert: (text: string) => void;
	}

	let { oninsert }: Props = $props();

	const VALID = 'valid';
	const addressJobs = createAddressJobs();
	const dummyJobs = createDummyJobs();

	let open = $state(false);
	let step = $state(1);
	let field: Caret['field'] = $state('action');

	let kind: DataKind = $state('address');
	// Strings, as the selects bind them; read through the option lists they come from.
	let chain: string = $state('evm');
	let bitcoinType: string = $state('p2wpkh');
	let bitcoinNetwork: string = $state('mainnet');
	let sample: string = $state(VALID);
	let preset: string = $state(PRESETS[0].value);
	let amountCase = $state('0');
	let dummyField: string = $state('name');
	/** Bumped by Generate another, so the same choices give a new value. */
	let nonce = $state(0);

	/** What Insert puts in the field, and how the preview shows it: spaces and invisible characters made visible. */
	let value: { text: string; shown: string } | null = $state(null);
	let loading = $state(false);
	let error = $state('');
	let request = 0;

	const target: AddressTarget = $derived(
		targetFor(
			chain as ChainId,
			bitcoinType as BitcoinTypeValue,
			bitcoinNetwork as BitcoinNetworkValue
		)
	);
	const sampleOptions = $derived([
		{ value: VALID, label: 'Valid' },
		...invalidVariantsFor(target).map(({ id, label }) => ({
			value: id,
			label: `Invalid: ${label}`
		}))
	]);
	const decimals = $derived(PRESETS.find((p) => p.value === preset)?.decimals ?? 18);
	const amountCases = $derived(generateAmountCases({ decimals }).cases);
	const amountOptions = $derived(
		amountCases.map((c, i) => ({ value: String(i), label: `${c.category}: ${c.purpose}` }))
	);
	const presetOptions = PRESETS.map(({ value, label, decimals }) => ({
		value,
		label: `${label} (${decimals})`
	}));

	// A sample that does not apply to the new chain or type falls back to Valid (FR-011 AC-4).
	$effect(() => {
		if (!sampleOptions.some((o) => o.value === sample)) sample = VALID;
	});

	// Another token has other cases; start again from the first.
	$effect(() => {
		void preset;
		amountCase = '0';
	});

	// Regenerates whenever a choice changes while the dialog is open.
	$effect(() => {
		if (!open) return;
		void nonce;
		if (kind === 'amount') {
			request++;
			loading = false;
			error = '';
			const input = amountCases[Number(amountCase)]?.input;
			value = input === undefined ? null : { text: input, shown: visibleAddress(input) };
			return;
		}
		void generate(kind, target, sample, dummyField as FieldId);
	});

	// Leaving the editor while the dialog is open stops them too (NFR-019).
	$effect(() => () => {
		addressJobs.dispose();
		dummyJobs.dispose();
	});

	// Closing stops the workers, whichever way the dialog closed (Escape, Cancel, Insert).
	$effect(() => {
		if (open) return;
		request++;
		addressJobs.dispose();
		dummyJobs.dispose();
		value = null;
	});

	async function generate(
		kind: 'address' | 'dummy',
		target: AddressTarget,
		sample: string,
		field: FieldId
	): Promise<void> {
		const id = ++request;
		loading = true;
		error = '';
		try {
			const next =
				kind === 'address' ? await addressValue(target, sample) : await dummyValue(field);
			if (id !== request) return;
			value = next;
		} catch {
			if (id !== request) return;
			value = null;
			error = GENERATE_ERROR;
		} finally {
			if (id === request) loading = false;
		}
	}

	async function addressValue(
		target: AddressTarget,
		sample: string
	): Promise<{ text: string; shown: string }> {
		const variants = sample === VALID ? [] : [sample as VariantId];
		const rows = await addressJobs.generate({ target, count: 1, variants });
		// One valid row, then the variant's row when one was asked for.
		const row = sample === VALID ? rows[0] : rows.find((r) => r.validity !== 'valid');
		if (!row) throw new Error('No row was generated.');
		const shown = row.address === '' ? row.address : visibleAddress(row.address);
		return { text: addressText(row), shown: addressText({ ...row, address: shown }) };
	}

	async function dummyValue(field: FieldId): Promise<{ text: string; shown: string }> {
		const settings = { ...defaultSettings(today()), fields: [field], count: 1 };
		const [row] = await dummyJobs.generate(settings, freshSeed(), () => {});
		if (!row) throw new Error('No row was generated.');
		const text = dummyText(row.person, field);
		return { text, shown: text };
	}

	/** Opens for one step field; the last choices are kept between openings. */
	export function show(stepNumber: number, into: Caret['field']): void {
		step = stepNumber;
		field = into;
		open = true;
	}

	function insert(): void {
		if (value === null || loading) return;
		const { text } = value;
		open = false;
		oninsert(text);
	}
</script>

<Dialog bind:open title="Insert test data">
	<p data-testid="case-editor-insert-target">{targetText(step, field)}</p>
	<div class="kind">
		<SegmentedControl
			legend="Kind of test data"
			options={KIND_OPTIONS}
			value={kind}
			onchange={(next) => (kind = next)}
		/>
	</div>

	<div class="fields">
		{#if kind === 'address'}
			<Field label="Chain">
				{#snippet children(control)}
					<Select
						{...control}
						options={CHAIN_OPTIONS}
						bind:value={chain}
						data-testid="case-editor-insert-chain"
					/>
				{/snippet}
			</Field>
			{#if chain === 'bitcoin'}
				<Field label="Type">
					{#snippet children(control)}
						<Select {...control} options={BITCOIN_TYPES} bind:value={bitcoinType} />
					{/snippet}
				</Field>
				<Field label="Network">
					{#snippet children(control)}
						<Select {...control} options={BITCOIN_NETWORKS} bind:value={bitcoinNetwork} />
					{/snippet}
				</Field>
			{/if}
			<Field label="Sample">
				{#snippet children(control)}
					<Select
						{...control}
						options={sampleOptions}
						bind:value={sample}
						data-testid="case-editor-insert-sample"
					/>
				{/snippet}
			</Field>
		{:else if kind === 'amount'}
			<Field label="Token (decimals)">
				{#snippet children(control)}
					<Select
						{...control}
						options={presetOptions}
						bind:value={preset}
						data-testid="case-editor-insert-preset"
					/>
				{/snippet}
			</Field>
			<Field label="Edge case">
				{#snippet children(control)}
					<Select
						{...control}
						options={amountOptions}
						bind:value={amountCase}
						data-testid="case-editor-insert-amount"
					/>
				{/snippet}
			</Field>
		{:else}
			<Field label="Field">
				{#snippet children(control)}
					<Select
						{...control}
						options={FIELD_OPTIONS}
						bind:value={dummyField}
						data-testid="case-editor-insert-field"
					/>
				{/snippet}
			</Field>
		{/if}
	</div>

	<div class="preview">
		<span class="label">Inserted as</span>
		<p
			class="value"
			aria-live="polite"
			aria-busy={loading}
			data-testid="case-editor-insert-preview"
		>
			{#if error}
				<span class="error">{error}</span>
			{:else if value === null}
				<span class="muted">Generating…</span>
			{:else}
				{value.shown}
			{/if}
		</p>
		{#if kind !== 'amount'}
			<Button size="sm" onclick={() => nonce++} data-testid="case-editor-insert-another"
				>Generate another</Button
			>
		{/if}
	</div>

	{#snippet actions()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			variant="primary"
			disabled={value === null || loading}
			onclick={insert}
			data-testid="case-editor-insert-confirm">Insert</Button
		>
	{/snippet}
</Dialog>

<style>
	/* The dialog body sets every paragraph's margin to 0, so the gap is on the control. */
	.kind {
		margin: var(--space-3) 0 var(--space-4);
	}

	.fields {
		display: grid;
		gap: var(--space-3);
		margin-bottom: var(--space-4);
	}

	.preview {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}

	.label {
		grid-column: 1 / -1;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	.value {
		min-height: var(--control-md);
		margin: 0;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}

	.muted {
		color: var(--color-text-subtle);
	}

	.error {
		color: var(--color-danger);
		font-family: var(--font-sans);
	}
</style>
