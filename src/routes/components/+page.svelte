<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import OutputToolbar from '#lib/ui/OutputToolbar.svelte';
	import { notify } from '#lib/state/notify.svelte.ts';
	import type { StatusCounts } from '#lib/core/qa/run.ts';
	import { PRIORITIES, type ResultStatus } from '#lib/core/qa/types.ts';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FooterBar from '#lib/ui/FooterBar.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import IconButton from '#lib/ui/IconButton.svelte';
	import PageState from '#lib/ui/PageState.svelte';
	import PriorityBadge from '#lib/ui/PriorityBadge.svelte';
	import ResultControl from '#lib/ui/ResultControl.svelte';
	import ResultsBar from '#lib/ui/ResultsBar.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import TagChip from '#lib/ui/TagChip.svelte';
	import TagInput from '#lib/ui/TagInput.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import {
		attachmentName,
		checkCount,
		formatSize,
		screenshotErrorText,
		SCREENSHOTS_MAX,
		type ScreenshotType
	} from '#lib/core/qa/screenshots.ts';
	import ImageViewer from '#lib/ui/ImageViewer.svelte';
	import ScreenshotArea, { type ScreenshotItem } from '#lib/ui/ScreenshotArea.svelte';
	import { downloadBlob } from '#lib/ui/download.ts';
	import { createImageJobs } from '#lib/workers/image-jobs.ts';

	// A living reference for docs/design.md section 6 and the page the component E2E tests run
	// against (T-008). It is not listed in the navigation.

	const chains = [
		{ value: 'evm', label: 'EVM' },
		{ value: 'bitcoin', label: 'Bitcoin' },
		{ value: 'solana', label: 'Solana' },
		{ value: 'tron', label: 'Tron' }
	];
	const variants = [
		{ value: 'checksum', label: 'Wrong checksum' },
		{ value: 'length', label: 'Wrong length' },
		{ value: 'network', label: 'Wrong network prefix' },
		{ value: 'lookalike', label: 'Look-alike from another chain' },
		{ value: 'whitespace', label: 'Leading whitespace', disabled: true }
	];
	const families = [
		{ value: 'ether', label: 'Ether' },
		{ value: 'btc', label: 'BTC' },
		{ value: 'sol', label: 'SOL' },
		{ value: 'trx', label: 'TRX' }
	] as const;
	const modes = [
		{ id: 'generate', label: 'Generate' },
		{ id: 'validate', label: 'Validate' }
	] as const;

	let chain = $state('evm');
	let count = $state('12');
	let fee = $state('');
	let notes = $state('');
	let selectedVariants = $state(['checksum']);
	let family: (typeof families)[number]['value'] = $state('ether');
	let mode: (typeof modes)[number]['id'] = $state('generate');
	let generating = $state(false);

	// Slice 2a primitives (T-051).
	let result: ResultStatus | null = $state(null);
	let tags = $state(['deposit', 'smoke']);
	const knownTags = ['deposit', 'smoke', 'tron', 'usdt', 'withdrawal'];
	const runCounts: StatusCounts = { pass: 18, fail: 3, blocked: 2, untested: 17, total: 40 };
	const freshCounts: StatusCounts = { pass: 0, fail: 0, blocked: 0, untested: 5, total: 5 };

	interface ExampleRow {
		id: string;
		index: number;
		address: string;
		variant: string;
	}

	const columns: Column<ExampleRow>[] = [
		{ key: 'index', label: '#', value: (row) => String(row.index), numeric: true },
		{ key: 'address', label: 'Address', value: (row) => row.address, mono: true },
		{ key: 'variant', label: 'Variant', value: (row) => row.variant }
	];
	let rows: ExampleRow[] = $state([]);
	// A fixed example value for the stand-alone copy button.
	const exampleHash = '0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060';
	let run = 0;
	let detail: ExampleRow | undefined = $state();
	let detailOpen = $state(false);
	let deleteOpen = $state(false);

	// Random hex that looks like an EVM address. Display data only: not a key, not derived from one.
	function exampleRows(total: number): ExampleRow[] {
		run += 1;
		const labels = variants.filter((v) => selectedVariants.includes(v.value)).map((v) => v.label);
		return Array.from({ length: total }, (_, i) => {
			const bytes = crypto.getRandomValues(new Uint8Array(20));
			const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
			return {
				id: `${run}-${i}`,
				index: i + 1,
				address: `0x${hex}`,
				variant: labels[i % labels.length]
			};
		});
	}

	function showDetail(row: ExampleRow): void {
		detail = row;
		detailOpen = true;
	}

	const countError = $derived(
		/^\d+$/.test(count) && Number(count) >= 1 && Number(count) <= 500
			? undefined
			: 'Enter a whole number from 1 to 500.'
	);
	const variantError = $derived(
		selectedVariants.length === 0 ? 'Select at least one variant.' : undefined
	);

	// Shows the loading state long enough to see; real tools end it when their work finishes.
	let timer: ReturnType<typeof setTimeout> | undefined;
	function generate(): void {
		if (countError || variantError) return;
		generating = true;
		timer = setTimeout(() => {
			generating = false;
			rows = exampleRows(Number(count));
			notify.announce(`${rows.length} ${rows.length === 1 ? 'row' : 'rows'} generated`);
		}, 1200);
	}
	onDestroy(() => clearTimeout(timer));

	// The image worker's test bed (T-059): the result is shown as text, so `image-worker.spec.ts`
	// can read each output and refusal in every browser.
	const images = createImageJobs();
	onDestroy(() => images.dispose());
	let compressing = $state(false);
	let compressed = $state('');

	async function compressChosen(event: Event & { currentTarget: HTMLInputElement }) {
		const file = event.currentTarget.files?.[0];
		event.currentTarget.value = '';
		if (!file) return;
		compressing = true;
		try {
			const result = await images.compress(file, file.name);
			if (!result.ok) compressed = screenshotErrorText(result.error);
			else {
				const { type, width, height, bytes, firstFrameOnly } = result.value;
				compressed =
					`${type} · ${width} × ${height} · ${formatSize(bytes.byteLength)}` +
					(firstFrameOnly ? ' · first frame only' : '');
			}
		} catch (error) {
			compressed = error instanceof Error ? error.message : String(error);
		} finally {
			compressing = false;
		}
	}

	// Screenshot area and image viewer (T-062, design 13.5). Sample images are drawn here, so
	// the page needs no image files; each is shown through an object URL, as stored screenshots
	// will be (plan finding F-13).
	interface Shot extends ScreenshotItem {
		blob: Blob;
		n: number;
	}

	const urls: string[] = [];
	let samples: Shot[] = $state.raw([]);
	let shots: Shot[] = $state.raw([]);
	let shotsCompressing = $state(0);
	let shotError: string | null = $state(null);
	let nextShot = 1;
	let viewing: Shot | undefined = $state.raw();
	let viewerOpen = $state(false);
	let removing: Shot | undefined = $state.raw();
	let removeOpen = $state(false);

	function shot(blob: Blob, n: number): Shot {
		const src = URL.createObjectURL(blob);
		urls.push(src);
		return { id: `shot-${n}`, src, name: `Screenshot ${n} of TC-12`, blob, n };
	}

	/** A 640 × 400 sample in one of the accent colours, numbered so the thumbnails differ. */
	async function sample(n: number): Promise<Blob> {
		const canvas = new OffscreenCanvas(640, 400);
		const context = canvas.getContext('2d');
		if (!context) throw new Error('This browser gives no 2D canvas.');
		context.fillStyle = ['#0f766e', '#1d4ed8', '#b45309', '#7c3aed', '#be123c'][(n - 1) % 5];
		context.fillRect(0, 0, 640, 400);
		context.fillStyle = '#ffffff';
		context.font = '600 96px sans-serif';
		context.fillText(`#${n}`, 48, 140);
		return canvas.convertToBlob({ type: 'image/jpeg', quality: 0.8 });
	}

	onMount(async () => {
		const blobs = await Promise.all([1, 2, 3, 4, 5].map(sample));
		samples = blobs.map((blob, i) => shot(blob, i + 1));
		shots = samples.slice(0, 2);
		nextShot = 3;
	});
	onDestroy(() => urls.forEach((url) => URL.revokeObjectURL(url)));

	async function addShots(files: File[]): Promise<void> {
		shotError = null;
		for (const file of files) {
			const refused = checkCount(shots.length + shotsCompressing);
			if (refused) {
				shotError = screenshotErrorText(refused);
				return;
			}
			shotsCompressing += 1;
			try {
				const result = await images.compress(file, file.name);
				if (!result.ok) shotError = screenshotErrorText(result.error);
				else {
					const { bytes, type } = result.value;
					shots = [...shots, shot(new Blob([bytes], { type }), nextShot++)];
					notify.announce(`Screenshot added, ${shots.length} of ${SCREENSHOTS_MAX}.`);
				}
			} catch (error) {
				shotError = error instanceof Error ? error.message : String(error);
			} finally {
				shotsCompressing -= 1;
			}
		}
	}

	function openShot(list: readonly Shot[], id: string): void {
		viewing = list.find((item) => item.id === id);
		viewerOpen = viewing !== undefined;
	}

	const viewingName = $derived(
		viewing ? attachmentName(12, 'run-demo', viewing.n, viewing.blob.type as ScreenshotType) : ''
	);
