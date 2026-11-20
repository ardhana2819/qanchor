<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Status text on the left, e.g. "Unsaved changes" or "40 selected". */
		status?: Snippet;
		/** Buttons on the right, the primary action last. */
		actions: Snippet;
	}

	let { status, actions }: Props = $props();
</script>

<!-- Sticks to the viewport bottom only while the form above is taller than the screen
     (design 13.5); otherwise it sits right after the form. -->
<div class="footer-bar">
	<div class="status">
		{#if status}{@render status()}{/if}
	</div>
	<div class="actions">{@render actions()}</div>
</div>

<style>
	.footer-bar {
		position: sticky;
		bottom: 0;
		z-index: 1;
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin-top: var(--space-6);
		padding: var(--space-3) 0;
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	.status {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		margin-left: auto;
	}
</style>
