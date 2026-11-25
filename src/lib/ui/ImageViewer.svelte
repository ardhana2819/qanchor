<script lang="ts">
	import { formatSize } from '#lib/core/qa/screenshots.ts';
	import Button from './Button.svelte';
	import Dialog from './Dialog.svelte';
	import Icon from './Icon.svelte';

	// Image viewer (design 13.5, FR-112 AC-3): the full image in a dialog. Escape and Close close
	// it, and the dialog returns focus to the thumbnail that opened it.

	interface Props {
		open: boolean;
		/** e.g. "Screenshot 2 of TC-12": the title and the image's alt text. */
		title: string;
		/** An object URL of the stored image. */
		src: string;
		/** The attachment file name (FR-122), shown below the image with the size. */
		fileName: string;
		size: number;
		ondownload: () => void;
	}

	let { open = $bindable(), title, src, fileName, size, ondownload }: Props = $props();
</script>

<Dialog bind:open {title} wide>
	<img {src} alt={title} />
	<p class="meta"><span class="file-name">{fileName}</span> · {formatSize(size)}</p>
	{#snippet actions()}
		<Button onclick={ondownload}><Icon name="download" />Download</Button>
		<Button variant="primary" onclick={() => (open = false)}>Close</Button>
	{/snippet}
</Dialog>

<style>
	img {
		display: block;
		max-width: min(90vw - 2 * var(--space-6), 1920px);
		max-height: 70vh;
		margin: 0 auto;
		border: 1px solid var(--color-border);
	}

	.meta {
		margin-top: var(--space-2);
		font-size: var(--text-xs);
	}

	.file-name {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}
</style>
