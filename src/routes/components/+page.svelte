<script lang="ts">
	import { onDestroy } from 'svelte';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import OutputToolbar from '#lib/ui/OutputToolbar.svelte';
	import { notify } from '#lib/state/notify.svelte.ts';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';

	// A living reference for docs/design.md section 6 and the page the component E2E tests run
	// against (T-008). It is not listed in the navigation.

	const chains = [
		{ value: 'evm', label: 'EVM' },
		{ value: 'bitcoin', label: 'Bitcoin' },
		{ value: 'solana', label: 'Solana' },
		{ value: 'tron', label: 'Tron' }
	];
	const variants = [
		{ value: 'checksum', label: 'Wrong checksum' },
		{ value: 'length', label: 'Wrong length' },
		{ value: 'network', label: 'Wrong network prefix' },
		{ value: 'lookalike', label: 'Look-alike from another chain' },
		{ value: 'whitespace', label: 'Leading whitespace', disabled: true }
	];
	const families = [
		{ value: 'ether', label: 'Ether' },
		{ value: 'btc', label: 'BTC' },
		{ value: 'sol', label: 'SOL' },
		{ value: 'trx', label: 'TRX' }
	] as const;
	const modes = [
		{ id: 'generate', label: 'Generate' },
		{ id: 'validate', label: 'Validate' }
	] as const;

	let chain = $state('evm');
	let count = $state('12');
	let fee = $state('');
	let notes = $state('');
	let selectedVariants = $state(['checksum']);
	let family: (typeof families)[number]['value'] = $state('ether');
	let mode: (typeof modes)[number]['id'] = $state('generate');
	let generating = $state(false);

	interface ExampleRow {
		id: string;
		index: number;
		address: string;
		variant: string;
	}

	const columns: Column<ExampleRow>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{ key: 'address', label: 'Address', value: (row) => row.address, mono: true },
		{ key: 'variant', label: 'Variant', value: (row) => row.variant }
	];
	let rows: ExampleRow[] = $state([]);
	// A fixed example value for the stand-alone copy button.
	const exampleHash = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
	let run = 0;
	let detail: ExampleRow | undefined = $state();
	let detailOpen = $state(false);
	let deleteOpen = $state(false);

	// Random hex that looks like an EVM address. Display data only: not a key, not derived from one.
	function exampleRows(total: number): ExampleRow[] {
		run += 1;
		const labels = variants.filter((v) => selectedVariants.includes(v.value)).map((v) => v.label);
		return Array.from({ length: total }, (_, i) => {
			const bytes = crypto.getRandomValues(new Uint8Array(20));
			const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
			return {
				id: `${run}-${i}`,
				index: i + 1,
				address: `0x${hex}`,
				variant: labels[i % labels.length]
			};
		});
	}

	function showDetail(row: ExampleRow): void {
		detail = row;
		detailOpen = true;
	}

	const countError = $derived(
		/^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= 500
			? undefined
			: 'Enter a whole number from 1 to 500.'
	);
	const variantError = $derived(
		selectedVariants.length === 0 ? 'Select at least one variant.' : undefined
	);

	// Shows the loading state long enough to see; real tools end it when their work finishes.
	let timer: ReturnType<typeof setTimeout> | undefined;
	function generate(): void {
		if (countError || variantError) return;
		generating = true;
		timer = setTimeout(() => {
			generating = false;
			rows = exampleRows(Number(count));
			notify.announce(`${rows.length} ${rows.length === 1 ? 'row' : 'rows'} generated`);
		}, 1200);
	}
	onDestroy(() => clearTimeout(timer));
</script>

<svelte:head>
	<title>Components · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Components</h1>
	<p>The UI primitives from the design system, in each of their states.</p>
</header>

<section aria-labelledby="buttons">
	<h2 id="buttons">Buttons</h2>
	<div class="row">
		<Button variant="primary">Generate</Button>
		<Button>Secondary</Button>
		<Button variant="ghost">Ghost</Button>
		<Button variant="danger" onclick={() => (deleteOpen = true)}>Delete wallet</Button>
		<Button variant="primary" disabled>Generate</Button>
		<Button variant="primary" loading>Looking up…</Button>
	</div>
	<div class="row">
		<Button size="sm">Small</Button>
		<Button size="sm" variant="ghost">Small ghost</Button>
	</div>
	<!-- Icon buttons: the caption names the variant on screen; the button keeps its own name. -->
	<div class="row samples">
		<div class="sample">
			<IconButton label="Icon button example"><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Default</span>
		</div>
		<div class="sample">
			<IconButton label="Outlined icon button example" outline><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Outline</span>
		</div>
		<div class="sample">
			<IconButton label="Small icon button example" size="sm"><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Small</span>
		</div>
		<div class="sample">
			<IconButton label="Disabled icon button example" disabled><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Disabled</span>
		</div>
		<div class="sample">
			<CopyButton label="Copy example hash" value={exampleHash} />
			<span class="caption" aria-hidden="true">Copy</span>
		</div>
	</div>
</section>

