<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		tag: string;
		/** Makes the chip removable with a 24 px button named "Remove tag <tag>" (design 13.5). */
		onremove?: () => void;
	}

	let { tag, onremove }: Props = $props();
</script>

<span class="chip" class:removable={onremove}>
	{tag}
	{#if onremove}
		<button type="button" aria-label="Remove tag {tag}" title="Remove tag {tag}" onclick={onremove}>
			<Icon name="cross" size={12} />
		</button>
	{/if}
</span>

<style>
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		max-width: 100%;
		height: 24px;
		padding: 0 var(--space-2);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
		white-space: nowrap;
		overflow-wrap: anywhere;
	}

	.removable {
		padding-right: 0;
	}

	button {
		display: inline-grid;
		flex: none;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 0;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--color-text-subtle);
		cursor: pointer;
		transition:
			background-color var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out);
	}

	button:hover {
		background: var(--color-border);
		color: var(--color-text);
	}
</style>
