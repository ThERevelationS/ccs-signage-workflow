import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";

// One composed mount read: session identity + workspace preferences +
// notification unread count. The page's global providers used to each POST
// their own gateway at t=0 — this carries the shared pieces in a single
// invoke and the client primes the per-action read caches so the providers'
// own calls resolve without a second request. Advisory reads only; anything
// mutable still goes through its own gateway.
Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 1 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: "Authentication required" }, { status: 401 });
    const me = String(user.email).toLowerCase();

    const entities = base44.asServiceRole.entities;
    const [prefRows, notifRows] = await Promise.all([
      entities.UserWorkspacePreferences.filter({ user_email: me }).catch(() => []),
      entities.Notification.filter({ recipient_email: me }, "-created_date", 200).catch(() => []),
    ]);

    const nowMs = Date.now();
    const unread = (Array.isArray(notifRows) ? notifRows : []).filter((n: any) => {
      if (n?.handled_at) return false;
      const snooze = Date.parse(String(n?.snoozed_until || ""));
      if (Number.isFinite(snooze) && snooze > nowMs) return false;
      return !n?.read_at;
    }).length;

    const row = Array.isArray(prefRows) ? prefRows[0] : null;
    return Response.json({
      success: true,
      me: { email: me, name: String(user.full_name || "").trim(), role: String(user.role || "user") },
      prefs: row?.preferences ?? null,
      profiles: Array.isArray(row?.profiles) ? row.profiles : [],
      unread_count: unread,
    });
  } catch (e: any) {
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
});
