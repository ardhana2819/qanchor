<script lang="ts" module>
	export interface Column<Row> {
		key: string;
		label: string;
		value: (row: Row) => string;
		/** Monospace and on one line: addresses, hashes, amounts (design principle 3). */
		mono?: boolean;
		/** Right-aligned with tabular figures. */
		numeric?: boolean;
	}

	/** Rows staggered one by one when results arrive; later rows appear with the last of them. */
	export const STAGGERED_ROWS = 12;
</script>

<script lang="ts" generics="Row">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Names the table for screen readers (design section 9); visually hidden. */
		caption: string;
		columns: readonly Column<Row>[];
		rows: readonly Row[];
		/** Stable per result set: new keys are what make rows play the enter animation. */
		rowKey: (row: Row) => string;
		/** Last column, e.g. a copy button whose name includes the row ("Copy address 3"). */
		actions?: Snippet<[Row, number]>;
		actionsLabel?: string;
	}

	let { caption, columns, rows, rowKey, actions, actionsLabel = 'Actions' }: Props = $props();

	// Two bodies so that at most 13 elements animate, however many rows there are: each of the
	// first 12 rows on its own, then everything after them as one block (design 2.4).
	const head = $derived(rows.slice(0, STAGGERED_ROWS));
	const rest = $derived(rows.slice(STAGGERED_ROWS));
</script>

{#snippet row(item: Row, index: number, staggered: boolean)}
	<!-- --i drives the stagger delay; a style attribute is allowed by the CSP (ADR-007). -->
	<tr class:enter={staggered} style:--i={staggered ? index : undefined}>
		{#each columns as column (column.key)}
			<td class:mono={column.mono} class:numeric={column.numeric}>{column.value(item)}</td>
		{/each}
		{#if actions}<td class="actions">{@render actions(item, index)}</td>{/if}
	</tr>
{/snippet}

<!-- Scrolls on its own, so a wide or long table never makes the page scroll sideways. It is
     focusable so keyboard users can scroll it (WCAG 2.1.1, axe scrollable-region-focusable). -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="scroll" role="region" aria-label={caption} tabindex="0">
	<table>
		<caption class="visually-hidden">{caption}</caption>
		<thead>
			<tr>
				{#each columns as column (column.key)}
					<th scope="col" class:numeric={column.numeric}>{column.label}</th>
				{/each}
				{#if actions}<th scope="col"><span class="visually-hidden">{actionsLabel}</span></th>{/if}
			</tr>
		</thead>
		<tbody>
			{#each head as item, index (rowKey(item))}
				{@render row(item, index, true)}
			{/each}
		</tbody>
		{#if rest.length > 0}
			{#key rowKey(rest[0])}
				<tbody class="enter" style:--i={STAGGERED_ROWS - 1}>
					{#each rest as item, offset (rowKey(item))}
						{@render row(item, STAGGERED_ROWS + offset, false)}
					{/each}
				</tbody>
			{/key}
		{/if}
	</table>
</div>

<style>
	.scroll {
		max-height: min(70vh, 640px);
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
	}

	table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
	}

	th {
		position: sticky;
		top: 0;
		z-index: 1;
		height: 40px;
		padding: 0 var(--space-3);
		border-bottom: 1px solid var(--color-border);
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		text-align: left;
		white-space: nowrap;
	}

	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border);
		vertical-align: top;
	}

	tbody:last-child tr:last-child td {
		border-bottom: 0;
	}

	tr:hover td {
		background: var(--color-surface-raised);
	}

	.mono {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		white-space: nowrap;
	}

	.numeric {
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.actions {
		width: 1%;
		padding-block: var(--space-1);
		white-space: nowrap;
	}

	/* Results enter (design 2.4): runs once when the element is inserted. */
	.enter {
		animation: enter var(--duration-base) var(--ease-out) backwards;
		animation-delay: calc(var(--i) * var(--stagger-step));
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}
</style>
