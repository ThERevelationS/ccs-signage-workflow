import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import {
  CUSTOMER_RELINK_SPECS, buildMergeAuditRow, buildRelinkPatch, buildTombstonePatch,
  buildWinnerPatch, customerDisplayName, entityResultsForResponse, evaluateMergeGuards,
  initialMergeProgress, mergeAuditRequestKey, mergeCompletionStatus, mergeRunKey,
  recordEntityResult, resolveMasterAccountMerge, MERGE_GUARDS,
} from '../../shared/customerMergeModel.ts';

const clean = (value: any) => String(value ?? '').trim();
const num = (value: any) => Number(value) || 0;
const bad = (message: string, status = 400) => Object.assign(new Error(message), { status, statusCode: status });
const isAdmin = (user: any) => clean(user?.role).toLowerCase() === 'admin' || user?.is_full_admin === true;
const MERGE_CUSTOMER_FIELDS = [
  'id', 'updated_date', 'company_name', 'display_name', 'customer_name', 'client_name',
  'customer_status', 'merged_into_customer_id', 'master_account_id', 'master_account',
  'legacy_client_names', 'in_store_credit_balance', 'in_store_credit', 'merge_run',
];
const REQUIRED_SPECS = CUSTOMER_RELINK_SPECS.map((spec) => ({ ...spec, optional: false }));
const project = (row: any, fields: string[]) => Object.fromEntries(fields.filter((field) => field in row).map((field) => [field, row[field]]));
const missingSchema = (error: any, entity: string) =>
  clean(error?.message).includes(`Entity schema ${entity} not found in app`);

