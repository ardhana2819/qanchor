<script lang="ts">
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
</script>

<Dialog
	bind:open={() => clipboard.failed, (next) => (next ? undefined : clipboard.dismiss())}
	title="Could not copy"
>
	<p>Select the value and copy it manually.</p>
	<!-- svelte-ignore a11y_autofocus -->
	<textarea
		aria-label="Value to copy"
		readonly
		autofocus
		rows={Math.min(8, clipboard.value.split('\n').length)}
		value={clipboard.value}
		onfocus={(event) => event.currentTarget.select()}></textarea>
	{#snippet actions()}
		<Button onclick={() => clipboard.dismiss()}>Close</Button>
	{/snippet}
</Dialog>

<style>
	textarea {
		width: 100%;
		margin-top: var(--space-3);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-surface);
		color: var(--color-text);
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		line-height: var(--leading-mono);
		resize: vertical;
		white-space: pre;
	}
</style>
