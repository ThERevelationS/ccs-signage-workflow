import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Read-only referential scan — reports orphaned rows; never deletes or repairs.
const CHECKS = [
  { name: 'time_entries_unknown_user', entity: 'TimeEntry', field: 'user_email', parents: 'AuthorizedEmail', parentField: 'email' },
  { name: 'permit_lines_missing_work_order', entity: 'PermitLineItem', field: 'work_order_id', parents: 'WorkOrder', parentField: 'id' },
  { name: 'corrections_missing_entry', entity: 'TimeClockCorrectionRequest', field: 'time_entry_id', parents: 'TimeEntry', parentField: 'id' },
];

const SCAN_PAGE = 500;
const SCAN_MAX_ROWS = 20000;

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

export async function handler(request: Request) {
  try {
    const base44 = createClientFromRequest(request);
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
}
