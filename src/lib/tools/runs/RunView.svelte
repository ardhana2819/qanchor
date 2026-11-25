<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { MediaQuery, SvelteMap } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import { countStatuses, countsInWords, resultsByCase } from '#lib/core/qa/run.ts';
	import { runSummaryMarkdown } from '#lib/core/qa/summary.ts';
	import type { CaseSnapshot, ResultStatus, Run } from '#lib/core/qa/types.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PageState from '#lib/ui/PageState.svelte';
	import PriorityBadge from '#lib/ui/PriorityBadge.svelte';
	import ResultsBar from '#lib/ui/ResultsBar.svelte';
	import Select from '#lib/ui/Select.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import {
		CASE_LIST_FILTERS,
		caseIndexFromQuery,
		completeBody,
		completedText,
		formFor,
		isSaved,
		markedText,
		positionText,
		shortcutFor,
		type CaseListFilter,
		type ResultForm
	} from './execution.ts';
	import { saveErrorText } from './present.ts';
	import ResultPanel from './ResultPanel.svelte';
	import { RunShots } from './shots.svelte.ts';

	// Run execution (design 13.3 P2-04; FR-111, FR-113 AC-2, AC-3, AC-5). `/runs/view?id=&case=`;
	// the ID is read after mount (T-047), and the current case is kept in the URL.

	let mounted = $state(false);
	let index = $state(0);
	/** The run the index was read for, so the URL is read once per run. */
	let indexFor: string | null = $state(null);
	let form: ResultForm = $state(formFor(undefined, 0));
	/** Unsaved forms of the other cases, kept while the page is open. */
	const drafts = new SvelteMap<number, ResultForm>();
	let listFilter: CaseListFilter = $state('all');
	let heading: HTMLHeadingElement | undefined = $state();
	let resultPanel: ResultPanel | undefined = $state();
	let completeOpen = $state(false);
	let shortcutsOpen = $state(false);
	let changingStatus = $state(false);
	let switching = $state(false);
	const wide = new MediaQuery('min-width: 1024px');
	let listOpen = $state(false);
	const shots = new RunShots();
	onDestroy(() => shots.dispose());

	const id = $derived(mounted ? (page.shallow?.url ?? page.url).searchParams.get('id') : null);
	const run = $derived(id ? runs.list.find((r) => r.id === id) : undefined);
	const completed = $derived(run?.status === 'completed');
	const byCase = $derived(run ? resultsByCase(run.id, runs.results) : new Map());
	const counts = $derived(run ? countStatuses(run.id, run.cases, runs.results) : null);
	const item: CaseSnapshot | undefined = $derived(run?.cases[index]);
	const result = $derived(item ? byCase.get(item.number) : undefined);
	const statusOf = (c: CaseSnapshot): ResultStatus | 'untested' =>
		byCase.get(c.number)?.status ?? 'untested';
	const listed = $derived(
		run
			? run.cases
					.map((c, i) => ({ c, i }))
					.filter(({ c }) => listFilter === 'all' || statusOf(c) === listFilter)
			: []
	);
	const environmentLine = $derived(run?.environment.trim().split(/\r?\n/, 1)[0] ?? '');

	onMount(() => {
		mounted = true;
		// EC-028: a run URL without an ID goes to the list, replacing itself so Back skips it.
		if (!(page.shallow?.url ?? page.url).searchParams.get('id')) {
			void goto(resolve('/runs'), { replace: true });
			return;
		}
		void runs.load();
	});

	// Opens the case named in the URL once the run is read.
	$effect(() => {
		if (!run || indexFor === run.id) return;
		indexFor = run.id;
		openCase(caseIndexFromQuery((page.shallow?.url ?? page.url).search, run.cases), run);
	});

	function openCase(next: number, of: Run): void {
		const target = of.cases[next];
		index = next;
		form = drafts.get(target.number) ?? formFor(byCase.get(target.number), target.steps.length);
		drafts.delete(target.number);
		const query = `id=${encodeURIComponent(of.id)}&case=${formatKey(target.number)}`;
		if ((page.shallow?.url ?? page.url).search !== `?${query}`) {
			void goto(resolve(`/runs/view?${query}`), { shallow: true, replace: true });
		}
	}

	/** Moves to another case: focus to its heading, and its position read out (design 13.8). */
	async function goTo(next: number): Promise<void> {
		if (!run || !item || next < 0 || next >= run.cases.length || next === index) return;
		if (!isSaved(form, result)) drafts.set(item.number, $state.snapshot(form));
		switching = true;
		openCase(next, run);
		if (!wide.current) listOpen = false;
		await tick();
		requestAnimationFrame(() => (switching = false));
		heading?.focus();
		notify.announce(positionText(next, run.cases.length, run.cases[next].title));
	}

	async function save(saving: ResultForm, how: 'status' | 'submit' | 'field'): Promise<boolean> {
		if (!run || !item || saving.status === null) return false;
		const number = item.number;
		const status = saving.status;
		const pending = shots.pendingOf(number);
		const written = await runs.saveResult(
			{
				runId: run.id,
				caseNumber: number,
				status,
				failedStep: saving.failedStep,
				actual: saving.actual,
				reason: saving.reason,
				notes: saving.notes,
				linkedIssue: saving.linkedIssue.trim()
			},
			pending
		);
		if (!written.ok) {
			notify.showToast(saveErrorText(written.error));
			return false;
		}
		const late = await shots.saved(run.id, number, pending);
		if (late) notify.showToast(saveErrorText(late));
		// The form stays as typed; only the stored issue is trimmed.
		if (item?.number === number) form.linkedIssue = written.value.linkedIssue;
		const next = countStatuses(run.id, run.cases, runs.results);
		if (how === 'submit') notify.showToast(`Saved ${formatKey(number)}.`);
		if (how === 'field') notify.announce(`Saved ${formatKey(number)}.`);
		else notify.announce(markedText(number, status, next));
		return true;
	}

	async function complete(): Promise<void> {
		if (!run || !counts || changingStatus) return;
		changingStatus = true;
		const changed = await runs.setStatus(run.id, 'completed');
		changingStatus = false;
		completeOpen = false;
		notify.showToast(changed.ok ? completedText(counts) : WRITE_ERRORS[changed.error]);
	}

	async function reopen(): Promise<void> {
		if (!run || changingStatus) return;
		changingStatus = true;
		const changed = await runs.setStatus(run.id, 'in-progress');
		changingStatus = false;
		notify.showToast(changed.ok ? 'Run reopened.' : WRITE_ERRORS[changed.error]);
	}

	function copySummary(): void {
		if (!run) return;
		void clipboard.copy(runSummaryMarkdown(run, runs.results), 'Copied run summary');
	}

	// Single-key shortcuts (design 13.4, FR-111 AC-7).
	function onkeydown(event: KeyboardEvent): void {
		if (!run || !item) return;
		const dialogOpen = document.querySelector('dialog[open]') !== null;
		const shortcut = shortcutFor(event, dialogOpen);
		if (!shortcut) return;
		if ('pfb'.includes(shortcut) && completed) return;
		event.preventDefault();
		if (shortcut === 'p') void resultPanel?.setStatus('pass');
		else if (shortcut === 'f') void resultPanel?.setStatus('fail', true);
		else if (shortcut === 'b') void resultPanel?.setStatus('blocked', true);
		else if (shortcut === 'j') void goTo(index + 1);
		else if (shortcut === 'k') void goTo(index - 1);
		else shortcutsOpen = true;
	}
