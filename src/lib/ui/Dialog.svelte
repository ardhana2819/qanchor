<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		open: boolean;
		title: string;
		/** Destructive dialogs show the title in the danger colour (design section 6). */
		destructive?: boolean;
		children: Snippet;
		/** Buttons, primary or destructive action last. */
		actions: Snippet;
	}

	let { open = $bindable(), title, destructive = false, children, actions }: Props = $props();

	const id = $props.id();
	const titleId = `${id}-title`;
	let dialog: HTMLDialogElement | undefined = $state();

	// Native modal dialog: the browser makes the rest of the page inert, closes it on Escape, and
	// on close returns focus to the element that had it before opening (design section 9).
	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// The close event is queued, so it can arrive after the dialog has already been shown again
	// (a guard that reopens on the next navigation). Only an actually closed dialog ends `open`.
	function onclose(): void {
		if (!dialog?.open) open = false;
	}
</script>

<dialog bind:this={dialog} class:destructive aria-labelledby={titleId} {onclose}>
	<h2 id={titleId}>{title}</h2>
	<div class="body">{@render children()}</div>
	<div class="actions">{@render actions()}</div>
</dialog>

<style>
	dialog {
		width: min(480px, calc(100vw - 2 * var(--space-4)));
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		box-shadow: var(--shadow-overlay);
		color: var(--color-text);
	}

	h2 {
		margin: 0;
		padding: var(--space-4) var(--space-6) 0;
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
	}

	.destructive h2 {
		color: var(--color-danger);
	}

	.body {
		padding: var(--space-2) var(--space-6) var(--space-6);
		color: var(--color-text-muted);
	}

	.body :global(p) {
		margin: 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-6);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface);
		border-radius: 0 0 var(--radius-md) var(--radius-md);
	}

	/* Dialog open / close (design 2.4): opacity and a 0.98 scale; the backdrop fades. Closing
	   keeps the dialog in the top layer for the fade where the browser supports it (overlay);
	   elsewhere it closes instantly. */
	dialog,
	dialog::backdrop {
		opacity: 0;
		transition:
			opacity var(--duration-base) var(--ease-out),
			transform var(--duration-base) var(--ease-out),
			overlay var(--duration-base) allow-discrete,
			display var(--duration-base) allow-discrete;
	}

	dialog {
		transform: scale(0.98);
	}

	dialog::backdrop {
		background: rgb(0 0 0 / 0.4);
	}

	dialog[open],
	dialog[open]::backdrop {
		opacity: 1;
		transition-duration: var(--duration-slow);
	}

	dialog[open] {
		transform: none;
	}

	@starting-style {
		dialog[open],
		dialog[open]::backdrop {
			opacity: 0;
		}

		dialog[open] {
			transform: scale(0.98);
		}
	}
</style>
