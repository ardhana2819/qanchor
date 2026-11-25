<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ScreenshotError } from '#lib/core/qa/screenshots.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import ScreenshotArea from '#lib/ui/ScreenshotArea.svelte';
	import { downloadBlob } from '#lib/ui/download.ts';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { saveErrorText } from './present.ts';
	import type { AddError, RunShots, ShotItem } from './shots.svelte.ts';

	// The screenshots of one case's result (design 13.3 P2-04 item 3, 13.5; FR-112). The result
	// panel hands pasted files to `add` (EC-029); choosing and dropping go through the area.

	interface Props {
		shots: RunShots;
		runId: string;
		caseNumber: number;
		/** A completed run: open and download only. */
		readonly: boolean;
	}

	let { shots, runId, caseNumber, readonly }: Props = $props();

	let wrapper: HTMLDivElement | undefined = $state();
	let error = $state.raw<AddError | null>(null);
	let note: string | null = $state(null);
	let readFailed = $state(false);
	let viewing: ShotItem | undefined = $state.raw();
	let viewerOpen = $state(false);
	let removing: string | null = $state(null);
	let removeOpen = $state(false);

	const items = $derived(shots.itemsOf(runId, caseNumber));
	// Shown once the stored images are read, so they appear together and do not play the
	// thumbnail-added transition (T-062).
	const ready = $derived(readFailed || shots.isOpen(runId, caseNumber));
	const storageFull = $derived(
		error !== null && typeof error !== 'string' && error.kind === 'storage'
	);

	onMount(async () => {
		const opened = await shots.open(runId, caseNumber);
		if (opened.ok) return;
		readFailed = true;
		error = opened.error;
	});

	/** Compresses and adds files: chosen, dropped, or pasted (FR-112 AC-1). */
	export async function add(files: File[]): Promise<void> {
		if (readonly) return;
		error = null;
		note = null;
		const outcome = await shots.add(runId, caseNumber, files);
		error = outcome.error;
		note = outcome.note;
	}

	/** A paste without an image outside a text field (design 13.7). */
	export function refuse(refusal: ScreenshotError): void {
		error = refusal;
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
		const removed = await shots.remove(caseNumber, id);
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

<div bind:this={wrapper} data-testid="run-screenshots">
	{#if ready}
		<ScreenshotArea
			{items}
			compressing={shots.compressingOf(caseNumber)}
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
	{/if}
</div>

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

<Dialog bind:open={removeOpen} title="Remove this screenshot?" destructive>
	<p>The image is deleted from this result. This cannot be undone.</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: removing cannot be undone. -->
		<Button autofocus onclick={() => (removeOpen = false)}>Cancel</Button>
		<Button variant="danger" onclick={remove} data-testid="run-remove-screenshot">Remove</Button>
	{/snippet}
</Dialog>
