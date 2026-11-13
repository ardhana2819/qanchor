<script lang="ts">
	import '../app.css';
	// Same file as the @font-face in app.css; Vite emits it once with a content hash.
	import interLatin from '@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="preload" href={interLatin} as="font" type="font/woff2" crossorigin="anonymous" />
</svelte:head>

{@render children()}
