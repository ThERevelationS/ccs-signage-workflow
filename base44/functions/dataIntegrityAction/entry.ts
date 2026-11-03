import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Read-only referential scan + admin-gated test-record cleanup — ZZ-flagged
// rows are deleted in dependency order with a per-row re-verify; the back-
// stamp repair clears link fields only when the target is provably missing.
const CHECKS = [
  { name: 'time_entries_unknown_user', entity: 'TimeEntry', field: 'user_email', parents: 'AuthorizedEmail', parentField: 'email' },
  { name: 'permit_lines_missing_work_order', entity: 'PermitLineItem', field: 'work_order_id', parents: 'WorkOrder', parentField: 'id' },
  { name: 'corrections_missing_entry', entity: 'TimeClockCorrectionRequest', field: 'time_entry_id', parents: 'TimeEntry', parentField: 'id' },
];

const SCAN_PAGE = 500;
const SCAN_MAX_ROWS = 20000;

// ---- Test-record cleanup (admin-gated, ZZ-verified) ----
const LINK_ENTITY: Record<string, string> = {
  customer_id: 'Customer', estimate_id: 'AllInOneEstimate', work_order_id: 'WorkOrder',
  opportunity_id: 'Opportunity', invoice_id: 'Invoice', intake_id: 'OpportunityIntake',
  estimating_request_id: 'EstimatingRequest', contact_id: 'CustomerContact',
  location_id: 'CustomerLocation', payment_id: 'Payment', purchase_order_id: 'PurchaseOrder',
  change_order_id: 'ChangeOrder', acceptance_id: 'EstimateAcceptance', parent_estimate_id: 'AllInOneEstimate',
};
const NAME_FIELDS = ['company_name', 'name', 'project_name', 'estimate_number', 'work_order_number',
  'invoice_number', 'po_number', 'subject', 'title', 'description', 'text', 'summary', 'payment_method',
  'vendor_name', 'contact_name', 'request_number', 'reference', 'notes'];
const isZz = (row: any) => {
  for (const f of NAME_FIELDS) {
    const v = row?.[f];
    if (typeof v === 'string' && /^ZZ(\b|\s)/.test(v.trim())) return `name:${f}`;
  }
  if (typeof row?.creation_request_key === 'string' && /e2e/i.test(row.creation_request_key)) return 'key';
  return null;
};
// Dependency order — children before parents (Z-04 runbook).
const CLEANUP_ORDER = ['Payment', 'Invoice', 'ChangeOrder', 'PurchaseOrder', 'PermitLineItem', 'WorkOrder',
  'EstimateAcceptance', 'AllInOneEstimate', 'EstimatingRequest', 'OpportunityIntake', 'Opportunity',
  'CustomerContact', 'CustomerLocation', 'Customer', 'OpportunityActivity', 'GeneralTask'];

// Paged table scan — the old list('-created_date', 500) silently stopped at
// 500 rows so orphan checks missed anything older. Pages the table (or a
// filtered slice of it) and reports how far it actually got instead of
// failing when the safety cap trips.
async function scanEntityRows(entity: any, query: any = null) {
  const rows: any[] = [];
  let scanned = 0;
  let truncated = false;
  while (true) {
    const page = query
      ? await entity.filter(query, '-created_date', SCAN_PAGE, scanned)
      : await entity.list('-created_date', SCAN_PAGE, scanned);
    if (!Array.isArray(page)) {
      throw Object.assign(new Error('Integrity scan could not read a page.'), { status: 500 });
    }
    scanned += page.length;
    for (const row of page) rows.push(row);
    if (page.length < SCAN_PAGE) break;
    if (scanned >= SCAN_MAX_ROWS) { truncated = true; break; }
  }
  return { rows, scanned, truncated };
}

