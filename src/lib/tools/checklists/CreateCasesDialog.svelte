<script lang="ts">
	import type { Checklist } from '#lib/content/checklists/index.ts';
	import {
		caseFromItem,
		checklistItems,
		existingItemIds,
		type ChecklistItem
	} from '#lib/core/qa/from-checklist.ts';
	import { testCases } from '#lib/state/test-cases.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import {
		createButtonText,
		creatingText,
		duplicateText,
		nothingToCreateText,
		roomText,
		selectedText
	} from './create-cases.ts';

	// Create test cases from a checklist (design 13.3 S-07, 13.7; FR-150 AC-1 to AC-3). Loaded only
	// when first opened, so the checklist page itself carries no QA code (NFR-025).

	interface Props {
		checklist: Checklist;
		/** After the cases are stored, with how many. */
		oncreated: (count: number) => void;
	}

	let { checklist, oncreated }: Props = $props();

	type Existing = 'skip' | 'create';
	const EXISTING_OPTIONS: readonly { value: Existing; label: string }[] = [
		{ value: 'skip', label: 'Skip existing' },
		{ value: 'create', label: 'Create anyway' }
	];

	let open = $state(false);
	const items = $derived(checklistItems(checklist));
	/** Checked item IDs per section, as CheckboxGroup binds one array per group. */
	let selected: string[][] = $state([]);
	let existingChoice: Existing = $state('skip');
	let creating = $state(false);
	let error = $state('');

	const chosen = $derived(new Set(selected.flat()));
	const existing = $derived(
		testCases.status === 'ready'
			? existingItemIds(items, testCases.list, checklist.slug)
			: new Set()
	);
	const duplicates = $derived(items.filter((i) => chosen.has(i.id) && existing.has(i.id)).length);
	const toCreate = $derived(
		items.filter((i) => chosen.has(i.id) && (existingChoice === 'create' || !existing.has(i.id)))
	);
	const blocked = $derived(nothingToCreateText(chosen.size, toCreate.length));

	/** Opens with every item selected (FR-150 AC-1); test cases are read again for the duplicate check. */
	export function show(): void {
		selectAll();
		existingChoice = 'skip';
		error = '';
		open = true;
		void testCases.load();
	}

	function selectAll(): void {
		selected = checklist.sections.map((_, s) =>
			items.filter((i) => i.id.startsWith(`${s}-`)).map((i) => i.id)
		);
	}

	function selectNone(): void {
		selected = checklist.sections.map(() => []);
	}

	const optionsOf = (s: number) =>
		items
			.filter((item: ChecklistItem) => item.id.startsWith(`${s}-`))
			.map((item) => ({ value: item.id, label: item.text }));

	async function create(): Promise<void> {
		if (creating || blocked) return;
		const batch = toCreate;
		creating = true;
		error = '';
		const created = await testCases.createMany(batch.map((i) => caseFromItem(checklist.slug, i)));
		creating = false;
		if (!created.ok) {
			error =
				created.error === 'limit' ? roomText(testCases.list.length) : WRITE_ERRORS[created.error];
			return;
		}
		open = false;
		oncreated(created.value.length);
	}
</script>

<Dialog bind:open title="Create test cases from {checklist.title}" large>
	{#if testCases.status === 'loading'}
		<p class="muted" data-testid="checklists-create-loading">Loading test cases…</p>
	{:else if testCases.status === 'unavailable'}
		<div data-testid="checklists-create-unavailable">
			<Callout variant="warning" title="Storage unavailable">
				Test cases need storage, which is unavailable in this tab, for example in a private window.
			</Callout>
		</div>
	{:else}
		<p class="intro">
			One test case per item: the item is its title and expected result, tagged
			<code>{checklist.slug}</code> and the section, with Medium priority and no steps.
		</p>
		<div class="bulk">
			<span class="count" data-testid="checklists-create-selected"
				>{selectedText(chosen.size, items.length)}</span
			>
			<Button size="sm" onclick={selectAll} data-testid="checklists-create-all">Select all</Button>
			<Button size="sm" onclick={selectNone} data-testid="checklists-create-none"
				>Select none</Button
			>
		</div>
		{#if duplicates > 0}
			<div class="duplicates" data-testid="checklists-create-duplicates">
				<Callout variant="warning">
					{duplicateText(duplicates, checklist.slug)}
					{#snippet action()}
						<SegmentedControl
							legend="Items that already exist"
							options={EXISTING_OPTIONS}
							value={existingChoice}
							onchange={(next) => (existingChoice = next)}
						/>
					{/snippet}
				</Callout>
			</div>
		{/if}
		<div class="sections">
			{#each checklist.sections as section, s (section.heading)}
				<div data-testid="checklists-create-section">
					<CheckboxGroup legend={section.heading} options={optionsOf(s)} bind:group={selected[s]} />
				</div>
			{/each}
		</div>
	{/if}

	{#snippet actions()}
		{#if error}
			<p class="error" role="alert" data-testid="checklists-create-error">{error}</p>
		{:else if blocked && testCases.status === 'ready'}
			<p class="hint" id="checklists-create-hint">{blocked}</p>
		{/if}
		<Button onclick={() => (open = false)}>Cancel</Button>
		{#if testCases.status === 'ready'}
			<Button
				variant="primary"
				loading={creating}
				disabled={blocked !== null}
				aria-describedby={blocked ? 'checklists-create-hint' : undefined}
				onclick={create}
				data-testid="checklists-create-confirm"
			>
				{creating ? creatingText(toCreate.length) : createButtonText(toCreate.length)}
			</Button>
		{/if}
	{/snippet}
</Dialog>

<style>
	.muted,
	.intro {
		color: var(--color-text-muted);
	}

	.intro {
		margin: 0 0 var(--space-4);
	}

	code {
		font-family: var(--font-mono);
		font-size: var(--text-mono);
	}

	.bulk {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: var(--space-4);
	}

	.count {
		margin-right: auto;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.duplicates {
		margin-bottom: var(--space-4);
	}

	.sections {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.hint,
	.error {
		margin: 0 auto 0 0;
		font-size: var(--text-xs);
	}

	.hint {
		color: var(--color-text-muted);
	}

	.error {
		color: var(--color-danger);
	}
</style>
