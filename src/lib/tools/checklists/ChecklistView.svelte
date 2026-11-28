<script lang="ts">
	import { tick, type Component } from 'svelte';
	import { resolve } from '$app/paths';
	import { itemCount, type Checklist } from '#lib/content/checklists/index.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { toMarkdown } from './checklists.ts';
	import { casesQuery, createdText } from './create-cases.ts';

	let { checklist }: { checklist: Checklist } = $props();

	type CreateDialog = Component<
		{ checklist: Checklist; oncreated: (count: number) => void },
		{ show: () => void }
	>;

	// The dialog and the test case store load on first use (FR-150, NFR-025).
	let CreateCases: CreateDialog | null = $state.raw(null);
	let createDialog: { show: () => void } | undefined = $state();
	let opening = $state(false);
	let created: number | null = $state(null);

	function copy(): void {
		void clipboard.copy(toMarkdown(checklist), 'Copied as Markdown');
	}

	async function openCreate(): Promise<void> {
		if (opening) return;
		if (!CreateCases) {
			opening = true;
			try {
				CreateCases = (await import('./CreateCasesDialog.svelte')).default as CreateDialog;
			} finally {
				opening = false;
			}
			await tick();
		}
		created = null;
		createDialog?.show();
	}
</script>

<div class="toolbar">
	<span class="count">
		{itemCount(checklist)} items in {checklist.sections.length} sections
	</span>
	<div class="actions">
		<Button onclick={copy} data-testid="checklists-copy-markdown">
			<Icon name="copy" />
			Copy as Markdown
		</Button>
		<!-- Not `loading`: a disabled button drops focus, which the dialog returns to on close. -->
		<Button onclick={openCreate} data-testid="checklists-create-cases">
			<Icon name="cases" />
			Create test cases
		</Button>
	</div>
</div>

<div class="created" role="status" data-testid="checklists-created">
	{#if created !== null}
		<Icon name="check" />
		{createdText(created)}
		<a href={resolve(`/cases?${casesQuery(checklist.slug)}`)}>View them</a>
	{/if}
</div>

{#if CreateCases}
	<CreateCases bind:this={createDialog} {checklist} oncreated={(count) => (created = count)} />
{/if}

{#each checklist.sections as section, i (section.heading)}
	<section aria-labelledby="section-{i}" data-testid="checklists-section">
		<h2 id="section-{i}">{section.heading}</h2>
		<ul>
			{#each section.items as item (item)}
				<li data-testid="checklists-item">{item}</li>
			{/each}
		</ul>
	</section>
{/each}

<style>
	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.created {
		display: flex;
		align-items: center;
		gap: var(--space-2);
	}

	.created :global(.icon) {
		color: var(--color-success);
	}

	.created:not(:empty) {
		margin: calc(-1 * var(--space-2)) 0 var(--space-6);
	}

	.created a {
		color: var(--color-accent);
		font-weight: 500;
	}

	.count {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	section + section {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	ul {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
		list-style: none;
	}

	li {
		position: relative;
		padding: var(--space-2) 0 var(--space-2) var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	/* An empty box, as in the Markdown task list it exports to; read-only in Phase 1. */
	li::before {
		position: absolute;
		top: calc(var(--space-2) + 4px);
		left: 2px;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-border-strong);
		border-radius: 3px;
		content: '';
	}
</style>
