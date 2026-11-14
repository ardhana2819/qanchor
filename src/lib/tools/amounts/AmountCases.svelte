<script lang="ts">
	import {
		generateAmountCases,
		type AmountCase,
		type AmountCases
	} from '#lib/core/amount/cases.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import OutputToolbar from '#lib/ui/OutputToolbar.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import {
		OPTIONAL_FIELDS,
		PRESET_OPTIONS,
		presetDecimals,
		readForm,
		type FormValues,
		type PresetId
	} from './form.ts';

	// Amount edge cases (FR-020 to FR-022, design S-03).

	interface Row extends AmountCase {
		id: string;
		index: number;
	}

	let preset = $state<PresetId>('custom');
	let values: FormValues = $state({ decimals: '', balance: '', fee: '', min: '', max: '' });
	type Result = AmountCases & { decimals: number; run: number };
	let result = $state.raw<Result | null>(null);
	let runs = 0;

	const form = $derived(readForm(values));
	const errors = $derived(form.ok ? {} : form.errors);

	const rows: Row[] = $derived(
		(result?.cases ?? []).map((c, i) => ({ ...c, index: i + 1, id: `${result!.run}-${i}` }))
	);
	const omittedCount = $derived(
		(result?.omitted ?? []).reduce((sum, group) => sum + group.cases.length, 0)
	);

	// Spaces are invisible in a table cell, so they are shown as ␣. Copy and export keep the
	// literal string (FR-022 AC-1).
	const columns: Column<Row>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{ key: 'input', label: 'Input', value: (row) => row.input.replaceAll(' ', '␣'), mono: true },
		{ key: 'category', label: 'Category', value: (row) => row.category },
		{ key: 'purpose', label: 'Purpose', value: (row) => row.purpose }
	];

	function choosePreset(next: PresetId): void {
		preset = next;
		const decimals = presetDecimals(next);
		if (decimals !== null) values.decimals = String(decimals);
	}

	function onDecimalsInput(text: string): void {
		values.decimals = text;
		// A typed value that no longer matches the preset makes it a custom token.
		if (presetDecimals(preset) !== null && text.trim() !== String(presetDecimals(preset))) {
			preset = 'custom';
		}
	}

	function generate(event: SubmitEvent): void {
		event.preventDefault();
		if (!form.ok) return;
		runs += 1;
		result = { ...generateAmountCases(form.params), decimals: form.params.decimals, run: runs };
		const n = result.cases.length;
		notify.announce(`${n} ${n === 1 ? 'case' : 'cases'} generated`);
	}

	function cases(n: number): string {
		return `${n} ${n === 1 ? 'case' : 'cases'}`;
	}
</script>

<FormPanel aria-label="Token parameters" onsubmit={generate}>
	<div class="grid">
		<Field label="Preset" hint="Fills in the decimals.">
			{#snippet children(control)}
				<Select
					{...control}
					options={PRESET_OPTIONS}
					value={preset}
					onchange={(event) => choosePreset(event.currentTarget.value as PresetId)}
				/>
			{/snippet}
		</Field>
		<Field label="Decimals" hint="Whole number from 0 to 36." error={errors.decimals}>
			{#snippet children(control)}
				<TextInput
					{...control}
					inputmode="numeric"
					value={values.decimals}
					oninput={(event) => onDecimalsInput(event.currentTarget.value)}
				/>
			{/snippet}
		</Field>
	</div>
	<div class="grid optional">
		{#each OPTIONAL_FIELDS as field (field.key)}
			<Field label={field.label} hint="Optional, in token units." error={errors[field.key]}>
				{#snippet children(control)}
					<TextInput {...control} mono inputmode="decimal" bind:value={values[field.key]} />
				{/snippet}
			</Field>
		{/each}
	</div>
	{#snippet footer()}
		<span class="summary">
			{form.ok ? `Decimals ${form.params.decimals}` : 'Enter the decimals to generate.'}
		</span>
		<Button type="submit" variant="primary" disabled={!form.ok}>Generate</Button>
	{/snippet}
</FormPanel>

<section class="output" aria-labelledby="results">
	<h2 id="results">Results</h2>

	{#if result && result.omitted.length > 0}
		<div class="omitted">
			<Callout variant="info" title="{cases(omittedCount)} omitted">
				<ul>
					{#each result.omitted as group (group.cases.join())}
						<li>{group.cases.join(', ')}: {group.reason}</li>
					{/each}
				</ul>
			</Callout>
		</div>
	{/if}

	<OutputToolbar
		summary={result ? cases(rows.length) : 'No cases yet'}
		records={rows.map((row) => ({
			input: row.input,
			category: row.category,
			purpose: row.purpose
		}))}
		fields={['input', 'category', 'purpose']}
		filename={result ? `amount-cases-d${result.decimals}` : 'amount-cases'}
	/>
	{#if rows.length > 0}
		<DataTable caption="Edge-case amounts" {columns} {rows} rowKey={(row) => row.id}>
			{#snippet actions(row)}
				<CopyButton label="Copy input {row.index}" value={row.input} size="sm" />
			{/snippet}
		</DataTable>
	{:else}
		<EmptyState>Enter the token's decimals to generate edge-case amounts.</EmptyState>
	{/if}
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.optional {
		margin-top: var(--space-4);
	}

	.summary {
		color: var(--color-text-muted);
	}

	.output {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.omitted {
		margin-bottom: var(--space-4);
	}

	ul {
		margin: var(--space-1) 0 0;
		padding-left: var(--space-4);
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
