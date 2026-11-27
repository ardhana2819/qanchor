<script lang="ts">
	import { onDestroy, onMount, tick, untrack } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		countFindings,
		durationText,
		elapsedMs,
		findingCountsText,
		msUntilNextMinute,
		sortFindings,
		timeboxReached
	} from '#lib/core/qa/session.ts';
	import type { Finding } from '#lib/core/qa/types.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { runs } from '#lib/state/runs.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import PageState from '#lib/ui/PageState.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import EditSessionDialog from './EditSessionDialog.svelte';
	import { FindingShots } from './finding-shots.svelte.ts';
	import FindingComposer from './FindingComposer.svelte';
	import FindingItem from './FindingItem.svelte';
	import {
		clockLine,
		deleteFindingBody,
		FINDING_FILTER_OPTIONS,
		noFindingsOfType,
		TIMEBOX_REACHED,
		type FindingFilter
	} from './present.ts';

	// Session page (design 13.3 P2-06; FR-130 AC-2 to AC-6, FR-131). The clock shows whole
	// minutes, so the page wakes once a minute while the session runs and the page is visible,
	// and not at all otherwise; it catches up when the page is shown again (AC-3, NFR-003).

	let mounted = $state(false);
	let now = $state(Date.now());
	let filter: FindingFilter = $state('all');
	let changing = $state(false);
	let endOpen = $state(false);
	let deleteOpen = $state(false);
	let deleting: Finding | null = $state.raw(null);
	let removing = $state(false);
	let editDialog: EditSessionDialog | undefined = $state();
	let header: HTMLElement | undefined = $state();
	/** Findings added during this visit, which play the enter animation. */
	const fresh = new SvelteSet<string>();
	/** Whether the timebox was already reached when the page opened: its callout then stays still. */
	let reachedOnOpen: boolean | null = $state(null);
	const shots = new FindingShots();
	onDestroy(() => shots.dispose());

	const id = $derived(mounted ? page.url.searchParams.get('id') : null);
	const session = $derived(id ? sessions.list.find((s) => s.id === id) : undefined);
	const environmentLine = $derived(session?.environment.trim().split(/\r?\n/, 1)[0] ?? '');
	const findings = $derived(session ? sortFindings(sessions.findingsOf(session.id)) : []);
	const shown = $derived(
		filter === 'all' ? findings : findings.filter((finding) => finding.type === filter)
	);
	const reached = $derived(
		session !== undefined && session.status !== 'ended' && timeboxReached(session, now)
	);

	onMount(() => {
		mounted = true;
		// A session URL without an ID goes to the list, replacing itself so Back skips it (EC-028).
		if (!page.url.searchParams.get('id')) {
			void goto(resolve('/sessions'), { replace: true });
			return;
		}
		// Runs only add release suggestions to Edit details.
		void runs.load();
		void sessions.load();
	});

	// The images of every finding are read once the session is.
	$effect(() => {
		if (!session) return;
		const of = untrack(() => sessions.findingsOf(session.id));
		untrack(() => {
			if (!shots.loaded) void shots.load(of);
		});
	});

	// The clock (FR-130 AC-2, AC-3): `now` moves when the shown minute changes, only while the
	// session runs and the page is visible; on becoming visible it catches up at once.
	$effect(() => {
		if (!session) return;
		const current = session;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const tick = () => {
			clearTimeout(timer);
			const time = Date.now();
			now = time;
			if (document.visibilityState !== 'visible') return;
			const wait = msUntilNextMinute(current, time);
			if (wait !== null) timer = setTimeout(tick, wait);
		};
		tick();
		document.addEventListener('visibilitychange', tick);
		return () => {
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', tick);
		};
	});

	// The timebox notice (FR-130 AC-4) is said once, when it is reached during the visit.
	$effect(() => {
		if (!session) return;
		const isReached = reached;
		untrack(() => {
			if (reachedOnOpen === null) reachedOnOpen = isReached;
			else if (isReached && !reachedOnOpen) notify.announce(TIMEBOX_REACHED);
		});
	});

	async function change(
		action: (id: string) => ReturnType<typeof sessions.pause>,
		focusAfter: string
	): Promise<void> {
		if (!session || changing) return;
		changing = true;
		const changed = await action(session.id);
		changing = false;
		if (!changed.ok) {
			notify.showToast(WRITE_ERRORS[changed.error]);
			return;
		}
		// The pressed button is replaced: focus goes to the one that takes its place.
		await tick();
		header?.querySelector<HTMLElement>(`[data-testid="${focusAfter}"]`)?.focus();
	}

	async function end(): Promise<void> {
		endOpen = false;
		await change((id) => sessions.end(id), 'session-edit');
		if (session?.status === 'ended') notify.showToast('Session ended.');
	}

	function confirmDelete(finding: Finding): void {
		deleting = finding;
		deleteOpen = true;
	}

	async function removeFinding(): Promise<void> {
		if (!deleting || removing) return;
		removing = true;
		const ids = sessions.screenshotsOf(deleting).map((meta) => meta.id);
		const removed = await sessions.removeFinding(deleting);
		removing = false;
		deleteOpen = false;
		if (!removed.ok) {
			notify.showToast(WRITE_ERRORS[removed.error]);
			return;
		}
		shots.forget(ids);
		notify.showToast('Finding deleted.');
		// Its row is gone: focus goes to the findings heading.
		await tick();
		document.getElementById('findings-heading')?.focus();
	}

	function added(finding: Finding): void {
		fresh.add(finding.id);
		// A new finding of another type than the filter would be hidden: show all.
		if (filter !== 'all' && filter !== finding.type) filter = 'all';
	}
</script>

<svelte:head>
	<title>{session ? session.charter : 'Session'} · QAnchor</title>
</svelte:head>

