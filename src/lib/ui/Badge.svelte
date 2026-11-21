<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	/** `subtle`: neutral with subtle text, for the lowest priority (design 13.5). */
	type Variant = 'success' | 'danger' | 'warning' | 'neutral' | 'subtle';

	interface Props {
		variant: Variant;
		/** Replaces the variant's status icon; `null` shows the text alone (priority badges). */
		icon?: IconName | null;
		/** The status in words (Valid, Invalid, Risky, Pending, Failed): colour is never the only cue. */
		children: Snippet;
	}

	let { variant, icon, children }: Props = $props();

	const ICONS: Record<Variant, IconName> = {
		success: 'check',
		danger: 'cross',
		warning: 'warning',
		neutral: 'dot',
		subtle: 'dot'
	};
	const shown = $derived(icon === undefined ? ICONS[variant] : icon);
</script>

<span class="badge {variant}"
	>{#if shown}<Icon name={shown} size={14} />{/if}{@render children()}</span
>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 24px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
		white-space: nowrap;
	}

	.success {
		background: var(--color-success-bg);
		color: var(--color-success);
	}

	.danger {
		background: var(--color-danger-bg);
		color: var(--color-danger);
	}

	.warning {
		background: var(--color-warning-bg);
		color: var(--color-warning);
	}

	.neutral,
	.subtle {
		background: var(--color-surface-raised);
		color: var(--color-text-muted);
	}

	.subtle {
		color: var(--color-text-subtle);
	}
</style>