</script>

<svelte:head>
	<title>Components · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Components</h1>
	<p>The UI primitives from the design system, in each of their states.</p>
</header>

<section aria-labelledby="buttons">
	<h2 id="buttons">Buttons</h2>
	<div class="row">
		<Button variant="primary">Generate</Button>
		<Button>Secondary</Button>
		<Button variant="ghost">Ghost</Button>
		<Button variant="danger" onclick={() => (deleteOpen = true)}>Delete wallet</Button>
		<Button variant="primary" disabled>Generate</Button>
		<Button variant="primary" loading>Looking up…</Button>
	</div>
	<div class="row">
		<Button size="sm">Small</Button>
		<Button size="sm" variant="ghost">Small ghost</Button>
	</div>
	<!-- Icon buttons: the caption names the variant on screen; the button keeps its own name. -->
	<div class="row samples">
		<div class="sample">
			<IconButton label="Icon button example"><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Default</span>
		</div>
		<div class="sample">
			<IconButton label="Outlined icon button example" outline><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Outline</span>
		</div>
		<div class="sample">
			<IconButton label="Small icon button example" size="sm"><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Small</span>
		</div>
		<div class="sample">
			<IconButton label="Disabled icon button example" disabled><Icon name="info" /></IconButton>
			<span class="caption" aria-hidden="true">Disabled</span>
		</div>
		<div class="sample">
			<CopyButton label="Copy example hash" value={exampleHash} />
			<span class="caption" aria-hidden="true">Copy</span>
		</div>
	</div>
