<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Progress from '#lib/ui/Progress.svelte';
	import { PERSIST_REFUSED, usageText } from './storage-status.ts';

	// Storage in Settings (design 13.3 S-10, 13.7; FR-092 AC-1, AC-2). The browser is asked to
	// keep data persistent only when "Keep data persistent" is clicked: Firefox shows a prompt, and
	// its promise settles only when the user answers (T-057), so the page waits for it.

	type Usage = { usage: number; quota: number | undefined } | null;

	let status: 'checking' | 'ready' | 'unsupported' = $state('checking');
	let usage: Usage = $state.raw(null);
	let persisted: boolean | null = $state(null);
	let asking = $state(false);
	let answer: 'refused' | 'failed' | null = $state(null);
	let outcomeBox: HTMLDivElement | undefined = $state();

	const api = () => (typeof navigator === 'undefined' ? undefined : navigator.storage);

	onMount(async () => {
		const storage = api();
		if (!storage?.estimate && !storage?.persisted) {
			status = 'unsupported';
			return;
		}
		const [estimate, isPersisted] = await Promise.all([
			storage.estimate?.().catch(() => null) ?? null,
			storage.persisted?.().catch(() => null) ?? null
		]);
		usage = estimate?.usage === undefined ? null : { usage: estimate.usage, quota: estimate.quota };
		persisted = isPersisted;
		status = 'ready';
	});

	async function keepPersistent(): Promise<void> {
		const storage = api();
		if (!storage?.persist || asking) return;
		asking = true;
		answer = null;
		try {
			persisted = await storage.persist();
			if (persisted) notify.announce('Storage is now persistent.');
			else answer = 'refused';
		} catch {
			answer = 'failed';
		} finally {
			asking = false;
		}
		if (answer) {
			await tick();
			outcomeBox?.querySelector<HTMLElement>('.callout')?.focus();
		}
	}
</script>

<section class="storage" aria-labelledby="storage" data-testid="settings-storage">
	<h3 id="storage">Storage</h3>

	{#if status === 'checking'}
		<p class="muted" data-testid="storage-status">Checking storage…</p>
	{:else if status === 'unsupported'}
		<p class="muted" data-testid="storage-status">
			This browser does not report how much storage is used or whether it is persistent.
		</p>
	{:else}
		{#if usage}
			<div class="usage">
				<Progress
					label={usageText(usage.usage, usage.quota)}
					value={usage.usage}
					max={usage.quota ?? usage.usage}
					data-testid="storage-usage"
				/>
			</div>
		{/if}

		{#if persisted !== null}
			<div class="line" data-testid="storage-persistence">
				{#if persisted}
					<Badge variant="success">Persistent</Badge>
					<span class="muted">The browser keeps this data unless you clear it.</span>
				{:else}
					<Badge variant="warning">Not persistent</Badge>
					<span class="muted">The browser may delete this data when disk space runs low.</span>
				{/if}
			</div>
		{/if}

		{#if persisted === false && api()?.persist}
			<div class="actions">
				<Button loading={asking} onclick={keepPersistent} data-testid="storage-persist">
					Keep data persistent
				</Button>
				{#if asking}
					<span class="muted" data-testid="storage-asking">Waiting for the browser's answer…</span>
				{/if}
			</div>
		{/if}

		<div bind:this={outcomeBox}>
			{#if answer === 'refused'}
				<Callout variant="info" title="The browser did not make storage persistent.">
					<p>{PERSIST_REFUSED}</p>
				</Callout>
			{:else if answer === 'failed'}
				<Callout variant="danger" title="The browser could not be asked." role="alert">
					<p>Reload the page, then try again.</p>
				</Callout>
			{/if}
		</div>
	{/if}
</section>

<style>
	.storage {
		display: grid;
		gap: var(--space-3);
		margin-top: var(--space-8);
	}

	h3 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
	}

	.muted {
		margin: 0;
		color: var(--color-text-muted);
	}

	.usage {
		max-width: 480px;
	}

	.line,
	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2) var(--space-3);
	}
</style>