async function readRows(entity: any, query: any, fields: string[], label: string) {
  const rows = await loadAllEntityRows({ entity, query, sort: 'created_date', pageSize: 1000, label });
  return rows.map((row: any) => project(row, fields));
}

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    const entities = base44.asServiceRole.entities as any;
    const Customer = entities.Customer;
    const OpportunityActivity = entities.OpportunityActivity;

    if (action === 'probe_projection') {
      if (!isAdmin(user)) throw bad('Only administrators can probe reads.', 403);
      try {
        const rows = await Customer.filter({}, { sort: 'created_date', limit: 1, fields: ['id'] });
        return Response.json({ success: true, options_supported: Array.isArray(rows) });
      } catch (error: any) {
        return Response.json({ success: true, options_supported: false, error: clean(error?.message), status: Number(error?.statusCode || error?.status) || undefined });
      }
    }

    if (!['preview_customer_merge', 'merge_customers'].includes(action)) throw bad('Unknown customer merge action.');
    if (action === 'merge_customers' && !isAdmin(user)) throw bad('Only administrators can merge customers.', 403);
    const keepId = clean(body?.keep_id || body?.winner_id);
    const loseId = clean(body?.lose_id || body?.loser_id);
    if (!keepId || !loseId) throw bad('keep_id and lose_id are required.');
    const runKey = clean(body?.merge_run_key) || mergeRunKey(keepId, loseId);
    let [keep, loseRow] = await Promise.all([Customer.get(keepId).catch(() => null), Customer.get(loseId).catch(() => null)]);
    const guard = evaluateMergeGuards({ keep, lose: loseRow, runKey });
    if (!guard.ok) {
      if (action === 'preview_customer_merge') return Response.json({
        success: true, action, ok: false, run_key: runKey, code: guard.code, reason: guard.reason,
        already_merged: guard.already_merged,
        keep: keep?.id ? { id: keepId, name: customerDisplayName(keep) } : null,
        lose: loseRow?.id ? { id: loseId, name: customerDisplayName(loseRow) } : null,
      });
      if (guard.already_merged) return Response.json({
        success: true, action, status: 'already_merged', run_key: runKey,
        keep: { id: keepId, name: customerDisplayName(keep) }, lose: { id: loseId, name: customerDisplayName(loseRow) },
        entities: entityResultsForResponse(initialMergeProgress({ runKey, keepId, actor, stored: loseRow?.merge_run, allowSkippedMissingEntity: true })),
        actor,
      });
      const status = guard.code === MERGE_GUARDS.MISSING_KEEP || guard.code === MERGE_GUARDS.MISSING_LOSE ? 404
        : guard.code === MERGE_GUARDS.SAME_CUSTOMER ? 400 : 409;
      throw bad(guard.reason, status);
    }

    const customers = await readRows(Customer, {}, MERGE_CUSTOMER_FIELDS, 'Merge customers');
    const master = resolveMasterAccountMerge({ keep, lose: loseRow, customers });
    const keepName = customerDisplayName(keep);
    const children = customers.filter((c: any) => clean(c.master_account_id) === loseId && clean(c.id) !== keepId && clean(c.id) !== loseId);
    const priorTombstones = customers.filter((c: any) => clean(c.merged_into_customer_id) === loseId && clean(c.id) !== keepId);

    if (action === 'preview_customer_merge') {
      const entries: any[] = [];
      for (const spec of CUSTOMER_RELINK_SPECS) {
        const entry: any = { entity: spec.entity, label: spec.label, kind: spec.kind, linked: 0, optional: spec.optional === true, note: spec.note };
        if (spec.kind === 'customer_ref') entry.linked = children.length + priorTombstones.length;
        else {
          try {
            const ids = new Set<string>();
            for (const field of spec.match_fields) {
              const rows = await readRows(entities[spec.entity], { [field]: loseId }, ['id', ...spec.match_fields], `Merge preview ${spec.entity}`);
              for (const row of rows) if (row.id) ids.add(clean(row.id));
            }
            entry.linked = ids.size;
          } catch (error: any) {
            if (missingSchema(error, spec.entity)) { entry.status = 'skipped_missing_entity'; entry.note = clean(error.message); }
            else entry.error = clean(error?.message) || 'lookup failed';
          }
        }
        entries.push(entry);
      }
      const errors = entries.filter((entry) => entry.error);
      const warnings: string[] = [];
      if (children.length) warnings.push(`${children.length} child account${children.length === 1 ? '' : 's'} will re-parent to the winner.`);
      if (priorTombstones.length) warnings.push(`${priorTombstones.length} previously merged record${priorTombstones.length === 1 ? '' : 's'} pointing at the loser will be re-pointed to the winner.`);
      const credit = num(loseRow?.in_store_credit_balance) || num(loseRow?.in_store_credit);
      if (credit !== 0) warnings.push(`The loser's in-store credit balance ($${credit.toFixed(2)}) moves to the winner.`);
      if (clean(loseRow?.merge_run?.run_key) && clean(loseRow?.merge_run?.status) !== 'done') warnings.push('An unfinished merge run is recorded on the loser — the next merge call resumes it.');
      if (master?.note) warnings.push(master.note);
      const missing = entries.filter((entry) => entry.status === 'skipped_missing_entity').map((entry) => entry.entity);
      if (missing.length) warnings.push(`Missing entity schemas skipped: ${missing.join(', ')}.`);
      return Response.json({
        success: true, action, ok: errors.length === 0, run_key: runKey,
        reason: errors.length ? 'One or more linked-record lookups failed.' : undefined,
        keep: { id: keepId, name: keepName, master_account_id: clean(keep?.master_account_id), master_account: clean(keep?.master_account) },
        lose: { id: loseId, name: customerDisplayName(loseRow), master_account_id: clean(loseRow?.master_account_id), master_account: clean(loseRow?.master_account) },
        master_account: master, child_accounts: children.map((c: any) => ({ id: clean(c.id), name: customerDisplayName(c) })),
        prior_tombstones: priorTombstones.length, entities: entries,
        linked_total: entries.reduce((sum, entry) => sum + num(entry.linked), 0), warnings,
      });
    }

    const nowIso = () => new Date().toISOString();
    const progress = initialMergeProgress({ runKey, keepId, actor, at: nowIso(), stored: loseRow?.merge_run, allowSkippedMissingEntity: true });
    let progressWarning = '';
    const persistMergeRun = async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        const anchor = clean(loseRow?.updated_date);
        if (!anchor) break;
        try {
          const result = await Customer.updateMany({ id: loseId, updated_date: anchor }, {
            $set: { merge_run: { run_key: runKey, keep_id: keepId, status: progress.status, updated_at: nowIso(), actor, entities: progress.entities } },
          });
          if (result && result.updated === 1) {
            const fresh = await Customer.get(loseId).catch(() => null);
            if (fresh?.id) loseRow = fresh;
            return;
          }
        } catch { /* retry after refresh */ }
        const fresh = await Customer.get(loseId).catch(() => null);
        if (fresh?.id) loseRow = fresh; else break;
      }
      progressWarning = 'Merge progress could not be persisted on the loser row — a resume re-scans completed entities instead of skipping them.';
    };

    for (const spec of CUSTOMER_RELINK_SPECS) {
      const prior = progress.entities[spec.entity]?.status;
      if (prior === 'done' || prior === 'skipped' || prior === 'skipped_missing_entity') continue;
      try {
        const api = entities[spec.entity];
        if (!api?.filter || !api?.updateMany) throw new Error(`${spec.entity} entity API is unavailable`);
        const fields = ['id', 'updated_date', ...spec.match_fields, ...(spec.name_fields || [])];
        if (spec.match_fields.includes('master_account_id')) fields.push('master_account');
        const byId = new Map<string, any>();
        for (const field of spec.match_fields) {
          const rows = await readRows(api, { [field]: loseId }, fields, `Merge sweep ${spec.entity}`);
          for (const row of rows) if (row?.id && !byId.has(clean(row.id))) byId.set(clean(row.id), row);
        }
        let relinked = 0;
        let skipped = 0;
        const failures: any[] = [];
        for (const row of byId.values()) {
          try {
            const patch = buildRelinkPatch(spec, row, { keepId, keepName, loseId });
            if (!patch) { skipped++; continue; }
            let landed = false;
            if (clean(row.updated_date)) {
              const result = await api.updateMany({ id: row.id, updated_date: row.updated_date }, { $set: patch });
              landed = !!(result && result.updated === 1);
            } else { await api.update(row.id, patch); landed = true; }
            if (!landed) {
              const fresh = await api.get(row.id).catch(() => null);
              if (!fresh?.id) { failures.push({ id: row.id, error: 'row disappeared during merge' }); continue; }
              const retry = buildRelinkPatch(spec, fresh, { keepId, keepName, loseId });
              if (!retry) { relinked++; continue; }
              const result = clean(fresh.updated_date)
                ? await api.updateMany({ id: row.id, updated_date: fresh.updated_date }, { $set: retry })
                : await api.update(row.id, retry).then(() => ({ updated: 1 }));
              landed = !!(result && result.updated === 1);
            }
            if (landed) relinked++; else failures.push({ id: row.id, error: 'concurrent-edit conflict' });
          } catch (error: any) { failures.push({ id: clean(row?.id) || '?', error: clean(error?.message) || 'update failed' }); }
        }
        recordEntityResult(progress, spec, { status: failures.length ? 'failed' : 'done', scanned: byId.size, relinked, skipped, failures }, nowIso());
      } catch (error: any) {
        recordEntityResult(progress, spec, {
          status: missingSchema(error, spec.entity) ? 'skipped_missing_entity' : 'failed',
          error: clean(error?.message) || 'entity sweep failed',
        }, nowIso());
      }
      await persistMergeRun();
    }

    const completion = mergeCompletionStatus(progress, REQUIRED_SPECS, { allowSkippedMissingEntity: true });
    const results = entityResultsForResponse(progress);
    if (completion !== 'done') {
      progress.status = 'partial';
      await persistMergeRun();
      return Response.json({
        success: true, action, status: 'partial', run_key: runKey,
        reason: 'One or more entities could not finish relinking — the loser stays live; call again with the same run_key to resume.',
        keep: { id: keepId, name: keepName }, lose: { id: loseId, name: customerDisplayName(loseRow) },
        master_account: master, entities: results, progress_warning: progressWarning || undefined, actor,
      });
    }

    const winnerPatch = buildWinnerPatch({ keep, lose: loseRow, masterDecision: master });
    let winnerWarning = '';
    if (Object.keys(winnerPatch).length) {
      for (let attempt = 0; attempt < 2; attempt++) {
        const anchor = clean(keep?.updated_date);
        if (!anchor) { winnerWarning = 'winner row had no version anchor — patch skipped'; break; }
        const result = await Customer.updateMany({ id: keepId, updated_date: anchor }, { $set: winnerPatch }).catch(() => null);
        if (result && result.updated === 1) { winnerWarning = ''; break; }
        const fresh = await Customer.get(keepId).catch(() => null);
        if (!fresh?.id) { winnerWarning = 'winner row could not be re-read — patch skipped'; break; }
        keep = fresh;
        if (attempt === 1) winnerWarning = 'winner patch lost a concurrent-edit race — verify master account / credit balance / legacy names';
      }
    }
    const tomb = buildTombstonePatch({ keep, lose: loseRow, actor, at: nowIso(), runKey, progress });
    let tombstoned = false;
    let tombError = '';
    for (let attempt = 0; attempt < 3 && !tombstoned; attempt++) {
      const fresh = await Customer.get(loseId).catch(() => null);
      if (!fresh?.id) { tombError = 'loser row disappeared before tombstone'; break; }
      loseRow = fresh;
      if (clean(loseRow.merged_into_customer_id) === keepId) { tombstoned = true; break; }
      const anchor = clean(loseRow.updated_date);
      if (!anchor) { tombError = 'loser row had no version anchor'; break; }
      const result = await Customer.updateMany({ id: loseId, updated_date: anchor }, { $set: tomb }).catch((error: any) => { tombError = clean(error?.message); return null; });
      tombstoned = !!(result && result.updated === 1);
    }
    if (!tombstoned) return Response.json({
      success: true, action, status: 'partial', run_key: runKey,
      reason: `All records relinked but the loser could not be tombstoned (${tombError || 'concurrent-edit conflict'}) — retry with the same run_key.`,
      keep: { id: keepId, name: keepName }, lose: { id: loseId, name: customerDisplayName(loseRow) },
      master_account: master, entities: results, winner_warning: winnerWarning || undefined, actor,
    });
    let auditId = '';
    try {
      const audit = buildMergeAuditRow({ keep, lose: loseRow, actor, runKey, status: 'merged', entities: results, masterDecision: master, at: nowIso() });
      const existing = await OpportunityActivity.filter({ creation_request_key: mergeAuditRequestKey(runKey) }, null, 5).catch(() => []);
      const found = (Array.isArray(existing) ? existing : []).find((row: any) => clean(row?.creation_request_key) === mergeAuditRequestKey(runKey));
      if (found?.id) auditId = clean(found.id);
      else auditId = clean((await OpportunityActivity.create(audit))?.id);
    } catch (error: any) { progressWarning = [progressWarning, `audit row failed: ${clean(error?.message) || 'write failed'}`].filter(Boolean).join(' '); }
    return Response.json({
      success: true, action, status: 'merged', run_key: runKey,
      keep: { id: keepId, name: keepName }, lose: { id: loseId, name: customerDisplayName(loseRow), merged_into_customer_id: keepId },
      master_account: master, entities: results, relinked_total: results.reduce((sum, entry) => sum + num(entry.relinked), 0),
      audit_id: auditId || undefined, winner_warning: winnerWarning || undefined, progress_warning: progressWarning || undefined, actor,
    });
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status) || 500;
    return Response.json({ success: false, error: clean(error?.message) || 'Customer merge failed.' }, { status });
  }
});
