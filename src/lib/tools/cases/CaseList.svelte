<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { copyOfCase } from '#lib/core/qa/duplicate.ts';
	import {
		EMPTY_FILTER,
		filterCases,
		filterToQuery,
		matchesFilter,
		type CaseFilter
	} from '#lib/core/qa/filter.ts';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import type { TestCase } from '#lib/core/qa/types.ts';
	import { fullDateTime, relativeTime } from '#lib/core/relative-time.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import PriorityBadge from '#lib/ui/PriorityBadge.svelte';
	import TagChip from '#lib/ui/TagChip.svelte';
	import {
		countText,
		deleteBody,
		deletedText,
		duplicatedText,
		PRIORITY_LABELS,
		SAVE_ERRORS,
		visibleTags
	} from './present.ts';
	import CaseFilterBar from './CaseFilterBar.svelte';

	// Test cases (design 13.3 P2-01; FR-101, FR-102). The filter bar keeps the filter in the URL.

	let filter: CaseFilter = $state(EMPTY_FILTER);
	let filterBar: CaseFilterBar | undefined = $state();
	// Read once when the list is shown; "Updated" times do not tick (NFR-005).
	let now = $state(Date.now());

	let duplicating = $state(false);
	let deleteOpen = $state(false);
	let deleting: TestCase | null = $state(null);
	let removing = $state(false);

	const status = $derived(
		testCases.status === 'unavailable' || runs.status === 'unavailable'
			? 'unavailable'
			: testCases.status === 'ready' && runs.status === 'ready'
				? 'ready'
				: 'loading'
	);
	const matches = $derived(filterCases(testCases.list, filter));
	const filtering = $derived(matches.length !== testCases.list.length);

	onMount(() => {
		void Promise.all([testCases.load(), runs.load()]).then(() => (now = Date.now()));
	});

	// The count is read out while a filter is on, through the shell's one live region.
	$effect(() => {
		if (status !== 'ready' || !filtering) return;
		notify.announce(countText(matches.length, testCases.list.length));
	});

	async function duplicate(item: TestCase): Promise<void> {
		if (duplicating) return;
		duplicating = true;
		const created = await testCases.create(copyOfCase(item));
		duplicating = false;
		if (!created.ok) {
			notify.showToast(SAVE_ERRORS[created.error]);
			return;
		}
		notify.showToast(duplicatedText(created.value.number));
		// FR-102 AC-1: the copy opens in the editor.
		void goto(resolve(`/cases/edit?id=${encodeURIComponent(created.value.id)}`));
	}

	function confirmDelete(item: TestCase): void {
		deleting = item;
		deleteOpen = true;
	}

	async function remove(): Promise<void> {
		if (!deleting || removing) return;
		removing = true;
		const removed = await testCases.remove(deleting.id);
		removing = false;
		deleteOpen = false;
		notify.showToast(removed.ok ? deletedText(deleting.number) : SAVE_ERRORS[removed.error]);
		// The row and its Delete button are gone, so focus goes to the filter instead of the page.
		if (removed.ok) {
			await tick();
			filterBar?.focus();
		}
	}

	function newRunHref(of: CaseFilter): string {
		const query = filterToQuery(of);
		return query === '' ? resolve('/runs/new') : resolve(`/runs/new?${query}`);
	}

	const columns: Column<TestCase>[] = [
		{ key: 'key', label: 'Key', value: (c) => formatKey(c.number), mono: true },
		{ key: 'title', label: 'Title', value: (c) => c.title, cell: titleCell },
		{
			key: 'priority',
			label: 'Priority',
			value: (c) => PRIORITY_LABELS[c.priority],
			cell: priorityCell
		},
		{ key: 'tags', label: 'Tags', value: (c) => c.tags.join(', '), cell: tagsCell },
		{ key: 'steps', label: 'Steps', value: (c) => String(c.steps.length), numeric: true },
		{
			key: 'updated',
			label: 'Updated',
			value: (c) => relativeTime(c.updatedAt, now),
			cell: updatedCell
		}
	];
</script>

