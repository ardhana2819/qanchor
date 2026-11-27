<script lang="ts">
	import { tick } from 'svelte';
	import type { Session } from '#lib/core/qa/types.ts';
	import { notify } from '#lib/state/notify.svelte.ts';
	import { sessions } from '#lib/state/sessions.svelte.ts';
	import Button from '#lib/ui/Button.svelte';
	import Dialog from '#lib/ui/Dialog.svelte';
	import { WRITE_ERRORS } from '#lib/tools/wallets/present.ts';
	import { SessionForm } from './session-form.svelte.ts';
	import SessionFields from './SessionFields.svelte';

	// Edit details (FR-130 AC-6): charter, timebox, release, and environment, also of an ended
	// session. The clock fields are not touched, so an ended session stays ended.

	let { session }: { session: Session } = $props();

	const formId = $props.id();
	let open = $state(false);
	let form = $state(new SessionForm());
	let fields: SessionFields | undefined = $state();
	let saving = $state(false);

	/** Opens the dialog with the session's current details. */
	export function show(): void {
		form = new SessionForm(session);
		open = true;
	}

	async function save(event: SubmitEvent): Promise<void> {
		event.preventDefault();
		if (saving) return;
		const invalid = form.validate();
		if (invalid) {
			await tick();
			fields?.focus(invalid);
			return;
		}
		saving = true;
		const saved = await sessions.edit(session.id, form.input);
		saving = false;
		if (!saved.ok) {
			notify.showToast(WRITE_ERRORS[saved.error]);
			return;
		}
		open = false;
		notify.showToast('Session details saved.');
	}
</script>

<Dialog bind:open title="Edit session details">
	<form id={formId} novalidate onsubmit={save} data-testid="session-edit-form">
		<SessionFields bind:this={fields} {form} narrow />
	</form>
	{#snippet actions()}
		<Button onclick={() => (open = false)}>Cancel</Button>
		<Button
			type="submit"
			form={formId}
			variant="primary"
			loading={saving}
			data-testid="session-edit-save"
		>
			Save
		</Button>
	{/snippet}
</Dialog>
