<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		groupReleases,
		latestResults,
		passRateText,
		releaseTotals,
		type ReleaseGroup
	} from '#lib/core/qa/release.ts';
	import { fullDateTime, relativeTime } from '#lib/core/relative-time.ts';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import { loadReleaseData, releaseData, releaseDataStatus } from './data.ts';
	import { releaseQuery } from './present.ts';

	// Releases (design 13.3 P2-07; FR-140 AC-1, AC-5): every release used by a run or a session,
	// latest activity first, "No release" last. "Last activity" is read once and does not tick.

	let now = $state(Date.now());

	const status = $derived(releaseDataStatus());
	const data = $derived(releaseData());
	const groups = $derived(status === 'ready' ? groupReleases(data) : []);
	const rateOf = (group: ReleaseGroup) =>
		passRateText(releaseTotals(latestResults(group.runs, data.results)));

	onMount(() => {
		void loadReleaseData().then(() => (now = Date.now()));
	});

	const columns: Column<ReleaseGroup>[] = [
		{ key: 'release', label: 'Release', value: (g) => g.name, cell: releaseCell },
		{ key: 'runs', label: 'Runs', value: (g) => `${g.runs.length}`, numeric: true },
		{ key: 'sessions', label: 'Sessions', value: (g) => `${g.sessions.length}`, numeric: true },
		{ key: 'rate', label: 'Pass rate', value: rateOf, numeric: true },
		{
			key: 'activity',
			label: 'Last activity',
			value: (g) => relativeTime(g.lastActivity, now),
			cell: activityCell
		}
	];
</script>

{#snippet releaseCell(group: ReleaseGroup)}
	<a class="release" href={resolve(`/releases/view?${releaseQuery(group)}`)}>{group.name}</a>
{/snippet}

{#snippet activityCell(group: ReleaseGroup)}
	<time
		datetime={new Date(group.lastActivity).toISOString()}
		title={fullDateTime(group.lastActivity)}
		class="activity">{relativeTime(group.lastActivity, now)}</time
	>
{/snippet}

{#if status === 'loading'}
	<p class="muted" data-testid="releases-loading">Loading releases…</p>
{:else if status === 'unavailable'}
	<div data-testid="releases-unavailable">
		<Callout variant="warning" title="Storage unavailable">
			Releases are built from your runs and sessions, which need storage. Storage is unavailable in
			this tab, for example in a private window.
		</Callout>
	</div>
{:else if groups.length === 0}
	<div data-testid="releases-empty">
		<EmptyState>No releases yet. Add a release to a run or a session to see it here.</EmptyState>
	</div>
{:else}
	<p class="count" data-testid="releases-count">
		{groups.length.toLocaleString('en')}
		{groups.length === 1 ? 'release' : 'releases'}
	</p>
	<DataTable
		caption="Releases"
		{columns}
		rows={groups}
		rowKey={(g) => g.key}
		rowTestId="releases-row"
		enter={false}
	/>
{/if}

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.count {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.release {
		color: var(--color-accent);
		font-weight: 500;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.release:hover {
		text-decoration: underline;
	}

	.activity {
		white-space: nowrap;
	}
</style>
