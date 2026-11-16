<script lang="ts">
	import { onDestroy } from 'svelte';
	import { isoDate } from '#lib/core/dummy/dates.ts';
	import type { NpwpFormat, PhoneFormat, Realism } from '#lib/core/dummy/fields.ts';
	import { GENERATOR_VERSION, randomSeed } from '#lib/core/dummy/random.ts';
	import type { DummyRow } from '#lib/core/dummy/rows.ts';
	import {
		ADULT_AGES,
		defaultSettings,
		FIELD_IDS,
		PRESETS,
		settingsErrors,
		type FieldId,
		type Scenario,
		type Settings
	} from '#lib/core/dummy/settings.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import ExportBar from './ExportBar.svelte';
	import {
		FIELD_OPTIONS,
		formErrors,
		NPWP_FORMATS,
		parseIsoDate,
		parseWhole,
		PHONE_FORMATS,
		REALISM_OPTIONS,
		today,
		type DummyResult
	} from './form.ts';
	import { createDummyJobs } from './jobs.ts';

	// Dummy data page (FR-080 to FR-084, design S-09). Rows are generated in the dummy worker; this
	// page holds the form, shows progress and the first 100 rows, and builds exports on demand.

	/** Rows rendered in the preview; exports always cover every row (FR-080 AC-4). */
	const PREVIEW_ROWS = 100;
	const NOTED: readonly Scenario[] = ['name-edge-cases', 'invalid-formats', 'duplicate-nik'];

	const defaults = defaultSettings(today());
	let preset = $state<Scenario | ''>('');
	let fields = $state<string[]>([...defaults.fields]);
	let countText = $state(String(defaults.count));
	let seedText = $state('');
	let phoneFormat = $state<PhoneFormat>(defaults.phoneFormat);
	let npwpFormat = $state<NpwpFormat>(defaults.npwpFormat);
	let realism = $state<Realism>(defaults.realism);
	let minAgeText = $state(String(ADULT_AGES.min));
	let maxAgeText = $state(String(ADULT_AGES.max));
	let asOfText = $state(isoDate(defaults.asOf));

	const presetOptions = [
		{ value: '', label: 'None' },
		...PRESETS.map(({ id, label }) => ({ value: id, label }))
	];
	const chosenPreset = $derived(PRESETS.find((p) => p.id === preset));

	const settings: Settings = $derived({
		fields: FIELD_IDS.filter((id) => fields.includes(id)),
		count: parseWhole(countText),
		phoneFormat,
		npwpFormat,
		realism,
		ages: { min: parseWhole(minAgeText), max: parseWhole(maxAgeText) },
		asOf: parseIsoDate(asOfText),
		scenario: preset === '' ? null : preset
	});
	const errors = $derived(formErrors(settingsErrors(settings)));
	const valid = $derived(Object.keys(errors).length === 0);

	/** A preset sets fields and options, which stay editable (FR-084 AC-1). */
	function choosePreset(value: string): void {
		const chosen = PRESETS.find((p) => p.id === value);
		preset = chosen ? chosen.id : '';
		if (!chosen) return;
		const applied = chosen.apply(settings);
		fields = [...applied.fields];
		realism = applied.realism;
		minAgeText = String(applied.ages.min);
		maxAgeText = String(applied.ages.max);
	}

	const jobs = createDummyJobs();
	onDestroy(() => jobs.dispose());

	let result = $state.raw<DummyResult | null>(null);
	let progress = $state<{ done: number; total: number } | null>(null);
	let failure = $state<string | null>(null);
	let runs = $state(0);

	async function generate(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (!valid || progress) return;
		const run = { settings, seed: seedText.trim() === '' ? randomSeed() : seedText.trim() };
		failure = null;
		progress = { done: 0, total: run.settings.count };
		try {
			const rows = await jobs.generate(run.settings, run.seed, (done, total) => {
				progress = { done, total };
			});
			result = { ...run, rows };
			runs += 1;
			notify.announce(`${count(rows.length)} generated`);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
		} finally {
			progress = null;
		}
	}

	function count(n: number): string {
		return `${n.toLocaleString('en-US')} ${n === 1 ? 'row' : 'rows'}`;
	}

	interface PreviewRow extends DummyRow {
		key: string;
	}

	const preview = $derived(
		(result?.rows ?? [])
			.slice(0, PREVIEW_ROWS)
			.map((row) => ({ ...row, key: `${runs}-${row.number}` }))
	);

	const COLUMNS: Readonly<Record<FieldId, Column<PreviewRow>>> = {
		name: { key: 'name', label: 'Full name', value: (r) => r.person.name },
		gender: { key: 'gender', label: 'Gender', value: (r) => r.person.gender },
		birthDate: {
			key: 'birthDate',
			label: 'Birth date',
			value: (r) => r.person.birthDate,
			mono: true
		},
		nik: { key: 'nik', label: 'NIK', value: (r) => r.person.nik, mono: true },
		npwp: { key: 'npwp', label: 'NPWP', value: (r) => r.person.npwp, mono: true },
		phone: { key: 'phone', label: 'Phone', value: (r) => r.person.phone, mono: true },
		address: { key: 'address', label: 'Address', value: (r) => r.person.address.full },
		bank: {
			key: 'bank',
			label: 'Bank account',
			value: (r) => `${r.person.bank.name} (${r.person.bank.code}) ${r.person.bank.account}`,
			cell: bank
		}
	};

	const columns = $derived.by(() => {
		if (!result) return [];
		const { fields: shown, scenario } = result.settings;
		const list: Column<PreviewRow>[] = [
			{ key: 'number', label: '#', value: (r) => String(r.number), numeric: true },
			...FIELD_IDS.filter((id) => shown.includes(id)).map((id) => COLUMNS[id])
		];
		if (scenario && NOTED.includes(scenario)) {
			list.push({ key: 'note', label: 'Note', value: (r) => r.note ?? '' });
		}
		return list;
	});

	const negative = $derived(
		result?.settings.scenario
			? PRESETS.find((p) => p.id === result!.settings.scenario)!.negative
			: false
	);
