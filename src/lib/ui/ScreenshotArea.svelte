<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { SCREENSHOTS_MAX } from '#lib/core/qa/screenshots.ts';
	import Icon from './Icon.svelte';
	import Thumbnail from './Thumbnail.svelte';

	// Screenshot area (design 13.5, FR-112 AC-1, AC-3): thumbnails, placeholders while images
	// compress, and a drop target that is also the button to choose files. It shows what it is
	// given; compressing, storing, and paste handling belong to the page that uses it (T-063).

	export interface ScreenshotItem {
		id: string;
		/** An object URL of the stored image. */
		src: string;
		/** e.g. "Screenshot 2 of TC-12": the image's alt text and its buttons' names. */
		name: string;
	}

	interface Props {
		items: readonly ScreenshotItem[];
		/** Images being compressed, each shown as a placeholder (FR-112 AC-2). */
		compressing?: number;
		/** The reason the last image was not added (design 13.7). */
		error?: string | null;
		/** Follows the error, e.g. a link to Settings when storage is full. */
		errorAction?: Snippet;
		/** Said about an image that was added, e.g. a GIF kept its first frame (EC-030). */
		note?: string | null;
		/** A completed run: thumbnails open, nothing can be added or removed. */
		readonly?: boolean;
		onfiles: (files: File[]) => void;
		onopen: (id: string, trigger: HTMLButtonElement) => void;
		onremove: (id: string) => void;
	}

	let {
		items,
		compressing = 0,
		error = null,
		errorAction,
		note = null,
		readonly = false,
		onfiles,
		onopen,
		onremove
	}: Props = $props();

	const id = $props.id();
	let input: HTMLInputElement | undefined = $state();
	let over = $state(false);
	// Only thumbnails added after the area was shown play the added transition (design 13.6).
	const shown = untrack(() => new Set(items.map((item) => item.id)));
	const full = $derived(items.length + compressing >= SCREENSHOTS_MAX);

	function chosen(event: Event & { currentTarget: HTMLInputElement }): void {
		const files = [...(event.currentTarget.files ?? [])];
		// Cleared so choosing the same file again still fires a change.
		event.currentTarget.value = '';
		if (files.length) onfiles(files);
	}

	function dragover(event: DragEvent): void {
		if (readonly || full) return;
		event.preventDefault();
		over = true;
	}

	function drop(event: DragEvent): void {
		over = false;
		if (readonly || full) return;
		event.preventDefault();
		const files = [...(event.dataTransfer?.files ?? [])];
		if (files.length) onfiles(files);
	}
</script>

<div
	class="area"
	role="group"
	aria-labelledby="{id}-label"
	ondragover={dragover}
	ondragleave={() => (over = false)}
	ondrop={drop}
	data-testid="screenshot-area"
>
	<span class="label" id="{id}-label">
		Screenshots {#if !readonly}<span class="optional">optional, up to {SCREENSHOTS_MAX}</span>{/if}
	</span>
	<div class="items">
		{#each items as item (item.id)}
			<Thumbnail
				src={item.src}
				name={item.name}
				added={!shown.has(item.id)}
				onopen={(trigger) => onopen(item.id, trigger)}
				onremove={readonly ? undefined : () => onremove(item.id)}
			/>
		{/each}
		{#each { length: compressing }}
			<div class="placeholder">Compressing…</div>
		{/each}
		{#if readonly}
			{#if items.length === 0}<p class="note">No screenshots.</p>{/if}
		{:else if full}
			<p class="note" data-testid="screenshot-limit">
				{SCREENSHOTS_MAX} of {SCREENSHOTS_MAX} screenshots
			</p>
		{:else}
			<button type="button" class="target" class:over onclick={() => input?.click()}>
				<Icon name="image" />Paste, drop, or choose an image
			</button>
		{/if}
	</div>
	{#if error}
		<p class="error" role="alert">
			<Icon name="warning" size={14} />{error}{#if errorAction}{@render errorAction()}{/if}
		</p>
	{/if}
	{#if note}
		<p class="added-note" data-testid="screenshot-note">{note}</p>
	{/if}
	{#if !readonly}
		<input
			bind:this={input}
			class="visually-hidden"
			type="file"
			accept="image/*"
			multiple
			tabindex="-1"
			aria-label="Screenshot files"
			onchange={chosen}
		/>
	{/if}
</div>

<style>
	.area {
		display: grid;
		gap: var(--space-2);
	}

	.label {
		color: var(--color-text);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.optional {
		color: var(--color-text-subtle);
		font-weight: 400;
	}

	.items {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.target {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		min-width: 220px;
		height: 64px;
		padding: 0 var(--space-4);
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-bg);
		color: var(--color-text-muted);
		font: 500 var(--text-xs) var(--font-sans);
		cursor: pointer;
		transition:
			border-color var(--duration-fast) var(--ease-out),
			color var(--duration-fast) var(--ease-out);
	}

	.target:hover,
	.target.over {
		border-color: var(--color-accent);
		color: var(--color-accent);
	}

	.placeholder {
		display: grid;
		place-items: center;
		width: 96px;
		height: 64px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-surface-raised);
		color: var(--color-text-muted);
		font-size: 0.75rem;
	}

	.note {
		display: flex;
		align-items: center;
		height: 64px;
		margin: 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
	}

	.added-note {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.error {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		color: var(--color-danger);
	}
</style>
