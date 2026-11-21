<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { copyOfCase } from '#lib/core/qa/duplicate.ts';
	import {
		filterCases,
		filterFromQuery,
		filterToQuery,
		matchesFilter,
		type CaseFilter
	} from '#lib/core/qa/filter.ts';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import { PRIORITIES, type TestCase } from '#lib/core/qa/types.ts';
	import { fullDateTime, relativeTime } from '#lib/core/relative-time.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PriorityBadge from '#lib/ui/PriorityBadge.svelte';
	import TagChip from '#lib/ui/TagChip.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import {
		countText,
		deleteBody,
		deletedText,
		duplicatedText,
		PRIORITY_LABELS,
		SAVE_ERRORS,
		tagFilterSummary,
		visibleTags
	} from './present.ts';

	// Test cases (design 13.3 P2-01; FR-101, FR-102). The filter lives in the URL query, written
	// with a shallow replace so it survives a reload without adding history entries (T-047).

	let mounted = $state(false);
	let text = $state('');
	let tags: string[] = $state([]);
	let priorities: string[] = $state([]);
	let textBox: HTMLDivElement | undefined = $state();
	// Read once when the list is shown; "Updated" times do not tick (NFR-005).
	let now = $state(Date.now());

	let duplicating = $state(false);
	let deleteOpen = $state(false);
	let deleting: TestCase | null = $state(null);
	let removing = $state(false);

	const filter: CaseFilter = $derived({
		text,
		tags,
		priorities: PRIORITIES.filter((p) => priorities.includes(p))
	});
	const status = $derived(
		testCases.status === 'unavailable' || runs.status === 'unavailable'
			? 'unavailable'
			: testCases.status === 'ready' && runs.status === 'ready'
				? 'ready'
				: 'loading'
	);
	const matches = $derived(filterCases(testCases.list, filter));
	const filtering = $derived(matches.length !== testCases.list.length);
	// Every tag in use, plus any tag in the URL that no case has any more, so it can be unticked.
	const tagOptions = $derived(
		[...new Set([...testCases.list.flatMap((c) => c.tags), ...tags])]
			.sort()
			.map((tag) => ({ value: tag, label: tag }))
	);
	const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

	onMount(() => {
		const initial = filterFromQuery(currentSearch());
		text = initial.text;
		tags = [...initial.tags];
		priorities = [...initial.priorities];
		mounted = true;
		void Promise.all([testCases.load(), runs.load()]).then(() => (now = Date.now()));
	});

	function currentSearch(): string {
		return (page.shallow?.url ?? page.url).search;
	}

	// Mirrors the filter into the URL; skipped when it is already there (the first run, a reload).
	$effect(() => {
		if (!mounted) return;
		const query = filterToQuery(filter);
		if (query === currentSearch().replace(/^\?/, '')) return;
		void goto(query === '' ? resolve('/cases') : resolve(`/cases?${query}`), {
			shallow: true,
			replace: true
		});
	});

	// The count is read out while a filter is on, through the shell's one live region.
	$effect(() => {
		if (status !== 'ready' || !filtering) return;
		notify.announce(countText(matches.length, testCases.list.length));
	});

	function focusFilter(): void {
		textBox?.querySelector('input')?.focus();
	}

	// The Clear button disappears with the empty state, so focus goes back to the filter (AC-3).
	function clearFilters(): void {
		text = '';
		tags = [];
		priorities = [];
		focusFilter();
	}

	async function duplicate(item: TestCase): Promise<void> {
		if (duplicating) return;
		duplicating = true;
		const created = await testCases.create(copyOfCase(item));
		duplicating = false;
		notify.showToast(
			created.ok ? duplicatedText(created.value.number) : SAVE_ERRORS[created.error]
		);
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
			focusFilter();
		}
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
	<span class="title">{item.title}</span>
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
		<EmptyState>No test cases yet. Write one, or create them from a checklist.</EmptyState>
	</div>
{:else}
	<FormPanel aria-label="Filter test cases" onsubmit={(event) => event.preventDefault()}>
		<div class="filters">
			<div class="text" bind:this={textBox}>
				<Field label="Filter" hint="Matches the key and the title.">
					{#snippet children(control)}
						<TextInput {...control} bind:value={text} data-testid="cases-filter" />
					{/snippet}
				</Field>
			</div>
			<div class="tag-filter">
				<span class="label" aria-hidden="true">Tags</span>
				<details data-testid="cases-tags">
					<summary>
						<span class="visually-hidden">Tags:</span>
						{tagFilterSummary(tags.length)}
						<span class="chevron"><Icon name="chevron" size={14} /></span>
					</summary>
					<div class="tag-options">
						<CheckboxGroup legend="Cases have every tag" options={tagOptions} bind:group={tags} />
					</div>
				</details>
			</div>
			<div data-testid="cases-priority">
				<CheckboxGroup
					legend="Priority"
					options={priorityOptions}
					columns="inline"
					bind:group={priorities}
				/>
			</div>
		</div>
	</FormPanel>

	<p class="count" data-testid="cases-count">
		{countText(matches.length, testCases.list.length)}
	</p>

	{#if matches.length === 0}
		<div data-testid="cases-no-match">
			<EmptyState>
				No test case matches these filters.
				{#snippet action()}
					<Button
						variant="ghost"
						size="sm"
						onclick={clearFilters}
						data-testid="cases-clear-filters"
					>
						Clear filters
					</Button>
				{/snippet}
			</EmptyState>
		</div>
	{:else}
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

	.filters {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--space-4);
	}

	.tag-filter {
		display: flex;
		flex-direction: column;
		gap: 6px;
		min-width: 0;
	}

	.label {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	summary {
		display: flex;
		align-items: center;
		height: var(--control-md);
		padding: 0 var(--space-3);
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
		cursor: pointer;
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	.chevron {
		display: inline-flex;
		margin-left: auto;
		color: var(--color-text-subtle);
		transition: transform var(--duration-fast) var(--ease-out);
	}

	details[open] .chevron {
		transform: rotate(180deg);
	}

	.tag-options {
		max-height: 240px;
		margin-top: var(--space-2);
		padding: var(--space-3);
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		background: var(--color-bg);
	}

	.count {
		margin: var(--space-6) 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.title {
		display: block;
		min-width: 16ch;
		overflow-wrap: anywhere;
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

	@media (max-width: 1023px) {
		.filters {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