<section aria-labelledby="form">
	<h2 id="form">Form panel</h2>
	<FormPanel aria-label="Example form" onsubmit={(event) => (event.preventDefault(), generate())}>
		<div class="grid">
			<Field label="Chain" hint="Address family to generate.">
				{#snippet children(control)}
					<Select {...control} options={chains} bind:value={chain} />
				{/snippet}
			</Field>
			<Field label="Count" hint="1 to 500 per generation." error={countError}>
				{#snippet children(control)}
					<TextInput {...control} inputmode="numeric" bind:value={count} />
				{/snippet}
			</Field>
			<Field label="Fee (gwei)">
				{#snippet children(control)}
					<TextInput {...control} mono suffix="gwei" placeholder="0.0" bind:value={fee} />
				{/snippet}
			</Field>
			<Field label="Calldata" hint="Textarea, monospace. Ctrl+Enter submits.">
				{#snippet children(control)}
					<Textarea {...control} mono rows={2} placeholder="0x" bind:value={notes} />
				{/snippet}
			</Field>
			<Field label="Network" hint="Only mainnet for this chain.">
				{#snippet children(control)}
					<Select
						{...control}
						disabled
						options={[{ value: 'mainnet', label: 'Mainnet' }]}
						value="mainnet"
					/>
				{/snippet}
			</Field>
		</div>
		<div class="checks">
			<CheckboxGroup
				legend="Invalid variants"
				options={variants}
				columns={2}
				error={variantError}
				bind:group={selectedVariants}
			/>
		</div>
		{#snippet footer()}
			<span class="summary"
				>{selectedVariants.length}
				{selectedVariants.length === 1 ? 'variant' : 'variants'} selected</span
			>
			<Button
				type="submit"
				variant="primary"
				loading={generating}
				disabled={Boolean(countError || variantError)}
			>
				{generating ? 'Generating…' : 'Generate'}
			</Button>
		{/snippet}
	</FormPanel>

	<h3>Results</h3>
	<OutputToolbar
		summary={rows.length === 0
			? 'No rows yet'
			: `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
		records={rows.map((row) => ({
			index: String(row.index),
			address: row.address,
			variant: row.variant
		}))}
		fields={['index', 'address', 'variant']}
		filename="example-rows"
		testIdPrefix="components"
	/>
	{#if rows.length > 0}
		<DataTable caption="Generated example rows" {columns} {rows} rowKey={(row) => row.id}>
			{#snippet actions(row)}
				<CopyButton label="Copy address {row.index}" value={row.address} size="sm" />
				<IconButton label="Details of row {row.index}" size="sm" onclick={() => showDetail(row)}>
					<Icon name="info" />
				</IconButton>
			{/snippet}
		</DataTable>
	{:else}
		<EmptyState>
			Pick a chain and a count, then generate. Add invalid variants for negative tests.
		</EmptyState>
	{/if}
</section>

<section aria-labelledby="selection">
	<h2 id="selection">Segmented control and tabs</h2>
	<div class="segmented">
		<SegmentedControl
			legend="Unit family"
			options={families}
			value={family}
			onchange={(next) => (family = next)}
		/>
	</div>
	<Tabs label="Mode" tabs={modes} bind:value={mode}>
		{#snippet panel(id)}
			<p class="muted">
				{id === 'generate'
					? 'Generate tab: the form and the results table.'
					: 'Validate tab: paste one address to check it.'}
			</p>
		{/snippet}
	</Tabs>
</section>

<section aria-labelledby="status">
	<h2 id="status">Status</h2>
	<div class="row">
		<Badge variant="success">Valid</Badge>
		<Badge variant="danger">Invalid</Badge>
		<Badge variant="warning">Risky</Badge>
		<Badge variant="neutral">Pending</Badge>
	</div>
	<div class="stack">
		<Callout variant="info">
			<p>Generated data is fake and for testing only.</p>
		</Callout>
		<Callout variant="warning" title="Valid but risky">
			<p>This address is valid on Ethereum and on BNB Smart Chain.</p>
		</Callout>
		<Callout variant="danger" title="Could not reach rpc.example.org">
			<p>
				The request did not complete, so this says nothing about whether the transaction exists.
			</p>
			{#snippet action()}
				<Button size="sm">Retry</Button>
			{/snippet}
		</Callout>
	</div>
</section>

<Dialog bind:open={detailOpen} title="Row {detail?.index ?? ''}">
	<p class="address">{detail?.address}</p>
	{#snippet actions()}
		<Button onclick={() => (detailOpen = false)}>Close</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={deleteOpen} title="Delete wallet?" destructive>
	<p>This removes the wallet and its notes. This cannot be undone.</p>
	{#snippet actions()}
		<Button onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={() => {
				deleteOpen = false;
				notify.showToast('Example only: no wallet was deleted');
			}}>Delete</Button
		>
	{/snippet}
</Dialog>

<style>
	.page-header {
		margin-bottom: var(--space-8);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	.page-header p,
	.muted {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	section + section {
		margin-top: var(--space-12);
	}

	h2 {
		margin: 0 0 var(--space-4);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.samples {
		align-items: flex-start;
		gap: var(--space-4);
	}

	.sample {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		min-width: 56px;
	}

	.caption {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.row + .row {
		margin-top: var(--space-4);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.checks {
		margin-top: var(--space-6);
	}

	.summary {
		color: var(--color-text-muted);
	}

	.segmented {
		max-width: 320px;
		margin-bottom: var(--space-6);
	}

	h3 {
		margin: var(--space-8) 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.address {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}

	.stack {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 639px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
