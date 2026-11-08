const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32

/**
 * A ULID (26 characters, sortable by time). Created in the browser so that an
 * undone delete can restore an element under its old id.
 */
export function ulid(now = Date.now()): string {
  let time = "";
  let t = now;
  for (let i = 0; i < 10; i++) {
    time = (ALPHABET[t % 32] ?? "0") + time;
    t = Math.floor(t / 32);
  }
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  let rest = "";
  for (const byte of random) rest += ALPHABET[byte % 32];
  return time + rest;
}
