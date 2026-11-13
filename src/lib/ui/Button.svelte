<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md';
		/** Disables the button and sets aria-busy; the caller changes the label ("Generating…"). */
		loading?: boolean;
		children: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		loading = false,
		disabled = false,
		type = 'button',
		children,
		...rest
	}: Props = $props();
</script>

<button
	{...rest}
	{type}
	class="button {variant} {size}"
	disabled={disabled || loading}
	aria-busy={loading || undefined}
>
	{@render children()}
</button>

<style>
	.button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: var(--control-md);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text);
		font: 500 var(--text-sm) / 1 var(--font-sans);
		white-space: nowrap;
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-out),
			border-color var(--duration-fast) var(--ease-out),
			transform var(--duration-fast) var(--ease-out);
	}

	.sm {
		height: var(--control-sm);
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
	}

	.button:hover:not(:disabled) {
		background: var(--color-surface-raised);
	}

	/* Button press (design 2.4): tactile acknowledgement, compositor-only. */
	.button:active:not(:disabled) {
		transform: scale(0.97);
	}

	.primary {
		padding: 0 var(--space-4);
		border-color: var(--color-accent);
		background: var(--color-accent);
		color: var(--color-on-accent);
		box-shadow: var(--shadow-button);
	}

	.primary:hover:not(:disabled) {
		border-color: var(--color-accent-hover);
		background: var(--color-accent-hover);
	}

	.ghost {
		border-color: transparent;
		background: transparent;
		color: var(--color-text-muted);
	}

	.ghost:hover:not(:disabled) {
		color: var(--color-text);
	}

	.danger {
		border-color: var(--color-danger);
		color: var(--color-danger);
	}

	.danger:hover:not(:disabled) {
		background: var(--color-danger-bg);
	}

	.button:disabled {
		border-color: var(--color-border);
		background: var(--color-surface-raised);
		box-shadow: none;
		color: var(--color-text-subtle);
		cursor: not-allowed;
	}

	.button[aria-busy='true'] {
		cursor: progress;
	}
</style>
