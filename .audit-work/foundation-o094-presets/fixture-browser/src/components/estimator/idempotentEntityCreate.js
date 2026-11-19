let n = 0;
export const newCreationRequestKey = (k) => `k-${k || 'x'}-${++n}`;
export const ensureIdempotentEntityCreate = async (a) => ({ id: 'created-1', ...a.data });
