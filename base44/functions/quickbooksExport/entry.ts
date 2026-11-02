// quickbooksExport — QBO Online adapter surface (I-09).
//
// Everything here is testable EXCEPT the live OAuth/wire calls, which stay
// BLOCKED-CREDENTIALS until Intuit app credentials exist. `status` reports the
// connection, `dry_run` produces + validates the exact payload a push WOULD
// send, and every push/pull action returns its dry-run envelope with the
// credentials block — the wire is never attempted.
//
// Token storage lives in GlobalSettings { setting_key: 'qbo', setting_value:
// { realm_id, refresh_token_ref, access_token_ref, company_name, connected_at,
//   last_sync_at, environment, customer_map, account_map, item_map,
//   method_map, sync_state } } — token fields are secret-store REFERENCES,
// never the tokens themselves.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.4";
import { authenticateSignShopSession } from "../../shared/signShopSession.ts";
import { withEntityRateLimitRetry } from "../../shared/entityRateLimitRetry.ts";
import {
  QBO_ACTION_SPEC,
  QBO_BLOCK_CREDENTIALS,
  QBO_DOC_TYPES,
  QBO_ENTITY_FOR_DOC,
  QBO_SETTINGS_KEY,
  defaultQboSettings,
  dryRunEnvelope,
  normalizeQboSettings,
  pushBlockReason,
  qboAlreadySynced,
  qboConnectionStatus,
  qboSyncReceipt,
  qboSyncStateKey,
} from "../../shared/qboAdapterModel.ts";

const clean = (v: unknown): string => String(v ?? "").trim();
const bad = (msg: string, status = 400) =>
  Object.assign(new Error(msg), { status });

async function loadQboSettings(GlobalSettings: any) {
  const rows = await GlobalSettings.filter(
    { setting_key: QBO_SETTINGS_KEY }, "created_date", 2,
  ).catch(() => []);
  const row = Array.isArray(rows) ? rows[0] : null;
  return { row, value: normalizeQboSettings(row?.setting_value) };
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || "unknown";
    const action = clean(body?.action).toLowerCase();
    if (!action) throw bad("An action is required.");
    if (!QBO_ACTION_SPEC.some((a) => a.name === action)) {
      throw bad(`Unknown action "${action}". Expected one of: ${QBO_ACTION_SPEC.map((a) => a.name).join(", ")}.`);
    }

    const GlobalSettings = base44.asServiceRole.entities.GlobalSettings;
    const { row: settingsRow, value: settings } = await loadQboSettings(GlobalSettings);
    const conn = qboConnectionStatus(settings);

    if (action === "status") {
      const receipts = Object.entries(settings.sync_state || {}).map(([key, r]: any) => ({
        key, qbo_id: clean(r?.qbo_id), synced_at: clean(r?.synced_at), action: clean(r?.action),
      }));
      return Response.json({
        success: true,
        action,
        connection: conn,
        environment: settings.environment,
        company_name: settings.company_name,
        last_sync_at: settings.last_sync_at,
        actions: QBO_ACTION_SPEC.map((a) => ({
          name: a.name, direction: a.direction, credentials: a.credentials, notes: a.notes,
        })),
        sync_receipts: receipts,
      });
    }

    // Resolve the record for doc-scoped actions.
    const docType = clean(body?.doc_type).toLowerCase();
    const resolveDocType = () => {
      const d = docType || clean(action.match(/^push_(\w+)$/)?.[1]).toLowerCase();
      if (!QBO_DOC_TYPES.includes(d as any)) {
        throw bad(`doc_type must be one of: ${QBO_DOC_TYPES.join(", ")}.`);
      }
      return d;
    };

    const loadRecord = async (doc: string) => {
      const recordId = clean(body?.record_id);
      if (!recordId) throw bad("record_id is required.");
      const entityName = QBO_ENTITY_FOR_DOC[doc];
      const names = entityName.split("|");
      for (const name of names) {
        const entity = base44.asServiceRole.entities[name];
        if (!entity?.get) continue;
        const rec = await entity.get(recordId).catch(() => null);
        if (rec?.id) return rec;
      }
      throw bad(`${entityName} ${recordId} not found.`, 404);
    };

    if (action === "dry_run") {
      const doc = resolveDocType();
      const record = await loadRecord(doc);
      const envelope = dryRunEnvelope(doc, record, {
        settings,
        action: clean(body?.sync_action) || `push_${doc}`,
      });
      return Response.json({ success: true, action, ...envelope });
    }

    if (action === "connect") {
      throw bad(
        `${QBO_BLOCK_CREDENTIALS}: Intuit OAuth app credentials are not configured. ` +
        `Store {realm_id, refresh_token_ref} in GlobalSettings 'qbo' once the app exists.`,
        503,
      );
    }

    if (action === "disconnect") {
      if (user?.role !== "admin") throw bad("Admin role is required to disconnect QBO.", 403);
      if (!settingsRow?.id) {
        return Response.json({ success: true, action, disconnected: false, note: "No qbo settings row exists." });
      }
      const next = {
        ...settings,
        realm_id: "", refresh_token_ref: "", access_token_ref: "",
        company_name: "", connected_at: "",
      };
      // sync_state is deliberately preserved — receipts document what was pushed.
      await GlobalSettings.update(settingsRow.id, { setting_value: next });
      return Response.json({ success: true, action, disconnected: true, sync_state_preserved: true });
    }

    // push_* / pull_accounts — credential-gated. Return the dry-run envelope
    // so callers see exactly what WOULD go over the wire, plus the block.
    const spec = QBO_ACTION_SPEC.find((a) => a.name === action)!;
    if (conn.blocked) {
      const doc = spec.doc_type || (action === "pull_accounts" ? "account" : "");
      let envelope: Record<string, unknown> | null = null;
      if (doc && action !== "pull_accounts") {
        const record = await loadRecord(doc);
        envelope = dryRunEnvelope(doc, record, { settings, action }) as any;
        if (envelope) envelope.actor = actor;
      }
      return Response.json({
        success: false,
        action,
        blocked: QBO_BLOCK_CREDENTIALS,
        blocked_reason: conn.blocked_reason,
        missing: conn.missing,
        note: "Live QBO wire calls are credential-gated. The would-send payload is included where resolvable.",
        dry_run: envelope,
      }, { status: 503 });
    }

    // Unreachable while credentials are blocked — the live-call branch for
    // when Intuit credentials land. Kept explicit so the wiring is visible.
    const doc = resolveDocType();
    const record = await loadRecord(doc);
    if (spec.idempotent && qboAlreadySynced(settings, action, doc, record)) {
      return Response.json({
        success: true, action, already_synced: true,
        receipt: qboSyncReceipt(settings, doc, record),
        sync_state_key: qboSyncStateKey(doc, record),
      });
    }
    const recordBlocked = pushBlockReason(doc, record);
    if (recordBlocked) {
      return Response.json({ success: false, action, blocked: "record", blocked_reason: recordBlocked }, { status: 409 });
    }
    return Response.json({
      success: true, action,
      dry_run: dryRunEnvelope(doc, record, { settings, action }),
      note: "Credentials resolved — wire send is still stubbed pending first-connect verification.",
    });
  } catch (error: any) {
    return Response.json(
      { error: error?.message || "quickbooksExport failed." },
      { status: error?.status || 500 },
    );
  }
});
