<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { formatKey } from '#lib/core/qa/keys.ts';
	import {
		findRelease,
		groupReleases,
		latestResults,
		passRateText,
		releaseSummaryMarkdown,
		releaseTotals,
		type LatestRow
	} from '#lib/core/qa/release.ts';
	import { countStatuses, countsInWords, issueHref } from '#lib/core/qa/run.ts';
	import {
		countFindings,
		durationText,
		elapsedMs,
		findingCountsText
	} from '#lib/core/qa/session.ts';
	import { firstLine } from '#lib/core/qa/summary.ts';
	import type { Run, Session } from '#lib/core/qa/types.ts';
	import { clipboard } from '#lib/state/clipboard.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import PageState from '#lib/ui/PageState.svelte';
	import ResultsBar from '#lib/ui/ResultsBar.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import { loadReleaseData, releaseData, releaseDataStatus } from './data.ts';
	import {
		COPIED_SUMMARY,
		otherCasesText,
		passRateDetail,
		releaseCountsText,
		unknownReleaseText,
		requestedRelease
	} from './present.ts';

	// Release page (design 13.3 P2-07; FR-140 AC-2 to AC-4, FR-141). Totals come from the latest
	// result per case (plan finding F-16); each run keeps its own counts. Session times are read
	// once when the page opens and do not tick.

	let mounted = $state(false);
	let now = $state(Date.now());

	const requested = $derived(mounted ? requestedRelease(page.url.searchParams) : null);
	const status = $derived(releaseDataStatus());
	const data = $derived(releaseData());
	const group = $derived(
		status === 'ready' && requested !== null ? findRelease(groupReleases(data), requested) : null
	);
	const rows = $derived(group ? latestResults(group.runs, data.results) : []);
	const totals = $derived(releaseTotals(rows));
	const open = $derived(rows.filter((row) => row.result && row.result.status !== 'pass'));
	const others = $derived(rows.filter((row) => !row.result || row.result.status === 'pass'));

	onMount(() => {
		mounted = true;
		// A release URL that names no release goes to the list, replacing itself (EC-028).
		if (requestedRelease(page.url.searchParams) === null) {
			void goto(resolve('/releases'), { replace: true });
			return;
		}
		void loadReleaseData().then(() => (now = Date.now()));
	});

	function copySummary(): void {
		if (!group) return;
		void clipboard.copy(releaseSummaryMarkdown(group, data, Date.now()), COPIED_SUMMARY);
	}

	const detailOf = (row: LatestRow) =>
		row.result
			? firstLine(row.result.status === 'fail' ? row.result.actual : row.result.reason)
			: '';

	const runColumns: Column<Run>[] = [
		{ key: 'name', label: 'Run', value: (r) => r.name, cell: runNameCell },
		{
			key: 'status',
			label: 'Status',
			value: (r) => (r.status === 'completed' ? 'Completed' : 'In progress'),
			cell: runStatusCell
		},
		{
			key: 'results',
			label: 'Results',
			value: (r) => countsInWords(countStatuses(r.id, r.cases, data.results)),
			cell: runResultsCell
		}
	];

	const caseColumns: Column<LatestRow>[] = [
		{ key: 'key', label: 'Key', value: (row) => formatKey(row.item.number), mono: true },
		{ key: 'title', label: 'Title', value: (row) => row.item.title },
		{
			key: 'status',
			label: 'Status',
			value: (row) => row.result?.status ?? 'untested',
			cell: caseStatusCell
		},
		{ key: 'detail', label: 'Actual result or reason', value: detailOf },
		{
			key: 'issue',
			label: 'Linked issue',
			value: (row) => row.result?.linkedIssue ?? '',
			cell: issueCell
		}
	];

	const sessionColumns: Column<Session>[] = [
		{ key: 'charter', label: 'Charter', value: (s) => s.charter, cell: charterCell },
		{
			key: 'status',
			label: 'Status',
			value: (s) => s.status[0].toUpperCase() + s.status.slice(1),
			cell: sessionStatusCell
		},
		{ key: 'time', label: 'Time', value: (s) => durationText(elapsedMs(s, now)) },
		{
			key: 'findings',
			label: 'Findings',
			value: (s) =>
				findingCountsText(countFindings(data.findings.filter((f) => f.sessionId === s.id)))
		}
	];
</script>

