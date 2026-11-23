<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import {
		EMPTY_FILTER,
		filterCases,
		matchesFilter,
		type CaseFilter
	} from '#lib/core/qa/filter.ts';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import type { TestCase } from '#lib/core/qa/types.ts';
	import { runErrors, type RunField } from '#lib/core/qa/validation.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FooterBar from '#lib/ui/FooterBar.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import PriorityBadge from '#lib/ui/PriorityBadge.svelte';
	import TagChip from '#lib/ui/TagChip.svelte';
	import Textarea from '#lib/ui/Textarea.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import CaseFilterBar from '#lib/tools/cases/CaseFilterBar.svelte';
	import { countText, PRIORITY_LABELS, visibleTags } from '#lib/tools/cases/present.ts';
	import {
		createdRunText,
		defaultRunName,
		runErrorsByField,
		selectedText,
		selectionProblem
	} from './present.ts';

	// New run (design 13.3 P2-03a; FR-110). The picker uses the case list's filter, kept in the
	// URL. The run keeps a snapshot of each selected case, in key order (FR-110 AC-2, AC-3).

	const uid = $props.id();

	let form: HTMLDivElement | undefined = $state();
	let name = $state(defaultRunName(new Date()));
	let release = $state('');
	let environment = $state('');
	let filter: CaseFilter = $state(EMPTY_FILTER);
	/** Selected case IDs; each row reads only its own ID. */
	const selected = new SvelteSet<string>();
	let attempted = $state(false);
	let creating = $state(false);
	let saveError = $state('');

	const status = $derived(
		testCases.status === 'unavailable' || runs.status === 'unavailable'
			? 'unavailable'
			: testCases.status === 'ready' && runs.status === 'ready'
				? 'ready'
				: 'loading'
	);
	const matches = $derived(filterCases(testCases.list, filter));
	const matchingSelected = $derived(matches.filter((c) => selected.has(c.id)).length);
	const allMatching = $derived(matches.length > 0 && matchingSelected === matches.length);
	const problem = $derived(selectionProblem(selected.size));
	const draft = $derived({ name, release, environment, caseCount: selected.size });
	const errors = $derived(
		attempted ? runErrorsByField(runErrors(draft)) : new Map<RunField, string>()
	);
	const releaseListId = `${uid}-releases`;

	onMount(() => {
		void testCases.load();
		void runs.load();
	});

	function toggle(item: TestCase, checked: boolean): void {
		if (checked) selected.add(item.id);
		else selected.delete(item.id);
	}

	/** Select all matching, or clear them when all are selected; others stay as they are. */
	function toggleMatching(): void {
		const clear = allMatching;
		for (const item of matches) {
			if (clear) selected.delete(item.id);
			else selected.add(item.id);
		}
	}

	function focusField(field: RunField): void {
		form?.querySelector<HTMLElement>(`[data-field="${field}"] :is(input, textarea)`)?.focus();
	}

	async function create(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (creating || problem) return;
		attempted = true;
		const first = runErrors(draft)[0];
		if (first) {
			await tick();
			focusField(first.field);
			return;
		}
		creating = true;
		saveError = '';
		const chosen = testCases.list.filter((c) => selected.has(c.id));
		const created = await runs.create({ name, release: release.trim(), environment }, chosen);
		creating = false;
		if (!created.ok) {
			saveError = WRITE_ERRORS[created.error];
			return;
		}
		notify.showToast(createdRunText(created.value.name));
		// The run page arrives in T-055; until then the new run is shown in the list.
		void goto(resolve('/runs'));
	}

	const columns: Column<TestCase>[] = [
		{
			key: 'select',
			label: 'Selected',
			value: (c) => (selected.has(c.id) ? 'Selected' : ''),
			cell: selectCell,
			header: selectAllHeader
		},
		{ key: 'key', label: 'Key', value: (c) => formatKey(c.number), mono: true },
		{ key: 'title', label: 'Title', value: (c) => c.title, cell: titleCell },
		{
			key: 'priority',
			label: 'Priority',
			value: (c) => PRIORITY_LABELS[c.priority],
			cell: priorityCell
		},
		{ key: 'tags', label: 'Tags', value: (c) => c.tags.join(', '), cell: tagsCell }
	];
</script>

