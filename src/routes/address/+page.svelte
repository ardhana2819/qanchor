<script lang="ts">
	import GenerateTab from '#lib/tools/address/GenerateTab.svelte';
	import ValidateTab from '#lib/tools/address/ValidateTab.svelte';
	import Tabs from '#lib/ui/Tabs.svelte';

	const TABS = [
		{ id: 'generate', label: 'Generate' },
		{ id: 'validate', label: 'Validate' }
	] as const;

	let tab = $state<(typeof TABS)[number]['id']>('generate');
</script>

<svelte:head>
	<title>Address generator · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Address generator</h1>
	<p>
		Valid and deliberately invalid addresses for testing address fields. No private key is shown or
		stored.
	</p>
</header>

<Tabs label="Mode" tabs={TABS} bind:value={tab}>
	{#snippet panel(id)}
		<!-- Both stay mounted, so switching tabs keeps the generated rows and the pasted address. -->
		<div hidden={id !== 'generate'}><GenerateTab /></div>
		<div hidden={id !== 'validate'}><ValidateTab /></div>
	{/snippet}
</Tabs>

<style>
	.page-header {
		margin-bottom: var(--space-6);
	}

	h1 {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		line-height: var(--leading-xl);
	}

	.page-header p {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}
</style>
