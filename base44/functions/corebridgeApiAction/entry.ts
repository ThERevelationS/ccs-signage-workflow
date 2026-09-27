import { createClientFromRequest } from 'npm:@base44/sdk@0.8.46';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { buildJobRegisterCsv } from '../../shared/corebridgeOfflineCsv.mjs';

// Retained function name for compatibility with existing CCS installations.
// External CoreBridge API access is intentionally retired, even if an old secret remains.
// Historical CorebridgeApiAudit, CorebridgeLog, and PendingImport records are not touched.
const PAGE_SIZE = 500;
const MAX_ROWS = 10000;

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'POST is required.' }, { status: 405 });
    }
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const actor = await authenticateSignShopSession(base44, body?.session_token);
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Admin access is required.' }, { status: 403 });
    }

    if (body?.action !== 'export_jobs_csv') {
      return Response.json({
        error: 'CoreBridge API access has been retired. Use CCS native reports and reviewed file imports.',
        api_disabled: true,
      }, { status: 410 });
    }

    const scope = body?.scope || 'all';
    if (!['all', 'incomplete', 'completed'].includes(scope)) {
      return Response.json({ error: 'Invalid job register filter.' }, { status: 400 });
    }

    const records = [];
    const seen = new Set();
    let complete = false;
    for (let skip = 0; skip < MAX_ROWS; skip += PAGE_SIZE) {
      // Stable id sort prevents skipping jobs that share imported timestamps.
      const page = await base44.asServiceRole.entities.WorkOrder.list('id', PAGE_SIZE, skip);
      if (!Array.isArray(page)) throw new Error('The WorkOrder page could not be verified.');
      for (const row of page) {
        if (!row?.id || seen.has(row.id)) {
          throw new Error('The job register page order was inconsistent. No partial export was returned.');
        }
        seen.add(row.id);
        records.push(row);
      }
      if (page.length < PAGE_SIZE) {
        complete = true;
        break;
      }
    }
    if (!complete) {
      throw new Error('The WorkOrder export exceeded its safety limit. No partial export was returned.');
    }

    const result = buildJobRegisterCsv(records, scope);
    return Response.json({
      success: true,
      api_disabled: true,
      filename: 'ccs-job-register-' + scope + '-' + new Date().toISOString().slice(0, 10) + '.csv',
      csv: result.csv,
      exported_count: result.count,
      source_count: records.length,
    });
  } catch (error) {
    const status = Number((error as any)?.status || 500);
    const safeStatus = [400, 401, 403, 405, 410].includes(status) ? status : 500;
    console.error('CCS offline job register failed:', (error as any)?.message || error);
    return Response.json({
      error: safeStatus === 500
        ? 'CCS could not verify the complete job register. No partial export was returned.'
        : (error as any)?.message,
    }, { status: safeStatus });
  }
});
