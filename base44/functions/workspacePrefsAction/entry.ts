import { createClientFromRequest } from "npm:@base44/sdk@0.8.53";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";

// Personal Workspace Settings backend. One UserWorkspacePreferences row per
// employee (keyed by session email, backend-only RLS). The consolidated
// `preferences` blob is client-validated; this action only authenticates,
// scopes, dedupes, and persists. Mirrors the time_tracker_prefs_* contract:
// request_id idempotency, 409 on ambiguous rows, own-row enforcement.

const clean = (v: any) => String(v ?? '').trim();
const ok = (data: any) => Response.json({ success: true, ...data });
const fail = (error: string, status = 400) => Response.json({ success: false, error }, { status });

const MAX_PREFS_BYTES = 64 * 1024;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user || String(user.id || '').startsWith('badge:')) return fail('Authentication required.', 401);
    const actorEmail = clean(user.email).toLowerCase();
    if (!actorEmail) return fail('The signed-in session has no email identity.', 403);
    const action = clean(body?.action);
    if (!action) return fail('An action is required.');

    const entity = base44.asServiceRole.entities.UserWorkspacePreferences;
    const actorName = clean(user.full_name) || actorEmail;

    const loadRows = async () => {
      const rows = await entity.filter({ user_email: actorEmail });
      if (!Array.isArray(rows)) throw new Error('Workspace preference lookup did not return a record list.');
      return rows;
    };

    if (action === 'prefs_get') {
      const rows = await loadRows();
      if (rows.length > 1) return fail('Workspace preferences are ambiguous. Admin review is required.', 409);
      const row = rows[0] || null;
      return ok({
        prefs: row?.preferences ?? null,
        profiles: Array.isArray(row?.profiles) ? row.profiles : [],
        schema_version: row?.schema_version ?? 1,
        updated_date: row?.updated_date ?? null,
      });
    }

    if (action === 'prefs_update') {
      const requestId = clean(body?.request_id);
      if (!requestId) return fail('A request_id is required to update workspace preferences.');
      const rows = await loadRows();
      if (rows.length > 1) return fail('Workspace preferences are ambiguous. Admin review is required.', 409);
      const existing = rows[0] || null;
      if (existing && clean(existing.last_request_id) === requestId) {
        return ok({ reused: true, prefs: existing.preferences ?? null, profiles: existing.profiles ?? [] });
      }
      const prefs = body?.prefs && typeof body.prefs === 'object' && !Array.isArray(body.prefs) ? body.prefs : (existing?.preferences ?? {});
      const profiles = Array.isArray(body?.profiles) ? body.profiles.slice(0, 20) : (existing?.profiles ?? []);
      if (JSON.stringify(prefs).length > MAX_PREFS_BYTES || JSON.stringify(profiles).length > MAX_PREFS_BYTES) {
        return fail('Preference payload is too large.');
      }
      const write: any = {
        user_email: actorEmail,
        user_name: actorName,
        schema_version: 1,
        preferences: prefs,
        profiles,
        last_request_id: requestId,
      };
      if (existing) {
        await entity.update(existing.id, write);
      } else {
        write.creation_request_key = `uwp:${actorEmail}`;
        await entity.create(write);
        // Concurrent first-create race: keep the earliest row, remove extras.
        const after = await loadRows();
        if (after.length > 1) {
          const sorted = [...after].sort((a, b) => String(a.created_date || '').localeCompare(String(b.created_date || '')));
          for (const dup of sorted.slice(1)) {
            try { await entity.delete(dup.id); } catch { /* leave for admin review */ }
          }
        }
      }
      return ok({ prefs, profiles });
    }

    return fail(`Unknown action "${action}".`);
  } catch (error: any) {
    const status = Number(error?.statusCode) || 500;
    return fail(error?.message || 'Workspace preferences request failed.', status === 500 ? 500 : status);
  }
});
