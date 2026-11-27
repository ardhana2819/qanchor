<script lang="ts">
	import { tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ScreenshotError } from '#lib/core/qa/screenshots.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import ScreenshotArea from '#lib/ui/ScreenshotArea.svelte';
	import { downloadBlob } from '#lib/ui/download.ts';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { saveErrorText } from '#lib/tools/runs/present.ts';
	import type { AddError, ShotItem } from '#lib/tools/runs/shots.svelte.ts';
	import type { FindingShots, ShotTarget } from './finding-shots.svelte.ts';

	// The screenshots of one finding, or of the one in the composer (FR-131 AC-1, FR-112), as
	// `ResultScreenshots` does for a result. The parent hands pasted files to `add` (EC-029).

	interface Props {
		shots: FindingShots;
		target: ShotTarget;
		/** Thumbnails only, e.g. a finding not being edited. */
		readonly?: boolean;
	}

	let { shots, target, readonly = false }: Props = $props();

	let wrapper: HTMLDivElement | undefined = $state();
	let error = $state.raw<AddError | null>(null);
	let note: string | null = $state(null);
	let viewing: ShotItem | undefined = $state.raw();
	let viewerOpen = $state(false);
	let removing: string | null = $state(null);
	let removeOpen = $state(false);

	const items = $derived(shots.itemsOf(target));
	const storageFull = $derived(
		error !== null && typeof error !== 'string' && error.kind === 'storage'
	);

	/** Compresses and adds files: chosen, dropped, or pasted (FR-112 AC-1). */
	export async function add(files: File[]): Promise<void> {
		if (readonly) return;
		error = null;
		note = null;
		const outcome = await shots.add(target, files);
		error = outcome.error;
		note = outcome.note;
	}

	/** A paste without an image outside a text field (design 13.7). */
	export function refuse(refusal: ScreenshotError): void {
		error = refusal;
		note = null;
	}

	/** Clears the last refusal, e.g. when the composer starts a new finding. */
	export function reset(): void {
		error = null;
		note = null;
	}

	function open(id: string): void {
		viewing = items.find((item) => item.id === id);
		viewerOpen = viewing !== undefined;
	}

	async function remove(): Promise<void> {
		const id = removing;
		removeOpen = false;
		removing = null;
		if (!id) return;
		const removed = await shots.remove(id);
		if (!removed.ok) {
			notify.showToast(WRITE_ERRORS[removed.error]);
			return;
		}
		notify.announce('Screenshot removed.');
		// Its thumbnail is gone, so focus goes to the first control left in the area.
		await tick();
		wrapper?.querySelector<HTMLElement>('[data-testid="screenshot-area"] button')?.focus();
	}
</script>

{#snippet settingsLink()}
	<a href={resolve('/settings')}>Open Settings</a>
{/snippet}

{#if !readonly || items.length > 0}
	<div bind:this={wrapper} data-testid="finding-screenshots">
		<ScreenshotArea
			{items}
			compressing={shots.compressingOf(target)}
			error={error ? saveErrorText(error) : null}
			errorAction={storageFull ? settingsLink : undefined}
			{note}
			{readonly}
			onfiles={add}
			onopen={open}
			onremove={(id) => {
				removing = id;
				removeOpen = true;
			}}
		/>
	</div>
{/if}

{#if viewing}
	{@const shown = viewing}
	<ImageViewer
		bind:open={viewerOpen}
		title={shown.name}
		src={shown.src}
		fileName={shown.fileName}
		size={shown.blob.size}
		ondownload={() => downloadBlob(shown.fileName, shown.blob)}
	/>
{/if}

{#if !readonly}
	<Dialog bind:open={removeOpen} title="Remove this screenshot?" destructive>
		<p>The image is deleted from this finding. This cannot be undone.</p>
		{#snippet actions()}
			<!-- Cancel comes first and takes focus: removing cannot be undone. -->
			<Button autofocus onclick={() => (removeOpen = false)}>Cancel</Button>
			<Button variant="danger" onclick={remove} data-testid="finding-remove-screenshot"
				>Remove</Button
			>
		{/snippet}
	</Dialog>
{/if}
