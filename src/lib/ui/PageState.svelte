<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** The page heading, e.g. "Test case not found". */
		title: string;
		/** One sentence on why, or what to do next. */
		children: Snippet;
		/** One link back, styled as the primary action. */
		action: Snippet;
	}

	let { title, children, action }: Props = $props();
</script>

<!-- A whole-page state: not found (S-11) and a record that does not exist (FR-090 AC-3). -->
<div class="page-state">
	<h1>{title}</h1>
	<p>{@render children()}</p>
	{@render action()}
</div>

<style>
	.page-state {
		max-width: 480px;
		margin: var(--space-12) auto 0;
		text-align: center;
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	p {
		margin: var(--space-2) 0 var(--space-4);
		color: var(--color-text-muted);
	}

	.page-state :global(a) {
		display: inline-flex;
		align-items: center;
		min-height: var(--control-md);
		padding: 0 var(--space-4);
		border-radius: var(--radius-md);
		background: var(--color-accent);
		color: var(--color-on-accent);
		font-weight: 500;
		text-decoration: none;
	}

	.page-state :global(a:hover) {
		background: var(--color-accent-hover);
	}
</style>
