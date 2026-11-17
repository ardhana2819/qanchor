<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { NETWORKS, type Network } from '#lib/config/networks.ts';
	import { parseEndpointUrl, type EndpointUrlError } from '#lib/core/endpoint-url.ts';
	import { resolveEndpoint } from '#lib/net/endpoint.ts';
	import type { StorageErrorCode } from '#lib/storage/db.ts';
	import { endpointOverrides } from '#lib/state/endpoints.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Badge from '#lib/ui/Badge.svelte';
	import Button from '#lib/ui/Button.svelte';
	import Field from '#lib/ui/Field.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';

	// Endpoint overrides per network (FR-041 AC-1 to AC-3, design S-10). One row is edited at a
	// time; the field error is the only place a rejected URL is reported (AC-2).

	const URL_ERRORS: Record<EndpointUrlError, string> = {
		empty: 'Enter an endpoint URL, or cancel to keep the current one.',
		invalid: 'Enter a full URL, for example https://rpc.example.com.',
		'not-https': 'Use an https:// URL. Plain http:// is allowed only for http://localhost.',
		credentials:
			'Remove the user name and password from the URL. If your provider gives you an API key, put it in the path or query.',
		query:
			'This URL is a base that QAnchor adds paths such as /tx/<id> to, so it cannot have a query or #fragment.'
	};

	const WRITE_ERRORS: Record<StorageErrorCode, string> = {
		quota: 'Storage is full. Free up space in this browser, then try again.',
		unavailable: 'Storage is unavailable in this browser session, so the URL was not saved.',
		closed: 'QAnchor was updated in another tab. Reload this tab, then try again.',
		failed: 'The URL could not be saved.'
	};

	let editing: string | null = $state(null);
	let draft = $state('');
	let error: string | undefined = $state();
	let saving = $state(false);
	let list: HTMLUListElement | undefined = $state();

	const canSave = $derived(endpointOverrides.status === 'ready');

	onMount(() => {
		void endpointOverrides.load();
	});

	async function focusEdit(networkId: string): Promise<void> {
		await tick();
		list
			?.querySelector<HTMLElement>(
				`[data-network="${networkId}"] [data-testid="settings-endpoint-edit"]`
			)
			?.focus();
	}

	async function edit(network: Network): Promise<void> {
		editing = network.id;
		draft = resolveEndpoint(network, endpointOverrides.list).url;
		error = undefined;
		await tick();
		list?.querySelector<HTMLInputElement>('[data-testid="settings-endpoint-input"]')?.select();
	}

	function close(network: Network): void {
		editing = null;
		error = undefined;
		void focusEdit(network.id);
	}

	async function save(event: SubmitEvent, network: Network): Promise<void> {
		event.preventDefault();
		const parsed = parseEndpointUrl(draft, { appendsPaths: network.protocol !== 'json-rpc' });
		if (!parsed.ok) {
			error = URL_ERRORS[parsed.error];
			return;
		}
		const current = resolveEndpoint(network, endpointOverrides.list);
		if (parsed.value === current.url) {
			close(network);
			return;
		}
		// The default typed back in is a reset: nothing needs storing for it.
		const toDefault = parsed.value === network.defaultUrl;
		saving = true;
		const written = toDefault
			? await endpointOverrides.reset(network.id)
			: await endpointOverrides.save(network.id, parsed.value);
		saving = false;
		if (!written.ok) {
			error = WRITE_ERRORS[written.error];
			return;
		}
		notify.showToast(
			toDefault ? `${network.name} uses the default endpoint` : `${network.name} endpoint saved`
		);
		close(network);
	}

	async function reset(network: Network): Promise<void> {
		const removed = await endpointOverrides.reset(network.id);
		if (!removed.ok) {
			notify.showToast(WRITE_ERRORS[removed.error]);
			return;
		}
		if (editing === network.id) editing = null;
		notify.showToast(`${network.name} uses the default endpoint`);
		void focusEdit(network.id);
	}

	function onKeydown(event: KeyboardEvent, network: Network): void {
		if (event.key === 'Escape') {
			event.preventDefault();
			close(network);
		}
	}
