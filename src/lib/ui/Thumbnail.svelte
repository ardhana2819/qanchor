<script lang="ts">
	import Icon from './Icon.svelte';

	interface Props {
		/** An object URL of the stored image. */
		src: string;
		/** What the image is, e.g. "Screenshot 2 of TC-12"; also names both buttons. */
		name: string;
		/** Played once when the thumbnail was just added (design 13.6), not when a list is shown. */
		added?: boolean;
		onopen: (trigger: HTMLButtonElement) => void;
		/** Left out where the image cannot be removed (a completed run). */
		onremove?: () => void;
	}

	let { src, name, added = false, onopen, onremove }: Props = $props();
</script>

<div class="thumbnail" class:added>
	<button
		type="button"
		class="open"
		aria-label="Open {name}"
		onclick={(event) => onopen(event.currentTarget)}
	>
		<img {src} alt={name} />
	</button>
	{#if onremove}
		<button
			type="button"
			class="remove"
			aria-label="Remove {name}"
			title="Remove {name}"
			onclick={onremove}
		>
			<Icon name="trash" size={14} />
		</button>
	{/if}
</div>

<style>
	.thumbnail {
		position: relative;
		width: 96px;
		height: 64px;
	}

	/* Thumbnail added (design 13.6): opacity and a 0.96 scale; instant with reduced motion. */
	.added {
		animation: added var(--duration-base) var(--ease-out);
	}

	@keyframes added {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
	}

	.open {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		cursor: zoom-in;
	}

	img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.remove {
		position: absolute;
		top: 2px;
		right: 2px;
		display: grid;
		place-items: center;
		width: 24px;
		height: 24px;
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		color: var(--color-text-subtle);
		cursor: pointer;
		transition:
			color var(--duration-fast) var(--ease-out),
			border-color var(--duration-fast) var(--ease-out);
	}

	.remove:hover {
		border-color: var(--color-danger);
		color: var(--color-danger);
	}
</style>
