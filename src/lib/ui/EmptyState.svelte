<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** One sentence that says what to do next (design section 7). */
		children: Snippet;
		action?: Snippet;
	}

	let { children, action }: Props = $props();
</script>

<div class="empty-state">
	<p>{@render children()}</p>
	{#if action}{@render action()}{/if}
</div>

<style>
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-3);
		padding: var(--space-12) var(--space-4);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
		color: var(--color-text-muted);
		text-align: center;
	}

	p {
		margin: 0;
		max-width: 48ch;
	}
</style>
