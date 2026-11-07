// In-isolate short-TTL response memo. Deno function isolates persist module
// state across warm invocations, so a keyed memo absorbs concurrent bursts for
// ADVISORY reads at near-zero entity cost.
//
// Rules:
//  - NEVER memo responses that can differ by caller on the same payload — the
//    caller/session is part of the key where relevant.
//  - Write paths must call bust() so post-write reads never serve stale state.
//  - Callers may pass `bypass: true` to force a fresh read (maps to the
//    frontend's `force` refresh).
//  - Mutable operational data (punch state, inventory) gets only very short
//    TTLs for burst absorption — correctness is preserved because writes bust.

type MemoEntry = { value: unknown; expires: number };
const store = new Map<string, MemoEntry>();
const MAX_ENTRIES = 500;

function prune(now: number) {
  if (store.size < MAX_ENTRIES) return;
  for (const [k, v] of store) {
    if (v.expires <= now) store.delete(k);
  }
  // Still over cap: evict oldest-expiring first.
  if (store.size >= MAX_ENTRIES) {
    const ordered = [...store.entries()].sort((a, b) => a[1].expires - b[1].expires);
    for (const [k] of ordered.slice(0, store.size - MAX_ENTRIES + 50)) store.delete(k);
  }
}

/**
 * Serve `key` from the memo, or compute+store it. In-flight dedupe is
 * automatic: concurrent callers awaiting the same key share one computation.
 */
const inflight = new Map<string, Promise<unknown>>();

export async function memo<T>(
  scope: string,
  key: string,
  ttlMs: number,
  compute: () => Promise<T>,
  opts: { bypass?: boolean } = {},
): Promise<T> {
  const full = `${scope}:${key}`;
  const now = Date.now();
  if (!opts.bypass) {
    const hit = store.get(full);
    if (hit && hit.expires > now) return hit.value as T;
    const pending = inflight.get(full);
    if (pending) return pending as Promise<T>;
  }
  const p = (async () => {
    try {
      const value = await compute();
      prune(Date.now());
      store.set(full, { value, expires: Date.now() + ttlMs });
      return value;
    } finally {
      inflight.delete(full);
    }
  })();
  inflight.set(full, p);
  return p;
}

/** Drop all memo entries under a scope (call after any write that could change them). */
export function bust(scope: string, key?: string) {
  if (key === undefined) {
    for (const k of store.keys()) if (k.startsWith(`${scope}:`)) store.delete(k);
    return;
  }
  store.delete(`${scope}:${key}`);
}
