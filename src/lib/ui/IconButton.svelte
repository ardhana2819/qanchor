<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends Omit<HTMLButtonAttributes, 'aria-label'> {
		/** Accessible name; include the object, e.g. "Copy address 3" (design section 9). */
		label: string;
		outline?: boolean;
		size?: 'sm' | 'md';
		children: Snippet;
	}

	let { label, outline = false, size = 'md', type = 'button', children, ...rest }: Props = $props();
</script>

<button {...rest} {type} class="icon-button {size}" class:outline aria-label={label} title={label}>
	{@render children()}
</button>

<style>
	.icon-button {
		display: inline-grid;
		place-items: center;
		width: var(--control-md);
		height: var(--control-md);
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-subtle);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out),
			transform var(--duration-fast) var(--ease-out);
	}

	.sm {
		width: var(--control-sm);
		height: var(--control-sm);
	}

	.outline {
		border-color: var(--color-border-strong);
		background: var(--color-bg);
	}

	.icon-button:hover:not(:disabled) {
		background: var(--color-surface-raised);
		color: var(--color-text);
	}

	.icon-button:active:not(:disabled) {
		transform: scale(0.97);
	}

	.icon-button:disabled {
		color: var(--color-text-subtle);
		opacity: 0.6;
		cursor: not-allowed;
	}
</style>
