<script lang="ts">
	import { resolve } from '$app/paths';
	import { groupTools, tools } from '#lib/config/tools.ts';

	const groups = groupTools(tools);
</script>

<svelte:head>
	<title>QAnchor</title>
</svelte:head>

<header class="page-header">
	<h1>QAnchor</h1>
	<p>QA toolkit for blockchain and crypto testing.</p>
</header>

{#each groups as { group, entries } (group)}
	<section class="group" aria-labelledby="index-{group}">
		<h2 id="index-{group}">{group}</h2>
		<ul>
			{#each entries as entry (entry.route)}
				<li>
					<a href={resolve(entry.route)}>{entry.name}</a>
					<p>{entry.description}</p>
				</li>
			{/each}
		</ul>
	</section>
{:else}
	<p class="empty">No tools have shipped yet.</p>
{/each}

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

	.page-header p,
	.empty {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}

	.group + .group {
		margin-top: var(--space-8);
	}

	h2 {
		margin: 0 0 var(--space-2);
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	ul {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-border);
		list-style: none;
	}

	li {
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--color-border);
	}

	li a {
		color: var(--color-accent);
		font-size: var(--text-md);
		font-weight: 500;
		text-decoration: none;
	}

	li a:hover {
		text-decoration: underline;
	}

	li p {
		margin: var(--space-1) 0 0;
		color: var(--color-text-muted);
	}
</style>
