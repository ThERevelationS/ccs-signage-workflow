import { createClientFromRequest } from 'npm:@base44/sdk@0.8.53';
import { withEntityRateLimitRetry } from '../../shared/entityRateLimitRetry.ts';
import { authenticateSignShopSession } from '../../shared/signShopSession.ts';
import { loadAllEntityRows } from '../../shared/pagedEntityRows.ts';
import {
  activityMapByCustomerId,
  customerLifecycleStatus,
  lastActivitySummary,
  resolveAutoInactiveMonths,
  shouldAutoInactivate,
  sweepPlan,
} from '../../shared/customerLifecycleRules.ts';
import {
  CUSTOMER_RELINK_SPECS,
  buildMergeAuditRow,
  buildRelinkPatch,
  buildTombstonePatch,
  buildWinnerPatch,
  customerDisplayName,
  entityResultsForResponse,
  evaluateMergeGuards,
  initialMergeProgress,
  mergeAuditRequestKey,
  mergeCompletionStatus,
  mergeRunKey,
  recordEntityResult,
  resolveMasterAccountMerge,
  MERGE_GUARDS,
} from '../../shared/customerMergeModel.ts';

// Session-authenticated gateway for customer lifecycle maintenance (masterplan
// G-03). Customer has backend-only RLS, so staff-facing lifecycle reads and
// the auto-inactive sweep flow through here. The rules are the canonical pure
// module in base44/shared/customerLifecycleRules.ts — the frontend
// customerLifecycleModel re-exports the same logic so a dry-run plan shown to
// staff is exactly what the write path executes.
//
// Actions:
//   sweep_auto_inactive { dry_run?, months_default? }
//     Plans Active → Inactive transitions for customers whose inactivity
//     window elapsed (per-customer auto_inactive_months /
//     auto_inactive_after_months, else months_default; the
//     auto_inactive_disabled flag exempts a customer). dry_run returns the
//     plan without writes; otherwise each row is updated individually with
//     per-row errors surfaced in failures[] — a mass write is admin-gated.
//   get_lifecycle { customer_id, months_default? }
//     Returns the customer's normalized lifecycle status plus its computed
//     last-activity summary (per record-kind newest hit) and the
//     auto-inactivate verdict under the given default.
//   preview_customer_merge { keep_id, lose_id }
//     Read-only merge plan (masterplan G-14): guard verdict, per-entity
//     linked-record counts across CUSTOMER_RELINK_SPECS, the master-account
//     decision and staff warnings. Any signed-in staff may preview.
//   merge_customers { keep_id, lose_id, merge_run_key? }
//     Admin-only relink sweep + tombstone. Per-entity filter → CAS update
//     loop in canonical spec order; durable progress rides on the loser row
//     (merge_run) so a partial run resumes instead of restarting. Ends with
//     the winner patch (master re-point / credit balance / legacy names),
//     the loser tombstone (merged_into_customer_id — never a delete) and a
//     retry-safe OpportunityActivity audit row. All merge semantics live in
//     base44/shared/customerMergeModel.ts.

const clean = (value: any) => String(value ?? '').trim();
const num = (value: any, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const bad = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, statusCode: status });

// Projected reads keep entity-list volume under the app read cap — every
// field the rules touch is named, including the undeclared stored fields the
// sweep introduces (auto_inactive_months, auto_inactive_disabled).
const CUSTOMER_FIELDS = [
  'id', 'company_name', 'customer_status',
  'auto_inactive_months', 'auto_inactive_after_months', 'auto_inactive_disabled',
  'last_contacted_at', 'created_date', 'merged_into_customer_id',
];
const WORK_ORDER_FIELDS = [
  'id', 'customer_id', 'created_date', 'date_order_created',
  'sales_last_activity_at', 'completed_date', 'close_date',
];
const INVOICE_FIELDS = [
  'id', 'customer_id', 'created_date', 'issue_date', 'sent_date', 'paid_date',
];
const OPPORTUNITY_FIELDS = [
  'id', 'customer_id', 'last_activity_at', 'updated_date', 'created_date',
];
// Fields the merge sweep needs on Customer rows (master decision + names) —
// projected so a full customer pull stays inside the app read budget.
const MERGE_CUSTOMER_FIELDS = [
  'id', 'updated_date', 'company_name', 'display_name', 'customer_name',
  'client_name', 'customer_status', 'merged_into_customer_id',
  'master_account_id', 'master_account', 'legacy_client_names',
  'in_store_credit_balance', 'in_store_credit', 'merge_run',
];

