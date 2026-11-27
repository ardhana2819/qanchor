<script lang="ts">
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { SessionForm } from './session-form.svelte.ts';
	import SessionFields from './SessionFields.svelte';

	// Start session (design 13.3 P2-06; FR-130 AC-1): starting opens the session page.

	const form = new SessionForm();
	let fields: SessionFields | undefined = $state();
	let starting = $state(false);
	let saveError = $state('');

	async function start(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (starting) return;
		const invalid = form.validate();
		if (invalid) {
			await tick();
			fields?.focus(invalid);
			return;
		}
		starting = true;
		saveError = '';
		const started = await sessions.start(form.input);
		starting = false;
		if (!started.ok) {
			saveError = WRITE_ERRORS[started.error];
			return;
		}
		void goto(resolve(`/sessions/view?id=${encodeURIComponent(started.value.id)}`));
	}
</script>

<div class="start">
	<FormPanel aria-label="Start session" onsubmit={start} data-testid="session-start-form">
		<SessionFields bind:this={fields} {form} />
		{#snippet footer()}
			<span class="status">
				{#if saveError}
					<span class="error" role="alert" data-testid="session-start-error">{saveError}</span>
				{:else}
					The clock keeps counting with the tab closed, until you pause or end the session.
				{/if}
			</span>
			<Button type="submit" variant="primary" loading={starting} data-testid="session-start">
				{starting ? 'Starting…' : 'Start session'}
			</Button>
		{/snippet}
	</FormPanel>
</div>

<style>
	.start {
		max-width: 820px;
		margin-bottom: var(--space-8);
	}

	.status {
		color: var(--color-text-muted);
		font-size: var(--text-xs);
	}

	.error {
		color: var(--color-danger);
	}
</style>
