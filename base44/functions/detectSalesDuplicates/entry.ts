import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import { ensureConvergentPendingImportCreate } from '../../shared/pendingImportCreatePersistence.mjs';
import { hasWorkflowInvocationCapability } from '../../shared/workflowInvocationCapability.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { processWorkflowTriggerEvent } from '../../shared/workflowTriggerEngine.ts';

// Fire-and-forget automation emit — a failure must never break the scan.
async function emitRecordAutomation(base44: any, eventType: string, recordId: string, actor: string) {
  try {
    await processWorkflowTriggerEvent({
      base44,
      payload: { event_type: eventType, record: { id: recordId } },
      changedByOverride: actor,
    });
  } catch (error: any) {
    console.error(`Automation emit failed for ${eventType}:`, error?.message || error);
  }
}

// Simple string similarity (Jaro-Winkler-ish via character overlap)
function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.toLowerCase().trim();
  b = b.toLowerCase().trim();
  if (a === b) return 1;
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  // Count matching chars in order
  let matches = 0;
  let si = 0;
  for (let i = 0; i < shorter.length; i++) {
    const idx = longer.indexOf(shorter[i], si);
    if (idx !== -1) { matches++; si = idx + 1; }
  }
  return matches / longer.length;
}

Deno.serve(async (req) => {
  try {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const isScheduled = await hasWorkflowInvocationCapability(body, 'detectSalesDuplicates');

  if (!isScheduled) {
    let actor;
    try {
      actor = await authenticateSignShopSession(base44, body?.session_token);
    } catch (error: any) {
      const status = Number(error?.status || error?.statusCode || 500);
      const safeStatus = [401, 409, 503].includes(status) ? status : 500;
      console.error('detectSalesDuplicates sign-shop auth error:', error?.message || error);
      return Response.json({
        error: safeStatus === 500 ? 'Sales duplicate detection could not authenticate safely' : error.message,
      }, { status: safeStatus });
    }
    if (actor?.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const user = await base44.auth.me().catch(() => null);
    if (!user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const workOrders = (await loadAllEntityRows({
    entity: base44.asServiceRole.entities.WorkOrder,
    sort: '-created_date',
    maxRows: 10000,
    label: 'Sales duplicate Work Orders',
  })).filter(wo => !wo.deleted && !wo.completed && !wo.is_rider);

  const groups = [];
  const flagged = new Set();

  // Compare only plausibly-related pairs — same client-name first word or the
  // same Est/Inv number. A full O(n^2) pair scan over thousands of active
  // orders exceeds the worker CPU budget and crashed this function (F-dsd).
  const buckets = new Map();
  const addTo = (key, idx) => {
    const list = buckets.get(key);
    if (list) list.push(idx); else buckets.set(key, [idx]);
  };
  workOrders.forEach((wo, idx) => {
    const first = String(wo.client_name || "").toLowerCase().trim().split(" ")[0];
    if (first) addTo("w:" + first, idx);
    if (wo.est_inv_at) addTo("e:" + wo.est_inv_at, idx);
  });
  const seenPairs = new Set();
  const pairs = [];
  for (const idxs of buckets.values()) {
    for (let x = 0; x < idxs.length; x++) {
      for (let y = x + 1; y < idxs.length; y++) {
        const k = idxs[x] * 1e7 + idxs[y];
        if (!seenPairs.has(k)) { seenPairs.add(k); pairs.push([idxs[x], idxs[y]]); }
      }
    }
  }

  for (const [i, j] of pairs) {
    if (flagged.has(workOrders[i].id) || flagged.has(workOrders[j].id)) continue;
    const a = workOrders[i];
    const aName = (a.client_name || "").toLowerCase().trim();
    const aTitle = (a.title || "").toLowerCase().trim();
    const b = workOrders[j];
    const bName = (b.client_name || "").toLowerCase().trim();
    const bTitle = (b.title || "").toLowerCase().trim();

    const estInvMatch = a.est_inv_at && b.est_inv_at && a.est_inv_at === b.est_inv_at;

    const nameSim = similarity(aName, bName);
    const titleSim = similarity(aTitle, bTitle);

    let score = 0;
    const reasons = [];

    if (estInvMatch) { score += 90; reasons.push("Same Est/Inv number"); }
    if (nameSim >= 0.85) { score += 50; reasons.push(`Very similar client name (${Math.round(nameSim * 100)}%)`); }
    else if (nameSim >= 0.7) { score += 30; reasons.push(`Similar client name (${Math.round(nameSim * 100)}%)`); }
    if (titleSim >= 0.8 && aTitle && bTitle) { score += 30; reasons.push(`Similar title (${Math.round(titleSim * 100)}%)`); }

    if (score >= 50) {
      groups.push({ a, b, score: Math.min(score, 99), reasons });
      flagged.add(b.id);
    }
  }

  // Fetch existing flags in parallel with nothing (already done), build dedup set
  const existing = await loadAllEntityRows({
    entity: base44.asServiceRole.entities.PendingImport,
    query: { doc_type: 'duplicate', status: 'pending' },
    sort: 'created_date',
    label: 'Pending duplicate flags',
  });
  const existingPairs = new Set(existing.map(e => e.doc_number));

  const toCreate = [];
  for (const group of groups) {
    const pairKey = [group.a.id, group.b.id].sort().join('__');
    if (existingPairs.has(pairKey)) continue;
    toCreate.push({
      doc_number: pairKey,
      doc_type: 'duplicate',
      email_subject: `Possible duplicate: "${group.a.client_name}" and "${group.b.client_name}"`,
      extracted_data: {
        client_name: group.a.client_name,
        description: `Possible duplicate detected. Reasons: ${group.reasons.join(', ')}.`,
        match_score: group.score,
        reasons: group.reasons,
        record_a: { id: group.a.id, client_name: group.a.client_name, title: group.a.title, est_inv_at: group.a.est_inv_at },
        record_b: { id: group.b.id, client_name: group.b.client_name, title: group.b.title, est_inv_at: group.b.est_inv_at },
      },
      match_candidates: [
        { work_order_id: group.a.id, work_order_title: group.a.title || group.a.client_name, client_name: group.a.client_name, current_stage: group.a.current_stage, match_score: group.score, match_reasons: group.reasons },
        { work_order_id: group.b.id, work_order_title: group.b.title || group.b.client_name, client_name: group.b.client_name, current_stage: group.b.current_stage, match_score: group.score, match_reasons: group.reasons },
      ],
      status: 'pending',
    });
  }

  let createdCount = 0;
  let reusedCount = 0;
  for (const pendingData of toCreate) {
    const createResult = await ensureConvergentPendingImportCreate({
      entity: base44.asServiceRole.entities.PendingImport,
      data: pendingData,
      readMatches: () => loadAllEntityRows({
        entity: base44.asServiceRole.entities.PendingImport,
        query: {
          doc_number: pendingData.doc_number,
          doc_type: 'duplicate',
          status: 'pending',
        },
        sort: 'created_date',
        label: `Pending duplicate ${pendingData.doc_number}`,
      }),
      label: `Pending duplicate ${pendingData.doc_number}`,
    });
    if (createResult.status === 'created') {
      createdCount += 1;
      const newId = String(createResult.record?.id || '');
      if (newId) {
        // A duplicate flag is a pending import arriving — both advertised
        // events are true for the same record.
        await emitRecordAutomation(base44, 'pending_import_created', newId, 'system');
        await emitRecordAutomation(base44, 'duplicate_detected', newId, 'system');
      }
    }
    else reusedCount += 1;
  }

  return Response.json({
    duplicates_found: groups.length,
    new_flags_created: createdCount,
    concurrent_existing_flags: reusedCount,
  });
  } catch (error) {
    console.error("detectSalesDuplicates crashed:", error?.message || error);
    return Response.json({ error: "Duplicate scan failed safely", detail: String(error?.message || error) }, { status: 500 });
  }
});