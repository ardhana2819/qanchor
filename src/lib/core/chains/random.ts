// Key material for address derivation (NFR-012, NFR-013). Keys come from the Web Crypto CSPRNG
// only, never from the seeded PRNG used for dummy data, and are zero-filled as soon as the
// address is derived.

export function randomBytes(length: number): Uint8Array {
	return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Draws a fresh secret key (redrawing until `isValid`), passes it to `derive`, and zero-fills it
 * afterwards, even if `derive` throws. `derive` must not keep a reference to the key.
 */
export function withSecretKey<T>(
	length: number,
	isValid: (key: Uint8Array) => boolean,
	derive: (key: Uint8Array) => T
): T {
	for (;;) {
		const key = randomBytes(length);
		try {
			if (isValid(key)) return derive(key);
		} finally {
			key.fill(0);
		}
	}
}