{#snippet selectAllHeader()}
	<input
		type="checkbox"
		checked={allMatching}
		indeterminate={matchingSelected > 0 && !allMatching}
		disabled={matches.length === 0}
		aria-label="Select all matching ({matches.length.toLocaleString('en')})"
		title="Select all matching ({matches.length.toLocaleString('en')})"
		onchange={toggleMatching}
		data-testid="new-run-select-all"
	/>
{/snippet}

{#snippet selectCell(item: TestCase)}
	<input
		type="checkbox"
		id="{uid}-{item.id}"
		checked={selected.has(item.id)}
		aria-label="Select {formatKey(item.number)}"
		onchange={(event) => toggle(item, event.currentTarget.checked)}
		data-testid="new-run-select"
	/>
{/snippet}

{#snippet titleCell(item: TestCase)}
	<label class="title" for="{uid}-{item.id}">{item.title}</label>
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

{#if status === 'loading'}
	<p class="muted" data-testid="new-run-loading">Loading test cases…</p>
{:else if status === 'unavailable'}
	<div data-testid="new-run-unavailable">
		<Callout variant="warning" title="Storage unavailable">
			Test runs need storage, which is unavailable in this tab, for example in a private window.
			Nothing can be saved here.
		</Callout>
	</div>
{:else if testCases.list.length === 0}
	<div data-testid="new-run-no-cases">
		<EmptyState>
			There are no test cases to run yet.
			{#snippet action()}
				<Button variant="primary" href={resolve('/cases/new')}>New test case</Button>
			{/snippet}
		</EmptyState>
	</div>
{:else}
	<div class="new-run" bind:this={form}>
		<FormPanel aria-label="New run" id="{uid}-form" onsubmit={create}>
			<div class="fields">
				<div data-field="name">
					<Field label="Name" error={errors.get('name')}>
						{#snippet children(control)}
							<TextInput {...control} bind:value={name} data-testid="new-run-name" />
						{/snippet}
					</Field>
				</div>
				<div data-field="release">
					<Field
						label="Release (optional)"
						hint="Runs with the same release are grouped, whatever the letter case."
						error={errors.get('release')}
					>
						{#snippet children(control)}
							<TextInput
								{...control}
								bind:value={release}
								list={releaseListId}
								data-testid="new-run-release"
							/>
						{/snippet}
					</Field>
					<datalist id={releaseListId}>
						{#each runs.releases as known (known)}<option value={known}></option>{/each}
					</datalist>
				</div>
				<div data-field="environment" class="wide">
					<Field
						label="Environment (optional)"
						hint="Build, device, OS, browser, network."
						error={errors.get('environment')}
					>
						{#snippet children(control)}
							<Textarea
								{...control}
								rows={2}
								grow
								bind:value={environment}
								data-testid="new-run-environment"
							/>
						{/snippet}
					</Field>
				</div>
			</div>
		</FormPanel>
	</div>

	<h2>Test cases</h2>
	<CaseFilterBar
		bind:filter
		cases={testCases.list}
		href={(query) => (query === '' ? resolve('/runs/new') : resolve(`/runs/new?${query}`))}
		label="Filter test cases"
		testId="new-run"
	/>

	<p class="count" data-testid="new-run-count">
		{countText(matches.length, testCases.list.length)} · {selectedText(selected.size)}
	</p>

	{#if matches.length === 0}
		<p class="muted" data-testid="new-run-no-match">No test case matches these filters.</p>
	{/if}
	<div class="table" hidden={matches.length === 0}>
		<DataTable
			caption="Test cases to run"
			{columns}
			rows={testCases.list}
			rowKey={(c) => c.id}
			rowTestId="new-run-row"
			enter={false}
			hidden={(c) => !matchesFilter(c, filter)}
		/>
	</div>

	<FooterBar>
		{#snippet status()}
			{#if saveError}
				<span class="error" role="alert" data-testid="new-run-save-error">{saveError}</span>
			{:else}
				<span data-testid="new-run-selected">{selectedText(selected.size)}</span>
				{#if problem}
					<span class="hint" id="{uid}-problem" data-testid="new-run-problem">{problem}</span>
				{/if}
			{/if}
		{/snippet}
		{#snippet actions()}
			<Button onclick={() => goto(resolve('/runs'))} data-testid="new-run-cancel">Cancel</Button>
			<Button
				type="submit"
				form="{uid}-form"
				variant="primary"
				disabled={problem !== null}
				loading={creating}
				aria-describedby={problem ? `${uid}-problem` : undefined}
				data-testid="new-run-create"
			>
				{creating ? 'Creating…' : 'Create run'}
			</Button>
		{/snippet}
	</FooterBar>
{/if}

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.new-run {
		max-width: 820px;
	}

	.fields {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		align-items: start;
		gap: var(--space-4) var(--space-4);
	}

	.wide {
		grid-column: 1 / -1;
	}

	h2 {
		margin: var(--space-8) 0 var(--space-3);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
	}

	.count {
		margin: var(--space-6) 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.table :global(table) {
		table-layout: fixed;
		min-width: 640px;
	}

	.table :global(th:nth-child(1)) {
		width: 48px;
	}
	.table :global(th:nth-child(2)) {
		width: 80px;
	}
	.table :global(th:nth-child(4)) {
		width: 100px;
	}
	.table :global(th:nth-child(5)) {
		width: 30%;
	}

	input[type='checkbox'] {
		width: 16px;
		height: 16px;
		margin: 0;
		accent-color: var(--color-accent);
	}

	.title {
		display: block;
		font-weight: 500;
		overflow-wrap: anywhere;
		cursor: pointer;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-1);
	}

	.more {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		white-space: nowrap;
	}

	.hint {
		margin-left: var(--space-3);
	}

	.error {
		color: var(--color-danger);
	}

	@media (max-width: 639px) {
		.fields {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
