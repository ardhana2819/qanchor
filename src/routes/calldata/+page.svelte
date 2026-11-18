<script lang="ts">
	import CalldataDecoder from '#lib/tools/calldata/CalldataDecoder.svelte';
</script>

<svelte:head>
	<title>Calldata decoder · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Calldata decoder</h1>
	<p>
		Decode the input data of an EVM transaction into its function and arguments. Decoding runs in
		this browser; nothing is sent anywhere.
	</p>
</header>

<CalldataDecoder />

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