{#snippet titleCell(item: TestCase)}
	<a class="title" href={resolve(`/cases/edit?id=${encodeURIComponent(item.id)}`)}>{item.title}</a>
{/snippet}

{#snippet priorityCell(item: TestCase)}
	<PriorityBadge priority={item.priority} />
{/snippet}

{#snippet tagsCell(item: TestCase)}
	{@const { shown, more } = visibleTags(item.tags)}
	<span class="tags" title={more > 0 ? item.tags.join(', ') : undefined}>
		{#each shown as tag (tag)}<TagChip {tag} />{/each}
		{#if more > 0}
			<span class="more"
				><span aria-hidden="true">+{more}</span><span class="visually-hidden">and {more} more</span
				></span
			>
		{/if}
	</span>
{/snippet}

{#snippet updatedCell(item: TestCase)}
	<time
		datetime={new Date(item.updatedAt).toISOString()}
		title={fullDateTime(item.updatedAt)}
		class="updated">{relativeTime(item.updatedAt, now)}</time
	>
{/snippet}

{#if status === 'loading'}
	<p class="muted" data-testid="cases-loading">Loading test cases…</p>
{:else if status === 'unavailable'}
	<div data-testid="cases-unavailable">
		<Callout variant="warning" title="Storage unavailable">
			Test cases need storage, which is unavailable in this tab, for example in a private window.
			Nothing can be saved here.
		</Callout>
	</div>
{:else if testCases.list.length === 0}
	<div data-testid="cases-empty">
		<EmptyState>
			No test cases yet. Write one, or create them from a checklist.
			{#snippet action()}
				<Button variant="primary" href={resolve('/cases/new')}>New test case</Button>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<CaseFilterBar
		bind:this={filterBar}
		bind:filter
		cases={testCases.list}
		href={(query) => (query === '' ? resolve('/cases') : resolve(`/cases?${query}`))}
		label="Filter test cases"
		testId="cases"
	/>

	<div class="toolbar">
		<p class="count" data-testid="cases-count">
			{countText(matches.length, testCases.list.length)}
		</p>
		{#if matches.length > 0}
			<!-- Opens New run with the same filter (design 13.3 P2-01). -->
			<Button size="sm" href={newRunHref(filter)} data-testid="cases-new-run">
				New run with these
			</Button>
		{/if}
	</div>

	{#if matches.length === 0}
		<div data-testid="cases-no-match">
			<EmptyState>
				No test case matches these filters.
				{#snippet action()}
					<Button
						variant="ghost"
						size="sm"
						onclick={() => filterBar?.clear()}
						data-testid="cases-clear-filters"
					>
						Clear filters
					</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else}
		<div class="table">
			<DataTable
				caption="Test cases"
				{columns}
				rows={testCases.list}
				rowKey={(c) => c.id}
				rowTestId="cases-row"
				enter={false}
				hidden={(c) => !matchesFilter(c, filter)}
			>
				{#snippet actions(item)}
					<span class="actions">
						<Button size="sm" onclick={() => duplicate(item)} data-testid="cases-duplicate">
							Duplicate<span class="visually-hidden"> {formatKey(item.number)}</span>
						</Button>
						<Button size="sm" onclick={() => confirmDelete(item)} data-testid="cases-delete">
							Delete<span class="visually-hidden"> {formatKey(item.number)}</span>
						</Button>
					</span>
				{/snippet}
			</DataTable>
		</div>
	{/if}
{/if}

<Dialog
	bind:open={deleteOpen}
	title={deleting ? `Delete ${formatKey(deleting.number)}?` : ''}
	destructive
>
	<p data-testid="cases-delete-runs">
		{deleting ? deleteBody(runs.runsWith(deleting.id).length) : ''}
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button variant="danger" loading={removing} onclick={remove} data-testid="cases-confirm-delete">
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		margin: var(--space-6) 0 var(--space-2);
	}

	.count {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.table :global(table) {
		table-layout: fixed;
		min-width: 760px;
	}

	.table :global(th:nth-child(1)) {
		width: 80px;
	}
	.table :global(th:nth-child(3)) {
		width: 100px;
	}
	.table :global(th:nth-child(4)) {
		width: 26%;
	}
	.table :global(th:nth-child(5)) {
		width: 64px;
	}
	.table :global(th:nth-child(6)) {
		width: 120px;
	}
	.table :global(th:nth-child(7)) {
		width: 196px;
	}

	.title {
		display: block;
		min-width: 16ch;
		color: var(--color-accent);
		font-weight: 500;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.title:hover {
		text-decoration: underline;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.more,
	.updated {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.actions {
		display: flex;
		gap: var(--space-1);
	}
</style>
