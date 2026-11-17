<script lang="ts">
	import { itemCount, type Checklist } from '#lib/content/checklists/index.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { toMarkdown } from './checklists.ts';

	let { checklist }: { checklist: Checklist } = $props();

	function copy(): void {
		void clipboard.copy(toMarkdown(checklist), 'Copied as Markdown');
	}
</script>

<div class="toolbar">
	<span class="count">
		{itemCount(checklist)} items in {checklist.sections.length} sections
	</span>
	<Button onclick={copy} data-testid="checklists-copy-markdown">
		<Icon name="copy" />
		Copy as Markdown
	</Button>
</div>

{#each checklist.sections as section, i (section.heading)}
	<section aria-labelledby="section-{i}" data-testid="checklists-section">
		<h2 id="section-{i}">{section.heading}</h2>
		<ul>
			{#each section.items as item (item)}
				<li data-testid="checklists-item">{item}</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.count {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	section + section {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	ul {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
		list-style: none;
	}

	li {
		position: relative;
		padding: var(--space-2) 0 var(--space-2) var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	/* An empty box, as in the Markdown task list it exports to; read-only in Phase 1. */
	li::before {
		position: absolute;
		top: calc(var(--space-2) + 4px);
		left: 2px;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-border-strong);
		border-radius: 3px;
		content: '';
	}
</style>
