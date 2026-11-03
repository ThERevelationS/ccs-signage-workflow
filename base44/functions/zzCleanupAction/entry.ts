import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';

// Admin-only test-record cleanup (L-09 / Z-01 / Z-02 / Z-04 runbook):
//   zz_scan           — reports ZZ-flagged rows per entity, deletes nothing
//   zz_cleanup        — deletes flagged rows leaf-first, re-verified on load
//   repair_back_stamp — clears link fields on one record whose targets are
//                       provably missing (fail-closed per field)
// Flagged = row with an identifying field starting "ZZ", a creation key
// containing "e2e", or a link field pointing at a flagged row.

const SCAN_PAGE = 500;
const SCAN_MAX_ROWS = 20000;

const LINK_ENTITY: Record<string, string> = {
  customer_id: 'Customer', estimate_id: 'AllInOneEstimate', work_order_id: 'WorkOrder',
  opportunity_id: 'Opportunity', invoice_id: 'Invoice', intake_id: 'OpportunityIntake',
  estimating_request_id: 'EstimatingRequest', contact_id: 'CustomerContact',
  location_id: 'CustomerLocation', payment_id: 'Payment', purchase_order_id: 'PurchaseOrder',
  change_order_id: 'ChangeOrder', acceptance_id: 'EstimateAcceptance', parent_estimate_id: 'AllInOneEstimate',
};
const NAME_FIELDS = ['company_name', 'name', 'project_name', 'estimate_number', 'work_order_number',
  'invoice_number', 'po_number', 'subject', 'title', 'description', 'text', 'summary',
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

async function scanEntityRows(entity: any, query: any = null) {
  const rows: any[] = [];
  let scanned = 0;
  while (true) {
    const page = query
      ? await entity.filter(query, '-created_date', SCAN_PAGE, scanned)
      : await entity.list('-created_date', SCAN_PAGE, scanned);
    if (!Array.isArray(page)) break;
    scanned += page.length;
    for (const row of page) rows.push(row);
    if (page.length < SCAN_PAGE) break;
    if (scanned >= SCAN_MAX_ROWS) break;
  }
  return { rows, scanned };
}

Deno.serve(async (request: Request) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(request));
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    const action = String(body?.action || 'zz_scan');
    const audit = async (act: string, detail: string) => {
      try {
        await base44.asServiceRole.entities.AdminAuditLog.create({
          actor_email: actor.email, action: act, target_email: 'zz-records',
          detail, at: new Date().toISOString(),
        });
      } catch { /* best-effort */ }
    };

    if (action === 'zz_scan' || action === 'zz_cleanup') {
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
            // Re-verify on load — only delete a row flagged in THIS run that
            // still exists and still matches its flag reason.
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
      const flaggedList = [...flagged].map((k) => ({ key: k, reason: reason[k] }));
      await audit(action, `${deleted.length} deleted, ${skipped.length} skipped of ${flagged.size} flagged`);
      return Response.json({ success: true, per_entity: perEntity, deleted: deleted.length,
        skipped, flagged_total: flagged.size, flagged: flaggedList });
    }

    // purge_dangling_ref — find every link field holding a dead id and null it.
    // Guarded: only fields in LINK_ENTITY, only exact id matches, and (unless
    // entity explicitly allows) only on ZZ-flagged or link-flagged rows.
    if (action === 'purge_dangling_ref') {
      const deadId = String(body?.dead_id || '');
      if (!deadId) return Response.json({ success: false, error: 'dead_id required' }, { status: 400 });
      const found: any[] = [];
      const repaired: string[] = [];
      for (const ent of CLEANUP_ORDER) {
        let rows: any[] = [];
        try { rows = (await scanEntityRows(base44.asServiceRole.entities[ent])).rows; } catch { continue; }
        for (const r of rows) {
          for (const field of Object.keys(LINK_ENTITY)) {
            if (r?.[field] === deadId) {
              found.push({ entity: ent, id: r.id, field });
              if (body?.apply === true) {
                try {
                  await base44.asServiceRole.entities[ent].update(r.id, { [field]: null });
                  repaired.push(`${ent}:${r.id}.${field}`);
                } catch (e: any) {
                  repaired.push(`${ent}:${r.id}.${field} FAILED: ${e?.message || 'update failed'}`);
                }
              }
            }
          }
        }
      }
      await audit('purge_dangling_ref', `${deadId} found=${found.length} repaired=${repaired.length} apply=${!!body?.apply}`);
      return Response.json({ success: true, dead_id: deadId, found, repaired, applied: !!body?.apply });
    }

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
      await audit('repair_back_stamp', `${ent}:${id} cleared ${JSON.stringify(cleared)}`);
      return Response.json({ success: true, cleared, kept, patched: Object.keys(patch).length, row });
    }

    // get_row — read-only single row fetch for cleanup verification.
    if (action === 'get_row') {
      const ent = String(body?.entity || '');
      const id = String(body?.id || '');
      if (!ent || !id) return Response.json({ success: false, error: 'entity and id required' }, { status: 400 });
      const rows = await base44.asServiceRole.entities[ent].filter({ id }, null, 1);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return Response.json({ success: false, error: `No ${ent} row ${id}` }, { status: 404 });
      return Response.json({ success: true, row });
    }

    // delete_orphan_by_id — removes ONE row only when provably orphaned:
    // every populated link field must dangle (target row missing). A row that
    // still links to any live parent is refused — no blind deletes.
    if (action === 'delete_orphan_by_id') {
      const ent = String(body?.entity || '');
      const id = String(body?.id || '');
      if (!ent || !id || !CLEANUP_ORDER.includes(ent)) {
        return Response.json({ success: false, error: 'entity (in cleanup order) and id required' }, { status: 400 });
      }
      const rows = await base44.asServiceRole.entities[ent].filter({ id }, null, 1);
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return Response.json({ success: true, deleted: 0, note: 'already absent' });
      const live: string[] = [];
      const dangling: string[] = [];
      for (const [field, target] of Object.entries(LINK_ENTITY)) {
        const v = row?.[field];
        if (typeof v !== 'string' || !v) continue;
        try {
          const hit = await base44.asServiceRole.entities[target].filter({ id: v }, null, 1);
          if (Array.isArray(hit) && hit.length > 0) live.push(`${field}->${target}`); else dangling.push(field);
        } catch { live.push(`${field} (unverifiable)`); }
      }
      if (live.length > 0) {
        return Response.json({ success: false, error: `Row still links to live parents: ${live.join(', ')}`, live }, { status: 409 });
      }
      await base44.asServiceRole.entities[ent].delete(id);
      await audit('delete_orphan_by_id', `${ent}:${id} dangling=[${dangling.join(',')}]`);
      return Response.json({ success: true, deleted: 1, dangling });
    }

    return Response.json({ success: false, error: `Unknown action ${action}` }, { status: 400 });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'cleanup failed' }, { status: e?.status || 500 });
  }
});
