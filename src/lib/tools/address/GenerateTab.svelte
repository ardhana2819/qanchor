<script lang="ts">
	import { onDestroy } from 'svelte';
	import {
		invalidVariantsFor,
		riskySamplesFor,
		type AddressRow,
		type RiskyId,
		type VariantId
	} from '#lib/core/chains/catalog.ts';
	import type { ChainId } from '#lib/core/chains/types.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import OutputToolbar from '#lib/ui/OutputToolbar.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import {
		BITCOIN_NETWORKS,
		BITCOIN_TYPES,
		CHAIN_OPTIONS,
		COUNT_ERROR,
		parseCount,
		targetFor,
		visibleAddress,
		type BitcoinNetworkValue,
		type BitcoinTypeValue
	} from './form.ts';
	import { createAddressJobs } from './jobs.ts';

	// Generate tab (FR-010 to FR-012, design S-02). The work runs in the address worker; this page
	// only sends the options and shows the rows (NFR-005).

	interface Row extends AddressRow {
		id: string;
		index: number;
	}

	let chain = $state<ChainId>('evm');
	let bitcoinType = $state<BitcoinTypeValue>('p2wpkh');
	let bitcoinNetwork = $state<BitcoinNetworkValue>('mainnet');
	let countText = $state('10');
	let invalid = $state<string[]>([]);
	let risky = $state<string[]>([]);

	const target = $derived(targetFor(chain, bitcoinType, bitcoinNetwork));
	const invalidOptions = $derived(
		invalidVariantsFor(target).map(({ id, label }) => ({ value: id, label }))
	);
	const riskyOptions = $derived(
		riskySamplesFor(target).map(({ id, label }) => ({ value: id, label }))
	);
	// Only variants that apply to the current target count; others stay ticked but unused, so
	// switching back to the chain restores the choice.
	const selected = $derived([
		...invalid.filter((id) => invalidOptions.some((o) => o.value === id)),
		...risky.filter((id) => riskyOptions.some((o) => o.value === id))
	] as (VariantId | RiskyId)[]);
	const count = $derived(parseCount(countText));
	const countError = $derived(count === null ? COUNT_ERROR : undefined);

	const jobs = createAddressJobs();
	onDestroy(() => jobs.dispose());

	let rows = $state.raw<Row[]>([]);
	let generating = $state(false);
	let failure = $state<string | null>(null);
	let runs = 0;
	let exportName = $state('addresses');

	const tally = $derived({
		valid: rows.filter((r) => r.validity === 'valid').length,
		invalid: rows.filter((r) => r.validity === 'invalid').length,
		risky: rows.filter((r) => r.validity === 'risky').length
	});

	async function generate(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (count === null || generating) return;
		generating = true;
		failure = null;
		const options = { target, count, variants: [...selected] };
		try {
			const result = await jobs.generate(options);
			runs += 1;
			rows = result.map((row, i) => ({ ...row, index: i + 1, id: `${runs}-${i}` }));
			exportName =
				target.chain === 'bitcoin'
					? `addresses-bitcoin-${target.type}-${target.network}`
					: `addresses-${target.chain}`;
			notify.announce(`${rows.length} ${rows.length === 1 ? 'address' : 'addresses'} generated`);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			generating = false;
		}
	}

	function plural(n: number, one: string, many: string): string {
		return `${n} ${n === 1 ? one : many}`;
	}

	const STATUS = {
		valid: { variant: 'success', text: 'Valid' },
		invalid: { variant: 'danger', text: 'Invalid' },
		risky: { variant: 'warning', text: 'Risky' }
	} as const;

	const columns: Column<Row>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{ key: 'address', label: 'Address', value: (row) => visibleAddress(row.address), mono: true },
		{ key: 'status', label: 'Status', value: (row) => STATUS[row.validity].text, cell: status },
		{
			key: 'details',
			label: 'Details',
			value: (row) => `${row.label}: ${row.reason}`,
			cell: details
		}
	];
</script>

