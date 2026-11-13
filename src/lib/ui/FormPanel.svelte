<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLFormAttributes } from 'svelte/elements';

	interface Props extends HTMLFormAttributes {
		children: Snippet;
		/** Row with the summary on the left and the single primary button on the right. */
		footer?: Snippet;
	}

	let { children, footer, ...rest }: Props = $props();
</script>

<!-- Form panel (design 5, v0.4): the only raised surface on a tool page besides the primary button. -->
<form {...rest} class="panel" novalidate>
	<div class="content">{@render children()}</div>
	{#if footer}<div class="footer">{@render footer()}</div>{/if}
</form>

<style>
	.panel {
		position: relative;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
		box-shadow: var(--shadow-panel);
	}

	/* Panel focus (design 2.4): the halo is a pseudo-element whose opacity fades, so the shadow
	   itself is never animated. It adds context; each control keeps its own focus ring. */
	.panel::after {
		content: '';
		position: absolute;
		inset: -1px;
		border-radius: inherit;
		box-shadow: 0 0 0 3px var(--color-focus-glow);
		opacity: 0;
		pointer-events: none;
		transition: opacity var(--duration-base) var(--ease-out);
	}

	.panel:focus-within::after {
		opacity: 1;
	}

	.content {
		padding: var(--space-4);
	}

	.footer {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-top: 1px solid var(--color-border);
	}
</style>