Deno.serve(async (request: Request) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(request));
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    const findOrphans = async (check: any, cap = 10) => {
      const scan = await scanEntityRows(base44.asServiceRole.entities[check.entity]);
      const values = [...new Set(scan.rows.map((r: any) => String(r?.[check.field] || '').trim()).filter(Boolean))];
      const orphans: string[] = [];
      for (const v of values.slice(0, 200)) {
        const found = await base44.asServiceRole.entities[check.parents].filter({ [check.parentField]: v }, null, 1);
        if (!Array.isArray(found) || found.length === 0) orphans.push(v);
        if (orphans.length >= cap) break;
      }
      return { orphans, scanned: scan.scanned, truncated: scan.truncated };
    };

    const action = String(body?.action || 'scan');
    if (action === 'list_orphans') {
      const check = CHECKS.find((c) => c.name === body?.check_name);
      if (!check) return Response.json({ success: false, error: 'Unknown check' }, { status: 400 });
      return Response.json({ success: true, ...(await findOrphans(check, 10)) });
    }

    if (action === 'relink') {
      // Manual repair — point orphaned children at a verified parent value.
      const check = CHECKS.find((c) => c.name === body?.check_name);
      const orphanValue = String(body?.orphan_value || '').trim();
      const newParent = String(body?.new_parent_value || '').trim();
      if (!check || !orphanValue || !newParent) {
        return Response.json({ success: false, error: 'check_name, orphan_value and new_parent_value are required' }, { status: 400 });
      }
      const parent = await base44.asServiceRole.entities[check.parents].filter({ [check.parentField]: newParent }, null, 1);
      if (!Array.isArray(parent) || parent.length === 0) {
        return Response.json({ success: false, error: `No ${check.parents} row matches "${newParent}"` }, { status: 404 });
      }
      const matched = await scanEntityRows(base44.asServiceRole.entities[check.entity], { [check.field]: orphanValue });
      const orphans = matched.rows;
      if (orphans.length === 0) {
        return Response.json({ success: false, error: 'No orphaned rows matched' }, { status: 404 });
      }
      let relinked = 0;
      for (const row of orphans.slice(0, 100)) {
        await base44.asServiceRole.entities[check.entity].update(row.id, { [check.field]: newParent });
        relinked += 1;
      }
      try {
        await base44.asServiceRole.entities.AdminAuditLog.create({
          actor_email: actor.email, action: 'integrity_relink',
          target_email: `${check.entity}:${orphanValue}`, detail: `${relinked} rows -> ${newParent}`,
          at: new Date().toISOString(),
        });
      } catch { /* audit is best-effort */ }
      return Response.json({ success: true, relinked, scanned: matched.scanned, truncated: matched.truncated });
    }

    // ---- zz_scan / zz_cleanup ----
    // Flagged = ZZ-named row, or a row linked to a flagged row. Scans every
    // entity in CLEANUP_ORDER, builds the flagged set to a fixpoint, then
    // (cleanup only) deletes leaf-first re-verifying each row on load.
    const collectZz = async () => {
      const loaded: Record<string, any[]> = {};
      const flagged = new Set<string>();
      const reason: Record<string, string> = {};
      for (const ent of CLEANUP_ORDER) {
        try {
          const scan = await scanEntityRows(base44.asServiceRole.entities[ent]);
          loaded[ent] = scan.rows;
          for (const r of scan.rows) {
            const hit = isZz(r);
            if (hit) { flagged.add(`${ent}:${r.id}`); reason[`${ent}:${r.id}`] = hit; }
          }
        } catch { loaded[ent] = []; }
      }
      let grew = true;
      while (grew) {
        grew = false;
        for (const ent of CLEANUP_ORDER) {
          for (const r of (loaded[ent] || [])) {
            const key = `${ent}:${r.id}`;
            if (flagged.has(key)) continue;
            for (const [field, target] of Object.entries(LINK_ENTITY)) {
              const v = r?.[field];
              if (typeof v === 'string' && v && flagged.has(`${target}:${v}`)) {
                flagged.add(key); reason[key] = `link:${field}`; grew = true; break;
              }
            }
          }
        }
      }
      return { loaded, flagged, reason };
    };

    if (action === 'zz_scan' || action === 'zz_cleanup') {
      const { loaded, flagged, reason } = await collectZz();
      const perEntity: Record<string, any> = {};
      const deleted: string[] = [];
      const skipped: string[] = [];
      for (const ent of CLEANUP_ORDER) {
        const rows = loaded[ent] || [];
        const hit = rows.filter((r) => flagged.has(`${ent}:${r.id}`));
        perEntity[ent] = { scanned: rows.length, flagged: hit.length, deleted: 0 };
        if (action !== 'zz_cleanup') continue;
        for (const r of hit) {
          try {
            // Re-verify on load — only ever delete a row that was flagged in
            // this run and still exists right now.
            const fresh = await base44.asServiceRole.entities[ent].filter({ id: r.id }, null, 1);
            const row = Array.isArray(fresh) ? fresh[0] : null;
            if (!row) continue;
            if (!isZz(row) && !reason[`${ent}:${r.id}`]?.startsWith('link:')) {
              skipped.push(`${ent}:${r.id}`); continue;
            }
            await base44.asServiceRole.entities[ent].delete(r.id);
            perEntity[ent].deleted += 1;
            deleted.push(`${ent}:${r.id}`);
          } catch (e: any) {
            skipped.push(`${ent}:${r.id} (${e?.message || 'delete failed'})`);
          }
        }
      }
      try {
        await base44.asServiceRole.entities.AdminAuditLog.create({
          actor_email: actor.email, action: action === 'zz_cleanup' ? 'zz_cleanup' : 'zz_scan',
          target_email: 'zz-records', detail: `${deleted.length} deleted, ${skipped.length} skipped`,
          at: new Date().toISOString(),
        });
      } catch { /* best-effort */ }
      return Response.json({ success: true, per_entity: perEntity, deleted: deleted.length,
        skipped, flagged_total: flagged.size });
    }

    // ---- repair_back_stamp ----
    // Clears link fields on one record whose targets are provably missing.
    // Fail-closed: only fields listed in LINK_ENTITY whose target lookup
    // returns empty are nulled — existing targets are left alone.
    if (action === 'repair_back_stamp') {
      const ent = String(body?.entity || '');
      const id = String(body?.id || '');
      if (!ent || !id) return Response.json({ success: false, error: 'entity and id required' }, { status: 400 });
      const rows = await base44.asServiceRole.entities[ent].filter({ id }, null, 1);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return Response.json({ success: false, error: `No ${ent} row ${id}` }, { status: 404 });
      const cleared: Record<string, string> = {};
      const kept: string[] = [];
      const patch: Record<string, any> = {};
      for (const [field, target] of Object.entries(LINK_ENTITY)) {
        const v = row?.[field];
        if (typeof v !== 'string' || !v) continue;
        try {
          const hit = await base44.asServiceRole.entities[target].filter({ id: v }, null, 1);
          if (Array.isArray(hit) && hit.length > 0) { kept.push(field); continue; }
          patch[field] = null; cleared[field] = v;
        } catch { kept.push(field + ' (unverifiable)'); }
      }
      if (Object.keys(patch).length > 0) {
        await base44.asServiceRole.entities[ent].update(id, patch);
      }
      try {
        await base44.asServiceRole.entities.AdminAuditLog.create({
          actor_email: actor.email, action: 'repair_back_stamp', target_email: `${ent}:${id}`,
          detail: `cleared ${JSON.stringify(cleared)}`, at: new Date().toISOString(),
        });
      } catch { /* best-effort */ }
      return Response.json({ success: true, cleared, kept, patched: Object.keys(patch).length });
    }

    const results = [];
    for (const check of CHECKS) {
      try {
        const scan = await scanEntityRows(base44.asServiceRole.entities[check.entity]);
        const values = [...new Set(scan.rows.map((r: any) => String(r?.[check.field] || '').trim()).filter(Boolean))];
        let orphans = 0;
        for (const v of values.slice(0, 200)) {
          const found = await base44.asServiceRole.entities[check.parents].filter({ [check.parentField]: v }, null, 1);
          if (!Array.isArray(found) || found.length === 0) orphans += 1;
        }
        results.push({ name: check.name, scanned: scan.scanned, values_checked: values.length, orphans, truncated: scan.truncated });
      } catch (e: any) {
        results.push({ name: check.name, error: e?.message || 'check failed' });
      }
    }
    return Response.json({ success: true, results });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Integrity scan failed' }, { status: e?.status || 500 });
  }
});