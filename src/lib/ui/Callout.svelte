<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	type Variant = 'info' | 'warning' | 'danger';

	interface Props {
		variant: Variant;
		title?: string;
		/**
		 * "alert" for errors the user must notice now, so screen readers announce them (design
		 * section 9). Leave unset for notes that are part of the page.
		 */
		role?: 'alert';
		children: Snippet;
		/** Optional action, e.g. a Retry button. */
		action?: Snippet;
	}

	let { variant, title, role, children, action }: Props = $props();

	const ICONS: Record<Variant, IconName> = { info: 'info', warning: 'warning', danger: 'warning' };
</script>

<div class="callout {variant}" {role} tabindex="-1">
	<span class="icon"><Icon name={ICONS[variant]} /></span>
	<div class="body">
		{#if title}<p class="title">{title}</p>{/if}
		<div class="text">{@render children()}</div>
	</div>
	{#if action}<div class="action">{@render action()}</div>{/if}
</div>

<style>
	.callout {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3) var(--space-4);
		border: 1px solid;
		border-radius: var(--radius-md);
		color: var(--color-text);
	}

	/* Focus is moved here after an error (FR-042 AC-6); the ring comes from :focus-visible. */
	.callout:focus {
		outline: none;
	}

	.callout:focus-visible {
		outline: 2px solid var(--color-accent);
	}

	.icon {
		display: flex;
		padding-top: 3px;
	}

	.body {
		flex: 1;
		min-width: 0;
	}

	.title {
		margin: 0;
		font-weight: 600;
	}

	.text :global(p) {
		margin: 0;
	}

	.action {
		flex: none;
	}

	.info {
		border-color: var(--color-info);
		background: var(--color-info-bg);
	}

	.info .icon {
		color: var(--color-info);
	}

	.warning {
		border-color: var(--color-warning);
		background: var(--color-warning-bg);
	}

	.warning .icon {
		color: var(--color-warning);
	}

	.danger {
		border-color: var(--color-danger);
		background: var(--color-danger-bg);
	}

	.danger .icon {
		color: var(--color-danger);
	}
</style>