{#if !mounted || sessions.status === 'loading'}
	<p class="muted" data-testid="session-loading">Loading session…</p>
{:else if sessions.status === 'unavailable'}
	<p class="muted" data-testid="session-unavailable">
		Sessions need storage, which is unavailable in this tab, for example in a private window.
	</p>
{:else if !session}
	<div data-testid="session-not-found">
		<PageState title="Session not found">
			It may have been deleted, or it was started in another browser.
			{#snippet action()}
				<a href={resolve('/sessions')}>Back to sessions</a>
			{/snippet}
		</PageState>
	</div>
{:else}
	<header class="session-header" bind:this={header}>
		<div class="title">
			<h1>
				<span data-testid="session-charter-heading">{session.charter}</span>
				<StatusBadge status={session.status} />
			</h1>
			<div class="meta" data-testid="session-meta">
				<span>Timebox {durationText(session.timeboxMinutes * 60_000)}</span>
				{#if session.release}<span>Release <span class="mono">{session.release}</span></span>{/if}
				{#if environmentLine}
					<details data-testid="session-environment-line">
						<summary>Environment: {environmentLine}</summary>
						<p>{session.environment}</p>
					</details>
				{/if}
			</div>
			<p class="clock" data-testid="session-clock">{clockLine(session, now)}</p>
		</div>
		<div class="header-actions">
			<Button onclick={() => editDialog?.show()} data-testid="session-edit">Edit details</Button>
			{#if session.status === 'running'}
				<Button
					onclick={() => change((id) => sessions.pause(id), 'session-resume')}
					loading={changing}
					data-testid="session-pause">Pause</Button
				>
			{:else if session.status === 'paused'}
				<Button
					onclick={() => change((id) => sessions.resume(id), 'session-pause')}
					loading={changing}
					data-testid="session-resume">Resume</Button
				>
			{/if}
			{#if session.status !== 'ended'}
				<Button variant="primary" onclick={() => (endOpen = true)} data-testid="session-end">
					End session
				</Button>
			{/if}
		</div>
	</header>

	{#if reached}
		<div class="callout" class:animate={reachedOnOpen === false} data-testid="session-timebox">
			<Callout variant="info">{TIMEBOX_REACHED}</Callout>
		</div>
	{/if}

	<FindingComposer {session} {shots} onadded={added} />

	<section aria-labelledby="findings-heading">
		<div class="findings-head">
			<h2 id="findings-heading" tabindex="-1">Findings</h2>
			<span class="counts" data-testid="session-finding-counts">
				{findingCountsText(countFindings(findings))}
			</span>
			{#if findings.length > 0}
				<div class="filter">
					<SegmentedControl
						legend="Show findings of type"
						options={FINDING_FILTER_OPTIONS}
						value={filter}
						onchange={(next) => (filter = next)}
					/>
				</div>
			{/if}
		</div>

		{#if findings.length === 0}
			<div data-testid="session-findings-empty">
				<EmptyState>No findings yet. Note what you observe as you go.</EmptyState>
			</div>
		{:else if shown.length === 0 && filter !== 'all'}
			<p class="muted" data-testid="session-findings-none">{noFindingsOfType(filter)}</p>
		{:else}
			<ul class="findings" data-testid="session-findings">
				{#each shown as finding (finding.id)}
					<FindingItem {finding} {shots} fresh={fresh.has(finding.id)} ondelete={confirmDelete} />
				{/each}
			</ul>
		{/if}
	</section>

	<EditSessionDialog bind:this={editDialog} {session} />

	<Dialog bind:open={endOpen} title="End this session?">
		<p data-testid="session-end-body">
			The clock stops at {durationText(elapsedMs(session, now))}. An ended session cannot be
			restarted; you can still edit its details and findings, and add findings.
		</p>
		{#snippet actions()}
			<Button autofocus onclick={() => (endOpen = false)}>Cancel</Button>
			<Button variant="primary" onclick={end} data-testid="session-confirm-end">End session</Button>
		{/snippet}
	</Dialog>
{/if}

<Dialog bind:open={deleteOpen} title="Delete this finding?" destructive>
	<p data-testid="finding-delete-body">
		{deleting ? deleteFindingBody(sessions.screenshotsOf(deleting).length) : ''}
	</p>
	{#snippet actions()}
		<!-- Cancel comes first and takes focus: deleting cannot be undone. -->
		<Button autofocus onclick={() => (deleteOpen = false)}>Cancel</Button>
		<Button
			variant="danger"
			loading={removing}
			onclick={removeFinding}
			data-testid="finding-confirm-delete"
		>
			Delete
		</Button>
	{/snippet}
</Dialog>

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.session-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	.title {
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

	.meta {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		margin-top: var(--space-1);
		color: var(--color-text-muted);
	}

	.meta summary {
		max-width: 60ch;
		overflow: hidden;
		cursor: pointer;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.meta details p {
		max-width: 60ch;
		margin: var(--space-1) 0 0;
		white-space: pre-line;
	}

	.clock {
		margin: var(--space-3) 0 0;
		font-size: var(--text-lg);
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}

	.header-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.callout {
		margin-bottom: var(--space-6);
	}

	/* Timebox reached (design 13.6): drawn attention to once. */
	.callout.animate {
		animation: callout-in var(--duration-base) var(--ease-out) backwards;
	}

	@keyframes callout-in {
		from {
			opacity: 0;
			transform: translateY(4px);
		}
	}

	.findings-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
		margin-bottom: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
		font-weight: 600;
		line-height: var(--leading-lg);
	}

	.counts {
		color: var(--color-text-muted);
		font-size: var(--text-sm);
	}

	.filter {
		margin-left: auto;
	}

	.findings {
		margin: 0;
		padding: 0;
		list-style: none;
	}
</style>
