import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { base44 } from '@/api/base44Client';

// Read-only referential scan — reports orphaned rows; never deletes or repairs.
const CHECKS = [
  { name: 'time_entries_unknown_user', entity: 'TimeEntry', field: 'user_email', parents: 'AuthorizedEmail', parentField: 'email' },
  { name: 'permit_lines_missing_work_order', entity: 'PermitLineItem', field: 'work_order_id', parents: 'WorkOrder', parentField: 'id' },
  { name: 'corrections_missing_entry', entity: 'TimeClockCorrectionRequest', field: 'time_entry_id', parents: 'TimeEntry', parentField: 'id' },
];

export async function handler(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor.role !== 'admin') {
      return Response.json({ success: false, error: 'Admin access required' }, { status: 403 });
    }
    const results = [];
    for (const check of CHECKS) {
      try {
        const children = await base44.asServiceRole.entities[check.entity].list('-created_date', 500);
        const values = [...new Set((children || []).map((r: any) => String(r?.[check.field] || '').trim()).filter(Boolean))];
        let orphans = 0;
        for (const v of values.slice(0, 200)) {
          const found = await base44.asServiceRole.entities[check.parents].filter({ [check.parentField]: v }, null, 1);
          if (!Array.isArray(found) || found.length === 0) orphans += 1;
        }
        results.push({ name: check.name, scanned: values.length, orphans });
      } catch (e: any) {
        results.push({ name: check.name, error: e?.message || 'check failed' });
      }
    }
    return Response.json({ success: true, results });
  } catch (e: any) {
    return Response.json({ success: false, error: e?.message || 'Integrity scan failed' }, { status: e?.status || 500 });
  }
}
