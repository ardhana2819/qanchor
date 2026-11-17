<script lang="ts">
	import { notify } from '#lib/state/notify.svelte.ts';

	// The last toast's text stays in the element while it fades out.
	let shown = $state('');
	$effect(() => {
		if (notify.toast) shown = notify.toast;
	});
</script>

<div class="visually-hidden" aria-live="polite" aria-atomic="true">{notify.announcement}</div>

<!-- Not a live region itself: the region above already reads the message once. -->
<div
	class="toast"
	data-testid="app-toast"
	class:visible={notify.toast !== ''}
	aria-hidden={notify.toast === ''}
>
	{shown}
</div>

<style>
	/* Toast enter / leave (design 2.4): opacity and a 4 px rise. visibility switches at the end
	   of the fade, so a hidden toast cannot be reached or read. */
	.toast {
		position: fixed;
		right: var(--space-6);
		bottom: var(--space-6);
		z-index: 10;
		max-width: min(360px, calc(100vw - 2 * var(--space-4)));
		padding: var(--space-2) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface-raised);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
		font-weight: 500;
		opacity: 0;
		transform: translateY(4px);
		visibility: hidden;
		pointer-events: none;
		transition:
			opacity var(--duration-base) var(--ease-out),
			transform var(--duration-base) var(--ease-out),
			visibility 0s linear var(--duration-base);
	}

	.visible {
		opacity: 1;
		transform: none;
		visibility: visible;
		transition-delay: 0s;
	}

	@media (max-width: 639px) {
		.toast {
			right: var(--space-4);
			bottom: var(--space-4);
		}
	}
</style>
