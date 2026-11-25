<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import { countStatuses, countsInWords } from '#lib/core/qa/run.ts';
	import type { Run } from '#lib/core/qa/types.ts';
	import { fullDateTime, relativeTime } from '#lib/core/relative-time.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import ResultsBar from '#lib/ui/ResultsBar.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { deletedRunText, deleteRunBody, deleteRunTitle, progressText } from './present.ts';

	// Test runs (design 13.3 P2-03; FR-113 AC-1, AC-4). Newest first, as the store keeps them.

	let list: HTMLDivElement | undefined = $state();
	// Read once when the list is shown; "Created" times do not tick (NFR-005).
	let now = $state(Date.now());

	let deleteOpen = $state(false);
	let deleting: Run | null = $state(null);
	let removing = $state(false);

	const status = $derived(
		testCases.status === 'unavailable' || runs.status === 'unavailable'
			? 'unavailable'
			: testCases.status === 'ready' && runs.status === 'ready'
				? 'ready'
				: 'loading'
	);
	const countsOf = (run: Run) => countStatuses(run.id, run.cases, runs.results);
	const resultCount = (run: Run) => runs.results.filter((r) => r.runId === run.id).length;

	onMount(() => {
		void Promise.all([testCases.load(), runs.load()]).then(() => (now = Date.now()));
	});

	function confirmDelete(run: Run): void {
		deleting = run;
		deleteOpen = true;
	}

	async function remove(): Promise<void> {
		if (!deleting || removing) return;
		removing = true;
		const removed = await runs.remove(deleting.id);
		removing = false;
		deleteOpen = false;
		notify.showToast(removed.ok ? deletedRunText(deleting.name) : WRITE_ERRORS[removed.error]);
		// The row and its Delete button are gone: focus goes to the table, or to the empty state.
		if (removed.ok) {
			await tick();
			list?.querySelector<HTMLElement>('[role="region"], a, button')?.focus();
		}
	}

	const columns: Column<Run>[] = [
		{ key: 'name', label: 'Name', value: (r) => r.name, cell: nameCell },
		{ key: 'release', label: 'Release', value: (r) => r.release, cell: releaseCell },
		{
			key: 'status',
			label: 'Status',
			value: (r) => (r.status === 'completed' ? 'Completed' : 'In progress'),
			cell: statusCell
		},
		{
			key: 'progress',
			label: 'Progress',
			value: (r) => countsInWords(countsOf(r)),
			cell: progressCell
		},
		{
			key: 'created',
			label: 'Created',
			value: (r) => relativeTime(r.createdAt, now),
			cell: createdCell
		}
	];
</script>

{#snippet nameCell(run: Run)}
	<a class="name" href={resolve(`/runs/view?id=${encodeURIComponent(run.id)}`)}>{run.name}</a>
{/snippet}

{#snippet releaseCell(run: Run)}
	{#if run.release}{run.release}{:else}<span class="muted">None</span>{/if}
{/snippet}

{#snippet statusCell(run: Run)}
	<StatusBadge status={run.status} />
{/snippet}

{#snippet progressCell(run: Run)}
	{@const counts = countsOf(run)}
	<span class="progress">
		<ResultsBar {counts} />
		<span class="fraction">{progressText(counts)}</span>
	</span>
{/snippet}

{#snippet createdCell(run: Run)}
	<time
		datetime={new Date(run.createdAt).toISOString()}
		title={fullDateTime(run.createdAt)}
		class="created">{relativeTime(run.createdAt, now)}</time
	>
{/snippet}

<div bind:this={list}>
	{#if status === 'loading'}
		<p class="muted" data-testid="runs-loading">Loading runs…</p>
	{:else if status === 'unavailable'}
		<div data-testid="runs-unavailable">
			<Callout variant="warning" title="Storage unavailable">
				Test runs need storage, which is unavailable in this tab, for example in a private window.
				Nothing can be saved here.
			</Callout>
		</div>
	{:else if runs.list.length === 0}
		<div data-testid="runs-empty">
			<EmptyState>
				No runs yet. Start one from your test cases.
				{#snippet action()}
					{#if testCases.list.length > 0}
						<Button variant="primary" href={resolve('/runs/new')}>New run</Button>
					{:else}
						<span class="no-cases">
							<Button variant="primary" disabled aria-describedby="runs-no-cases">New run</Button>
							<span id="runs-no-cases" class="muted">Write a test case first.</span>
						</span>
					{/if}
				{/snippet}
			</EmptyState>
		</div>
	{:else}
		<p class="count" data-testid="runs-count">
			{runs.list.length.toLocaleString('en')}
			{runs.list.length === 1 ? 'run' : 'runs'}
		</p>
		<DataTable
			caption="Test runs"
			{columns}
			rows={runs.list}
			rowKey={(r) => r.id}
			rowTestId="runs-row"
			enter={false}
		>
			{#snippet actions(run)}
				<Button size="sm" onclick={() => confirmDelete(run)} data-testid="runs-delete">
					Delete<span class="visually-hidden"> {run.name}</span>
				</Button>
			{/snippet}
		</DataTable>
	{/if}
</div>

<Dialog bind:open={deleteOpen} title={deleting ? deleteRunTitle(deleting.name) : ''} destructive>
	<p data-testid="runs-delete-results">
		{deleting ? deleteRunBody(resultCount(deleting), runs.screenshotCount(deleting.id)) : ''}
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button variant="danger" loading={removing} onclick={remove} data-testid="runs-confirm-delete">
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.no-cases {
		display: inline-flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
	}

	.count {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.name {
		color: var(--color-accent);
		font-weight: 500;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.name:hover {
		text-decoration: underline;
	}

	.progress {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-width: 160px;
	}

	.fraction,
	.created {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