{#snippet runNameCell(run: Run)}
	<a class="link" href={resolve(`/runs/view?id=${encodeURIComponent(run.id)}`)}>{run.name}</a>
{/snippet}

{#snippet runStatusCell(run: Run)}
	<StatusBadge status={run.status} />
{/snippet}

{#snippet runResultsCell(run: Run)}
	{@const counts = countStatuses(run.id, run.cases, data.results)}
	<span class="results">
		<ResultsBar {counts} />
		<span class="counts">{countsInWords(counts)}</span>
	</span>
{/snippet}

{#snippet caseStatusCell(row: LatestRow)}
	<StatusBadge status={row.result?.status ?? 'untested'} />
{/snippet}

{#snippet issueCell(row: LatestRow)}
	{@const issue = row.result?.linkedIssue.trim() ?? ''}
	{@const href = issueHref(issue)}
	{#if href}
		<!-- An external page: resolve() is for the app's own routes. -->
		<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
		<a class="link issue" {href} target="_blank" rel="noopener noreferrer">{issue}</a>
	{:else}
		{issue}
	{/if}
{/snippet}

{#snippet charterCell(session: Session)}
	<a class="link" href={resolve(`/sessions/view?id=${encodeURIComponent(session.id)}`)}
		>{session.charter}</a
	>
{/snippet}

{#snippet sessionStatusCell(session: Session)}
	<StatusBadge status={session.status} />
{/snippet}

<svelte:head>
	<title>{group ? `${group.name} · Releases` : 'Release'} · QAnchor</title>
</svelte:head>

{#if !mounted || status === 'loading' || requested === null}
	<p class="muted" data-testid="release-loading">Loading release…</p>
{:else if status === 'unavailable'}
	<p class="muted" data-testid="release-unavailable">
		Releases are built from your runs and sessions, which need storage. Storage is unavailable in
		this tab, for example in a private window.
	</p>
{:else if !group}
	<div data-testid="release-not-found">
		<PageState title="Release not found">
			{unknownReleaseText(requested || 'No release')}
			{#snippet action()}
				<a href={resolve('/releases')}>Back to releases</a>
			{/snippet}
		</PageState>
	</div>
{:else}
	<header class="release-header">
		<div class="title">
			<h1 data-testid="release-heading">{group.name}</h1>
			<p class="meta" data-testid="release-meta">{releaseCountsText(group)}</p>
		</div>
		<Button variant="primary" onclick={copySummary} data-testid="release-copy">
			<Icon name="copy" />Copy summary
		</Button>
	</header>

	<!-- The five figures over the latest result per case (FR-140 AC-2, FR-141 AC-2). -->
	<dl class="stats" data-testid="release-stats">
		<div>
			<dt>Executed</dt>
			<dd data-testid="release-executed">{totals.executed}</dd>
			<dd class="stat-note">of {totals.total} {totals.total === 1 ? 'case' : 'cases'}</dd>
		</div>
		<div>
			<dt>Pass rate</dt>
			<dd data-testid="release-pass-rate">{passRateText(totals)}</dd>
			<dd class="stat-note" data-testid="release-pass-rate-detail">{passRateDetail(totals)}</dd>
		</div>
		<div>
			<dt>Failed</dt>
			<dd class:danger={totals.fail > 0} data-testid="release-failed">{totals.fail}</dd>
		</div>
		<div>
			<dt>Blocked</dt>
			<dd class:warning={totals.blocked > 0} data-testid="release-blocked">{totals.blocked}</dd>
		</div>
		<div>
			<dt>Untested</dt>
			<dd data-testid="release-untested">{totals.untested}</dd>
		</div>
	</dl>

	<section aria-labelledby="release-runs">
		<h2 id="release-runs">Runs</h2>
		{#if group.runs.length === 0}
			<p class="muted" data-testid="release-no-runs">No run uses this release.</p>
		{:else}
			<DataTable
				caption="Runs of this release"
				columns={runColumns}
				rows={group.runs}
				rowKey={(r) => r.id}
				rowTestId="release-run-row"
				enter={false}
			/>
		{/if}
	</section>

	{#if rows.length > 0}
		<section aria-labelledby="release-cases">
			<h2 id="release-cases">Latest result per case</h2>
			<p class="section-note">
				Each case once, with its most recent result over the runs of this release.
			</p>
			{#if open.length === 0}
				<p class="muted" data-testid="release-no-open">No case failed or is blocked.</p>
			{:else}
				<DataTable
					caption="Failed and blocked cases"
					columns={caseColumns}
					rows={open}
					rowKey={(row) => `${row.item.number}`}
					rowTestId="release-open-row"
					enter={false}
				/>
			{/if}
			{#if others.length > 0}
				<details class="others" data-testid="release-others">
					<summary>
						<Icon name="chevron-right" />{otherCasesText(totals.pass, totals.untested)}
					</summary>
					<DataTable
						caption="Passed and untested cases"
						columns={caseColumns}
						rows={others}
						rowKey={(row) => `${row.item.number}`}
						rowTestId="release-other-row"
						enter={false}
					/>
				</details>
			{/if}
		</section>
	{/if}

	<section aria-labelledby="release-sessions">
		<h2 id="release-sessions">Sessions</h2>
		{#if group.sessions.length === 0}
			<p class="muted" data-testid="release-no-sessions">No session uses this release.</p>
		{:else}
			<DataTable
				caption="Sessions of this release"
				columns={sessionColumns}
				rows={group.sessions}
				rowKey={(s) => s.id}
				rowTestId="release-session-row"
				enter={false}
			/>
		{/if}
	</section>
{/if}

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.release-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
	}

	.title {
		flex: 1 1 420px;
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
		overflow-wrap: anywhere;
	}

	.meta {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.stats {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: var(--space-3);
		margin: 0 0 var(--space-8);
	}

	.stats > div {
		padding: var(--space-3) var(--space-4);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		background: var(--color-surface);
	}

	dt {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	dd {
		margin: var(--space-1) 0 0;
		font-size: var(--text-xl);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		line-height: var(--leading-xl);
	}

	dd.danger {
		color: var(--color-danger);
	}

	dd.warning {
		color: var(--color-warning);
	}

	dd.stat-note {
		margin: 0;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-weight: 400;
		line-height: var(--leading-xs);
	}

	section {
		margin-bottom: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
	}

	.section-note {
		margin: calc(-1 * var(--space-2)) 0 var(--space-3);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.link {
		color: var(--color-accent);
		font-weight: 500;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.link:hover {
		text-decoration: underline;
	}

	.issue {
		font-weight: 400;
	}

	.results {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		min-width: 160px;
	}

	.counts {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		font-variant-numeric: tabular-nums;
	}

	.others {
		margin-top: var(--space-3);
	}

	.others summary {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-3);
		color: var(--color-accent);
		font-weight: 500;
		cursor: pointer;
		list-style: none;
	}

	.others summary::-webkit-details-marker {
		display: none;
	}

	.others summary :global(.icon) {
		transition: transform var(--duration-fast) var(--ease-out);
	}

	.others[open] summary :global(.icon) {
		transform: rotate(90deg);
	}

	@media (max-width: 899px) {
		.stats {
			grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		}
	}
</style>
