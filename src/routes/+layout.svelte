<script lang="ts">
	import '../app.css';
	// Same file as the @font-face in app.css; Vite emits it once with a content hash.
	import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
	import { afterNavigate } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { groupTools, tools } from '#lib/config/tools.ts';
	import ThemeControl from '#lib/ui/ThemeControl.svelte';
	import Toaster from '#lib/ui/Toaster.svelte';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();

	const groups = groupTools(tools);
	// The small-screen menu; on wide screens its content is always shown (see CSS).
	let menuOpen = $state(false);

	afterNavigate(() => {
		menuOpen = false;
	});
</script>

<svelte:head>
	<link rel="preload" href={interLatin} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

<a class="skip-link" href="#main">Skip to content</a>

<div class="shell">
	<div class="sidebar">
		<nav aria-label="Main">
			<a class="brand" href={resolve('/')}>
				<svg class="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
					<circle cx="8" cy="3.5" r="1.5" />
					<path d="M8 5v9M5 7.5h6M2.5 9.5a5.5 5 0 0 0 11 0" />
				</svg>
				QAnchor
			</a>

			{#if groups.length > 0}
				<details class="menu" bind:open={menuOpen}>
					<summary>Menu</summary>
					<div class="menu-panel">
						{#each groups as { group, entries } (group)}
							<section class="nav-group" aria-labelledby="nav-{group}">
								<h2 id="nav-{group}">{group}</h2>
								<ul>
									{#each entries as entry (entry.route)}
										<li>
											<a
												class="nav-item"
												href={resolve(entry.route)}
												aria-current={page.url.pathname === entry.route ? 'page' : undefined}
											>
												{entry.name}
											</a>
										</li>
									{/each}
								</ul>
							</section>
						{/each}
					</div>
				</details>
			{/if}
		</nav>

		<div class="theme">
			<ThemeControl />
		</div>
	</div>

	<div class="column">
		<main id="main" tabindex="-1">
			{@render children()}
		</main>

		<footer>Build {__COMMIT_ID__}</footer>
	</div>
</div>

<Toaster />

<style>
	.skip-link {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 10;
		padding: var(--space-1) var(--space-3);
		border-radius: var(--radius-sm);
		background: var(--color-accent);
		color: var(--color-on-accent);
		transform: translateY(-200%);
	}

	.skip-link:focus {
		transform: none;
	}

	.shell {
		display: grid;
		grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
		min-height: 100vh;
	}

	.sidebar {
		position: sticky;
		top: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
		height: 100vh;
		overflow-y: auto;
		padding: var(--space-4) var(--space-3);
		border-right: 1px solid var(--color-border);
		background: var(--color-surface);
	}

	nav {
		display: flex;
		flex-direction: column;
		gap: var(--space-6);
	}

	.theme {
		margin-top: auto;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		align-self: flex-start;
		padding: var(--space-1) var(--space-2);
		border-radius: var(--radius-sm);
		color: var(--color-text);
		font-size: var(--text-md);
		font-weight: 600;
		text-decoration: none;
	}

	.brand-mark {
		width: 26px;
		height: 26px;
		padding: 5px;
		border-radius: var(--radius-sm);
		background: var(--color-accent);
		fill: none;
		stroke: var(--color-on-accent);
		stroke-width: 1.6;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* Wide screens: the menu is a plain list, so the toggle is hidden and the content always shown.
	   Scoped to the wide range so small screens keep the browser's own open/closed behaviour. */
	@media (min-width: 1024px) {
		.menu summary {
			display: none;
		}

		.menu::details-content {
			content-visibility: visible;
		}
	}

	.menu-panel {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.nav-group h2 {
		margin: 0 0 var(--space-1);
		padding: 0 var(--space-2);
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		font-weight: 500;
		line-height: var(--leading-xs);
	}

	.nav-group ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: 34px;
		padding: 0 10px;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: background-color var(--duration-fast) var(--ease-out);
	}

	.nav-item:hover {
		background: var(--color-surface-raised);
		color: var(--color-text);
	}

	.nav-item[aria-current='page'] {
		background: var(--color-accent-subtle);
		color: var(--color-accent);
		font-weight: 500;
	}

	.column {
		display: flex;
		flex-direction: column;
		min-width: 0;
		padding: var(--space-8) 40px var(--space-6);
	}

	main {
		flex: 1;
		width: 100%;
		max-width: var(--content-max-width);
		margin: 0 auto;
	}

	/* Focus lands here from the skip link; the outline would frame the whole page. */
	main:focus {
		outline: none;
	}

	footer {
		width: 100%;
		max-width: var(--content-max-width);
		margin: var(--space-12) auto 0;
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	/* Below 1024 px the sidebar becomes a top bar with a native menu (docs/design.md section 8). */
	@media (max-width: 1023px) {
		.shell {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: auto 1fr;
		}

		.sidebar {
			position: relative;
			z-index: 5;
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
			height: auto;
			overflow: visible;
			flex-wrap: wrap;
			padding: var(--space-2) var(--space-4);
			border-right: 0;
			border-bottom: 1px solid var(--color-border);
		}

		nav {
			flex-direction: row;
			align-items: center;
			justify-content: space-between;
			gap: var(--space-4);
			flex: 1;
		}

		/* On narrow screens it wraps onto its own row instead of squeezing the menu button. */
		.theme {
			margin: 0 0 0 auto;
		}

		.menu summary {
			display: flex;
			align-items: center;
			min-height: var(--control-md);
			padding: 0 var(--space-3);
			border: 1px solid var(--color-border-strong);
			border-radius: var(--radius-md);
			background: var(--color-bg);
			cursor: pointer;
			list-style: none;
		}

		.menu summary::-webkit-details-marker {
			display: none;
		}

		.menu-panel {
			position: absolute;
			top: 100%;
			right: var(--space-4);
			left: var(--space-4);
			margin-top: var(--space-1);
			padding: var(--space-3);
			border: 1px solid var(--color-border);
			border-radius: var(--radius-md);
			background: var(--color-surface);
			box-shadow: var(--shadow-overlay);
		}

		.column {
			padding: var(--space-6) var(--space-4) var(--space-4);
		}
	}
</style>
