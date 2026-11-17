<script lang="ts">
	import { resolve } from '$app/paths';
	import { CHECKLISTS, itemCount } from '#lib/content/checklists/index.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import Highlight from './Highlight.svelte';
	import { filterChecklists } from './checklists.ts';

	let filter = $state('');
	let filterBox: HTMLDivElement | undefined = $state();

	// The Clear button disappears with the empty state, so focus goes back to the filter.
	function clear(): void {
		filter = '';
		filterBox?.querySelector('input')?.focus();
	}

	const matches = $derived(filterChecklists(CHECKLISTS, filter));
	const filtering = $derived(filter.trim() !== '');
	const itemTotal = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;

	// The result count is read out while filtering, through the shell's one live region.
	$effect(() => {
		if (!filtering) return;
		const n = matches.length;
		notify.announce(
			n === 0 ? 'No matches' : `${n} ${n === 1 ? 'checklist matches' : 'checklists match'}`
		);
	});
</script>

<div class="filter" bind:this={filterBox}>
	<Field label="Filter" hint="Matches checklist titles, summaries, headings, and items.">
		{#snippet children(control)}
			<TextInput {...control} bind:value={filter} data-testid="checklists-filter" />
		{/snippet}
	</Field>
</div>

{#if matches.length === 0}
	<div data-testid="checklists-empty">
		<EmptyState>
			No checklist or item contains "{filter.trim()}".
			{#snippet action()}
				<Button variant="ghost" size="sm" onclick={clear}>Clear filter</Button>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<ul class="list" aria-label="Checklists">
		{#each matches as { checklist, items } (checklist.slug)}
			<li data-testid="checklists-row">
				<div class="row-head">
					<a href={resolve('/checklists/[slug]', { slug: checklist.slug })}>
						<Highlight text={checklist.title} {filter} />
					</a>
					<span class="count">
						{#if items}
							{items.length} of {itemTotal(itemCount(checklist))}
						{:else}
							{itemTotal(itemCount(checklist))}
						{/if}
					</span>
				</div>
				<p class="summary"><Highlight text={checklist.summary} {filter} /></p>
				{#if items}
					<ul class="items" aria-label="Matching items in {checklist.title}">
						{#each items as { heading, item } (item)}
							<li>
								<span class="heading"><Highlight text={heading} {filter} /></span>
								<Highlight text={item} {filter} />
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
{/if}

{#if filtering && matches.length > 0}
	<p class="tally">
		Showing {matches.length} of {CHECKLISTS.length} checklists.
	</p>
{/if}

<style>
	.filter {
		max-width: 28rem;
		margin-bottom: var(--space-6);
	}

	.list {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
		list-style: none;
	}

	.list > li {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.row-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-4);
	}

	a {
		color: var(--color-accent);
		font-size: var(--text-md);
		font-weight: 500;
		text-decoration: none;
	}

	a:hover {
		text-decoration: underline;
	}

	.count,
	.tally {
		flex-shrink: 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.summary {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: var(--space-2) 0 0;
		padding: 0 0 0 var(--space-3);
		border-left: 2px solid var(--color-border);
		list-style: none;
	}

	.heading {
		display: block;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
	}

	.tally {
		margin: var(--space-3) 0 0;
	}
</style>
