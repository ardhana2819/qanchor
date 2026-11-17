<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { explorerTxUrl, NETWORKS, networkById, type Network } from '#lib/config/networks.ts';
	import { parseTxHash, TX_HASH_FORMAT } from '#lib/core/tx/hash.ts';
	import type { TxResult } from '#lib/core/tx/types.ts';
	import { resolveEndpoint, type Endpoint } from '#lib/net/endpoint.ts';
	import { lookupTx } from '#lib/net/lookup.ts';
	import type { LookupError } from '#lib/net/request.ts';
	import { endpointOverrides } from '#lib/state/endpoints.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import EmptyState from '#lib/ui/EmptyState.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { errorCopy } from './present.ts';
	import TxResultView from './TxResultView.svelte';

	// Tx lookup (FR-040, FR-042, FR-043, design S-05). One lookup at a time (EC-024); leaving the
	// page aborts it (FR-040 AC-5, NFR-019); nothing is requested without a submit (AC-6).

	const NETWORK_OPTIONS = NETWORKS.map((n) => ({ value: n.id, label: n.name }));

	interface Query {
		network: Network;
		endpoint: Endpoint;
		hash: string;
	}

	type Outcome =
		| { kind: 'result'; query: Query; tx: TxResult }
		| { kind: 'error'; query: Query; error: LookupError };

	let networkId = $state('eth');
	let hashInput = $state('');
	let hashError: string | undefined = $state();
	let running = $state<Query | null>(null);
	let outcome = $state<Outcome | null>(null);
	let outcomeBox: HTMLElement | undefined = $state();

	const network = $derived(networkById(networkId) as Network);
	const parsedHash = $derived(parseTxHash(network.chain, hashInput));
	const explorerUrl = $derived(parsedHash.ok ? explorerTxUrl(network, parsedHash.value) : null);

	// Overrides are read once; a lookup waits for them so it never goes to a default by mistake.
	let overridesRead: Promise<void> = Promise.resolve();
	let controller: AbortController | null = null;
	let destroyed = false;

	onMount(() => {
		overridesRead = endpointOverrides.load();
	});

	onDestroy(() => {
		destroyed = true;
		controller?.abort();
	});

	async function run(query: Omit<Query, 'endpoint'>): Promise<void> {
		if (running) return;
		await overridesRead;
		if (destroyed) return;
		const endpoint = resolveEndpoint(query.network, endpointOverrides.list);
		const current: Query = { ...query, endpoint };
		running = current;
		controller = new AbortController();
		const result = await lookupTx(current.network, endpoint, current.hash, {
			signal: controller.signal
		});
		// After an abort (the page was left) nothing may change (FR-040 AC-5).
		if (destroyed || (!result.ok && result.error.code === 'aborted')) return;
		running = null;
		controller = null;
		outcome = result.ok
			? { kind: 'result', query: current, tx: result.value }
			: { kind: 'error', query: current, error: result.error };
		if (!result.ok) {
			// Focus moves to the error so keyboard and screen-reader users land on it (AC-6).
			await tick();
			outcomeBox?.querySelector<HTMLElement>('[role="alert"]')?.focus();
		}
	}

	function submit(event: SubmitEvent): void {
		event.preventDefault();
		if (!parsedHash.ok) {
			// Checked before any request (FR-040 AC-4).
			hashError =
				parsedHash.error === 'empty' ? 'Paste a transaction hash.' : TX_HASH_FORMAT[network.chain];
			return;
		}
		void run({ network, hash: parsedHash.value });
	}

	function retry(): void {
		if (outcome) void run({ network: outcome.query.network, hash: outcome.query.hash });
	}

	const shown = $derived(
		outcome?.kind === 'error'
			? errorCopy(outcome.error, outcome.query.network, outcome.query.endpoint)
			: null
	);
</script>

<FormPanel aria-label="Lookup" onsubmit={submit} novalidate>
	<div class="grid">
		<Field label="Network">
			{#snippet children(control)}
				<Select
					{...control}
					options={NETWORK_OPTIONS}
					bind:value={networkId}
					onchange={() => (hashError = undefined)}
					data-testid="tx-network"
				/>
			{/snippet}
		</Field>
		<Field
			label="Transaction hash"
			hint="The network cannot be told from the hash, so pick it first."
			error={hashError}
		>
			{#snippet children(control)}
				<TextInput
					{...control}
					mono
					bind:value={hashInput}
					oninput={() => (hashError = undefined)}
					autocomplete="off"
					spellcheck={false}
					data-testid="tx-hash"
				/>
			{/snippet}
		</Field>
	</div>

	{#snippet footer()}
		<span class="summary" aria-live="polite" data-testid="tx-progress">
			{#if running}Asking {running.endpoint.host}…{/if}
		</span>
		<span class="actions">
			{#if explorerUrl}
				<!-- An external page: resolve() is for the app's own routes. -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					class="explorer"
					href={explorerUrl}
					target="_blank"
					rel="noopener noreferrer"
					data-testid="tx-explorer"
				>
					Open in explorer<span class="visually-hidden"> (opens in a new tab)</span>
				</a>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{/if}
			<Button type="submit" variant="primary" loading={running !== null} data-testid="tx-lookup">
				{running ? 'Looking up…' : 'Look up'}
			</Button>
		</span>
	{/snippet}
</FormPanel>

<!-- Not a labelled region: with aria-labelledby here, an axe scan crashed Playwright's Firefox
	once the error callout had focus (T-040). The h2 still heads the section. -->
<section class="output" bind:this={outcomeBox}>
	<h2 id="results">Result</h2>
	{#if outcome?.kind === 'error' && shown}
		<div data-testid="tx-error">
			<Callout variant="danger" title="Lookup failed" role="alert">
				<p>{shown.text}</p>
				{#if shown.hint}<p>{shown.hint}</p>{/if}
				{#snippet action()}
					<Button size="sm" onclick={retry} loading={running !== null} data-testid="tx-retry">
						Retry
					</Button>
				{/snippet}
			</Callout>
		</div>
	{:else if outcome?.kind === 'result'}
		<TxResultView
			tx={outcome.tx}
			network={outcome.query.network}
			endpoint={outcome.query.endpoint}
			hash={outcome.query.hash}
		/>
	{:else}
		<EmptyState>
			Paste a transaction hash to look it up. Nothing is requested until you submit.
		</EmptyState>
	{/if}
</section>

<style>
	.grid {
		display: grid;
		grid-template-columns: 14rem minmax(0, 1fr);
		gap: var(--space-4);
	}

	.summary {
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.explorer {
		color: var(--color-accent);
	}

	.output {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-3);
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	p {
		margin: 0;
	}

	p + p {
		margin-top: var(--space-2);
	}

	@media (max-width: 767px) {
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
	}
</style>
