// Device-generated ids (games, participants, frames) so a game built offline
// syncs as-is.

interface CryptoLike {
  randomUUID?: () => string;
  getRandomValues(array: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>;
}

/**
 * A random v4 UUID.
 *
 * crypto.randomUUID only exists in secure contexts (https or localhost). It is
 * MISSING when the app is opened over plain http on another host, e.g. testing
 * on a phone against the dev machine's LAN IP. crypto.getRandomValues works in
 * every context, so build the UUID from it in that case.
 */
export function newId(cryptoImpl: CryptoLike = globalThis.crypto): string {
  if (typeof cryptoImpl.randomUUID === 'function') {
    return cryptoImpl.randomUUID();
  }
  return uuidV4FromRandom(cryptoImpl);
}

export function uuidV4FromRandom(cryptoImpl: CryptoLike = globalThis.crypto): string {
  const bytes = cryptoImpl.getRandomValues(new Uint8Array(16));
  // RFC 9562 section 5.4: version 4 in the high nibble of byte 6,
  // variant 10xx in the high bits of byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
