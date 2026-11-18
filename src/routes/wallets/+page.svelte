<script lang="ts">
	import WalletTracker from '#lib/tools/wallets/WalletTracker.svelte';
</script>

<svelte:head>
	<title>Testnet wallets · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Testnet wallets</h1>
	<p>
		Keep the testnet addresses you test with, each with a label and notes. Only public addresses are
		stored, in this browser; there is no field for a private key or seed phrase.
	</p>
</header>

<WalletTracker />

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