{#snippet status(row: Row)}
	<Badge variant={STATUS[row.validity].variant}>{STATUS[row.validity].text}</Badge>
{/snippet}

{#snippet details(row: Row)}
	<span class="variant">{row.label}</span>
	<span class="reason">{row.reason}</span>
{/snippet}

<FormPanel aria-label="Address options" onsubmit={generate}>
	<div class="grid">
		<Field label="Chain">
			{#snippet children(control)}
				<Select {...control} options={CHAIN_OPTIONS} bind:value={chain} />
			{/snippet}
		</Field>
		{#if chain === 'bitcoin'}
			<Field label="Address type" hint="Bitcoin encodes each type differently.">
				{#snippet children(control)}
					<Select {...control} options={BITCOIN_TYPES} bind:value={bitcoinType} />
				{/snippet}
			</Field>
			<Field label="Network" hint="Testnet addresses use other prefixes.">
				{#snippet children(control)}
					<Select {...control} options={BITCOIN_NETWORKS} bind:value={bitcoinNetwork} />
				{/snippet}
			</Field>
		{:else}
			<Field label="Address type" hint="This chain has one address type.">
				{#snippet children(control)}
					<Select
						{...control}
						disabled
						options={[{ value: 'standard', label: 'Standard' }]}
						value="standard"
					/>
				{/snippet}
			</Field>
			<Field label="Network" hint="Same encoding on mainnet and testnet.">
				{#snippet children(control)}
					<Select
						{...control}
						disabled
						options={[{ value: 'any', label: 'Any network' }]}
						value="any"
					/>
				{/snippet}
			</Field>
		{/if}
		<Field label="Valid addresses" hint="1 to 500" error={countError}>
			{#snippet children(control)}
				<TextInput {...control} inputmode="numeric" bind:value={countText} />
			{/snippet}
		</Field>
	</div>

	<div class="variants">
		<CheckboxGroup
			legend="Invalid variants"
			options={invalidOptions}
			columns={2}
			bind:group={invalid}
		/>
		{#if riskyOptions.length > 0}
			<CheckboxGroup legend="Valid but risky" options={riskyOptions} bind:group={risky} />
		{/if}
	</div>

	{#snippet footer()}
		<span class="summary">
			{#if count === null}
				Enter a count to generate.
			{:else}
				{plural(count + selected.length, 'row', 'rows')}: {plural(
					count,
					'valid address',
					'valid addresses'
				)}
				plus one row per selected variant.
			{/if}
		</span>
		<Button type="submit" variant="primary" loading={generating} disabled={count === null}>
			{generating ? 'Generating…' : 'Generate'}
		</Button>
	{/snippet}
</FormPanel>

<section class="output" aria-labelledby="results">
	<div class="results-head">
		<h2 id="results">Results</h2>
		{#if rows.length > 0}
			<span class="tally">
				<Badge variant="success">{tally.valid} valid</Badge>
				{#if tally.invalid > 0}<Badge variant="danger">{tally.invalid} invalid</Badge>{/if}
				{#if tally.risky > 0}<Badge variant="warning">{tally.risky} risky</Badge>{/if}
			</span>
		{/if}
	</div>

	{#if failure}
		<div class="failure">
			<Callout variant="danger" title="Generation failed" role="alert">
				<p>{failure}</p>
			</Callout>
		</div>
	{/if}

	<OutputToolbar
		summary={rows.length > 0 ? plural(rows.length, 'address', 'addresses') : 'No addresses yet'}
		records={rows.map((row) => ({
			address: row.address,
			chain: row.chain,
			type: row.type,
			network: row.network,
			validity: row.validity === 'risky' ? 'valid-but-risky' : row.validity,
			variantId: row.variantId,
			reason: row.reason
		}))}
		fields={['address', 'chain', 'type', 'network', 'validity', 'variantId', 'reason']}
		filename={exportName}
	/>
	{#if rows.length > 0}
		<DataTable caption="Generated addresses" {columns} {rows} rowKey={(row) => row.id}>
			{#snippet actions(row)}
				<CopyButton label="Copy address {row.index}" value={row.address} size="sm" />
			{/snippet}
		</DataTable>
	{:else}
		<EmptyState>
			Pick a chain and a count, then generate. Add invalid variants for negative tests.
		</EmptyState>
	{/if}
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.variants {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
		gap: var(--space-6);
		margin-top: var(--space-6);
	}

	.summary {
		color: var(--color-text-muted);
	}

	.output {
		margin-top: var(--space-8);
	}

	.results-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.tally {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.failure {
		margin-bottom: var(--space-4);
	}

	.variant {
		display: block;
	}

	.reason {
		display: block;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.variants {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 639px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
