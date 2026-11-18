<script lang="ts">
	import { builtinFaucets } from '#lib/config/networks.ts';
	import { faucetHost, isWebLink } from '#lib/core/faucets.ts';
	import { faucets } from '#lib/state/faucets.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import type { Faucet } from '#lib/storage/schema.ts';
	import Button from '#lib/ui/Button.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import { WRITE_ERRORS } from './present.ts';

	// A wallet entry's faucet links (FR-072, design S-08 row detail): the built-in ones for its
	// network, then the user's own. Links only navigate, in a new tab without an opener or
	// referrer; nothing is submitted to a faucet (AC-1, AC-2).

	interface Props {
		networkId: string;
		/** Names the entry in button labels, so each row's controls are told apart. */
		walletLabel: string;
		onadd: (networkId: string) => void;
	}

	let { networkId, walletLabel, onadd }: Props = $props();

	const builtin = $derived(builtinFaucets(networkId));
	const own = $derived(faucets.forNetwork(networkId));
	const count = $derived(builtin.length + own.length);

	async function remove(faucet: Faucet): Promise<void> {
		const removed = await faucets.remove(faucet.id);
		notify.showToast(
			removed.ok
				? `Removed "${faucet.label || faucetHost(faucet.url)}"`
				: WRITE_ERRORS[removed.error]
		);
	}
</script>

{#snippet link(label: string, url: string)}
	<!-- An external page: resolve() is for the app's own routes. -->
	<!-- eslint-disable svelte/no-navigation-without-resolve -->
	<a href={url} target="_blank" rel="noopener noreferrer" data-testid="wallets-faucet-link">
		{label}
		<span class="visually-hidden">(opens in a new tab)</span>
		<Icon name="external" size={12} />
	</a>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
	<span class="host">{faucetHost(url)}</span>
{/snippet}

<details data-testid="wallets-faucets">
	<summary>
		{#if count === 0}No faucet listed{:else}Faucets ({count}){/if}
		<span class="visually-hidden"> for {walletLabel}</span>
	</summary>
	<div class="body">
		{#if count === 0}
			<p class="muted" data-testid="wallets-no-faucet">
				No faucet is listed for this network. Add one you use below.
			</p>
		{:else}
			<ul>
				{#each builtin as faucet (faucet.url)}
					<li>{@render link(faucet.label, faucet.url)}</li>
				{/each}
				{#each own as faucet (faucet.id)}
					<li data-testid="wallets-own-faucet">
						{#if isWebLink(faucet.url)}
							{@render link(faucet.label || faucetHost(faucet.url), faucet.url)}
						{:else}
							<!-- From an imported backup: shown, never linked (not an http or https address). -->
							<span class="unlinked">{faucet.label || faucet.url}</span>
							<span class="host">not a web link</span>
						{/if}
						<Button
							size="sm"
							variant="ghost"
							onclick={() => remove(faucet)}
							data-testid="wallets-faucet-remove"
						>
							Remove<span class="visually-hidden"> {faucet.label || faucet.url}</span>
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if faucets.status === 'ready'}
			<Button size="sm" onclick={() => onadd(networkId)} data-testid="wallets-faucet-add">
				Add faucet link<span class="visually-hidden"> for {walletLabel}</span>
			</Button>
		{/if}
	</div>
</details>

<style>
	details {
		margin-top: var(--space-1);
	}

	summary {
		width: fit-content;
		white-space: nowrap;
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		cursor: pointer;
	}

	summary:hover {
		color: var(--color-text);
	}

	.body {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-2) 0 var(--space-1);
	}

	ul {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		white-space: nowrap;
	}

	a {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--color-accent);
	}

	.host,
	.muted {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	p {
		margin: 0;
	}
</style>
