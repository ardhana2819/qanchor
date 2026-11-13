<script lang="ts" generics="T extends string">
	import type { Snippet } from 'svelte';

	interface Props {
		/** Accessible name of the tab list, e.g. "Mode". */
		label: string;
		tabs: readonly { id: T; label: string }[];
		value: T;
		/** Renders the selected tab's panel. */
		panel: Snippet<[T]>;
	}

	let { label, tabs, value = $bindable(), panel }: Props = $props();

	const base = $props.id();
	const tabId = (id: T) => `${base}-tab-${id}`;
	const panelId = `${base}-panel`;

	let list: HTMLDivElement | undefined = $state();
	// Underline position in px; null until measured, so the static CSS underline shows before
	// hydration and the sliding one takes over after.
	let indicator: { x: number; width: number } | null = $state(null);
	let animated = $state(false);

	function measure(): void {
		const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
		if (selected) indicator = { x: selected.offsetLeft, width: selected.offsetWidth };
	}

	$effect(() => {
		void value;
		measure();
	});

	// Tab widths change when Inter finishes loading or the text is zoomed.
	$effect(() => {
		if (!list) return;
		const observer = new ResizeObserver(measure);
		observer.observe(list);
		return () => observer.disconnect();
	});

	function select(id: T): void {
		animated = true;
		value = id;
	}

	// Arrow keys move between tabs and select them; Tab leaves the group (design section 9).
	function onkeydown(event: KeyboardEvent): void {
		const current = tabs.findIndex((tab) => tab.id === value);
		const last = tabs.length - 1;
		const next = {
			ArrowRight: current === last ? 0 : current + 1,
			ArrowLeft: current === 0 ? last : current - 1,
			Home: 0,
			End: last
		}[event.key];
		if (next === undefined) return;
		event.preventDefault();
		select(tabs[next].id);
		list?.querySelector<HTMLElement>(`#${CSS.escape(tabId(tabs[next].id))}`)?.focus();
	}
</script>

<div
	class="tabs"
	class:measured={indicator}
	role="tablist"
	aria-label={label}
	tabindex="-1"
	bind:this={list}
	{onkeydown}
>
	{#each tabs as tab (tab.id)}
		<button
			type="button"
			role="tab"
			id={tabId(tab.id)}
			aria-selected={tab.id === value}
			aria-controls={panelId}
			tabindex={tab.id === value ? 0 : -1}
			onclick={() => select(tab.id)}
		>
			{tab.label}
		</button>
	{/each}
	{#if indicator}
		<span
			class="indicator"
			class:animated
			aria-hidden="true"
			style:transform="translateX({indicator.x}px) scaleX({indicator.width})"
		></span>
	{/if}
</div>

<div class="panel" role="tabpanel" id={panelId} aria-labelledby={tabId(value)} tabindex="0">
	{@render panel(value)}
</div>

<style>
	.tabs {
		position: relative;
		display: flex;
		gap: var(--space-6);
		margin-bottom: var(--space-6);
		border-bottom: 1px solid var(--color-border);
	}

	button {
		margin-bottom: -1px;
		padding: var(--space-2) 0;
		border: 0;
		border-bottom: 2px solid transparent;
		background: none;
		color: var(--color-text-muted);
		font: 500 var(--text-sm) / var(--leading-sm) var(--font-sans);
		cursor: pointer;
		transition: color var(--duration-fast) var(--ease-out);
	}

	button:hover,
	button[aria-selected='true'] {
		color: var(--color-text);
	}

	button[aria-selected='true'] {
		border-bottom-color: var(--color-accent);
	}

	.measured button[aria-selected='true'] {
		border-bottom-color: transparent;
	}

	/* Tab indicator (design 2.4): a 1 px bar moved and stretched with transform only. */
	.indicator {
		position: absolute;
		bottom: -1px;
		left: 0;
		width: 1px;
		height: 2px;
		background: var(--color-accent);
		transform-origin: left;
	}

	.indicator.animated {
		transition: transform var(--duration-base) var(--ease-out);
	}

	.panel:focus-visible {
		outline-offset: 4px;
	}
</style>
