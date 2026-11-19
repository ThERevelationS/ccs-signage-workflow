export function newCreationRequestKey(prefix = "create") { return `${prefix}-harness-${Math.random().toString(36).slice(2, 10)}`; }
export async function ensureIdempotentEntityCreate({ entity, data }) { return entity.create(data); }
