<script lang="ts">
	import TxLookup from '#lib/tools/tx/TxLookup.svelte';
</script>

<svelte:head>
	<title>Tx lookup · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Tx lookup</h1>
	<p>
		Look up a transaction on its network. The request goes from this browser straight to the
		network's endpoint, which you can change in Settings.
	</p>
</header>

<TxLookup />

<style>
	.page-header {
		margin-bottom: var(--space-8);
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
