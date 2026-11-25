<script lang="ts" module>
	// Inline SVG paths on a 16 px grid, drawn with currentColor (design section 6: no icon library).
	const PATHS = {
		check: 'M3.5 8.5l3 3 6-7',
		cross: 'M4.5 4.5l7 7M11.5 4.5l-7 7',
		warning: 'M8 2.5l6 11H2zM8 6.5v3M8 11.5v.01',
		info: 'M8 14.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM8 7.5v4M8 5v.01',
		dot: 'M8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
		chevron: 'M4 6l4 4 4-4',
		'chevron-left': 'M10 4L6 8l4 4',
		'chevron-right': 'M6 4l4 4-4 4',
		checklist: 'M2.5 4.5l1.25 1.25L6 3.5M8.5 4.5h5M2.5 10.5l1.25 1.25L6 9.5M8.5 10.5h5',
		person: 'M8 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM3 13.5a5 5 0 0 1 10 0',
		swap: 'M2.5 5.5h11L11 3M13.5 10.5h-11L5 13',
		bars: 'M3 13.5v-4M8 13.5v-11M13 13.5v-7',
		at: 'M10.5 8a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0zM10.5 8v1a1.75 1.75 0 0 0 3.5 0V8a6 6 0 1 0-2.4 4.8',
		wallet:
			'M2.5 5.5v7a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-6a1 1 0 0 0-1-1h-10zM2.5 5.5l8-3v3M11 9.5h.01',
		external:
			'M9.5 2.5h4v4M13.5 2.5l-6 6M11.5 9.5v3a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3',
		code: 'M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5',
		search: 'M7 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM10.75 10.75l3.25 3.25',
		copy: 'M5.5 5.5v-2a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M3.5 5.5h6a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z',
		cases: 'M3.5 2.5h9v11h-9zM6 5.5h4M6 8h4M6 10.5h2.5',
		run: 'M5 3.5l7 4.5-7 4.5z',
		'arrow-up': 'M8 13V3M4 7l4-4 4 4',
		'arrow-down': 'M8 3v10M4 9l4 4 4-4',
		trash: 'M2.5 4.5h11M6.5 4.5v-2h3v2M4 4.5l.75 9h6.5l.75-9M6.75 7v4M9.25 7v4',
		image:
			'M3.5 3h9A1.5 1.5 0 0 1 14 4.5v7a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 11.5v-7A1.5 1.5 0 0 1 3.5 3zM2.5 11l3.5-3.5 3 3 2-2 2.5 2.5M10.5 7a1 1 0 1 0 0-2 1 1 0 0 0 0 2z',
		download: 'M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13.5h10'
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