</script>

{#snippet bank(row: PreviewRow)}
	<span class="bank">{row.person.bank.name} ({row.person.bank.code})</span>
	<span class="mono">{row.person.bank.account}</span>
{/snippet}

<FormPanel aria-label="Dummy data options" onsubmit={generate}>
	<div class="grid">
		<Field
			label="Preset"
			hint={chosenPreset?.description ?? 'Sets fields and options; you can still change them.'}
		>
			{#snippet children(control)}
				<Select
					{...control}
					options={presetOptions}
					value={preset}
					data-testid="dummy-preset"
					onchange={(event) => choosePreset(event.currentTarget.value)}
				/>
			{/snippet}
		</Field>
		<Field label="Rows" hint="1 to 10,000" error={errors.count}>
			{#snippet children(control)}
				<TextInput
					{...control}
					inputmode="numeric"
					data-testid="dummy-count"
					bind:value={countText}
				/>
			{/snippet}
		</Field>
		<Field label="Seed" hint="Same seed, same rows. Leave empty for a random one.">
			{#snippet children(control)}
				<TextInput {...control} mono data-testid="dummy-seed-input" bind:value={seedText} />
			{/snippet}
		</Field>
		<Field label="Ages as of" hint="YYYY-MM-DD. Saved with the seed." error={errors.asOf}>
			{#snippet children(control)}
				<TextInput {...control} mono data-testid="dummy-as-of" bind:value={asOfText} />
			{/snippet}
		</Field>
		<Field label="Youngest age" error={errors.ages}>
			{#snippet children(control)}
				<TextInput
					{...control}
					inputmode="numeric"
					data-testid="dummy-min-age"
					bind:value={minAgeText}
				/>
			{/snippet}
		</Field>
		<Field label="Oldest age">
			{#snippet children(control)}
				<TextInput
					{...control}
					inputmode="numeric"
					aria-invalid={errors.ages ? 'true' : undefined}
					data-testid="dummy-max-age"
					bind:value={maxAgeText}
				/>
			{/snippet}
		</Field>
		<Field label="Phone format">
			{#snippet children(control)}
				<Select
					{...control}
					options={PHONE_FORMATS}
					data-testid="dummy-phone-format"
					bind:value={phoneFormat}
				/>
			{/snippet}
		</Field>
		<Field label="NPWP format">
			{#snippet children(control)}
				<Select
					{...control}
					options={NPWP_FORMATS}
					data-testid="dummy-npwp-format"
					bind:value={npwpFormat}
				/>
			{/snippet}
		</Field>
		<Field label="Identifier realism" hint="For NIK and phone numbers.">
			{#snippet children(control)}
				<Select
					{...control}
					options={REALISM_OPTIONS}
					data-testid="dummy-realism"
					bind:value={realism}
				/>
			{/snippet}
		</Field>
	</div>

	{#if realism === 'non-colliding'}
		<div class="note" data-testid="dummy-realism-note">
			<Callout variant="warning" title="Stricter validators may reject these">
				<p>
					NIKs use province code 00 and phones use the unallocated prefixes 0801 to 0803 and 0805,
					so no real person has them. A validator that checks region codes or operator prefixes may
					reject them.
				</p>
			</Callout>
		</div>
	{/if}

	<div class="fields">
		<CheckboxGroup
			legend="Fields"
			options={FIELD_OPTIONS}
			columns={2}
			error={errors.fields}
			bind:group={fields}
		/>
	</div>

	{#snippet footer()}
		<span class="summary">
			{#if Number.isInteger(settings.count) && settings.count >= 1}
				{count(settings.count)} with {settings.fields.length}
				{settings.fields.length === 1 ? 'field' : 'fields'}.
			{:else}
				Enter a row count to generate.
			{/if}
		</span>
		<Button
			type="submit"
			variant="primary"
			loading={progress !== null}
			disabled={!valid}
			data-testid="dummy-generate"
		>
			{progress ? 'Generating…' : 'Generate'}
		</Button>
	{/snippet}
</FormPanel>

<section class="output" aria-labelledby="results">
	<h2 id="results">Results</h2>

	{#if failure}
		<div class="block" data-testid="dummy-error">
			<Callout variant="danger" title="Generation failed" role="alert">
				<p>{failure}</p>
			</Callout>
		</div>
	{/if}

	{#if progress}
		<div class="block">
			<Progress
				label="Generating {count(progress.total)}…"
				value={progress.done}
				max={progress.total}
				data-testid="dummy-progress"
			/>
		</div>
	{/if}

	{#if result}
		<div class="block" data-testid="dummy-fake-note">
			<Callout variant="info">
				<p>
					Fake data for testing only. These people, NIKs, and accounts are generated and do not
					exist.
				</p>
			</Callout>
		</div>
		{#if negative}
			<div class="block" data-testid="dummy-negative-note">
				<Callout variant="warning" title="Negative-test data">
					<p>Every row is deliberately invalid. The Note column says why.</p>
				</Callout>
			</div>
		{/if}
		<dl class="run">
			<div>
				<dt>Seed</dt>
				<dd>
					<code data-testid="dummy-seed">{result.seed}</code>
					<CopyButton label="Copy seed" value={result.seed} size="sm" />
				</dd>
			</div>
			<div>
				<dt>Ages as of</dt>
				<dd><code data-testid="dummy-run-as-of">{isoDate(result.settings.asOf)}</code></dd>
			</div>
			<div>
				<dt>Generator</dt>
				<dd><code>v{GENERATOR_VERSION}</code></dd>
			</div>
		</dl>
	{/if}

	<ExportBar {result} />

	{#if result && result.rows.length > 0}
		<p class="shown" data-testid="dummy-row-count">
			{#if result.rows.length > PREVIEW_ROWS}
				Showing the first {PREVIEW_ROWS} of {count(result.rows.length)}.
			{:else}
				Showing all {count(result.rows.length)}.
			{/if}
		</p>
		<DataTable
			caption="Generated dummy data"
			{columns}
			rows={preview}
			rowKey={(row) => row.key}
			rowTestId="dummy-preview-row"
		/>
	{:else if !progress}
		<EmptyState>Choose fields and a row count, then generate.</EmptyState>
	{/if}
</section>

<p class="credit">
	Region data: <a href="https://github.com/cahyadsn/wilayah" rel="noreferrer">Cahya DSN</a>, MIT.
</p>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.note,
	.fields {
		margin-top: var(--space-6);
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

	.block {
		margin-bottom: var(--space-4);
	}

	.run {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-6);
		margin: 0 0 var(--space-4);
	}

	.run div {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	dt {
		color: var(--color-text-muted);
	}

	dd {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
	}

	code,
	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	.bank {
		display: block;
	}

	.shown {
		margin: 0 0 var(--space-3);
		color: var(--color-text-muted);
	}

	.credit {
		margin: var(--space-8) 0 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
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