</script>

<svelte:window {onkeydown} />

<svelte:head>
	<title>{run ? run.name : 'Test run'} · QAnchor</title>
</svelte:head>

{#snippet caseRows()}
	{#if listed.length === 0}
		<p class="no-cases" data-testid="run-no-cases">No case with this result.</p>
	{:else}
		<ol>
			{#each listed as { c, i } (c.number)}
				<li>
					<button
						type="button"
						class="case-row"
						aria-current={i === index ? 'true' : undefined}
						onclick={() => goTo(i)}
						data-testid="run-case-row"
					>
						<span class="case-key mono">{formatKey(c.number)}</span>
						<span class="case-title" title={c.title}>{c.title}</span>
						<StatusBadge status={statusOf(c)} />
					</button>
				</li>
			{/each}
		</ol>
	{/if}
{/snippet}

{#if !mounted || runs.status === 'loading'}
	<p class="muted" data-testid="run-loading">Loading run…</p>
{:else if runs.status === 'unavailable'}
	<p class="muted" data-testid="run-unavailable">
		Test runs need storage, which is unavailable in this tab, for example in a private window.
	</p>
{:else if !run || !item || !counts}
	<div data-testid="run-not-found">
		<PageState title="Run not found">
			It may have been deleted, or it was created in another browser.
			{#snippet action()}
				<a href={resolve('/runs')}>Back to test runs</a>
			{/snippet}
		</PageState>
	</div>
{:else}
	<header class="run-header">
		<div class="run-title">
			<h1>
				<span data-testid="run-name">{run.name}</span>
				{#if completed}<StatusBadge status="completed" />{/if}
			</h1>
			{#if run.release || environmentLine}
				<div class="run-meta">
					{#if run.release}<span>Release <span class="mono">{run.release}</span></span>{/if}
					{#if environmentLine}
						<details data-testid="run-environment">
							<summary>Environment: {environmentLine}</summary>
							<p>{run.environment}</p>
						</details>
					{/if}
				</div>
			{/if}
			<div class="progress-line">
				<span class="bar"><ResultsBar {counts} /></span>
				<span data-testid="run-counts">{countsInWords(counts)}</span>
			</div>
		</div>
		<div class="header-actions">
			<Button variant="ghost" onclick={() => (shortcutsOpen = true)} data-testid="run-shortcuts">
				Keyboard shortcuts
			</Button>
			<Button onclick={copySummary} data-testid="run-copy-summary">
				<Icon name="copy" />Copy summary
			</Button>
			{#if completed}
				<Button onclick={reopen} loading={changingStatus} data-testid="run-reopen"
					>Reopen run</Button
				>
			{:else}
				<Button onclick={() => (completeOpen = true)} data-testid="run-complete">
					Complete run
				</Button>
			{/if}
		</div>
	</header>

	<div class="panes">
		<nav class="case-list" aria-label="Cases in this run">
			<details
				open={wide.current || listOpen}
				ontoggle={(e) => {
					// On wide screens the list is always open; only the narrow disclosure is the user's.
					if (!wide.current) listOpen = e.currentTarget.open;
				}}
			>
				<summary data-testid="run-case-list-toggle">
					Case {index + 1} of {run.cases.length} · show all
				</summary>
				<div class="list-body">
					<label class="filter">
						<span class="label">Show</span>
						<Select
							options={CASE_LIST_FILTERS}
							bind:value={listFilter}
							data-testid="run-case-filter"
						/>
					</label>
					{@render caseRows()}
				</div>
			</details>
		</nav>

		<section class="case-pane" class:switching aria-labelledby="run-case-title">
			{#key item.number}
				<div class="case-head">
					<div>
						<div class="eyebrow">
							<span class="mono" data-testid="run-case-key">{formatKey(item.number)}</span>
							<PriorityBadge priority={item.priority} />
						</div>
						<h2 id="run-case-title" tabindex="-1" bind:this={heading}>{item.title}</h2>
					</div>
					<div class="case-nav">
						<span class="subtle" data-testid="run-case-position">
							Case {index + 1} of {run.cases.length}
						</span>
						<Button
							size="sm"
							disabled={index === 0}
							onclick={() => goTo(index - 1)}
							data-testid="run-previous"
						>
							<Icon name="chevron-left" />Previous
						</Button>
						<Button
							size="sm"
							disabled={index === run.cases.length - 1}
							onclick={() => goTo(index + 1)}
							data-testid="run-next"
						>
							Next<Icon name="chevron-right" />
						</Button>
					</div>
				</div>

				{#if item.preconditions.trim()}
					<div class="block">
						<h3>Preconditions</h3>
						<p data-testid="run-preconditions">{item.preconditions}</p>
					</div>
				{/if}

				{#if item.steps.length > 0}
					<div class="block">
						<table class="steps">
							<caption class="visually-hidden">Steps for {formatKey(item.number)}</caption>
							<thead>
								<tr>
									<th scope="col">#</th>
									<th scope="col">Action</th>
									<th scope="col">Expected result</th>
								</tr>
							</thead>
							<tbody>
								{#each item.steps as step, s (s)}
									<tr
										class:failed={result?.status === 'fail' && result.failedStep === s + 1}
										data-testid="run-step"
									>
										<td>{s + 1}</td>
										<td>{step.action}</td>
										<td>
											{#if step.expected.trim()}{step.expected}{:else}<span class="subtle"
													>None</span
												>{/if}
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if item.expected.trim()}
					<div class="block">
						<h3>Expected result</h3>
						<p data-testid="run-expected">{item.expected}</p>
					</div>
				{/if}

				<div class="block">
					<ResultPanel
						bind:this={resultPanel}
						bind:form
						runId={run.id}
						{item}
						{shots}
						{result}
						{completed}
						onsave={save}
					/>
				</div>
			{/key}
		</section>
	</div>
{/if}

<Dialog bind:open={completeOpen} title="Complete this run?">
	<p data-testid="run-complete-body">{counts ? completeBody(counts.untested) : ''}</p>
	{#snippet actions()}
		<Button autofocus onclick={() => (completeOpen = false)}>Cancel</Button>
		<Button
			variant="primary"
			loading={changingStatus}
			onclick={complete}
			data-testid="run-confirm-complete"
		>
			Complete run
		</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={shortcutsOpen} title="Keyboard shortcuts">
	<p>They work when focus is not in a text field, a list, or a dialog.</p>
	<dl class="shortcuts" data-testid="run-shortcut-list">
		<dt><kbd>P</kbd><kbd>F</kbd><kbd>B</kbd></dt>
		<dd>Mark the case Pass, Fail, or Blocked</dd>
		<dt><kbd>J</kbd><kbd>K</kbd></dt>
		<dd>Next case, previous case</dd>
		<dt><kbd>?</kbd></dt>
		<dd>Show this list</dd>
	</dl>
	{#snippet actions()}
		<Button variant="primary" autofocus onclick={() => (shortcutsOpen = false)}>Close</Button>
	{/snippet}
</Dialog>

<style>
	.muted,
	.subtle {
		color: var(--color-text-muted);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.run-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	.run-title {
		flex: 1 1 420px;
		min-width: 0;
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
		overflow-wrap: anywhere;
	}

	.run-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		margin-top: var(--space-1);
		color: var(--color-text-muted);
	}

	.run-meta summary {
		max-width: 60ch;
		overflow: hidden;
		cursor: pointer;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.run-meta details p {
		max-width: 60ch;
		margin: var(--space-1) 0 0;
		white-space: pre-line;
	}

	.progress-line {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3);
		margin-top: var(--space-3);
		font-variant-numeric: tabular-nums;
	}

	.bar {
		display: flex;
		width: 240px;
	}

	.header-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
	}

	.panes {
		display: grid;
		grid-template-columns: 280px minmax(0, 1fr);
		align-items: start;
		gap: var(--space-6);
	}

	.case-list {
		position: sticky;
		top: var(--space-4);
	}

	.case-list summary {
		display: none;
	}

	.list-body {
		display: grid;
		gap: var(--space-2);
	}

	.filter {
		display: grid;
		gap: 6px;
	}

	.label {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	ol {
		max-height: calc(100vh - 140px);
		margin: 0;
		padding: 0;
		overflow: auto;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		list-style: none;
	}

	li + li {
		border-top: 1px solid var(--color-border);
	}

	.case-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-2);
		width: 100%;
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		border: 0;
		background: var(--color-bg);
		color: var(--color-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
	}

	.case-row:hover {
		background: var(--color-surface-raised);
	}

	.case-row[aria-current='true'] {
		background: var(--color-accent-subtle);
	}

	.case-row[aria-current='true'] .case-key {
		color: var(--color-accent);
	}

	.case-key {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
	}

	.case-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.no-cases {
		margin: 0;
		padding: var(--space-3);
		color: var(--color-text-muted);
	}

	/* Case switch (design 13.6): the pane fades in, opacity only. */
	.case-pane {
		min-width: 0;
		transition: opacity var(--duration-fast) var(--ease-out);
	}

	.case-pane.switching {
		opacity: 0;
		transition-duration: 0ms;
	}

	.case-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
		overflow-wrap: anywhere;
	}

	.eyebrow {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		margin-bottom: 2px;
		color: var(--color-text-muted);
	}

	.case-nav {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-variant-numeric: tabular-nums;
	}

	.block {
		margin-top: var(--space-6);
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
		font-weight: 600;
	}

	.block p {
		margin: 0;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	th,
	td {
		padding: var(--space-2) var(--space-3);
		border-bottom: 1px solid var(--color-border);
		text-align: left;
		vertical-align: top;
		white-space: pre-line;
		overflow-wrap: anywhere;
	}

	th {
		height: 40px;
		background: var(--color-surface);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 500;
	}

	td:first-child,
	th:first-child {
		width: 40px;
		font-variant-numeric: tabular-nums;
	}

	tr.failed td {
		background: var(--color-danger-bg);
	}

	tr.failed td:first-child {
		box-shadow: inset 3px 0 0 var(--color-danger);
	}

	.shortcuts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-2) var(--space-4);
		margin: var(--space-4) 0 0;
	}

	.shortcuts dt {
		display: flex;
		gap: var(--space-1);
	}

	.shortcuts dd {
		margin: 0;
	}

	kbd {
		min-width: 24px;
		padding: 0 6px;
		border: 1px solid var(--color-border-strong);
		border-radius: var(--radius-sm);
		font: 500 var(--text-xs) var(--font-mono);
		line-height: 22px;
		text-align: center;
	}

	@media (max-width: 1023px) {
		.panes {
			grid-template-columns: minmax(0, 1fr);
		}

		.case-list {
			position: static;
		}

		.case-list summary {
			display: block;
			padding: var(--space-2) var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-md);
			cursor: pointer;
		}

		.list-body {
			margin-top: var(--space-2);
		}
	}
</style>
