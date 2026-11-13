<script lang="ts">
	import { onMount } from 'svelte';
	import { storage } from '#lib/state/storage.svelte.ts';
	import Button from './Button.svelte';
	import Callout from './Callout.svelte';

	onMount(() => {
		void storage.connect();
	});
</script>

{#if storage.status === 'unavailable'}
	<div class="banner">
		<Callout variant="info">
			<p>
				Storage is unavailable in this browser session. Tools still work, but nothing will be saved.
			</p>
		</Callout>
	</div>
{:else if storage.status === 'outdated'}
	<div class="banner">
		<Callout variant="warning" title="QAnchor was updated in another tab">
			<p>Reload this tab to keep saving your changes.</p>
			{#snippet action()}
				<Button size="sm" onclick={() => location.reload()}>Reload</Button>
			{/snippet}
		</Callout>
	</div>
{/if}

<style>
	.banner {
		margin-bottom: var(--space-6);
	}
</style>
