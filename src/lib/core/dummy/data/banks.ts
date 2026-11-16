// Banks for dummy account numbers (FR-081 AC-7). No bank publishes its account number length, and
// Bank Indonesia's participant list could not be reached when this was written (T-025), so every
// value here comes from commonly published secondary sources. The owner decided to use them with
// this label and re-check them against a bank app, a statement, or Bank Indonesia's SKNBI list
// before T-028 merges (decisions 2026-11-16). No checksum is applied to account numbers.

export interface Bank {
	readonly name: string;
	/** Three-digit clearing code (sandi bank). */
	readonly code: string;
	/** Digits in a personal account number. */
	readonly accountLength: number;
	readonly source: 'secondary';
}

export const BANKS: readonly Bank[] = [
	{ name: 'Bank Rakyat Indonesia (BRI)', code: '002', accountLength: 15, source: 'secondary' },
	{ name: 'Bank Mandiri', code: '008', accountLength: 13, source: 'secondary' },
	{ name: 'Bank Negara Indonesia (BNI)', code: '009', accountLength: 10, source: 'secondary' },
	{ name: 'Bank Danamon', code: '011', accountLength: 10, source: 'secondary' },
	{ name: 'Bank Permata', code: '013', accountLength: 10, source: 'secondary' },
	{ name: 'Bank Central Asia (BCA)', code: '014', accountLength: 10, source: 'secondary' },
	{ name: 'Bank CIMB Niaga', code: '022', accountLength: 13, source: 'secondary' },
	{ name: 'Bank Tabungan Negara (BTN)', code: '200', accountLength: 16, source: 'secondary' },
	{ name: 'Bank Syariah Indonesia (BSI)', code: '451', accountLength: 10, source: 'secondary' }
];
