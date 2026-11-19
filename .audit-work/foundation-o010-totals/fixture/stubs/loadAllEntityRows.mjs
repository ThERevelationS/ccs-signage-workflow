// Test double for loadAllEntityRows — returns the injected __rows of the
// entity object passed in (see stubs/base44Client.mjs globalThis registry).
export async function loadAllEntityRows({ entity } = {}) {
  return entity?.__rows ?? [];
}
export function primeEntityRowsCache() {}