</script>

<section class="section" aria-labelledby="endpoints">
	<h2 id="endpoints">Endpoints</h2>
	<p class="intro">
		Transaction lookups and balances are sent straight from this browser to these endpoints. Use
		your own URL for a network, for example a provider with your API key or a local node; the
		defaults are public endpoints checked on 17 November 2026.
	</p>

	{#if endpointOverrides.status === 'loading'}
		<p class="status" data-testid="settings-endpoints-status">Checking storage…</p>
	{:else if endpointOverrides.status === 'unavailable'}
		<p class="status" data-testid="settings-endpoints-status">
			Custom endpoints need storage, which is unavailable in this tab. The defaults are used.
		</p>
	{/if}

	<ul class="networks" aria-label="Endpoints by network" bind:this={list}>
		{#each NETWORKS as network (network.id)}
			{@const endpoint = resolveEndpoint(network, endpointOverrides.list)}
			<li class="network" data-testid="settings-endpoint-row" data-network={network.id}>
				<div class="name">
					{network.name}
					{#if network.testnet}<span class="testnet">Testnet</span>{/if}
				</div>
				<div class="current">
					<span class="url">{endpoint.url}</span>
					{#if endpoint.isOverride}<Badge variant="neutral">Custom</Badge>{/if}
				</div>
				<div class="row-actions">
					<Button
						variant="ghost"
						size="sm"
						disabled={!canSave || editing === network.id}
						aria-label="Edit {network.name} endpoint"
						onclick={() => edit(network)}
						data-testid="settings-endpoint-edit"
					>
						Edit
					</Button>
					{#if endpoint.isOverride}
						<Button
							variant="ghost"
							size="sm"
							disabled={!canSave}
							aria-label="Reset {network.name} endpoint to default"
							onclick={() => reset(network)}
							data-testid="settings-endpoint-reset"
						>
							Reset
						</Button>
					{/if}
				</div>

				{#if editing === network.id}
					<form
						class="editor"
						aria-label="{network.name} endpoint"
						onsubmit={(event) => save(event, network)}
						novalidate
					>
						<Field
							label="Endpoint URL for {network.name}"
							hint="Default: {network.defaultUrl}"
							{error}
						>
							{#snippet children(control)}
								<TextInput
									{...control}
									mono
									bind:value={draft}
									oninput={() => (error = undefined)}
									onkeydown={(event) => onKeydown(event, network)}
									data-testid="settings-endpoint-input"
								/>
							{/snippet}
						</Field>
						<div class="editor-actions">
							<Button
								type="submit"
								variant="primary"
								size="sm"
								loading={saving}
								data-testid="settings-endpoint-save"
							>
								Save
							</Button>
							<Button
								size="sm"
								onclick={() => close(network)}
								data-testid="settings-endpoint-cancel"
							>
								Cancel
							</Button>
						</div>
					</form>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	h2 {
		margin: 0;
		font-size: var(--text-md);
		font-weight: 600;
		line-height: var(--leading-md);
	}

	.intro,
	.status {
		max-width: 64ch;
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.status {
		margin-top: var(--space-3);
	}

	.networks {
		margin: var(--space-4) 0 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
		list-style: none;
	}

	.network {
		display: grid;
		grid-template-columns: 11rem minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-4);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.name {
		display: flex;
		flex-direction: column;
		font-weight: 500;
	}

	.testnet {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-weight: 400;
	}

	.current {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		min-width: 0;
	}

	.url {
		color: var(--color-text-muted);
		font-family: var(--font-mono);
		font-size: var(--text-mono);
		overflow-wrap: anywhere;
	}

	.row-actions {
		display: flex;
		gap: var(--space-1);
	}

	.editor {
		grid-column: 1 / -1;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-3) 0 var(--space-2);
	}

	.editor-actions {
		display: flex;
		gap: var(--space-2);
	}

	@media (max-width: 640px) {
		.network {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.current {
			grid-column: 1 / -1;
			grid-row: 2;
		}
	}
</style>
