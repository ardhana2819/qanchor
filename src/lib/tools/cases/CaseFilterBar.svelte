<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { filterFromQuery, filterToQuery, type CaseFilter } from '#lib/core/qa/filter.ts';
	import { PRIORITIES, type TestCase } from '#lib/core/qa/types.ts';
	import CheckboxGroup from '#lib/ui/CheckboxGroup.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { PRIORITY_LABELS, tagFilterSummary } from './present.ts';

	// The test case filter bar (design 13.3 P2-01), on the case list and the new-run picker
	// (FR-110 AC-1). The filter lives in the URL query, written with a shallow replace so it
	// survives a reload without adding history entries (T-047).

	interface Props {
		/** The cases to filter; their tags are the tag options. */
		cases: readonly TestCase[];
		/** The filter the fields hold, for the parent to apply. */
		filter?: CaseFilter;
		/** The page's URL for a query, already `resolve()`d; an empty query gives the bare path. */
		href: (query: string) => string;
		/** Names the form for screen readers. */
		label: string;
		/** Prefix of the test ids: `-filter`, `-tags`, `-priority`. */
		testId: string;
	}

	let { cases, filter = $bindable(), href, label, testId }: Props = $props();

	let mounted = $state(false);
	let text = $state('');
	let tags: string[] = $state([]);
	let priorities: string[] = $state([]);
	let textBox: HTMLDivElement | undefined = $state();

	const current: CaseFilter = $derived({
		text,
		tags,
		priorities: PRIORITIES.filter((p) => priorities.includes(p))
	});
	// Every tag in use, plus any tag in the URL that no case has any more, so it can be unticked.
	const tagOptions = $derived(
		[...new Set([...cases.flatMap((c) => c.tags), ...tags])]
			.sort()
			.map((tag) => ({ value: tag, label: tag }))
	);
	const priorityOptions = PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));

	$effect.pre(() => {
		filter = current;
	});

	onMount(() => {
		const initial = filterFromQuery(currentSearch());
		text = initial.text;
		tags = [...initial.tags];
		priorities = [...initial.priorities];
		mounted = true;
	});

	function currentSearch(): string {
		return (page.shallow?.url ?? page.url).search;
	}

	// Mirrors the filter into the URL; skipped when it is already there (the first run, a reload).
	$effect(() => {
		if (!mounted) return;
		const query = filterToQuery(current);
		if (query === currentSearch().replace(/^\?/, '')) return;
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- `href` returns a resolved path
		void goto(href(query), { shallow: true, replace: true });
	});

	export function focus(): void {
		textBox?.querySelector('input')?.focus();
	}

	/** Empties every field and puts focus in the text filter (FR-101 AC-3). */
	export function clear(): void {
		text = '';
		tags = [];
		priorities = [];
		focus();
	}
</script>

<FormPanel aria-label={label} onsubmit={(event) => event.preventDefault()}>
	<div class="filters">
		<div class="text" bind:this={textBox}>
			<Field label="Filter" hint="Matches the key and the title.">
				{#snippet children(control)}
					<TextInput {...control} bind:value={text} data-testid="{testId}-filter" />
				{/snippet}
			</Field>
		</div>
		<div class="tag-filter">
			<span class="label" aria-hidden="true">Tags</span>
			<details data-testid="{testId}-tags">
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
		<div data-testid="{testId}-priority">
			<CheckboxGroup
				legend="Priority"
				options={priorityOptions}
				columns="inline"
				bind:group={priorities}
			/>
		</div>
	</div>
</FormPanel>

<style>
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

	@media (max-width: 1023px) {
		.filters {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
