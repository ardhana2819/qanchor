<script lang="ts">
	import { resolve } from '$app/paths';
	import ChecklistView from '#lib/tools/checklists/ChecklistView.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>{data.checklist.title} checklist · QAnchor</title>
</svelte:head>

<header class="page-header">
	<a class="back" href={resolve('/checklists')}>
		<span class="back-icon"><Icon name="chevron" size={14} /></span>
		Checklists
	</a>
	<h1>{data.checklist.title}</h1>
	<p>{data.checklist.summary}</p>
</header>

<ChecklistView checklist={data.checklist} />

<style>
	.page-header {
		margin-bottom: var(--space-6);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		margin-bottom: var(--space-2);
		color: var(--color-text-muted);
		font-size: var(--text-xs);
		text-decoration: none;
	}

	.back:hover {
		color: var(--color-text);
	}

	.back-icon {
		display: flex;
		transform: rotate(90deg);
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
