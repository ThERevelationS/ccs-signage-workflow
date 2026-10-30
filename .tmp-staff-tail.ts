// Short-lived module-scope cache — identical reads within a few seconds (mount
// storms: parallel component reads and subscribe checks) collapse to a single
// upstream entity read while an isolate stays warm. Kept short so reads issued
// right after a write never serve pre-write snapshots.
const staffReadCache = new Map();
const STAFF_READ_CACHE_MS = 5_000;

const isRateLimited = (error: any) => Number(error?.status) === 429
  || /rate limit|too many requests/i.test(String(error?.message || error));

const MAX_BATCH = 16;
const BATCH_CONCURRENCY = 4;

// One read for an already-authenticated staff user. Returns {status, body} so
// a batch can report each read independently; the single-read path wraps it as
// a normal Response. Authorization, owner scoping and field projection are
// identical for both paths.
async function readOne(base44: any, user: any, body: any) {
  try {
    const entityName = String(body?.entity || '').trim();
    if (!STAFF_READABLE.has(entityName) && !ADMIN_READABLE.has(entityName)) {
      return { status: 403, body: { error: 'This record type cannot be read here.' } };
    }
    if (ADMIN_READABLE.has(entityName) && user.role !== 'admin') {
      return { status: 403, body: { error: 'This record type requires a CCS admin.' } };
    }

    const entity = base44.asServiceRole.entities[entityName];
    const ownerEmail = user.role === 'admin' ? '' : String(user.email).trim().toLowerCase();
    const id = String(body?.id || '').trim();
    if (id) {
      const item = await entity.get(id).catch((e: any) => (Number(e?.status) === 404 ? null : Promise.reject(e)));
      if (!item) return { status: 404, body: { error: 'Record not found.' } };
      if (OWNER_SCOPED.has(entityName) && ownerEmail && String(item?.user_email || '').trim().toLowerCase() !== ownerEmail) {
        return { status: 404, body: { error: 'Record not found.' } };
      }
      return { status: 200, body: { success: true, item: projectItem(entityName, item, user) } };
    }

    const query = cleanQuery(body?.query, entityName);
    const sort = cleanSort(body?.sort, entityName);
    const limit = cleanLimit(body?.limit, 100);
    const skip = cleanSkip(body?.skip);
    let effectiveQuery = query;
    if (OWNER_SCOPED.has(entityName) && ownerEmail) {
      effectiveQuery = { ...(effectiveQuery || {}), user_email: ownerEmail };
    }
    const items = effectiveQuery
      ? await entity.filter(effectiveQuery, sort || null, limit, skip)
      : await entity.list(sort || null, limit, skip);
    const rows = Array.isArray(items) ? items : [];
    const scopedRows = OWNER_SCOPED.has(entityName) && ownerEmail
      ? rows.filter((row) => String(row?.user_email || '').trim().toLowerCase() === ownerEmail)
      : rows;
    if (body?.count === true) {
      return { status: 200, body: { success: true, count: scopedRows.length } };
    }
    return { status: 200, body: { success: true, items: scopedRows.map((row) => projectItem(entityName, row, user)) } };
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 404, 429].includes(status)) {
      return { status, body: { error: error?.message || 'Staff read failed.' } };
    }
    // A platform rate limit is transient: hand it back as 429 so the browser
    // backs off and retries instead of surfacing a hard failure.
    if (isRateLimited(error)) {
      return { status: 429, body: { error: 'Data could not be loaded. Try again.', retry_after_ms: 3000 } };
    }
    console.error('staffDataRead error:', error);
    return { status: 500, body: { error: 'Data could not be loaded. Try again.' } };
  }
}

function toResponse(result: { status: number, body: any }) {
  const headers: Record<string, string> = result.status === 429 ? { 'Retry-After': '3' } : {};
  return Response.json(result.body, { status: result.status, headers });
}

Deno.serve(async (req) => {
  try {
    // One quick server-side retry at most: longer backoff belongs to the
    // browser, which honors Retry-After and coordinates every open request.
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await resolveFleetStaffUser(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: 'Authentication required' }, { status: 401 });
    const readCacheKey = JSON.stringify(body) + '|' + user.email + '|' + user.role;
    const cachedRead = staffReadCache.get(readCacheKey);
    if (cachedRead && cachedRead.expires > Date.now()) return Response.json(cachedRead.payload);

    // Batch: many reads behind a single session verification. The "entities"
    // shape returns rows keyed by entity name with per-entity errors beside
    // them; the "requests" shape returns positional {status, body} results.
    // One failing entry never hides the others — a single bad entity can no
    // longer turn one batch call into a fan-out of individual reads.
    if (Array.isArray(body?.entities) || Array.isArray(body?.requests)) {
      const entityMode = Array.isArray(body.entities);
      const requests = entityMode ? body.entities : body.requests;
      if (requests.length === 0 || requests.length > MAX_BATCH) {
        return Response.json({ error: `Staff read batch needs 1 to ${MAX_BATCH} reads.` }, { status: 400 });
      }
      const entities: Record<string, any> = {};
      const errors: Record<string, any> = {};
      const results: any[] = new Array(requests.length);
      for (let start = 0; start < requests.length; start += BATCH_CONCURRENCY) {
        const slice = requests.slice(start, start + BATCH_CONCURRENCY);
        const settled = await Promise.all(slice.map((request: any) => readOne(base44, user, request)));
        settled.forEach((result, offset) => {
          results[start + offset] = result;
          const name = String(requests[start + offset]?.entity || '').trim();
          if (result.status === 200) {
            entities[name] = result.body?.items ?? result.body?.item ?? result.body?.count;
          } else if (name) {
            errors[name] = { status: result.status, error: result.body?.error || 'Staff read failed.' };
          }
        });
      }
      const batchPayload = entityMode
        ? { success: true, entities, ...(Object.keys(errors).length ? { errors } : {}) }
        : { success: true, results };
      if (staffReadCache.size > 300) staffReadCache.clear();
      staffReadCache.set(readCacheKey, { payload: batchPayload, expires: Date.now() + STAFF_READ_CACHE_MS });
      return Response.json(batchPayload);
    }

    const result = await readOne(base44, user, body);
    if (result.status === 200) {
      if (staffReadCache.size > 300) staffReadCache.clear();
      staffReadCache.set(readCacheKey, { payload: result.body, expires: Date.now() + STAFF_READ_CACHE_MS });
    }
    return toResponse(result);
  } catch (error: any) {
    const status = Number(error?.status || error?.response?.status || 500);
    if ([400, 401, 403, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Staff read failed.' }, { status });
    }
    if (isRateLimited(error)) {
      return Response.json(
        { error: 'Data could not be loaded. Try again.', retry_after_ms: 3000 },
        { status: 429, headers: { 'Retry-After': '3' } },
      );
    }
    console.error('staffDataRead error:', error);
    return Response.json({ error: 'Data could not be loaded. Try again.' }, { status: 500 });
  }
});
