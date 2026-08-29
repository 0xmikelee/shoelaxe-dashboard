/**
 * Deterministic pseudo-randomness. Nothing in the mock layer may call `Math.random()`: a dataset that
 * differs per run turns "the row that reads +10.0% but is held" into a row that is sometimes there,
 * and a failing test into a flake.
 *
 * Every value is derived from a *string key* rather than from a shared sequence, so inserting a
 * product at index 3 does not renumber every id after it — fixtures committed today keep matching the
 * dataset tomorrow.
 */

/** FNV-1a, 32-bit. Fast, stable across engines, and good enough to seed a PRNG. */
export function hash(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32: one line, uniform enough for fixture data, identical everywhere. */
export function rng(key: string): () => number {
  let a = hash(key);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** An integer in [min, max]. */
export function intBetween(key: string, min: number, max: number): number {
  return min + Math.floor(rng(key)() * (max - min + 1));
}

export function pick<T>(key: string, options: readonly T[]): T {
  if (options.length === 0) throw new Error(`pick(${key}): no options`);
  return options[Math.floor(rng(key)() * options.length) % options.length];
}

export function chance(key: string, probability: number): boolean {
  return rng(key)() < probability;
}

/**
 * A v4-shaped UUID derived from `key`. Shaped, not random: `z.uuid()` checks the version and variant
 * nibbles, so a plain 32-hex digest is rejected by the very schemas these ids have to satisfy.
 */
export function uuidFrom(key: string): string {
  const next = rng(`uuid:${key}`);
  const u32 = () => Math.floor(next() * 0x100000000) >>> 0;
  const chars = [u32(), u32(), u32(), u32()]
    .map((n) => n.toString(16).padStart(8, "0"))
    .join("")
    .split("");
  chars[12] = "4";
  chars[16] = "89ab"[u32() % 4];
  const s = chars.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}
