<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { durationText } from '#lib/core/qa/session.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import PageState from '#lib/ui/PageState.svelte';
	import StatusBadge from '#lib/ui/StatusBadge.svelte';

	// Session page (design 13.3 P2-06). This task (T-069) gives it the record and its header, so
	// Start session has a page to open; T-070 adds the clock, its controls, and the findings.

	let mounted = $state(false);

	const id = $derived(mounted ? page.url.searchParams.get('id') : null);
	const session = $derived(id ? sessions.list.find((s) => s.id === id) : undefined);
	const environmentLine = $derived(session?.environment.trim().split(/\r?\n/, 1)[0] ?? '');

	onMount(() => {
		mounted = true;
		// A session URL without an ID goes to the list, replacing itself so Back skips it (EC-028).
		if (!page.url.searchParams.get('id')) {
			void goto(resolve('/sessions'), { replace: true });
			return;
		}
		void sessions.load();
	});
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
	<header class="session-header">
		<h1>
			<span data-testid="session-charter-heading">{session.charter}</span>
			<StatusBadge status={session.status} />
		</h1>
		<div class="meta" data-testid="session-meta">
			<span>Timebox {durationText(session.timeboxMinutes * 60_000)}</span>
			{#if session.release}<span>Release <span class="mono">{session.release}</span></span>{/if}
			{#if environmentLine}
				<details data-testid="session-environment">
					<summary>Environment: {environmentLine}</summary>
					<p>{session.environment}</p>
				</details>
			{/if}
		</div>
	</header>
{/if}

<style>
	.muted {
		color: var(--color-text-muted);
	}

	.mono {
		font-family: var(--font-mono);
	}

	.session-header {
		margin-bottom: var(--space-6);
		padding-bottom: var(--space-6);
		border-bottom: 1px solid var(--color-border);
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
</style>
