<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { resolve } from '$app/paths';
	import {
		countFindings,
		durationText,
		elapsedMs,
		findingCountsText
	} from '#lib/core/qa/session.ts';
	import type { Session } from '#lib/core/qa/types.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import DataTable, { type Column } from '#lib/ui/DataTable.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { deletedSessionText, deleteSessionBody, deleteSessionTitle } from './present.ts';
	import StartSession from './StartSession.svelte';

	// Sessions (design 13.3 P2-06; FR-130 AC-1). Newest first, as the store keeps them. The time
	// column is read once when the list is shown and does not tick (NFR-003); the session page
	// keeps the live clock.

	let list: HTMLDivElement | undefined = $state();
	let now = $state(Date.now());

	let deleteOpen = $state(false);
	let deleting: Session | null = $state(null);
	let removing = $state(false);

	// Runs only add release suggestions: the page works without them.
	const status = $derived(sessions.status);
	const findingsText = (session: Session) =>
		findingCountsText(countFindings(sessions.findingsOf(session.id)));
	const timeText = (session: Session) => durationText(elapsedMs(session, now));

	onMount(() => {
		void runs.load();
		void sessions.load().then(() => (now = Date.now()));
	});

	function confirmDelete(session: Session): void {
		deleting = session;
		deleteOpen = true;
	}

	function screenshotCount(session: Session): number {
		return sessions.screenshots.filter((item) => item.owner[1] === session.id).length;
	}

	async function remove(): Promise<void> {
		if (!deleting || removing) return;
		removing = true;
		const removed = await sessions.remove(deleting.id);
		removing = false;
		deleteOpen = false;
		notify.showToast(
			removed.ok ? deletedSessionText(deleting.charter) : WRITE_ERRORS[removed.error]
		);
		// The row and its Delete button are gone: focus goes to the table, or to the empty state.
		if (removed.ok) {
			await tick();
			list?.querySelector<HTMLElement>('[role="region"], [data-testid="sessions-empty"]')?.focus();
		}
	}

	const columns: Column<Session>[] = [
		{ key: 'charter', label: 'Charter', value: (s) => s.charter, cell: charterCell },
		{ key: 'release', label: 'Release', value: (s) => s.release, cell: releaseCell },
		{
			key: 'status',
			label: 'Status',
			value: (s) => s.status[0].toUpperCase() + s.status.slice(1),
			cell: statusCell
		},
		{ key: 'time', label: 'Time', value: timeText, cell: timeCell },
		{ key: 'findings', label: 'Findings', value: findingsText }
	];
</script>

{#snippet charterCell(session: Session)}
	<a class="charter" href={resolve(`/sessions/view?id=${encodeURIComponent(session.id)}`)}
		>{session.charter}</a
	>
{/snippet}

{#snippet releaseCell(session: Session)}
	{#if session.release}{session.release}{:else}<span class="muted">None</span>{/if}
{/snippet}

{#snippet statusCell(session: Session)}
	<StatusBadge status={session.status} />
{/snippet}

{#snippet timeCell(session: Session)}
	<span class="time">{timeText(session)} of {durationText(session.timeboxMinutes * 60_000)}</span>
{/snippet}

{#if status === 'loading'}
	<p class="muted" data-testid="sessions-loading">Loading sessions…</p>
{:else if status === 'unavailable'}
	<div data-testid="sessions-unavailable">
		<Callout variant="warning" title="Storage unavailable">
			Sessions need storage, which is unavailable in this tab, for example in a private window.
			Nothing can be saved here.
		</Callout>
	</div>
{:else}
	<StartSession />

	<h2>Sessions</h2>
	<div bind:this={list}>
		{#if sessions.list.length === 0}
			<div data-testid="sessions-empty" tabindex="-1">
				<EmptyState>No sessions yet. Start one with a charter and a timebox.</EmptyState>
			</div>
		{:else}
			<p class="count" data-testid="sessions-count">
				{sessions.list.length.toLocaleString('en')}
				{sessions.list.length === 1 ? 'session' : 'sessions'}
			</p>
			<DataTable
				caption="Sessions"
				{columns}
				rows={sessions.list}
				rowKey={(s) => s.id}
				rowTestId="sessions-row"
				enter={false}
			>
				{#snippet actions(session)}
					<Button size="sm" onclick={() => confirmDelete(session)} data-testid="sessions-delete">
						Delete<span class="visually-hidden"> {session.charter}</span>
					</Button>
				{/snippet}
			</DataTable>
		{/if}
	</div>
{/if}

<Dialog
	bind:open={deleteOpen}
	title={deleting ? deleteSessionTitle(deleting.charter) : ''}
	destructive
>
	<p data-testid="sessions-delete-findings">
		{deleting
			? deleteSessionBody(sessions.findingsOf(deleting.id).length, screenshotCount(deleting))
			: ''}
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			loading={removing}
			onclick={remove}
			data-testid="sessions-confirm-delete"
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.muted {
		color: var(--color-text-muted);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
	}

	.count {
		margin: 0 0 var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.charter {
		color: var(--color-accent);
		font-weight: 500;
		text-decoration: none;
		overflow-wrap: anywhere;
	}

	.charter:hover {
		text-decoration: underline;
	}

	.time {
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}
</style>
