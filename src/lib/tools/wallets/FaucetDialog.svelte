<script lang="ts">
	import { tick } from 'svelte';
	import { builtinFaucets } from '#lib/config/networks.ts';
	import { checkFaucetUrl, FAUCET_LABEL_MAX } from '#lib/core/faucets.ts';
	import { faucets } from '#lib/state/faucets.svelte.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Callout from '#lib/ui/Callout.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import Field from '#lib/ui/Field.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { FAUCET_URL_ERRORS, networkName, WRITE_ERRORS } from './present.ts';

	// Add a faucet link to a network (FR-072): the built-in list goes stale, so the user can keep
	// their own. The link is stored per network and listed on every wallet entry on it.

	interface Props {
		open: boolean;
		networkId: string;
	}

	let { open = $bindable(), networkId }: Props = $props();

	const formId = $props.id();

	let url = $state('');
	let label = $state('');
	let errors = $state<{ url?: string; label?: string }>({});
	let saveError = $state<string | null>(null);
	let saving = $state(false);
	let form: HTMLFormElement | undefined = $state();

	$effect(() => {
		if (!open) return;
		url = '';
		label = '';
		errors = {};
		saveError = null;
	});

	function isListed(href: string): boolean {
		return [...builtinFaucets(networkId), ...faucets.forNetwork(networkId)].some(
			(f) => f.url === href
		);
	}

	async function submit(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		const checked = checkFaucetUrl(url);
		const trimmedLabel = label.trim();
		errors = {
			url: !checked.ok
				? FAUCET_URL_ERRORS[checked.error]
				: isListed(checked.value)
					? `This faucet is already listed for ${networkName(networkId)}.`
					: undefined,
			label:
				trimmedLabel.length > FAUCET_LABEL_MAX
					? `Keep the label to ${FAUCET_LABEL_MAX} characters.`
					: undefined
		};
		if (!checked.ok || errors.url || errors.label) {
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		saving = true;
		const added = await faucets.add({ networkId, label: trimmedLabel, url: checked.value });
		saving = false;
		if (!added.ok) {
			saveError = WRITE_ERRORS[added.error];
			return;
		}
		open = false;
		notify.showToast(`Added a faucet link for ${networkName(networkId)}`);
	}
</script>

<Dialog bind:open title={`Add faucet link: ${networkName(networkId)}`}>
	<form id={formId} bind:this={form} onsubmit={submit} novalidate data-testid="wallets-faucet-form">
		<Field
			label="Faucet address"
			hint={`Listed on every wallet on ${networkName(networkId)}. QAnchor only opens the page; it never fills in or submits anything.`}
			error={errors.url}
		>
			{#snippet children(control)}
				<TextInput
					{...control}
					mono
					placeholder="https://"
					bind:value={url}
					oninput={() => ((errors.url = undefined), (saveError = null))}
					data-testid="wallets-faucet-url"
				/>
			{/snippet}
		</Field>
		<Field label="Label (optional)" hint="Shown instead of the web address." error={errors.label}>
			{#snippet children(control)}
				<TextInput
					{...control}
					bind:value={label}
					oninput={() => ((errors.label = undefined), (saveError = null))}
					data-testid="wallets-faucet-label"
				/>
			{/snippet}
		</Field>
		{#if saveError}
			<Callout variant="danger" role="alert">{saveError}</Callout>
		{/if}
	</form>

	{#snippet actions()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			type="submit"
			form={formId}
			variant="primary"
			loading={saving}
			data-testid="wallets-faucet-save"
		>
			Add link
		</Button>
	{/snippet}
</Dialog>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}
</style>
