import type { Result } from '../result.ts';

// Shared vocabulary for the per-chain modules: what a validator can say about an address.

export type ChainId = 'evm' | 'bitcoin' | 'solana' | 'tron';

/** Why an address fails a chain's validator; the Validate tab names it (FR-014 AC-3). */
export type AddressDefect =
	| 'empty'
	| 'missing-prefix'
	| 'wrong-prefix'
	| 'wrong-length'
	| 'invalid-character'
	| 'bad-checksum';

/** Valid, but worth a warning: never reported as invalid (FR-011 AC-5, EC-004, EC-006). */
export type AddressRisk = 'no-checksum' | 'zero-address' | 'off-curve';

export type AddressCheck = Result<{ risk?: AddressRisk }, AddressDefect>;

export interface RiskySample {
	address: string;
	risk: AddressRisk;
}
