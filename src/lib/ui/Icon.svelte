<script lang="ts" module>
	// Inline SVG paths on a 16 px grid, drawn with currentColor (design section 6: no icon library).
	const PATHS = {
		check: 'M3.5 8.5l3 3 6-7',
		cross: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
		warning: 'M8 2.5l6 11H2zM8 6.5v3M8 11.5v.01',
		info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4M8 5v.01',
		dot: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
		chevron: 'M4 6l4 4 4-4',
		person: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5a5 5 0 0 1 10 0',
		swap: 'M2.5 5.5h11L11 3M13.5 10.5h-11L5 13',
		bars: 'M3 13.5v-4M8 13.5v-11M13 13.5v-7',
		at: 'M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM10.5 8v1a1.75 1.75 0 0 0 3.5 0V8a6 6 0 1 0-2.4 4.8',
		copy: 'M5.5 5.5v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M3.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z'
	} as const;

	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let { name, size = 16 }: { name: IconName; size?: number } = $props();
</script>

<!-- Decorative: the text next to it, or the button's accessible name, carries the meaning. -->
<svg
	class="icon"
	width={size}
	height={size}
	viewBox="0 0 16 16"
	fill="none"
	stroke="currentColor"
	stroke-width="1.6"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	<path d={PATHS[name]} />
</svg>

<style>
	.icon {
		flex: none;
	}
</style>
