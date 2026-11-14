<script lang="ts">
	import AmountCases from '#lib/tools/amounts/AmountCases.svelte';
</script>

<svelte:head>
	<title>Amount edge cases · QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>Amount edge cases</h1>
	<p>Boundary and format inputs for an amount field, computed exactly from the token's decimals.</p>
</header>

<AmountCases />

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
