import { createClientFromRequest } from "npm:@base44/sdk@0.8.25";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";
import { subscriptionsForUser } from "../../shared/alertSubscriptionsModel.ts";

// One composed mount read: session identity + workspace preferences +
// notification unread count. The page's global providers used to each POST
// their own gateway at t=0 — this carries the shared pieces in a single
// invoke and the client primes the per-action read caches so the providers'
// own calls resolve without a second request. Advisory reads only; anything
// mutable still goes through its own gateway.
Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req), { maxRetries: 3 });
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    if (!user?.email) return Response.json({ error: "Authentication required" }, { status: 401 });
    const me = String(user.email).toLowerCase();

    const entities = base44.asServiceRole.entities;
    const [prefRows, notifRows, notifPrefRows] = await Promise.all([
      entities.UserWorkspacePreferences.filter({ user_email: me }).catch(() => []),
      entities.Notification.filter({ recipient_email: me }, "-created_date", 200).catch(() => []),
      entities.NotificationPreference.filter({ user_email: me }, "-created_date", 3).catch(() => []),
    ]);

    const nowMs = Date.now();
    const unread = (Array.isArray(notifRows) ? notifRows : []).filter((n: any) => {
      if (n?.handled_at) return false;
      const snooze = Date.parse(String(n?.snoozed_until || ""));
      if (Number.isFinite(snooze) && snooze > nowMs) return false;
      return !n?.read_at;
    }).length;

    const row = Array.isArray(prefRows) ? prefRows[0] : null;
    // Mirrors notificationAction get_preferences' normalized shape so the
    // client can prime that read slot byte-for-byte.
    const np = Array.isArray(notifPrefRows) ? notifPrefRows[0] : null;
    const listClean = (v: any) => (Array.isArray(v) ? v.map((x: any) => String(x ?? "").trim()).filter(Boolean) : []);
    const notification_prefs = np ? {
      hidden_sections: listClean(np.hidden_sections),
      section_snoozed_until: np.section_snoozed_until && typeof np.section_snoozed_until === "object" ? np.section_snoozed_until : {},
      dismissed_feed_items: Array.isArray(np.dismissed_feed_items) ? np.dismissed_feed_items : [],
      sound_on: np.sound_on !== false,
      digest_opt_in: np.digest_opt_in === true,
      last_digest_date: String(np.last_digest_date || ""),
      subscriptions: subscriptionsForUser(np),
    } : {
      hidden_sections: [], section_snoozed_until: {}, dismissed_feed_items: [],
      sound_on: true, digest_opt_in: false, last_digest_date: "", subscriptions: [],
    };
    return Response.json({
      success: true,
      me: { email: me, name: String(user.full_name || "").trim(), role: String(user.role || "user") },
      prefs: row?.preferences ?? null,
      profiles: Array.isArray(row?.profiles) ? row.profiles : [],
      unread_count: unread,
      notification_prefs,
    });
  } catch (e: any) {
    return Response.json({ success: false, error: String(e?.message || e) }, { status: 500 });
  }
});