const isAdmin = (user: any) =>
  clean(user?.role).toLowerCase() === 'admin' || user?.is_full_admin === true;

Deno.serve(async (req) => {
  try {
    const base44 = withEntityRateLimitRetry(createClientFromRequest(req));
    const body = await req.json().catch(() => ({}));
    const user = await authenticateSignShopSession(base44, body?.session_token);
    const actor = clean(user?.email) || clean(user?.id) || 'unknown';
    const action = clean(body?.action);
    if (!action) throw bad('An action is required.');

    const Customer = base44.asServiceRole.entities.Customer;
    const WorkOrder = base44.asServiceRole.entities.WorkOrder;
    const Invoice = base44.asServiceRole.entities.Invoice;
    const Opportunity = base44.asServiceRole.entities.Opportunity;
    const OpportunityActivity = base44.asServiceRole.entities.OpportunityActivity;

    if (action === 'sweep_auto_inactive') {
      const dryRun = body?.dry_run === true;
      const defaultMonths = num(body?.months_default, 0);

      if (!dryRun && !isAdmin(user)) {
        throw bad('Only administrators can run the auto-inactive sweep.', 403);
      }

      const [customers, workOrders, invoices, opportunities] = await Promise.all([
        loadAllEntityRows({ entity: Customer, query: {}, sort: 'created_date', fields: CUSTOMER_FIELDS, label: 'Lifecycle customers' }),
        loadAllEntityRows({ entity: WorkOrder, query: {}, sort: 'created_date', fields: WORK_ORDER_FIELDS, label: 'Lifecycle work orders' }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, query: {}, sort: 'created_date', fields: INVOICE_FIELDS, label: 'Lifecycle invoices' }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, query: {}, sort: 'created_date', fields: OPPORTUNITY_FIELDS, label: 'Lifecycle opportunities' }).catch(() => []),
      ]);
      if (!Array.isArray(customers)) throw bad('Customer lookup failed.', 500);

      const activityById = activityMapByCustomerId({ customers, workOrders, invoices, opportunities });
      const now = new Date();
      const plan = sweepPlan(customers, { activityById, now, defaultMonths });
      const activeEvaluated = customers.filter((c: any) =>
        customerLifecycleStatus(c) === 'Active' && !clean(c?.merged_into_customer_id)).length;

      const results: any[] = [];
      const failures: any[] = [];
      if (!dryRun) {
        // Sequential writes: a sweep is a batch/scheduled operation and a
        // burst of entity writes would burn the shared rate budget. Per-row
        // try/catch surfaces each failure instead of silently swallowing it.
        for (const item of plan) {
          try {
            await Customer.update(item.customer_id, { customer_status: 'inactive' });
            results.push({ ...item, to_status: 'inactive' });
          } catch (error: any) {
            failures.push({
              customer_id: item.customer_id,
              from_status: item.from_status,
              error: clean(error?.message) || 'Update failed.',
            });
          }
        }
      }

      return Response.json({
        success: true,
        action,
        dry_run: dryRun,
        months_default: defaultMonths,
        evaluated_active: activeEvaluated,
        plan,
        results,
        failures,
        swept_count: results.length,
        failed_count: failures.length,
        actor,
      });
    }

    if (action === 'get_lifecycle') {
      const customerId = clean(body?.customer_id);
      if (!customerId) throw bad('A customer_id is required.');
      const defaultMonths = num(body?.months_default, 0);

      const customer = await Customer.get(customerId).catch(() => null);
      if (!customer?.id) throw bad('Customer not found.', 404);

      const [workOrders, invoices, opportunities] = await Promise.all([
        loadAllEntityRows({ entity: WorkOrder, query: { customer_id: customerId }, sort: 'created_date', fields: WORK_ORDER_FIELDS, label: 'Lifecycle work orders' }).catch(() => []),
        loadAllEntityRows({ entity: Invoice, query: { customer_id: customerId }, sort: 'created_date', fields: INVOICE_FIELDS, label: 'Lifecycle invoices' }).catch(() => []),
        loadAllEntityRows({ entity: Opportunity, query: { customer_id: customerId }, sort: 'created_date', fields: OPPORTUNITY_FIELDS, label: 'Lifecycle opportunities' }).catch(() => []),
      ]);

      const summary = lastActivitySummary({ customer, workOrders, invoices, opportunities });
      const verdict = shouldAutoInactivate({
        customer,
        lastActivity: summary.last_activity_at,
        now: new Date(),
        defaultMonths,
      });

      return Response.json({
        success: true,
        action,
        customer_id: customerId,
        customer_status: clean(customer?.customer_status),
        lifecycle_status: customerLifecycleStatus(customer),
        merged_into_customer_id: clean(customer?.merged_into_customer_id),
        last_activity_at: summary.last_activity_at,
        activity: summary.sources,
        winner: summary.winner,
        auto_inactive: {
          disabled: customer?.auto_inactive_disabled === true,
          months: resolveAutoInactiveMonths(customer, defaultMonths),
          months_default: defaultMonths,
          verdict,
        },
      });
    }

    if (action === 'preview_customer_merge') {
      const keepId = clean(body?.keep_id || body?.winner_id);
      const loseId = clean(body?.lose_id || body?.loser_id);
      if (!keepId || !loseId) throw bad('keep_id and lose_id are required.');

      const [keep, lose] = await Promise.all([
        Customer.get(keepId).catch(() => null),
        Customer.get(loseId).catch(() => null),
      ]);
      const runKey = mergeRunKey(keepId, loseId);
      const guard = evaluateMergeGuards({ keep, lose, runKey });
      if (!guard.ok) {
        return Response.json({
          success: true, action, ok: false, run_key: runKey,
          code: guard.code, reason: guard.reason,
          already_merged: guard.already_merged,
          keep: keep?.id ? { id: keepId, name: customerDisplayName(keep) } : null,
          lose: lose?.id ? { id: loseId, name: customerDisplayName(lose) } : null,
        });
      }

      const customers = await loadAllEntityRows({
        entity: Customer, query: {}, sort: 'created_date', fields: MERGE_CUSTOMER_FIELDS,
        label: 'Merge customers',
      }).catch(() => []);
      const master = resolveMasterAccountMerge({ keep, lose, customers });
      const children = (Array.isArray(customers) ? customers : []).filter((c: any) =>
        clean(c?.master_account_id) === loseId && clean(c?.id) !== keepId && clean(c?.id) !== loseId);
      const priorTombstones = (Array.isArray(customers) ? customers : []).filter((c: any) =>
        clean(c?.merged_into_customer_id) === loseId && clean(c?.id) !== keepId);

      const entities: any[] = [];
      for (const spec of CUSTOMER_RELINK_SPECS) {
        const entry: any = { entity: spec.entity, label: spec.label, kind: spec.kind, linked: 0, optional: spec.optional === true, note: spec.note };
        if (spec.kind === 'customer_ref') {
          entry.linked = children.length + priorTombstones.length;
        } else {
          const api = (base44.asServiceRole.entities as any)[spec.entity];
          const ids = new Set<string>();
          let fetchError = '';
          for (const field of spec.match_fields) {
            const rows = await loadAllEntityRows({
              entity: api, query: { [field]: loseId }, sort: 'created_date',
              fields: ['id', ...spec.match_fields],
              label: `Merge preview ${spec.entity}`,
            }).catch((e: any) => { fetchError = clean(e?.message) || 'lookup failed'; return null; });
            if (!Array.isArray(rows)) continue;
            for (const row of rows) if (row?.id) ids.add(clean(row.id));
          }
          entry.linked = ids.size;
          if (fetchError) entry.error = fetchError;
        }
        entities.push(entry);
      }

      const warnings: string[] = [];
      if (children.length) warnings.push(`${children.length} child account${children.length === 1 ? '' : 's'} will re-parent to the winner.`);
      if (priorTombstones.length) warnings.push(`${priorTombstones.length} previously merged record${priorTombstones.length === 1 ? '' : 's'} pointing at the loser will be re-pointed to the winner.`);
      const loseCredit = num(lose?.in_store_credit_balance) || num(lose?.in_store_credit);
      if (loseCredit !== 0) warnings.push(`The loser's in-store credit balance ($${loseCredit.toFixed(2)}) moves to the winner.`);
      if (clean(lose?.merge_run?.run_key) && clean(lose?.merge_run?.status) !== 'done') {
        warnings.push('An unfinished merge run is recorded on the loser — the next merge call resumes it.');
      }
      if (master?.note) warnings.push(master.note);

      return Response.json({
        success: true, action, ok: true, run_key: runKey,
        keep: { id: keepId, name: customerDisplayName(keep), master_account_id: clean(keep?.master_account_id), master_account: clean(keep?.master_account) },
        lose: { id: loseId, name: customerDisplayName(lose), master_account_id: clean(lose?.master_account_id), master_account: clean(lose?.master_account) },
        master_account: master,
        child_accounts: children.map((c: any) => ({ id: clean(c?.id), name: customerDisplayName(c) })),
        prior_tombstones: priorTombstones.length,
        entities,
        linked_total: entities.reduce((s, e) => s + num(e.linked), 0),
        warnings,
      });
    }

    if (action === 'merge_customers') {
      if (!isAdmin(user)) {
        throw bad('Only administrators can merge customers.', 403);
      }
      const keepId = clean(body?.keep_id || body?.winner_id);
      const loseId = clean(body?.lose_id || body?.loser_id);
      if (!keepId || !loseId) throw bad('keep_id and lose_id are required.');
      const runKey = clean(body?.merge_run_key) || mergeRunKey(keepId, loseId);

      let [keep, loseRow] = await Promise.all([
        Customer.get(keepId).catch(() => null),
        Customer.get(loseId).catch(() => null),
      ]);
      const guard = evaluateMergeGuards({ keep, lose: loseRow, runKey });
      if (!guard.ok) {
        if (guard.already_merged) {
          return Response.json({
            success: true, action, status: 'already_merged', run_key: runKey,
            keep: { id: keepId, name: customerDisplayName(keep) },
            lose: { id: loseId, name: customerDisplayName(loseRow) },
            entities: entityResultsForResponse(initialMergeProgress({ runKey, keepId, actor, stored: loseRow?.merge_run })),
            actor,
          });
        }
        const status = guard.code === MERGE_GUARDS.MISSING_KEEP || guard.code === MERGE_GUARDS.MISSING_LOSE ? 404
          : guard.code === MERGE_GUARDS.SAME_CUSTOMER ? 400 : 409;
        throw bad(guard.reason, status);
      }

      const customers = await loadAllEntityRows({
        entity: Customer, query: {}, sort: 'created_date', fields: MERGE_CUSTOMER_FIELDS,
        label: 'Merge customers',
      }).catch(() => []);
      const master = resolveMasterAccountMerge({ keep, lose: loseRow, customers });
      const keepName = customerDisplayName(keep);
      const nowIso = () => new Date().toISOString();
      const progress = initialMergeProgress({ runKey, keepId, actor, at: nowIso(), stored: loseRow?.merge_run });
      let progressWarning = '';

      const persistMergeRun = async () => {
        // Progress rides on the loser row (D6) — CAS-anchored, one re-read
        // retry. A persistence miss is non-fatal: per-row relinks are
        // idempotent so a resume that re-scans a finished entity is still
        // correct, just slower.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const anchor = clean(loseRow?.updated_date);
          if (!anchor) break;
          try {
            const res = await Customer.updateMany(
              { id: loseId, updated_date: anchor },
              { $set: { merge_run: { run_key: runKey, keep_id: keepId, status: progress.status, updated_at: nowIso(), actor, entities: progress.entities } } },
            );
            if (res && res.updated === 1) {
              const fresh = await Customer.get(loseId).catch(() => null);
              if (fresh?.id) loseRow = fresh;
              return;
            }
          } catch { /* fall through to re-read */ }
          const fresh = await Customer.get(loseId).catch(() => null);
          if (fresh?.id) loseRow = fresh; else break;
        }
        progressWarning = 'Merge progress could not be persisted on the loser row — a resume re-scans completed entities instead of skipping them.';
      };

      // --- Relink sweep: per entity, filter → CAS update loop (D1/D6) ------
      for (const spec of CUSTOMER_RELINK_SPECS) {
        const prior = progress.entities[spec.entity]?.status;
        if (prior === 'done' || prior === 'skipped') continue;
        try {
          const entityApi = (base44.asServiceRole.entities as any)[spec.entity];
          if (!entityApi?.filter || !entityApi?.updateMany) {
            throw new Error(`${spec.entity} entity API is unavailable`);
          }
          const fields = ['id', 'updated_date', ...spec.match_fields, ...(spec.name_fields || [])];
          if (spec.match_fields.includes('master_account_id')) fields.push('master_account');
          const rowsById = new Map<string, any>();
          for (const field of spec.match_fields) {
            const rows = await loadAllEntityRows({
              entity: entityApi, query: { [field]: loseId }, sort: 'created_date',
              fields, label: `Merge sweep ${spec.entity}`,
            });
            for (const row of Array.isArray(rows) ? rows : []) {
              const id = clean(row?.id);
              if (id && !rowsById.has(id)) rowsById.set(id, row);
            }
          }

          let relinked = 0;
          let skipped = 0;
          const failures: any[] = [];
          for (const row of rowsById.values()) {
            try {
              const patch = buildRelinkPatch(spec, row, { keepId, keepName, loseId });
              if (!patch) { skipped += 1; continue; }
              let landed = false;
              if (clean(row.updated_date)) {
                const res = await entityApi.updateMany(
                  { id: row.id, updated_date: row.updated_date },
                  { $set: patch },
                );
                landed = res && res.updated === 1;
              } else {
                await entityApi.update(row.id, patch);
                landed = true;
              }
              if (!landed) {
                // CAS miss — the row moved under us; re-read and retry once
                // when it still carries the loser ref.
                const fresh = await entityApi.get(row.id).catch(() => null);
                if (!fresh?.id) {
                  failures.push({ id: row.id, error: 'row disappeared during merge' });
                  continue;
                }
                const retry = buildRelinkPatch(spec, fresh, { keepId, keepName, loseId });
                if (!retry) { relinked += 1; continue; } // a concurrent relink landed
                const res2 = clean(fresh.updated_date)
                  ? await entityApi.updateMany({ id: row.id, updated_date: fresh.updated_date }, { $set: retry })
                  : await entityApi.update(row.id, retry).then(() => ({ updated: 1 }));
                landed = !!(res2 && res2.updated === 1);
              }
              if (landed) relinked += 1;
              else failures.push({ id: row.id, error: 'concurrent-edit conflict' });
            } catch (e: any) {
              failures.push({ id: clean(row?.id) || '?', error: clean(e?.message) || 'update failed' });
            }
          }

          recordEntityResult(progress, spec, {
            status: failures.length ? 'failed' : 'done',
            scanned: rowsById.size, relinked, skipped, failures,
          }, nowIso());
          await persistMergeRun();
        } catch (e: any) {
          recordEntityResult(progress, spec, {
            status: spec.optional ? 'skipped' : 'failed',
            error: clean(e?.message) || 'entity sweep failed',
          }, nowIso());
          await persistMergeRun();
        }
      }

      const completion = mergeCompletionStatus(progress);
      const entities = entityResultsForResponse(progress);

      if (completion !== 'done') {
        progress.status = 'partial';
        await persistMergeRun();
        return Response.json({
          success: true, action, status: 'partial', run_key: runKey,
          reason: completion === 'partial'
            ? 'One or more entities could not finish relinking — the loser stays live; call again with the same run_key to resume.'
            : 'The sweep did not finish — call again with the same run_key to resume.',
          keep: { id: keepId, name: keepName },
          lose: { id: loseId, name: customerDisplayName(loseRow) },
          master_account: master,
          entities,
          progress_warning: progressWarning || undefined,
          actor,
        });
      }

      // --- Winner patch (master re-point, credit balance, legacy names) ---
      const winnerPatch = buildWinnerPatch({ keep, lose: loseRow, masterDecision: master });
      let winnerWarning = '';
      if (Object.keys(winnerPatch).length) {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const anchor = clean(keep?.updated_date);
          if (!anchor) { winnerWarning = 'winner row had no version anchor — patch skipped'; break; }
          const res = await Customer.updateMany({ id: keepId, updated_date: anchor }, { $set: winnerPatch }).catch(() => null);
          if (res && res.updated === 1) { winnerWarning = ''; break; }
          const fresh = await Customer.get(keepId).catch(() => null);
          if (!fresh?.id) { winnerWarning = 'winner row could not be re-read — patch skipped'; break; }
          keep = fresh;
          if (attempt === 1) winnerWarning = 'winner patch lost a concurrent-edit race — verify master account / credit balance / legacy names';
        }
      }

      // --- Tombstone the loser (D3/D6 — LAST write, never a delete) --------
      const tomb = buildTombstonePatch({ keep, lose: loseRow, actor, at: nowIso(), runKey, progress });
      let tombstoned = false;
      let tombError = '';
      for (let attempt = 0; attempt < 3 && !tombstoned; attempt += 1) {
        const fresh = await Customer.get(loseId).catch(() => null);
        if (!fresh?.id) { tombError = 'loser row disappeared before tombstone'; break; }
        loseRow = fresh;
        if (clean(loseRow.merged_into_customer_id) === keepId) { tombstoned = true; break; }
        const anchor = clean(loseRow.updated_date);
        if (!anchor) { tombError = 'loser row had no version anchor'; break; }
        const res = await Customer.updateMany({ id: loseId, updated_date: anchor }, { $set: tomb }).catch((e: any) => { tombError = clean(e?.message); return null; });
        tombstoned = !!(res && res.updated === 1);
      }
      if (!tombstoned) {
        // 200 + status:'partial' (not an error status) so the caller receives
        // the structured run state and can resume with the same run_key.
        return Response.json({
          success: true, action, status: 'partial', run_key: runKey,
          reason: `All records relinked but the loser could not be tombstoned (${tombError || 'concurrent-edit conflict'}) — retry with the same run_key.`,
          keep: { id: keepId, name: keepName },
          lose: { id: loseId, name: customerDisplayName(loseRow) },
          master_account: master,
          entities,
          winner_warning: winnerWarning || undefined,
          actor,
        });
      }

      // --- Audit row (D10 — retry-safe creation_request_key) ----------------
      let auditId = '';
      try {
        const audit = buildMergeAuditRow({ keep, lose: loseRow, actor, runKey, status: 'merged', entities, masterDecision: master, at: nowIso() });
        const existing = await OpportunityActivity.filter({ creation_request_key: mergeAuditRequestKey(runKey) }, null, 5).catch(() => []);
        const found = (Array.isArray(existing) ? existing : []).find((r: any) => clean(r?.creation_request_key) === mergeAuditRequestKey(runKey));
        if (found?.id) auditId = clean(found.id);
        else {
          const created = await OpportunityActivity.create(audit);
          auditId = clean(created?.id);
        }
      } catch (e: any) {
        progressWarning = [progressWarning, `audit row failed: ${clean(e?.message) || 'write failed'}`].filter(Boolean).join(' ');
      }

      return Response.json({
        success: true, action, status: 'merged', run_key: runKey,
        keep: { id: keepId, name: keepName },
        lose: { id: loseId, name: customerDisplayName(loseRow), merged_into_customer_id: keepId },
        master_account: master,
        entities,
        relinked_total: entities.reduce((s, e) => s + num(e.relinked), 0),
        audit_id: auditId || undefined,
        winner_warning: winnerWarning || undefined,
        progress_warning: progressWarning || undefined,
        actor,
      });
    }

    throw bad('Unknown customer lifecycle action.');
  } catch (error: any) {
    const status = Number(error?.statusCode || error?.status || 500);
    if ([400, 401, 403, 404, 409, 429].includes(status)) {
      return Response.json({ error: error?.message || 'Customer lifecycle request failed.' }, { status });
    }
    console.error('manageCustomerLifecycle error:', error);
    return Response.json({ error: 'The lifecycle request could not be completed. Try again.' }, { status });
  }
});
