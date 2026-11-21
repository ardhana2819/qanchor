<script lang="ts">
	import { countsInWords, type StatusCounts } from '#lib/core/qa/run.ts';

	let { counts }: { counts: StatusCounts } = $props();

	const SEGMENTS = ['pass', 'fail', 'blocked', 'untested'] as const;
</script>

<!-- Static (design 13.5): widths are never transitioned. The name carries the counts, and callers
     show them in words beside the bar too, so colour is never the only carrier (NFR-009). -->
<div class="results-bar" role="img" aria-label={countsInWords(counts)}>
	{#each SEGMENTS as status (status)}
		{#if counts[status] > 0}
			<span class={status} style:flex-grow={counts[status]}></span>
		{/if}
	{/each}
</div>

<style>
	.results-bar {
		display: flex;
		gap: 1px;
		width: 100%;
		height: 6px;
		overflow: hidden;
		border-radius: var(--radius-full);
		background: var(--color-surface-raised);
	}

	span {
		flex-basis: 0;
		min-width: 2px;
	}

	.pass {
		background: var(--color-success);
	}

	.fail {
		background: var(--color-danger);
	}

	.blocked {
		background: var(--color-warning);
	}

	.untested {
		background: var(--color-border);
	}
</style>
