// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		// interface Error {}
		// interface PageData {}
		interface PageState {
			/** Tx lookup hands its input data to the calldata decoder (FR-053). */
			calldata?: string;
		}
	}

	/** Short commit ID of this build, or "dev" outside Cloudflare Pages (vite.config.ts). */
	const __COMMIT_ID__: string;
}

export {};
