<script lang="ts">
	import {
		convert,
		customFamily,
		FAMILIES,
		parseDecimals,
		type FamilyId,
		type UnitFamily
	} from '#lib/core/units/families.ts';
	import CopyButton from '#lib/ui/CopyButton.svelte';
	import Field from '#lib/ui/Field.svelte';
	import FormPanel from '#lib/ui/FormPanel.svelte';
	import Icon from '#lib/ui/Icon.svelte';
	import SegmentedControl from '#lib/ui/SegmentedControl.svelte';
	import Select from '#lib/ui/Select.svelte';
	import TextInput from '#lib/ui/TextInput.svelte';
	import { DECIMALS_ERROR, describeAmountError } from '#lib/ui/amount-errors.ts';

	// Live, exact conversion (FR-030 to FR-032, design S-04). The field being typed in keeps the
	// text as typed; every other field shows the converted value.

	const DEFAULT_DECIMALS = '18';
	const familyOptions = FAMILIES.map((f) => ({ value: f.id, label: f.label }));

	const id = $props.id();
	let familyId = $state<FamilyId>('ethereum');
	let decimalsText = $state(DEFAULT_DECIMALS);
	let values: Record<string, string> = $state({});
	let edited: string | null = $state(null);
	let error: string | null = $state(null);

	const decimals = $derived(parseDecimals(decimalsText));
	// While the decimals field is invalid the custom family keeps its last valid decimals and
	// converts nothing (see `recompute`).
	let customDecimals = $state(Number(DEFAULT_DECIMALS));
	const family: UnitFamily = $derived(
		familyId === 'custom'
			? customFamily(customDecimals)
			: (FAMILIES.find((f) => f.id === familyId) ?? FAMILIES[0])
	);
	const decimalsInvalid = $derived(familyId === 'custom' && decimals === null);

	function recompute(): void {
		const unit = family.units.find((u) => u.id === edited);
		if (!unit) return;
		const text = values[unit.id] ?? '';
		// Clearing a field clears them all, with no error (FR-031 AC-2).
		if (text.trim() === '') {
			values = {};
			error = null;
			return;
		}
		if (decimalsInvalid) {
			error = null;
			return;
		}
		const result = convert(text, unit, family);
		// An invalid value leaves the other fields as they were (FR-031 AC-1).
		if (!result.ok) {
			error = describeAmountError(result.error, unit.name);
			return;
		}
		error = null;
		values = { ...result.value, [unit.id]: text };
	}

	function onUnitInput(unitId: string, text: string): void {
		values[unitId] = text;
		edited = unitId;
		recompute();
	}

	function onFamilyChange(next: FamilyId): void {
		familyId = next;
		values = {};
		edited = null;
		error = null;
	}

	function onDecimalsInput(text: string): void {
		decimalsText = text;
		if (decimals !== null) customDecimals = decimals;
		recompute();
	}
</script>

<div class="converter">
	<FormPanel aria-label="Unit converter">
		<div class="header">
			<!-- Five families fit a segmented control on wide screens only; phones get a select with
			     the same state (design section 8). Only one of the two is displayed at a time. -->
			<div class="family-segmented">
				<SegmentedControl
					legend="Unit family"
					options={familyOptions}
					value={familyId}
					onchange={onFamilyChange}
				/>
			</div>
			<div class="family-select">
				<Select
					aria-label="Unit family"
					options={familyOptions}
					value={familyId}
					data-testid="units-family"
					onchange={(event) => onFamilyChange(event.currentTarget.value as FamilyId)}
				/>
			</div>
			<span class="hint">Exact, no rounding</span>
		</div>

		{#if familyId === 'custom'}
			<div class="decimals">
				<Field
					label="Decimals"
					hint="The token's decimals, 0 to 36."
					error={decimalsInvalid ? DECIMALS_ERROR : undefined}
				>
					{#snippet children(control)}
						<TextInput
							{...control}
							inputmode="numeric"
							data-testid="units-decimals"
							value={decimalsText}
							oninput={(event) => onDecimalsInput(event.currentTarget.value)}
						/>
					{/snippet}
				</Field>
			</div>
		{/if}

		<div class="units">
			{#each family.units as unit, index (unit.id)}
				{@const inputId = `${id}-${index}`}
				{@const showError = error !== null && edited === unit.id}
				<div class="unit-row">
					<div class="unit-name">
						<label for={inputId}>{unit.name}</label>
						<span>{unit.factor}</span>
					</div>
					<TextInput
						id={inputId}
						mono
						inputmode="decimal"
						value={values[unit.id] ?? ''}
						aria-invalid={showError ? 'true' : undefined}
						aria-describedby={showError ? `${inputId}-error` : undefined}
						data-testid="units-input-{unit.id}"
						oninput={(event) => onUnitInput(unit.id, event.currentTarget.value)}
					/>
					<CopyButton
						value={values[unit.id] ?? ''}
						label="Copy {unit.name}"
						disabled={!values[unit.id]}
						data-testid="units-copy-{unit.id}"
					/>
					{#if showError}
						<p class="error" id="{inputId}-error" data-testid="units-error">
							<Icon name="warning" size={14} />{error}
						</p>
					{/if}
				</div>
			{/each}
		</div>
	</FormPanel>

	<p class="note">
		Use . as the decimal separator. Commas, thousands separators, negative numbers, and scientific
		notation are rejected. Values up to 78 digits stay exact.
	</p>
</div>

<style>
	.converter {
		max-width: 820px;
	}

	.header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		padding-bottom: var(--space-4);
		border-bottom: 1px solid var(--color-border);
	}

	.family-select {
		display: none;
	}

	.hint,
	.note,
	.unit-name span {
		color: var(--color-text-subtle);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.decimals {
		max-width: 240px;
		padding: var(--space-4) 0;
		border-bottom: 1px solid var(--color-border);
	}

	.units {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding-top: var(--space-4);
	}

	/* Stacked rows: a 78-digit value needs the full column width (design S-04). */
	.unit-row {
		display: grid;
		grid-template-columns: 140px minmax(0, 1fr) auto;
		align-items: center;
		gap: var(--space-1) var(--space-3);
	}

	.unit-name {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.unit-name label {
		font-weight: 500;
	}

	.error {
		display: flex;
		grid-column: 2 / 4;
		align-items: center;
		gap: var(--space-1);
		margin: 0;
		color: var(--color-danger);
		font-size: var(--text-xs);
		line-height: var(--leading-xs);
	}

	.note {
		margin: var(--space-3) 0 0;
	}

	@media (max-width: 639px) {
		.family-segmented {
			display: none;
		}

		.family-select {
			display: block;
			flex: 1;
		}

		.unit-row {
			grid-template-columns: minmax(0, 1fr) auto;
		}

		.unit-name,
		.error {
			grid-column: 1 / 3;
		}
	}
</style>
