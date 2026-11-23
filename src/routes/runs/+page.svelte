<script lang="ts">
	import { resolve } from '$app/paths';
	import RunList from '#lib/tools/runs/RunList.svelte';
	import Button from '#lib/ui/Button.svelte';
</script>

<svelte:head>
	<title>Test runs · QAnchor</title>
</svelte:head>

<header class="page-header">
	<div>
		<h1>Test runs</h1>
		<p>Your test cases run against a release, with a result per case, kept in this browser.</p>
	</div>
	<Button variant="primary" href={resolve('/runs/new')} data-testid="runs-new">New run</Button>
</header>

<RunList />

<style>
	.page-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-4);
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
