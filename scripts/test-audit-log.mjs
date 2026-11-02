import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

// K-06 suite — admin audit-log model (pure TS, zero imports): per-source
// normalization, unified merge filters, newest-first ordering, summary.
// Bundle first: bare Node can't run .ts (sibling-suite convention).
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const bundlePath = resolve(here, '.tmp-audit-log.mjs');
buildSync({
  entryPoints: [resolve(root, 'base44/shared/auditLogModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const {
  AUDIT_SOURCES,
  auditSourceFor,
  normalizeAuditRow,
  mergeAuditLog,
  auditSummary,
  actorLabel,
  actorEmail,
  entityLabelFor,
  humanizeAuditToken,
} = await import(pathToFileURL(bundlePath).href);

let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n += 1; };
const eq = (a, b, msg) => { assert.equal(a, b, msg); n += 1; };

// === zero imports (pure-model contract) =====================================
{
  const src = readFileSync(resolve(root, 'base44/shared/auditLogModel.ts'), 'utf8');
  ok(!/^\s*import\s/m.test(src) && !/require\(/.test(src), 'model has zero imports/requires');
}

// === AUDIT_SOURCES registry =================================================
{
  ok(Array.isArray(AUDIT_SOURCES) && AUDIT_SOURCES.length >= 4, 'registry holds the audited sources');
  const names = AUDIT_SOURCES.map((s) => s.entity);
  for (const e of ['ProductActivity', 'ActivityLog', 'OpportunityActivity', 'AdminAuditLog']) {
    ok(names.includes(e), `registry covers ${e}`);
  }
  for (const s of AUDIT_SOURCES) {
    ok(s.label && Array.isArray(s.actor_fields) && Array.isArray(s.entity_ref_fields),
      `${s.entity} carries the field maps`);
    ok('ts_field' in s, `${s.entity} declares ts_field`);
  }
  eq(auditSourceFor('ProductActivity').entity, 'ProductActivity');
  eq(auditSourceFor('Nope').entity, 'Nope', 'unknown names get a generic def');
  eq(auditSourceFor({ entity: 'ActivityLog' }).entity, 'ActivityLog', 'def-like object resolves');
}

// === per-source normalization ===============================================
const pa = normalizeAuditRow({
  id: 'pa1', work_order_id: 'wo-9', product_id: 'p-1', product_label: 'Channel Letters',
  event_type: 'status_change', actor_type: 'staff', actor_label: 'Brett H',
  from_value: 'order_review', to_value: 'in_production',
  occurred_at: '2026-11-02T10:00:00.000Z',
  details: { field: 'operational_status', field_label: 'Status' },
}, { source: 'ProductActivity' });
eq(pa.id, 'ProductActivity:pa1', 'id is source-prefixed');
eq(pa.occurred_at, '2026-11-02T10:00:00.000Z');
eq(pa.actor_label, 'Brett H');
eq(pa.actor_type, 'staff');
eq(pa.entity_type, 'Product');
eq(pa.entity_id, 'p-1');
eq(pa.entity_label, 'Channel Letters');
eq(pa.parent_entity_type, 'WorkOrder');
eq(pa.parent_entity_id, 'wo-9');
eq(pa.event_type, 'status_change');
eq(pa.summary, 'Status: order_review → in_production', 'field_label + arrow summary');
ok(pa.detail && pa.detail.details && pa.detail.details.field === 'operational_status', 'detail folded');

// D-11 price_override row — own `label` wins verbatim (money-trail contract)
{
  const d11 = normalizeAuditRow({
    id: 'pa2', work_order_id: 'wo-9', product_id: 'p-1',
    event_type: 'price_override', actor_label: 'amy@shop.com',
    label: 'Overridden during order entry — unit_price 10 → 12.5',
    occurred_at: '2026-11-02T11:00:00.000Z',
  }, { source: 'ProductActivity' });
  eq(d11.summary, 'Overridden during order entry — unit_price 10 → 12.5', 'D-11 label wins');
  eq(d11.actor_email, 'amy@shop.com', 'email-looking actor_label fills actor_email');
  eq(d11.event_type, 'price_override');
}

// ActivityLog — created_date ts, performed_by_*, work_order_title label
{
  const al = normalizeAuditRow({
    id: 'al1', work_order_id: 'wo-1', work_order_title: 'Marquee refit',
    action_type: 'stage_changed', action_details: 'Stage: design → production',
    performed_by_name: 'Amy S', performed_by_email: 'amy@shop.com',
    created_date: '2026-11-02T09:00:00.000Z',
  }, { source: 'ActivityLog' });
  eq(al.occurred_at, '2026-11-02T09:00:00.000Z', 'created_date is the event time');
  eq(al.actor_label, 'Amy S');
  eq(al.actor_email, 'amy@shop.com');
  eq(al.entity_type, 'WorkOrder');
  eq(al.entity_id, 'wo-1');
  eq(al.entity_label, 'Marquee refit');
  eq(al.event_type, 'stage_changed');
  eq(al.summary, 'Stage: design → production');
}

// OpportunityActivity — summary prose + ref chain types
{
  const oa = normalizeAuditRow({
    id: 'oa1', opportunity_id: 'opp-7', event_type: 'stage_changed',
    summary: 'Stage moved to quoted', actor: 'rep@shop.com',
    created_date: '2026-11-02T08:00:00.000Z',
  }, { source: 'OpportunityActivity' });
  eq(oa.entity_type, 'Opportunity');
  eq(oa.entity_id, 'opp-7');
  eq(oa.summary, 'Stage moved to quoted');
  eq(oa.actor_label, 'rep@shop.com');

  // standalone CRM event without opportunity_id falls down the ref chain
  const crm = normalizeAuditRow({
    id: 'oa2', work_order_id: 'wo-3', event_type: 'Call: Sales Follow Up',
    summary: 'Called about install date', actor: 'sales1',
    contact_name: 'Pat Customer', created_date: '2026-11-02T07:30:00.000Z',
  }, { source: 'OpportunityActivity' });
  eq(crm.entity_type, 'WorkOrder', 'ref chain types by the field that matched');
  eq(crm.entity_id, 'wo-3');
  eq(crm.entity_label, 'Pat Customer', 'contact/company label fallback');
}

// AdminAuditLog — at ts, actor_email, target is the audited "User"
{
  const aa = normalizeAuditRow({
    id: 'aa1', actor_email: 'admin@shop.com', action: 'authorized_user_added',
    target_email: 'newbie@shop.com', detail: 'Granted staff access',
    at: '2026-11-02T06:00:00.000Z',
  }, { source: 'AdminAuditLog' });
  eq(aa.occurred_at, '2026-11-02T06:00:00.000Z');
  eq(aa.actor_label, 'admin@shop.com');
  eq(aa.actor_email, 'admin@shop.com');
  eq(aa.entity_type, 'User');
  eq(aa.entity_id, 'newbie@shop.com');
  eq(aa.event_type, 'authorized_user_added');
  eq(aa.summary, 'Granted staff access');
}

// EstimateRevision + FieldAudit — the two extended sources
{
  const er = normalizeAuditRow({
    id: 'er1', estimate_id: 'est-4', estimate_number: 'EST-1042',
    revision_number: 3, revision_type: 'status_transition',
    previous_status: 'draft', new_status: 'sent', reason: 'Customer approved scope',
    created_by_email: 'brett@shop.com', updated_date: '2026-11-02T05:00:00.000Z',
  }, { source: 'EstimateRevision' });
  eq(er.entity_type, 'Estimate');
  eq(er.entity_id, 'est-4');
  eq(er.entity_label, 'EST-1042');
  eq(er.event_type, 'status_transition');
  ok(er.summary.includes('Revision 3') && er.summary.includes('draft → sent'), 'revision summary');

  const fa = normalizeAuditRow({
    id: 'fa1', entity_type: 'Order', entity_id: 'ord-2', field_name: 'total',
    old_value: '100', new_value: '120', actor_name: 'Smartsheet Sync',
    modified_at: '2026-11-02T04:00:00.000Z', source: 'smartsheet', status: 'committed',
  }, { source: 'FieldAudit' });
  eq(fa.entity_type, 'Order', 'row-carried entity_type wins');
  eq(fa.entity_id, 'ord-2');
  eq(fa.event_type, 'field_change');
  ok(fa.summary.includes('total: 100 → 120'), 'field diff summary');
  ok(fa.summary.includes('via smartsheet'), 'non-app source credited');
}

// === actorLabel chain (spec: actor_label → actor_email → created_by → system)
eq(actorLabel({ actor_label: 'A' }), 'A');
eq(actorLabel({ actor_email: 'e@x.com' }), 'e@x.com');
eq(actorLabel({ created_by: 'c@x.com' }), 'c@x.com');
eq(actorLabel({}), 'system');
eq(actorLabel({ performed_by_name: 'P' }), 'P', 'generic name fields precede system');
eq(actorEmail({ actor_label: 'name-only' }), '', 'no email → blank');
eq(actorEmail({ actor_label: 'named@x.com' }), 'named@x.com', 'email-looking label counts');

// === entityLabelFor =========================================================
eq(entityLabelFor({ entity_label: 'Lbl' }), 'Lbl', 'normalized label wins');
eq(entityLabelFor({ entity_type: 'Estimate', entity_id: 'e1' }, { titlesById: { 'e1': 'EST-9' } }),
  'EST-9', 'titlesById resolves the audited record');
ok(entityLabelFor({ entity_type: 'WorkOrder', entity_id: 'abcdefghijklmnop' }).startsWith('WorkOrder '),
  'unmapped id renders Type + short id');
eq(entityLabelFor({}), '—');
eq(entityLabelFor({ subject: 'Site survey call' }, { source: 'OpportunityActivity' }),
  'Site survey call', 'raw row + source uses label fields');
eq(humanizeAuditToken('stage_changed'), 'Stage Changed');
eq(humanizeAuditToken('Call: Prospecting'), 'Call: Prospecting', 'colon phrases untouched');

// === mergeAuditLog: ordering + undated ======================================
const feed = mergeAuditLog({
  ProductActivity: [
    { id: 'p1', product_id: 'p-1', event_type: 'note', note: 'older',
      occurred_at: '2026-11-01T10:00:00.000Z', actor_label: 'sys-sync' },
    { id: 'p2', product_id: 'p-1', event_type: 'note', note: 'newer',
      occurred_at: '2026-11-02T10:00:00.000Z', actor_label: 'Brett' },
    { id: 'p3', product_id: 'p-1', event_type: 'note', note: 'undated' },
  ],
  ActivityLog: [
    { id: 'a1', work_order_id: 'wo-1', action_type: 'note_added',
      performed_by_name: 'Amy', created_date: '2026-11-02T05:00:00.000Z' },
  ],
});
eq(feed.length, 4);
eq(feed[0].id, 'ProductActivity:p2', 'newest first');
eq(feed[feed.length - 1].id, 'ProductActivity:p3', 'undated sorts last');
ok(feed.every((r) => r.source && r.entity_type && r.event_type), 'every row normalized');
ok(!('_seq' in feed[0]) && !('_source' in feed[0]), 'internals stripped');
{
  // stable tiebreak on equal timestamps
  const tie = mergeAuditLog({
    ActivityLog: [
      { id: 'x1', action_type: 'a', created_date: '2026-11-02T00:00:00.000Z' },
      { id: 'x2', action_type: 'b', created_date: '2026-11-02T00:00:00.000Z' },
    ],
  });
  eq(tie[0].id, 'ActivityLog:x1');
  eq(tie[1].id, 'ActivityLog:x2');
}

// === mergeAuditLog: filters =================================================
const MIXED = {
  ProductActivity: [
    { id: 'p1', work_order_id: 'wo-9', product_id: 'p-1', event_type: 'status_change',
      actor_label: 'brett@shop.com', occurred_at: '2026-11-02T10:00:00.000Z' },
    { id: 'p2', work_order_id: 'wo-9', product_id: 'p-1', event_type: 'note', note: 'rush per customer',
      actor_label: 'amy@shop.com', occurred_at: '2026-11-02T12:00:00.000Z' },
    { id: 'pX', work_order_id: 'wo-9', product_id: 'p-1', event_type: 'note', note: 'undated' },
  ],
  ActivityLog: [
    { id: 'a1', work_order_id: 'wo-1', action_type: 'stage_changed',
      performed_by_email: 'amy@shop.com', created_date: '2026-11-01T09:00:00.000Z' },
  ],
  AdminAuditLog: [
    { id: 'd1', actor_email: 'admin@shop.com', action: 'role_changed',
      target_email: 'amy@shop.com', at: '2026-11-02T08:00:00.000Z' },
  ],
};

// from/to — inclusive bounds; undated rows excluded under a bound
{
  const day = mergeAuditLog(MIXED, { from: '2026-11-02T00:00:00.000Z', to: '2026-11-02T23:59:59.000Z' });
  eq(day.length, 3, 'bounds keep in-window rows across sources');
  ok(!day.some((r) => r.id === 'ProductActivity:pX'), 'undated excluded under bounds');
  ok(!day.some((r) => r.id === 'ActivityLog:a1'), 'out-of-window row dropped');
  const unbounded = mergeAuditLog(MIXED, {});
  eq(unbounded.length, 5, 'no bounds keeps undated rows');
  const fromOnly = mergeAuditLog(MIXED, { from: '2026-11-02T00:00:00.000Z' });
  eq(fromOnly.length, 3, 'open-ended bounds work');
}

// entity_type — audited type OR source name OR parent type (D4)
{
  const products = mergeAuditLog(MIXED, { entity_type: 'Product' });
  eq(products.length, 3, 'audited type match (undated rows stay — no date bound set)');
  ok(products.every((r) => r.entity_type === 'Product'));
  const bySource = mergeAuditLog(MIXED, { entity_type: 'AdminAuditLog' });
  eq(bySource.length, 1, 'source entity name match');
  eq(bySource[0].source, 'AdminAuditLog');
  const wo = mergeAuditLog(MIXED, { entity_type: 'WorkOrder' });
  eq(wo.length, 4, 'ProductActivity rows surface under parent WorkOrder + own WO row');
}

// user — exact email first, substring fallback
{
  const exact = mergeAuditLog(MIXED, { user: 'amy@shop.com' });
  eq(exact.length, 2, 'actor_email + actor_label exact hits');
  const fuzzy = mergeAuditLog(MIXED, { user: 'AMY' });
  eq(fuzzy.length, 2, 'case-insensitive substring fallback');
  const none = mergeAuditLog(MIXED, { user: 'nobody@nowhere' });
  eq(none.length, 0);
}

// q — actor/entity_label/summary (+entity_id/event_type)
{
  eq(mergeAuditLog(MIXED, { q: 'rush' }).length, 1, 'summary match');
  eq(mergeAuditLog(MIXED, { q: 'wo-1' }).length, 1, 'entity_id match');
  eq(mergeAuditLog(MIXED, { q: 'STATUS_CHANGE' }).length, 1, 'event_type match, case-insensitive');
  eq(mergeAuditLog(MIXED, { q: 'brett' }).length, 1, 'actor match');
}

// limit
{
  eq(mergeAuditLog(MIXED, { limit: 2 }).length, 2, 'limit caps the feed');
  eq(mergeAuditLog(MIXED, { limit: 0 }).length, 5, 'non-positive limit = no cap');
}

// unknown source key → generic normalize; junk values skipped
{
  const g = mergeAuditLog({
    WeirdAudit: [{ id: 'w1', summary: 'odd row', created_date: '2026-11-02T00:00:00.000Z' }],
    ProductActivity: 'not-an-array',
  });
  eq(g.length, 1);
  eq(g[0].source, 'WeirdAudit');
  eq(g[0].summary, 'odd row');
  eq(normalizeAuditRow(null), null);
  eq(normalizeAuditRow('nope'), null);
  eq(normalizeAuditRow(42), null);
}

// === auditSummary ===========================================================
{
  const s = auditSummary(mergeAuditLog(MIXED, {}));
  eq(s.count, 5);
  eq(s.by_entity.Product, 3);
  eq(s.by_entity.WorkOrder, 1);
  eq(s.by_entity.User, 1);
  eq(s.by_actor['amy@shop.com'], 2, 'actor histogram');
  eq(s.by_source.ProductActivity, 3, 'source histogram');
  eq(s.top_actions[0].event_type, 'note', 'top_actions sorted count-desc');
  eq(s.top_actions[0].count, 2);
  ok(s.top_actions.every((t, i) => i === 0 || s.top_actions[i - 1].count >= t.count), 'desc order');
  eq(auditSummary([]).count, 0);
  eq(auditSummary(null).count, 0);
}

rmSync(bundlePath, { force: true });
console.log(`PASS audit-log (${n} asserts)`);
