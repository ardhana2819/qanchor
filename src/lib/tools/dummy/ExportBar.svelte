<script lang="ts">
	import { toCsv, toJson } from '#lib/core/export/format.ts';
	import { parseTableName, SQL_DIALECTS, toSql, type SqlDialect } from '#lib/core/export/sql.ts';
	import { dummyExport, exportBaseName, runInfoLines } from '#lib/core/dummy/records.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { downloadText } from '#lib/ui/download.ts';
	import type { DummyResult } from './form.ts';

	// Export controls for dummy data (FR-083, design S-09). Every row is exported, not only the
	// preview; the text is built when the user copies or downloads, not when rows arrive.

	interface Props {
		result: DummyResult | null;
	}

	let { result }: Props = $props();

	type Format = 'csv' | 'json' | 'sql';
	const FORMATS: readonly { value: Format; label: string; mime: string }[] = [
		{ value: 'csv', label: 'CSV', mime: 'text/csv' },
		{ value: 'json', label: 'JSON', mime: 'application/json' },
		{ value: 'sql', label: 'SQL', mime: 'application/sql' }
	];

	const TABLE_ERRORS = {
		empty: 'Enter a table name.',
		characters: 'Use letters, digits, and underscore only.',
		'too-long': 'Use at most 63 characters.'
	} as const;

	let format = $state<Format>('csv');
	let tableText = $state('people');
	let dialect = $state<SqlDialect>('postgresql');

	const table = $derived(parseTableName(tableText));
	const tableError = $derived(table.ok ? undefined : TABLE_ERRORS[table.error]);
	// Disabled until there are rows (FR-083 AC-5); SQL also needs a valid table name (AC-4).
	const empty = $derived(result === null || result.rows.length === 0);
	const blocked = $derived(empty || (format === 'sql' && !table.ok));

	function render(current: DummyResult): string {
		const { settings, rows, seed } = current;
		const { columns, records } = dummyExport(rows, settings.fields, settings.scenario);
		if (format === 'csv') return toCsv(records, columns);
		if (format === 'json') return toJson(records, columns);
		return toSql(records, columns, {
			table: table.ok ? table.value : '',
			dialect,
			comments: runInfoLines({ seed, asOf: settings.asOf })
		});
	}

	function copyAll(): void {
		if (result && !blocked) void clipboard.copy(render(result));
	}

	function download(): void {
		if (!result || blocked) return;
		const { mime } = FORMATS.find((f) => f.value === format)!;
		downloadText(`${exportBaseName(result.seed)}.${format}`, render(result), mime);
	}
</script>

<div class="bar">
	<div class="choices">
		<Field label="Export format">
			{#snippet children(control)}
				<Select
					{...control}
					options={FORMATS}
					disabled={empty}
					data-testid="dummy-export-format"
					bind:value={format}
				/>
			{/snippet}
		</Field>
		{#if format === 'sql'}
			<Field label="Table name" hint="Letters, digits, and underscore." error={tableError}>
				{#snippet children(control)}
					<TextInput
						{...control}
						mono
						disabled={empty}
						data-testid="dummy-table-name"
						bind:value={tableText}
					/>
				{/snippet}
			</Field>
			<Field label="SQL quoting">
				{#snippet children(control)}
					<Select
						{...control}
						options={SQL_DIALECTS}
						disabled={empty}
						data-testid="dummy-sql-dialect"
						bind:value={dialect}
					/>
				{/snippet}
			</Field>
		{/if}
	</div>
	<div class="actions">
		<Button size="sm" disabled={blocked} onclick={copyAll} data-testid="dummy-copy-all">
			Copy all
		</Button>
		<Button size="sm" disabled={blocked} onclick={download} data-testid="dummy-download">
			Download
		</Button>
	</div>
</div>

<style>
	.bar {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: var(--space-3) var(--space-4);
		margin-bottom: var(--space-4);
	}

	.choices {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-3);
	}

	.choices > :global(*) {
		width: 180px;
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		/* Lines the buttons up with the controls, not with a hint or error below them. */
		padding-bottom: 2px;
	}
</style>