</section>

<section aria-labelledby="form">
	<h2 id="form">Form panel</h2>
	<FormPanel aria-label="Example form" onsubmit={(event) => (event.preventDefault(), generate())}>
		<div class="grid">
			<Field label="Chain" hint="Address family to generate.">
				{#snippet children(control)}
					<Select {...control} options={chains} bind:value={chain} />
				{/snippet}
			</Field>
			<Field label="Count" hint="1 to 500 per generation." error={countError}>
				{#snippet children(control)}
					<TextInput {...control} inputmode="numeric" bind:value={count} />
				{/snippet}
			</Field>
			<Field label="Fee (gwei)">
				{#snippet children(control)}
					<TextInput {...control} mono suffix="gwei" placeholder="0.0" bind:value={fee} />
				{/snippet}
			</Field>
			<Field label="Calldata" hint="Textarea, monospace. Ctrl+Enter submits.">
				{#snippet children(control)}
					<Textarea {...control} mono rows={2} placeholder="0x" bind:value={notes} />
				{/snippet}
			</Field>
			<Field label="Network" hint="Only mainnet for this chain.">
				{#snippet children(control)}
					<Select
						{...control}
						disabled
						options={[{ value: 'mainnet', label: 'Mainnet' }]}
						value="mainnet"
					/>
				{/snippet}
			</Field>
		</div>
		<div class="checks">
			<CheckboxGroup
				legend="Invalid variants"
				options={variants}
				columns={2}
				error={variantError}
				bind:group={selectedVariants}
			/>
		</div>
		{#snippet footer()}
			<span class="summary"
				>{selectedVariants.length}
				{selectedVariants.length === 1 ? 'variant' : 'variants'} selected</span
			>
			<Button
				type="submit"
				variant="primary"
				loading={generating}
				disabled={Boolean(countError || variantError)}
			>
				{generating ? 'Generating…' : 'Generate'}
			</Button>
		{/snippet}
	</FormPanel>

	<h3>Results</h3>
	<OutputToolbar
		summary={rows.length === 0
			? 'No rows yet'
			: `${rows.length} ${rows.length === 1 ? 'row' : 'rows'}`}
		records={rows.map((row) => ({
			index: String(row.index),
			address: row.address,
			variant: row.variant
		}))}
		fields={['index', 'address', 'variant']}
		filename="example-rows"
		testIdPrefix="components"
	/>
	{#if rows.length > 0}
		<DataTable caption="Generated example rows" {columns} {rows} rowKey={(row) => row.id}>
			{#snippet actions(row)}
				<CopyButton label="Copy address {row.index}" value={row.address} size="sm" />
				<IconButton label="Details of row {row.index}" size="sm" onclick={() => showDetail(row)}>
					<Icon name="info" />
				</IconButton>
			{/snippet}
		</DataTable>
	{:else}
		<EmptyState>
			Pick a chain and a count, then generate. Add invalid variants for negative tests.
		</EmptyState>
	{/if}
</section>

<section aria-labelledby="selection">
	<h2 id="selection">Segmented control and tabs</h2>
	<div class="segmented">
		<SegmentedControl
			legend="Unit family"
			options={families}
			value={family}
			onchange={(next) => (family = next)}
		/>
	</div>
	<Tabs label="Mode" tabs={modes} bind:value={mode}>
		{#snippet panel(id)}
			<p class="muted">
				{id === 'generate'
					? 'Generate tab: the form and the results table.'
					: 'Validate tab: paste one address to check it.'}
			</p>
		{/snippet}
	</Tabs>
</section>

<section aria-labelledby="status">
	<h2 id="status">Status</h2>
	<div class="row">
		<Badge variant="success">Valid</Badge>
		<Badge variant="danger">Invalid</Badge>
		<Badge variant="warning">Risky</Badge>
		<Badge variant="neutral">Pending</Badge>
	</div>
	<div class="stack">
		<Callout variant="info">
			<p>Generated data is fake and for testing only.</p>
		</Callout>
		<Callout variant="warning" title="Valid but risky">
			<p>This address is valid on Ethereum and on BNB Smart Chain.</p>
		</Callout>
		<Callout variant="danger" title="Could not reach rpc.example.org">
			<p>
				The request did not complete, so this says nothing about whether the transaction exists.
			</p>
			{#snippet action()}
				<Button size="sm">Retry</Button>
			{/snippet}
		</Callout>
	</div>
</section>

<section aria-labelledby="qa">
	<h2 id="qa">Test cases and runs</h2>
	<div class="stack">
		<div class="row">
			<ResultControl legend="Result of TC-12" value={result} onchange={(next) => (result = next)} />
			<Button size="sm" variant="ghost" onclick={() => (result = null)}>Clear result</Button>
		</div>
		<ResultControl legend="Result of TC-13, read-only" value="fail" onchange={() => {}} readonly />
	</div>

	<h3>Results bar</h3>
	<div class="bars">
		<div class="bar">
			<ResultsBar counts={runCounts} />
			<span class="summary">18 passed, 3 failed, 2 blocked, 17 untested</span>
		</div>
		<div class="bar">
			<ResultsBar counts={freshCounts} />
			<span class="summary">0 / 5</span>
		</div>
	</div>

	<h3>Badges and tags</h3>
	<div class="row" data-testid="components-status-badges">
		{#each ['pass', 'fail', 'blocked', 'untested', 'in-progress', 'completed'] as const as status (status)}
			<StatusBadge {status} />
		{/each}
	</div>
	<div class="row" data-testid="components-priority-badges">
		{#each PRIORITIES as priority (priority)}
			<PriorityBadge {priority} />
		{/each}
	</div>
	<div class="row">
		<TagChip tag="deposit" />
		<TagChip tag="tron" />
		<TagChip tag="usdt" />
	</div>
	<!-- Icon buttons with the new icons, named as the steps editor and the sidebar use them. -->
	<div class="row samples">
		<div class="sample">
			<IconButton label="Move step 2 up"><Icon name="arrow-up" /></IconButton>
			<span class="caption" aria-hidden="true">arrow-up</span>
		</div>
		<div class="sample">
			<IconButton label="Move step 2 down"><Icon name="arrow-down" /></IconButton>
			<span class="caption" aria-hidden="true">arrow-down</span>
		</div>
		<div class="sample">
			<IconButton label="Remove step 2"><Icon name="trash" /></IconButton>
			<span class="caption" aria-hidden="true">trash</span>
		</div>
		<div class="sample">
			<IconButton label="Cases icon example"><Icon name="cases" /></IconButton>
			<span class="caption" aria-hidden="true">cases</span>
		</div>
		<div class="sample">
			<IconButton label="Run icon example"><Icon name="run" /></IconButton>
			<span class="caption" aria-hidden="true">run</span>
		</div>
	</div>

	<h3>Editor footer</h3>
	<FormPanel aria-label="Example test case">
		<div class="editor">
			<Field label="Tags" hint="Enter or comma adds a tag; Backspace removes the last.">
				{#snippet children(control)}
					<TagInput {...control} bind:tags known={knownTags} testId="components-tags" />
				{/snippet}
			</Field>
		</div>
		<FooterBar>
			{#snippet status()}Unsaved changes{/snippet}
			{#snippet actions()}
				<Button>Cancel</Button>
				<Button variant="primary">Save</Button>
			{/snippet}
		</FooterBar>
	</FormPanel>

	<h3>Record not found</h3>
	<div class="frame">
		<PageState title="Test case not found">
			It may have been deleted, or it was created in another browser.
			{#snippet action()}
				<a href={resolve('/components')}>Back to test cases</a>
			{/snippet}
		</PageState>
	</div>
</section>

<section aria-labelledby="images">
	<h2 id="images">Screenshot compression</h2>
	<p class="summary">
		Runs the image worker on a chosen image: long edge up to 1,920 px, WebP or JPEG at 0.8.
	</p>
	<div class="stack">
		<label class="file">
			Image to compress
			<input type="file" onchange={compressChosen} data-testid="image-compress-file" />
		</label>
		<p role="status" data-testid="image-compress-result">
			{compressing ? 'Compressing…' : compressed}
		</p>
	</div>
</section>

<section aria-labelledby="screenshots">
	<h2 id="screenshots">Screenshots</h2>
	<p class="summary">
		Choose or drop images to compress them in the worker and add them; open a thumbnail to view it.
		The other examples show each state.
	</p>
	<div class="shot-states">
		<div data-testid="shots-live">
			<h3>Interactive</h3>
			<!-- Shown once the samples exist, so they count as already there, not as added. -->
			{#if samples.length}
				<ScreenshotArea
					items={shots}
					compressing={shotsCompressing}
					error={shotError}
					onfiles={addShots}
					onopen={(id) => openShot(shots, id)}
					onremove={(id) => {
						removing = shots.find((item) => item.id === id);
						removeOpen = true;
					}}
				/>
			{/if}
		</div>
		<div data-testid="shots-empty">
			<h3>Empty</h3>
			<ScreenshotArea items={[]} onfiles={() => {}} onopen={() => {}} onremove={() => {}} />
		</div>
		<div data-testid="shots-compressing">
			<h3>Compressing</h3>
			<ScreenshotArea
				items={samples.slice(0, 1)}
				compressing={2}
				onfiles={() => {}}
				onopen={(id) => openShot(samples, id)}
				onremove={() => {}}
			/>
		</div>
		<div data-testid="shots-full">
			<h3>Full</h3>
			<ScreenshotArea
				items={samples}
				onfiles={() => {}}
				onopen={(id) => openShot(samples, id)}
				onremove={() => {}}
			/>
		</div>
		<div data-testid="shots-error">
			<h3>Error</h3>
			<ScreenshotArea
				items={[]}
				error="This browser cannot open IMG_2041.heic (HEIC)."
				onfiles={() => {}}
				onopen={() => {}}
				onremove={() => {}}
			/>
		</div>
		<div data-testid="shots-readonly">
			<h3>Read-only (completed run)</h3>
			<ScreenshotArea
				items={samples.slice(0, 2)}
				readonly
				onfiles={() => {}}
				onopen={(id) => openShot(samples, id)}
				onremove={() => {}}
			/>
		</div>
	</div>
</section>

<ImageViewer
	bind:open={viewerOpen}
	title={viewing?.name ?? ''}
	src={viewing?.src ?? ''}
	fileName={viewingName}
	size={viewing?.blob.size ?? 0}
	ondownload={() => viewing && downloadBlob(viewingName, viewing.blob)}
/>

<Dialog bind:open={removeOpen} title="Remove this screenshot?" destructive>
	<p>The image is deleted from this result. This cannot be undone.</p>
	{#snippet actions()}
		<Button onclick={() => (removeOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={() => {
				removeOpen = false;
				shots = shots.filter((item) => item.id !== removing?.id);
				notify.announce('Screenshot removed.');
			}}>Remove</Button
		>
	{/snippet}
</Dialog>

<Dialog bind:open={detailOpen} title="Row {detail?.index ?? ''}">
	<p class="address">{detail?.address}</p>
	{#snippet actions()}
		<Button onclick={() => (detailOpen = false)}>Close</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={deleteOpen} title="Delete wallet?" destructive>
	<p>This removes the wallet and its notes. This cannot be undone.</p>
	{#snippet actions()}
		<Button onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			onclick={() => {
				deleteOpen = false;
				notify.showToast('Example only: no wallet was deleted');
			}}>Delete</Button
		>
	{/snippet}
</Dialog>

<style>
	.shot-states {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr));
		gap: var(--space-6);
	}

	.shot-states h3 {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	.page-header {
		margin-bottom: var(--space-8);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	.page-header p,
	.muted {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	section + section {
		margin-top: var(--space-12);
	}

	h2 {
		margin: 0 0 var(--space-4);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.samples {
		align-items: flex-start;
		gap: var(--space-4);
	}

	.sample {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		min-width: 56px;
	}

	.caption {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.row + .row {
		margin-top: var(--space-4);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--space-4);
	}

	.checks {
		margin-top: var(--space-6);
	}

	.summary {
		color: var(--color-text-muted);
	}

	.segmented {
		max-width: 320px;
		margin-bottom: var(--space-6);
	}

	h3 {
		margin: var(--space-8) 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.bars {
		display: grid;
		gap: var(--space-4);
		max-width: 360px;
	}

	.bar {
		display: grid;
		gap: var(--space-2);
	}

	.editor {
		max-width: 480px;
	}

	.frame {
		padding: var(--space-6) var(--space-4) var(--space-12);
		border: 1px dashed var(--color-border);
		border-radius: var(--radius-md);
	}

	.address {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}

	.file {
		display: grid;
		gap: var(--space-1);
		max-width: 360px;
	}

	.stack {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-4);
	}

	@media (max-width: 1023px) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}

	@media (max-width: 639px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
