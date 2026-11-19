// O-012 harness stub: loadAllEntityRows({entity, query, sort, label}) reads
// the shared in-memory store. entity may be a staffEntities proxy table or a
// plain object with .filter/.list.
export async function loadAllEntityRows({ entity, query = {}, sort, label } = {}) {
  const rows = entity?.filter
    ? await entity.filter(query, sort).catch(() => [])
    : entity?.list
      ? await entity.list().catch(() => [])
      : [];
  return Array.isArray(rows) ? rows : [];
}
export function primeEntityRowsCache() {}
export function invalidateEntityRowsCache() {}
