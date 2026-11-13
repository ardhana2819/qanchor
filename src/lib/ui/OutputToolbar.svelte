<script lang="ts">
	import {
		EXPORT_FORMATS,
		formatRecords,
		type ExportFormat,
		type ExportRecord
	} from '#lib/core/export/format.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from './Button.svelte';
	import Select from './Select.svelte';
	import { downloadText } from './download.ts';

	interface Props {
		/** Result count, e.g. "12 addresses". */
		summary: string;
		/** Every row, not only the ones on screen (FR-004 AC-2). */
		records: readonly ExportRecord[];
		/** Keys to export, in column order. */
		fields: readonly string[];
		/** File name without extension, e.g. "addresses-evm". */
		filename: string;
	}

	let { summary, records, fields, filename }: Props = $props();

	let format: ExportFormat = $state('csv');
	// Disabled until there is output (FR-012 AC-2, FR-083 AC-5).
	const empty = $derived(records.length === 0);
	const mime = $derived(EXPORT_FORMATS.find((f) => f.value === format)!.mime);

	function copyAll(): void {
		void clipboard.copy(formatRecords(format, records, fields));
	}

	function download(): void {
		downloadText(`${filename}.${format}`, formatRecords(format, records, fields), mime);
	}
</script>

<div class="toolbar">
	<p class="summary">{summary}</p>
	<div class="actions">
		<Button size="sm" disabled={empty} onclick={copyAll}>Copy all</Button>
		<span class="format">
			<Select
				aria-label="Export format"
				options={EXPORT_FORMATS}
				disabled={empty}
				bind:value={format}
			/>
		</span>
		<Button size="sm" disabled={empty} onclick={download}>Download</Button>
	</div>
</div>

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2) var(--space-4);
		margin-bottom: var(--space-3);
	}

	.summary {
		margin: 0;
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.format {
		width: 96px;
	}

	.format :global(select) {
		height: var(--control-sm);
		font-size: var(--text-xs);
	}
</style>
