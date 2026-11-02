// Notification/follow-up SUITE — masterplan item N-06 (worker w-129).
// ONE suite that esbuild-bundles the notification-side shared models and
// asserts lifecycle + interop across them:
//   base44/shared/followUpMachine.ts        (H-04 two-stage FU machine)
//   base44/shared/proofFollowUpModel.ts     (H-06 machine → WO.products[])
//   base44/shared/readyTriggerModel.ts      (H-10 estimate/proof ready)
//   base44/shared/vendorNotifyModel.ts      (H-09 vendor notices)
//   base44/shared/alertSubscriptionsModel.ts(H-12 per-user subscriptions)
//   base44/shared/digestBatchModel.ts       (H-13 daily digest batching)
//   base44/shared/delivery.ts               (H-01 channel adapter)
//   base44/shared/deliveryTelemetryModel.ts (H-14 delivery stamps/PII)
//   base44/shared/paymentReminderModel.ts   (H-07 invoice reminders)
//   base44/shared/crmSuggestionModel.ts     (G-06 CRM FU suggestions)
//   base44/shared/templateRender.ts         (H-03 placeholder render)
// + seed coverage vs base44/functions/seedNotificationTemplates/entry.ts
//   (w-67's 15-row TEMPLATE_SEED_ROWS) and the FU sweep's template keys
//   (followUpSweepAction/entry.ts).
//
// Assert themes: FU legal transitions + status gates, proof gate OR-precedence,
// ready/vendor trigger composition + kill-switches, dedupe keys stable +
// collision-free across kinds, feed/digest/both routing + N-alerts→1-row
// digest merge, telemetry PII redaction + re-stamp semantics, adapter channel
// fallback chain, suggestion dedupe (open FU event suppresses), payment
// reminder windows/cadence, template seed coverage, end-to-end interop
// (notification → delivery plan → telemetry; machine stage → suggestion gate).
//
// Run: node scripts/test-notification-suite.mjs  →  prints "PASS notification-suite"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const readText = (p) => readFileSync(join(root, p), 'utf8');

// delivery.ts and deliveryTelemetryModel.ts BOTH export DELIVERY_CHANNELS —
// bundle each model separately and destructure into namespaced aliases.
const bundle = (name) => {
  const out = resolve(here, `.tmp-notif-suite-${name}.mjs`);
  buildSync({
    entryPoints: [resolve(here, `../base44/shared/${name}.ts`)],
    bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  });
  return { name, out };
};
const TMP = [
  'followUpMachine',
  'proofFollowUpModel',
  'readyTriggerModel',
  'vendorNotifyModel',
  'alertSubscriptionsModel',
  'digestBatchModel',
  'delivery',
  'deliveryTelemetryModel',
  'paymentReminderModel',
  'crmSuggestionModel',
  'templateRender',
].map(bundle);

const fu = await import(pathToFileURL(TMP[0].out).href);
const proofFu = await import(pathToFileURL(TMP[1].out).href);
const ready = await import(pathToFileURL(TMP[2].out).href);
const vendor = await import(pathToFileURL(TMP[3].out).href);
const subs = await import(pathToFileURL(TMP[4].out).href);
const digest = await import(pathToFileURL(TMP[5].out).href);
const delivery = await import(pathToFileURL(TMP[6].out).href);
const telem = await import(pathToFileURL(TMP[7].out).href);
const payRem = await import(pathToFileURL(TMP[8].out).href);
const crm = await import(pathToFileURL(TMP[9].out).href);
const tplRender = await import(pathToFileURL(TMP[10].out).href);

const DAY_MS = 24 * 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const T0 = Date.parse('2026-10-01T12:00:00Z'); // anchor instant (ISO — TZ-safe)
const T = (days) => iso(T0 + days * DAY_MS);   // `days` after anchor

// ===========================================================================
// A. followUpMachine — legal transitions + status gate
// ===========================================================================
{
  assert.deepEqual(fu.FOLLOW_UP_STAGES, ['none', 'fu1_sent', 'fu2_sent', 'answered', 'closed'], 'FU stage vocabulary');

  // Status gate — only 'sent' records progress.
  for (const st of ['draft', 'calculated', 'viewed', '']) {
    const d = fu.nextStage({ record: { status: st, sent_at: T(-30) }, now: T(0) });
    assert.equal(d.action, 'none', `status '${st}' inert`);
    assert.equal(d.reason, `status_gate:${st || 'missing'}`, 'status_gate reason');
    assert.equal(d.patch, null, 'inert rows carry no patch');
  }
  // Terminal statuses close the (possibly never-started) sequence exactly once.
  for (const st of ['approved', 'declined', 'archived', 'cancelled', 'converted', 'won', 'lost', 'canceled']) {
    const d = fu.nextStage({ record: { status: st }, now: T(0) });
    assert.equal(d.action, 'close', `terminal '${st}' closes`);
    assert.equal(d.patch.stage, 'closed', 'close patch stage');
    assert.equal(d.patch.closed_reason, st, 'closed_reason = status');
    assert.equal(d.patch.next_due_at, null, 'close clears next_due_at');
    // Already-closed rows never re-close (close is one-shot).
    const after = fu.nextStage({ record: { status: st, follow_up_state: d.patch }, now: T(1) });
    assert.equal(after.action, 'none', `closed stays closed on '${st}'`);
    assert.equal(after.reason, 'already_closed');
  }

  // Sent + no anchor → nothing to schedule from.
  {
    const d = fu.nextStage({ record: { status: 'sent' }, now: T(0) });
    assert.equal(d.action, 'none'); assert.equal(d.reason, 'anchor_missing');
  }
  // Sent, FU1 not yet due → none; boundary is INCLUSIVE at anchor+fu1_delay.
  const sent = { status: 'sent', quote_issue_date: T(0) };
  {
    const early = fu.nextStage({ record: sent, now: T(6.5) });
    assert.equal(early.action, 'none'); assert.equal(early.reason, 'fu1_not_due');
    const due = fu.nextStage({ record: sent, now: T(7) });
    assert.equal(due.action, 'send_fu1', 'FU1 fires at anchor+7d inclusive');
    assert.equal(due.patch.stage, 'fu1_sent');
    assert.equal(due.patch.anchor_at, T(0), 'FU1 freezes resolved anchor');
    assert.equal(due.patch.fu1_sent_at, T(7));
    assert.equal(due.patch.last_sent_at, T(7));
    assert.equal(due.patch.next_due_at, T(14), 'FU2 due = send + fu2_after_fu1_days');

    // Apply patch → mid-window → fu2_not_due; at due → send_fu2.
    const fu1d = { ...sent, follow_up_state: due.patch };
    const mid = fu.nextStage({ record: fu1d, now: T(13) });
    assert.equal(mid.action, 'none'); assert.equal(mid.reason, 'fu2_not_due');
    const fu2 = fu.nextStage({ record: fu1d, now: T(14) });
    assert.equal(fu2.action, 'send_fu2', 'FU2 fires at next_due_at');
    assert.equal(fu2.patch.stage, 'fu2_sent');
    assert.equal(fu2.patch.fu2_sent_at, T(14));
    assert.equal(fu2.patch.next_due_at, null, 'sequence ends: next_due cleared');
    const done = fu.nextStage({ record: { ...sent, follow_up_state: fu2.patch }, now: T(40) });
    assert.equal(done.action, 'none'); assert.equal(done.reason, 'sequence_complete');
  }
  // markAnswered → terminal 'answered'; cancelFollowUp → 'closed' + reason.
  {
    const ans = fu.markAnswered({ status: 'sent', quote_issue_date: T(0) }, T(9));
    assert.equal(ans.stage, 'answered'); assert.equal(ans.answered_at, T(9));
    assert.equal(ans.next_due_at, null);
    assert.equal(fu.nextStage({ record: { status: 'sent', follow_up_state: ans }, now: T(30) }).reason, 'already_answered');
    const cx = fu.cancelFollowUp({ status: 'sent' }, 'manual_stop');
    assert.equal(cx.stage, 'closed'); assert.equal(cx.closed_reason, 'manual_stop');
  }
  // Partial-write guard: stage lost but a recent send stamp → fu1_cooldown.
  {
    const d = fu.nextStage({ record: { status: 'sent', quote_issue_date: T(-20), follow_up_state: { last_sent_at: T(-1) } }, now: T(0) });
    assert.equal(d.action, 'none'); assert.equal(d.reason, 'fu1_cooldown');
  }
  // FU2 recovery: missing next_due_at rebuilds as max(anchor+fu2_delay, fu1+spacing).
  {
    const rec = {
      status: 'sent', quote_issue_date: T(0),
      follow_up_state: { stage: 'fu1_sent', anchor_at: T(0), fu1_sent_at: T(10), last_sent_at: T(10), next_due_at: null },
    };
    const early = fu.nextStage({ record: rec, now: T(16) });
    assert.equal(early.action, 'none'); assert.equal(early.reason, 'fu2_not_due');
    assert.equal(early.due_source, 'recovered', 'recovered schedule declared');
    assert.equal(early.due_at, T(17), 'max(anchor+14d, fu1+7d) = T+17 (spacing wins)');
    const due = fu.nextStage({ record: rec, now: T(17) });
    assert.equal(due.action, 'send_fu2'); assert.equal(due.reason, 'fu2_due:recovered');
  }
  // Bad clock → now_invalid, no throw.
  assert.equal(fu.nextStage({ record: { status: 'sent' }, now: 'garbage' }).reason, 'now_invalid');

  // Stage aliases normalize into the canonical vocabulary.
  assert.equal(fu.nextStage({ record: { status: 'sent', follow_up_state: { stage: 'replied' } }, now: T(0) }).reason, 'already_answered', 'alias replied→answered');
  assert.equal(fu.nextStage({ record: { status: 'sent', follow_up_state: { stage: 'complete' } }, now: T(0) }).reason, 'sequence_complete', 'alias complete→fu2_sent');
  assert.equal(fu.nextStage({ record: { status: 'sent', follow_up_state: { stage: 'done' } }, now: T(0) }).reason, 'already_closed', 'alias done→closed');
  {
    // Legacy flat twins: fu1 alias + flat next_due → send_fu2 path still works.
    const d = fu.nextStage({
      record: { status: 'sent', follow_up_stage: 'fu1', follow_up_next_due_at: T(-1), quote_issue_date: T(-20) },
      now: T(0),
    });
    assert.equal(d.action, 'send_fu2', 'flat legacy state reaches FU2');
  }
  // Unknown extra keys in follow_up_state are preserved through the patch.
  {
    const d = fu.nextStage({
      record: { status: 'sent', quote_issue_date: T(-20), follow_up_state: { stage: 'none', sweep_date: '2026-10-01' } },
      now: T(0),
    });
    assert.equal(d.action, 'send_fu1');
    assert.equal(d.patch.sweep_date, '2026-10-01', 'unknown stored key survives');
  }
  // cfg override — a 0-day FU1 delay is due immediately.
  {
    const d = fu.nextStage({ record: { status: 'sent', quote_issue_date: T(0) }, now: T(0.5), cfg: { fu1_delay_days: 0 } });
    assert.equal(d.action, 'send_fu1', 'cfg.fu1_delay_days 0 → immediate due');
  }

  // LEGAL-TRANSITION TABLE — the machine's own rules, swept systematically:
  //   none → send_fu1 | close | none         (never send_fu2 — no skipping)
  //   fu1_sent → send_fu2 | close | none     (never send_fu1 — no restart)
  //   fu2_sent / answered / closed → none    (terminal)
  const LEGAL = {
    none: new Set(['send_fu1', 'close', 'none']),
    fu1_sent: new Set(['send_fu2', 'close', 'none']),
    fu2_sent: new Set(['none']),
    answered: new Set(['none']),
    closed: new Set(['none']),
  };
  for (const stage of fu.FOLLOW_UP_STAGES) {
    for (const status of ['sent', 'draft', 'approved', '']) {
      for (const now of [T(1), T(8), T(15), T(30)]) {
        const d = fu.nextStage({
          record: { status, quote_issue_date: T(0), follow_up_state: { stage, next_due_at: T(14) } },
          now,
        });
        assert.ok(LEGAL[stage].has(d.action), `ILLEGAL ${stage} → ${d.action} (status ${status || '∅'})`);
        if (d.patch?.stage) {
          const legalTargets = { send_fu1: 'fu1_sent', send_fu2: 'fu2_sent', close: 'closed' };
          assert.equal(d.patch.stage, legalTargets[d.action], `${d.action} lands expected stage`);
        }
      }
    }
  }
}

// ===========================================================================
// B. proofFollowUpModel — two-field OR gate + per-product state isolation
// ===========================================================================
{
  const wo = (products, extra = {}) => ({ id: 'wo1', products, ...extra });
  const awaiting = { id: 'p1', description: 'Monument', operational_status: 'awaiting_proof_approval', proof_sent_at: T(-9) };

  // Sent candidate (operational_status) + old anchor → FU1.
  {
    const rows = proofFu.productsNeedingProofFollowUp(wo([awaiting]), { now: T(0) });
    assert.equal(rows.length, 1); assert.equal(rows[0].decision.action, 'send_fu1');
    assert.equal(rows[0].index, 0); assert.equal(rows[0].product.id, 'p1');
  }
  // Terminal proof_status beats a stale sent operational_status → close.
  {
    const approved = { ...awaiting, proof_status: 'approved' };
    const rows = proofFu.productsNeedingProofFollowUp(wo([approved]), { now: T(0) });
    assert.equal(rows.length, 1); assert.equal(rows[0].decision.action, 'close', 'terminal proof_status wins over stale awaiting');
    assert.equal(proofFu.proofFollowUpGateStatus(approved), 'approved');
  }
  // Sent beats inert — proof_status 'sent' + mid-workflow operational → sent gate.
  {
    const sent = { ...awaiting, proof_status: 'sent', operational_status: 'in_design' };
    assert.equal(proofFu.proofFollowUpGateStatus(sent), 'sent', 'sent candidate beats inert');
    assert.equal(proofFu.productsNeedingProofFollowUp(wo([sent]), { now: T(0) }).length, 1);
  }
  // Inert product (no sent/terminal candidate) → gate 'none', nothing due.
  {
    const inert = { id: 'p2', operational_status: 'in_design' };
    assert.deepEqual(proofFu.productsNeedingProofFollowUp(wo([inert]), { now: T(0) }), [], 'inert product skipped');
  }
  // Deleted/completed orders produce no rows at all.
  assert.deepEqual(proofFu.productsNeedingProofFollowUp(wo([awaiting], { deleted: true }), { now: T(0) }), [], 'deleted WO skipped');
  assert.deepEqual(proofFu.productsNeedingProofFollowUp(wo([awaiting], { completed: true }), { now: T(0) }), [], 'completed WO skipped');
  // Estimate-style flat state keys on a product are invisible to the machine —
  // a stray follow_up_stage:'fu2_sent' must NOT suppress a real proof FU1.
  {
    const contaminated = { ...awaiting, follow_up_stage: 'fu2_sent', follow_up_next_due_at: T(99) };
    const rows = proofFu.productsNeedingProofFollowUp(wo([contaminated]), { now: T(0) });
    assert.equal(rows[0].decision.action, 'send_fu1', 'flat estimate state stripped from product view');
  }
  // Patch lands in proof_follow_up_state (NOT follow_up_state).
  {
    const patched = proofFu.applyProofFollowUpPatch(awaiting, { stage: 'fu1_sent', last_sent_at: T(0) });
    assert.equal(patched.proof_follow_up_state.stage, 'fu1_sent');
    assert.equal(patched.follow_up_state, undefined, 'no estimate state field created');
    assert.equal(proofFu.proofFollowUpState(patched).stage, 'fu1_sent');
    assert.deepEqual(proofFu.applyProofFollowUpPatch(awaiting, null).proof_follow_up_state, awaiting.proof_follow_up_state, 'null patch = no-op');
  }
  // proofFollowUpBatch — flat sweeper rows across orders.
  {
    const batch = proofFu.proofFollowUpBatch([wo([awaiting, { id: 'p2', proof_status: 'approved', operational_status: 'awaiting_proof_approval' }])], { now: T(0) });
    assert.equal(batch.length, 2, 'fu1 + close rows');
    assert.equal(batch[0].work_order_id, 'wo1'); assert.equal(batch[0].product_label, 'Monument');
    assert.equal(batch[1].action, 'close');
  }
}

// ===========================================================================
// C. readyTriggerModel — kill-switches, portal chain, composers, dedupe keys
// ===========================================================================
{
  assert.equal(ready.shouldNotify('estimate_ready', {}), true, 'default ON');
  assert.equal(ready.shouldNotify('estimate_ready', { settings: { notifications: { enabled: false } } }), false, 'master off');
  assert.equal(ready.shouldNotify('proof_ready', { settings: { notifications: { proof_ready_enabled: false } } }), false, 'per-kind off');
  assert.equal(ready.shouldNotify('estimate_ready', { settings: { notifications: { proof_ready_enabled: false } } }), true, 'kind switch is per-kind');
  assert.equal(ready.shouldNotify('bogus_kind', {}), false, 'unknown kind fails closed');
  assert.equal(ready.shouldNotify('estimate_ready', { setting_value: { notifications: { enabled: false } } }), false, 'KV blob mirror honored');

  assert.equal(ready.resolvePortalEnabled({}), true, 'portal default ON');
  assert.equal(ready.resolvePortalEnabled({ customerPortal: { enabled: false } }), false, 'explicit false disables');
  assert.equal(ready.resolvePortalLink({ settings: { customerPortal: { url: 'https://p.example.com/' } } }), 'https://p.example.com', 'settings portal URL + trailing slash stripped');
  assert.equal(ready.resolvePortalLink({ portal_link: 'https://tok.example.com/x', settings: { customerPortal: { url: 'https://p.example.com' } } }), 'https://tok.example.com/x', 'explicit portal_link wins');
  assert.equal(ready.estimateDeepLink('e 1'), `/EstimateDetail?id=${encodeURIComponent('e 1')}`, 'D-12 link encoded');
  assert.equal(ready.jobWorkspaceDeepLink('wo9'), '/JobWorkspace?wo=wo9');

  // Dedupe keys — stable + version semantics.
  assert.equal(ready.triggerDedupeKey('estimate_ready', 'e1'), 'ready:estimate_ready:e1');
  assert.equal(ready.triggerDedupeKey('proof_ready', 'p1', 2), 'ready:proof_ready:p1:v2', 'versioned artifact');
  assert.equal(ready.triggerDedupeKey('proof_ready', 'p1', 0), 'ready:proof_ready:p1', 'version 0 collapses (fail-closed)');
  assert.equal(ready.triggerDedupeKey('proof_ready', 'p1', ''), 'ready:proof_ready:p1', 'blank version collapses');
  assert.equal(ready.triggerDedupeKey('estimate_ready', 'e1', '3'), 'ready:estimate_ready:e1:v3', 're-send of revised quote re-notifies');
  assert.equal(ready.triggerDedupeKey('estimate_ready', 'e1'), ready.triggerDedupeKey('estimate_ready', 'e1'), 'dedupe deterministic');

  const settings = { company_name: 'CCS Signage', customerPortal: { enabled: true, url: 'https://portal.example.com/' } };
  const estimate = { id: 'e1', estimate_number: 'EST-100', project_name: 'Pylon sign', contact_email: 'Buyer@Acme.com', contact_name: 'Pat Buyer', quote_total: 1234.5, quote_version: 2, hyperlink: 'https://est/e1', client_name: 'Acme Co' };
  {
    assert.deepEqual(ready.estimateReadyNotifications({}), [], 'no estimate → []');
    assert.deepEqual(ready.estimateReadyNotifications({ estimate: {} }), [], 'id-less estimate → []');
    const rows = ready.estimateReadyNotifications({ estimate, customer: { company_name: 'Acme Co' }, settings });
    assert.equal(rows.length, 1, 'one customer-facing row');
    const n = rows[0];
    assert.equal(n.audience, 'customer');
    assert.equal(n.to, 'buyer@acme.com', 'recipient lowercased');
    assert.equal(n.kind, 'estimate_ready'); assert.equal(n.template_key, 'estimate_ready');
    assert.equal(n.entity_type, 'estimate'); assert.equal(n.entity_id, 'e1');
    assert.equal(n.dedupe_key, 'ready:estimate_ready:e1:v2', 'quote_version rides dedupe');
    assert.equal(n.deep_link, 'https://portal.example.com', 'portal link preferred when flag on');
    assert.equal(n.missing_email, false);
    assert.equal(n.subject, 'Your estimate EST-100 is ready — CCS Signage', 'subject shape');
    assert.ok(n.body.includes('EST-100') && n.body.includes('$1,234.50'), 'body carries number + money');
    // No portal URL anywhere → D-12 staff link fallback.
    const noPortal = ready.estimateReadyNotifications({ estimate, settings: {} })[0];
    assert.equal(noPortal.deep_link, '/EstimateDetail?id=e1', 'staff link fallback');
    const missingTo = ready.estimateReadyNotifications({ estimate: { id: 'e9' }, settings })[0];
    assert.equal(missingTo.missing_email, true, 'unresolved recipient flagged');
  }
  {
    const workOrder = { id: 'wo1', title: 'Lobby sign', corbridge_invoice_number: 'WO-77', contact_email: 'ap@acme.com', assigned_to: 'flo@shop.com' };
    const product = { id: 'p1', description: 'Monument face', proof_version: 3, designer: 'dee@shop.com' };
    assert.deepEqual(ready.proofReadyNotifications({}), [], 'missing wo/product → []');
    const rows = ready.proofReadyNotifications({
      workOrder, product, customer: { company_name: 'Acme Co' }, settings,
      proof_link: 'https://portal.example.com/proof/abc',
    });
    assert.equal(rows.length, 2, 'customer + internal designer pair');
    const [cust, internal] = rows;
    assert.equal(cust.audience, 'customer'); assert.equal(cust.kind, 'proof_ready');
    assert.equal(cust.template_key, 'proof_ready');
    assert.equal(cust.deep_link, 'https://portal.example.com/proof/abc', 'explicit proof_link wins');
    assert.equal(cust.dedupe_key, 'ready:proof_ready:p1:v3', 'proof_version rides dedupe');
    assert.equal(cust.subject, 'Your proof for Lobby sign is ready — CCS Signage');
    assert.equal(internal.audience, 'internal'); assert.equal(internal.type, 'notification');
    assert.equal(internal.recipient_email, 'dee@shop.com', 'product.designer wins');
    assert.equal(internal.title, 'Proof ready — Monument face');
    assert.equal(internal.link, '/JobWorkspace?wo=wo1');
    assert.equal(internal.dedupe_key, cust.dedupe_key, 'writer namespaces per recipient');
    // Designer chain falls back to workOrder.assigned_to.
    const noDesigner = ready.proofReadyNotifications({ workOrder, product: { description: 'X', proof_version: 1 }, settings })[1];
    assert.equal(noDesigner.recipient_email, 'flo@shop.com', 'assigned_to fallback');
    // id-less product anchors dedupe on '<wo>:<index>'.
    const idxRows = ready.proofReadyNotifications({ workOrder, product: { description: 'Face', proof_version: 1 }, settings, index: 1 });
    assert.equal(idxRows[0].dedupe_key, 'ready:proof_ready:wo1:1:v1', 'wo:index entity ref');
  }
  // resolveCustomerEmail ladder: primary → contact_email → billing → contacts[].
  assert.equal(ready.resolveCustomerEmail('A@B.co', {}), 'a@b.co');
  assert.equal(ready.resolveCustomerEmail('', { contact_email: 'C@D.co' }), 'c@d.co');
  assert.equal(ready.resolveCustomerEmail('not-an-email', { billing_contact_email: 'E@F.co' }), 'e@f.co');
  assert.equal(ready.resolveCustomerEmail('', { contacts: [{ email: 'G@H.co' }] }), 'g@h.co');
  assert.equal(ready.resolveCustomerEmail('', {}), '', 'nothing resolves → empty');
  assert.equal(ready.productReadyLabel({}), 'Product');
  assert.equal(ready.productReadyLabel({}, 0), 'Product 1');
  assert.equal(ready.proofEntityRef({ id: 'wo1' }, {}, 2), 'wo1:2');
  assert.equal(ready.proofEntityRef({ id: 'wo1' }, {}), 'wo1');
}

// ===========================================================================
// D. vendorNotifyModel — kinds, recipient chain, plan flags, dedupe
// ===========================================================================
{
  assert.equal(vendor.normalizeVendorEventKind('po_created'), 'po_created');
  assert.equal(vendor.normalizeVendorEventKind({ kind: 'PO_CREATED' }), 'po_created', 'object + case normalized');
  assert.equal(vendor.normalizeVendorEventKind({ type: 'feedback_sent' }), 'feedback_sent', 'type alias');
  assert.equal(vendor.normalizeVendorEventKind('bogus'), '', 'unknown → empty');
  assert.equal(vendor.normalizeVendorEventKind(null), '');

  const po = { id: 'po1', po_number: 'PO-1042', total: 2500, expected_date: '2026-12-01', vendor_name: 'FastSigns', created_by: 'buyer@shop.com', line_items: [{ a: 1 }, { a: 2 }] };
  const vend = { contact_email: 'sales@fastsigns.com', name: 'FastSigns' };
  const settings = { company_name: 'CCS Signage' };
  {
    const missingPo = vendor.vendorNotificationPlan({ event: 'po_created', vendor: vend, settings });
    assert.equal(missingPo.kind, 'po_created');
    assert.ok(missingPo.flags.includes('missing_po'));
    assert.deepEqual(missingPo.notifications, []); assert.deepEqual(missingPo.internal, []);
    const unknown = vendor.vendorNotificationPlan({ event: 'bogus', po, vendor: vend, settings });
    assert.equal(unknown.kind, ''); assert.ok(unknown.flags.includes('unknown_event'));
  }
  {
    const plan = vendor.vendorNotificationPlan({ event: 'po_created', po, vendor: vend, settings });
    assert.equal(plan.dedupe_key, 'vnotif:po1:po_created');
    assert.deepEqual(plan.flags, []);
    assert.equal(plan.notifications.length, 1, 'one external notification');
    const n = plan.notifications[0];
    assert.equal(n.to, 'sales@fastsigns.com');
    assert.equal(n.subject, 'PO PO-1042 from CCS Signage', 'spec-pinned subject');
    assert.equal(n.template_key, 'po_created');
    assert.equal(n.entity_type, 'purchase_order'); assert.equal(n.entity_id, 'po1');
    assert.equal(n.dedupe_key, 'vnotif:po1:po_created');
    assert.equal(n.deep_link, '/PurchaseOrders?po=po1');
    assert.ok(n.body.includes('Arrive by: 12/1/2026'), 'arrive-by rendered UTC');
    assert.ok(n.body.includes('View or respond online:'), 'portal link line present');
    assert.ok(plan.internal.length >= 1, 'internal row always produced');
    assert.equal(plan.internal[0].recipient_email, 'buyer@shop.com', 'PO creator is internal recipient');
    assert.equal(plan.internal[0].title, 'PO PO-1042 sent to FastSigns');
  }
  {
    // No vendor email anywhere → internal-only + flag.
    const plan = vendor.vendorNotificationPlan({ event: 'po_created', po: { ...po, vendor_email: '' }, vendor: { name: 'FastSigns' }, settings });
    assert.ok(plan.flags.includes('missing_vendor_email'));
    assert.deepEqual(plan.notifications, [], 'no external row without recipient');
    assert.ok(plan.internal.length >= 1, 'staff still see the event');
    assert.ok(plan.internal[0].message.includes('manually'), 'internal note explains why');
  }
  {
    // Every declared kind produces a notification + its template_key.
    for (const kind of vendor.VENDOR_EVENT_KINDS) {
      const plan = vendor.vendorNotificationPlan({ event: { kind, file_name: 'art.pdf', feedback: 'fix bleed', actor: 'sam@shop.com' }, po, vendor: vend, settings });
      assert.equal(plan.notifications.length, 1, `${kind} composes`);
      assert.equal(plan.notifications[0].template_key, vendor.VENDOR_TEMPLATE_KEYS[kind]);
      assert.equal(plan.dedupe_key, `vnotif:po1:${kind}`);
    }
  }
  // Recipient chain: contact_email → email → comm_prefs → contacts[] → statement → po.vendor_email → purchase contact.
  assert.equal(vendor.recipientsFor({ email: 'v@v.co' }).to, 'v@v.co', 'email second hop');
  assert.equal(vendor.recipientsFor({ comm_prefs: { email: 'cp@v.co' } }).to, 'cp@v.co', 'comm_prefs hop');
  assert.equal(vendor.recipientsFor({ contacts: [{ email: 'ct@v.co' }] }).to, 'ct@v.co', 'contacts[] hop');
  assert.equal(vendor.recipientsFor({ statement_email: 'st@v.co' }).to, 'st@v.co', 'statement_email hop');
  assert.equal(vendor.recipientsFor({}, { settings: { purchase_contact_email: 'buy@shop.com' } }).to, 'buy@shop.com', 'purchase inbox last hop');
  assert.equal(vendor.recipientsFor({}).missing_email, true, 'empty chain flags missing');
  assert.equal(vendor.notifyDedupeKey({ po_number: 'PO-9' }, 'file_uploaded'), 'vnotif:PO-9:file_uploaded', 'po_number id fallback');
  assert.equal(vendor.formatMoney(2500), '$2,500.00');
  assert.equal(vendor.formatMoney('x'), '');
  assert.equal(vendor.formatArriveBy(''), 'TBD');
  assert.equal(vendor.formatArriveBy('2026-12-01'), '12/1/2026', 'UTC-anchored date render');
  assert.equal(vendor.formatArriveBy('Next Friday'), 'Next Friday', 'free text survives');
  assert.equal(vendor.poDeepLink({ po_number: 'PO-9' }), '/PurchaseOrders?po=PO-9');
  assert.ok(vendor.portalLinkFor(po, {}, {}).includes('/vendor?po=po1'), 'portal link fallback synthesized');
}

// ===========================================================================
// E. alertSubscriptionsModel — normalize, match, fan-out, write patch
// ===========================================================================
{
  assert.equal(subs.normalizeEventKey('PO.Created'), 'po_created');
  assert.equal(subs.normalizeEventKey('  Proof  Ready '), 'proof_ready');
  assert.equal(subs.normalizeDelivery('in_app'), 'feed', 'in_app→feed');
  assert.equal(subs.normalizeDelivery('daily'), 'digest', 'daily→digest');
  assert.equal(subs.normalizeDelivery('all'), 'both', 'all→both');
  assert.equal(subs.normalizeDelivery('bogus'), 'feed', 'unknown → feed (fail-visible)');

  const ev = { kind: 'po_created', vendor_id: 'v1', customer: { id: 'c9' } };
  assert.equal(subs.matchesSubscription({ event_key: 'po_created' }, ev), true, 'empty criteria = match all');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'v1' } }, ev), true, 'criterion equal');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'V1' } }, ev), true, 'case-insensitive value');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: ['v2', 'v1'] } }, ev), true, 'any-of array');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { customer: { id: 'c9' } } }, ev), true, 'deep object equality');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { 'customer.id': 'c9' } }, ev), true, 'dotted path criterion');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { vendor_id: 'vX' } }, ev), false, 'mismatch fails');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', criteria: { missing_field: 'x' } }, ev), false, 'missing event field fails closed');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created', enabled: false }, ev), false, 'disabled never fires');
  assert.equal(subs.matchesSubscription({ event_key: 'proof_ready' }, ev), false, 'kind mismatch never fires');
  assert.equal(subs.matchesSubscription('po_created', ev), true, 'bare-string legacy sub matches');
  assert.equal(subs.matchesSubscription({ event_key: 'po_created' }, {}), false, 'keyless event never fires');

  const pref = (user_email, subscriptions, extra = {}) => ({ user_email, subscriptions, ...extra });
  {
    const out = subs.deliveriesFor(ev, [
      pref('z@shop.com', [{ event_key: 'po_created', delivery: 'feed' }]),
      pref('a@shop.com', [{ event_key: 'po_created', delivery: 'digest' }]),
      pref('m@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
      pref('split@shop.com', [
        { event_key: 'po_created', criteria: { vendor_id: 'v1' }, delivery: 'feed' },
        { event_key: 'po_created', delivery: 'digest' },
      ]),
      pref('off@shop.com', [{ event_key: 'po_created', enabled: false }]),
      pref('', [{ event_key: 'po_created' }]), // unresolvable identity
    ]);
    assert.deepEqual(out.map((r) => r.user_id), ['a@shop.com', 'm@shop.com', 'split@shop.com', 'z@shop.com'], 'sorted by user');
    const byUser = Object.fromEntries(out.map((r) => [r.user_id, r.delivery]));
    assert.equal(byUser['a@shop.com'], 'digest');
    assert.equal(byUser['z@shop.com'], 'feed');
    assert.equal(byUser['m@shop.com'], 'both');
    assert.equal(byUser['split@shop.com'], 'both', 'feed-sub + digest-sub merge to both');
    assert.equal(byUser['off@shop.com'], undefined, 'disabled excluded');
  }
  {
    // subscriptionPatch — signature dedupe replace-in-place.
    const base = pref('u@shop.com', [
      { event_key: 'po_created', delivery: 'feed', created_by: 'a@x.co', created_at: '2026-01-01T00:00:00Z' },
    ]);
    const p1 = subs.subscriptionPatch(base, { event_key: 'PO.Created', delivery: 'digest' }, { actor_id: 'b@x.co', now: '2026-11-02T00:00:00Z' });
    assert.equal(p1.subscriptions.length, 1, 'same signature replaces (key normalized)');
    assert.equal(p1.subscriptions[0].delivery, 'digest', 'delivery refreshed');
    assert.equal(p1.subscriptions[0].created_at, '2026-01-01T00:00:00Z', 'created_at preserved on replace');
    assert.equal(p1.subscriptions[0].updated_by, 'b@x.co');
    assert.equal(p1.subscriptions[0].updated_at, '2026-11-02T00:00:00Z');
    const p2 = subs.subscriptionPatch(base, { event_key: 'po_created', criteria: { vendor_id: 'v1' } }, { now: '2026-11-02T00:00:00Z' });
    assert.equal(p2.subscriptions.length, 2, 'different criteria = different sub, coexists');
    // Keyless junk is dropped; unknown future keys are kept.
    const p3 = subs.subscriptionPatch({ subscriptions: [{}, { event_key: 'future_event' }] }, { event_key: 'po_created' }, { now: '2026-11-02T00:00:00Z' });
    assert.equal(p3.subscriptions.length, 2, 'junk dropped, future key kept, new appended');
  }
  // Registry covers every emitter kind the suite exercises.
  const keys = new Set(subs.subscribableEventKeys());
  for (const k of [...ready.READY_EVENT_KINDS, ...vendor.VENDOR_EVENT_KINDS, ...payRem.REMINDER_KINDS, 'estimate_follow_up_due']) {
    assert.ok(keys.has(k), `registry covers emitter kind '${k}'`);
  }
}

// ===========================================================================
// F. digestBatchModel — lanes, N-alerts→1-row merge, dedupe keys
// ===========================================================================
{
  const pref = (user_email, subscriptions, extra = {}) => ({ user_email, subscriptions, ...extra });
  const NOW = { now: '2026-11-02T15:04:00Z' };
  const DAY = '2026-11-02';

  assert.equal(digest.digestDedupeKey('U@Shop.com', DAY), 'digest:u@shop.com:2026-11-02', 'digest key canonical');
  assert.equal(digest.eventDedupeKey('u@shop.com', { kind: 'po_created', id: 'po1' }), 'alert:u@shop.com:po_created:po1', 'event key canonical');
  assert.notEqual(
    digest.eventDedupeKey('u@shop.com', { kind: 'po_created', id: 'po1' }),
    digest.eventDedupeKey('u@shop.com', { kind: 'po_created', id: 'po2' }),
    'distinct events → distinct keys',
  );

  const prefs = [
    pref('feed@shop.com', [{ event_key: 'po_created' }]),
    pref('dig@shop.com', [{ event_key: 'po_created', delivery: 'digest' }, { event_key: 'proof_ready', delivery: 'digest' }], { digest_opt_in: true }),
    pref('both@shop.com', [{ event_key: 'po_created', delivery: 'both' }]),
  ];
  {
    const lanes = digest.eventLanes({ kind: 'po_created' }, prefs);
    assert.deepEqual(lanes.feed_users, ['both@shop.com', 'feed@shop.com'], 'feed lane routes feed+both');
    assert.deepEqual(lanes.digest_users, ['both@shop.com', 'dig@shop.com'], 'digest lane routes digest+both');
    assert.deepEqual(lanes.overlap, ['both@shop.com'], 'overlap = both');
    // N alerts → ONE digest candidate per user with N items (deduped).
    const events = [
      { kind: 'po_created', id: 'po1', title: 'PO 1' },
      { kind: 'proof_ready', id: 'pr1', title: 'Proof A' },
      { kind: 'po_created', id: 'po2', title: 'PO 2' },
      { kind: 'po_created', id: 'po1', title: 'PO 1' }, // duplicate event
    ];
    const cands = digest.digestCandidates(events, prefs, NOW);
    const digU = cands.find((c) => c.user === 'dig@shop.com');
    assert.ok(digU, 'digest user candidate exists');
    assert.equal(digU.events.length, 3, 'duplicate event collapses per user');
    assert.equal(digU.items.length, 3);
    assert.equal(digU.dedupe_key, 'digest:dig@shop.com:2026-11-02');
    assert.equal(digU.opted_in, true, 'opt-in surfaced for writer gate');
    // Per user+CHANNEL: 'both' → 1 feed row per event + 1 digest row total.
    const imm = digest.immediateCandidates(events, prefs);
    assert.equal(imm.filter((c) => c.user === 'both@shop.com').length, 3, 'both user: one feed row per distinct event');
    const bothU = cands.find((c) => c.user === 'both@shop.com');
    assert.equal(bothU.events.length, 2, 'both user digest carries only matching kinds (po_created ×2 deduped... po1,po2)');
    const composed = digest.composeDigest(bothU.user, bothU.events, NOW);
    assert.equal(composed.notification_row.dedupe_key, 'digest:both@shop.com:2026-11-02', 'one digest row per user per day');
    assert.equal(composed.notification_row.meta.total, 2);
    assert.equal(composed.notification_row.creation_request_key, 'notif:digest:both@shop.com:2026-11-02');
    // The composed row itself suppresses a same-day resend.
    assert.equal(digest.alreadyDigested([composed.notification_row], 'both@shop.com', DAY), true);
    assert.equal(digest.alreadyDigested([composed.notification_row], 'other@shop.com', DAY), false, 'other user unaffected');
    assert.equal(digest.alreadyDigested([composed.notification_row], 'both@shop.com', '2026-11-03'), false, 'other day unaffected');
    // feed-only user: immediate rows only, never a digest candidate.
    assert.equal(imm.filter((c) => c.user === 'feed@shop.com').length, 3);
    assert.equal(cands.some((c) => c.user === 'feed@shop.com'), false, 'feed-only never digests');
  }
  {
    // Lane parity vs alertSubscriptionsModel.deliveriesFor on the same fixture.
    const event = { kind: 'po_created', vendor_id: 'v9' };
    const p = [
      pref('f@x.co', [{ event_key: 'po_created', delivery: 'feed' }]),
      pref('d@x.co', [{ event_key: 'po_created', delivery: 'digest' }]),
      pref('b@x.co', [{ event_key: 'po_created', criteria: { vendor_id: 'v9' }, delivery: 'feed' }, { event_key: 'po_created', delivery: 'digest' }]),
    ];
    const lanes = digest.eventLanes(event, p);
    for (const r of subs.deliveriesFor(event, p)) {
      assert.equal(lanes.feed_users.includes(r.user_id), r.delivery === 'feed' || r.delivery === 'both', `parity feed ${r.user_id}`);
      assert.equal(lanes.digest_users.includes(r.user_id), r.delivery === 'digest' || r.delivery === 'both', `parity digest ${r.user_id}`);
    }
  }
}

// ===========================================================================
// G. deliveryTelemetryModel — stamps, PII redaction, re-stamp, stats
// ===========================================================================
{
  assert.equal(telem.normalizeDeliveryChannel('EMAIL'), 'email');
  assert.equal(telem.normalizeDeliveryChannel('bogus'), '');
  const NOW = '2026-11-02T09:00:00Z';

  const d1 = telem.deliveryStamp('email', { now: NOW, delivered: true });
  assert.equal(d1.delivery_status, 'delivered'); assert.equal(d1.delivered_at, NOW);
  assert.equal(d1.delivery_attempted_at, NOW);
  assert.equal(telem.deliveryStamp('smartsheet', { now: NOW, status: 'queued' }).delivery_status, 'queued');
  assert.equal(telem.deliveryStamp('internal', { now: NOW, delivered: 'skipped' }).delivery_status, 'skipped');
  assert.equal(telem.deliveryStamp('email', { now: NOW, delivered: false }).delivery_status, 'failed', 'bare false → failed');
  assert.equal(telem.deliveryStamp('email', { now: NOW, delivered: 'garbage' }).delivery_status, 'failed', 'garbage → failed (fail-closed)');
  assert.equal(telem.deliveryStamp('bogus-channel', { now: NOW, delivered: true }).delivery_channel, 'internal', 'unknown channel floors to internal');
  assert.equal(telem.deliveryStamp('email', { now: NOW, delivered: true, delivered_at: '2026-11-01T00:00:00Z' }).delivered_at, '2026-11-01T00:00:00Z', 'explicit delivered_at honored');

  // PII redaction — emails, URLs, Bearer, JWT, secret kv, long token runs.
  {
    const raw = 'SMTP 550 for john.doe@customer.com see https://track.example.com/x?t=abc api_key=deadbeef0123456789abcdef01234567';
    const r = telem.redactTelemetryError(raw);
    assert.ok(!r.includes('john.doe@customer.com'), 'email stripped');
    assert.ok(r.includes('[email]'));
    assert.ok(!r.includes('https://track.example.com'), 'URL stripped');
    assert.ok(r.includes('[url]'));
    assert.ok(r.includes('api_key=[redacted]'), 'secret kv redacted');
    assert.ok(!r.includes('deadbeef'), 'key material gone');
    const bearer = telem.redactTelemetryError('Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U failed');
    assert.ok(bearer.includes('Bearer [token]'), 'bearer redacted');
    assert.ok(!bearer.includes('eyJ'), 'JWT body gone');
    const jwt = telem.redactTelemetryError('token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U rejected');
    assert.ok(jwt.includes('[token]'), 'bare JWT redacted');
    const longTok = telem.redactTelemetryError('ref x7K9mP2vN8qR4tY6uI1oP3aS5dF7gH9jZ failed');
    assert.ok(!longTok.includes('x7K9mP2vN8qR4tY6uI1oP3aS5dF7gH9jZ'), '32+ run redacted');
    assert.equal(telem.redactTelemetryError(('x'.repeat(30) + ' ').repeat(15)).length, 200, 'redact caps at 200 (non-token input)');
    const stamped = telem.deliveryStamp('email', { now: NOW, delivered: false, error: `fail for boss@shop.com ${'y'.repeat(600)}` });
    assert.ok(stamped.delivery_error.length <= 500, 'stamp caps at 500');
    assert.ok(!stamped.delivery_error.includes('boss@shop.com'), 'PII stripped before cap');
    assert.equal(telem.redactTelemetryError(null), '');
    assert.equal(telem.redactTelemetryError(new Error('oops admin@x.co')), 'oops [email]', 'Error.message honored');
  }
  // telemetryPatch — attempts increment, channel precedence, no delivered_at nuke.
  {
    const p1 = telem.telemetryPatch({}, { channel: 'email', delivered: true, now: NOW });
    assert.equal(p1.delivery_attempts, 1); assert.equal(p1.delivery_status, 'delivered');
    assert.equal(p1.last_delivery_at, NOW);
    const row = { ...p1 };
    const p2 = telem.telemetryPatch(row, { delivered: false, error: 'bounce user@x.co', now: '2026-11-03T09:00:00Z' });
    assert.equal(p2.delivery_attempts, 2, 're-stamp increments');
    assert.equal(p2.delivery_status, 'failed');
    assert.ok(!('delivered_at' in p2), 'failed re-stamp leaves prior delivered_at on row');
    assert.equal(p2.delivery_channel, 'email', 'channel falls back to row history');
    const p3 = telem.telemetryPatch({}, { plan: { channel: 'smartsheet', channels: ['smartsheet', 'internal'] }, delivered: true, now: NOW });
    assert.equal(p3.delivery_channel, 'smartsheet', 'plan decides channel');
  }
  // channelFromPlan — real buildDeliveryPlan outputs + hand-rolled fallbacks.
  {
    const emailPlan = delivery.buildDeliveryPlan({ settings: { emailDelivery: { enabled: true } }, notification: { to: 'a@b.co', subject: 'S', body: 'B' } });
    assert.equal(telem.channelFromPlan(emailPlan), 'email', 'adapter plan → email');
    const smPlan = delivery.buildDeliveryPlan({ settings: {}, notification: { to: 'a@b.co', subject: 'S', body: 'B' } });
    assert.equal(telem.channelFromPlan(smPlan), 'smartsheet', 'adapter plan → smartsheet');
    assert.equal(telem.channelFromPlan({ channels: ['internal'] }), 'internal');
    assert.equal(telem.channelFromPlan({ smartsheetRow: {} }), 'smartsheet', 'payload sniffing');
    assert.equal(telem.channelFromPlan(null), 'internal', 'null plan → internal floor');
  }
  // deliveryStats — stamped rows only, per-channel rollup, error_top.
  {
    const rows = [
      { delivery_channel: 'email', delivery_status: 'delivered', delivery_attempted_at: '2026-11-02T01:00:00Z', delivery_attempts: 1, delivered_at: '2026-11-02T01:00:00Z' },
      { delivery_channel: 'email', delivery_status: 'failed', delivery_attempted_at: '2026-11-02T02:00:00Z', delivery_error: 'bounce' },
      { delivery_channel: 'smartsheet', delivery_status: 'delivered', delivery_attempted_at: '2026-11-02T03:00:00Z' },
      { delivery_channel: 'internal', delivery_status: 'skipped', delivery_attempted_at: '2026-11-02T04:00:00Z' },
      { title: 'unstamped row' }, // invisible — no stamp fields
    ];
    const s = telem.deliveryStats(rows);
    assert.equal(s.sent, 4, 'unstamped rows invisible');
    assert.equal(s.delivered, 2);
    assert.equal(s.delivery_rate, 0.5);
    assert.equal(s.by_channel.email.delivered, 1); assert.equal(s.by_channel.email.failed, 1);
    assert.equal(s.by_channel.internal.skipped, 1);
    assert.deepEqual(s.error_top, [{ error: 'bounce', count: 1 }], 'top errors from failed rows');
    const windowed = telem.deliveryStats(rows, { from: '2026-11-03' });
    assert.equal(windowed.sent, 0, 'window bounds on attempted_at');
  }
}

// ===========================================================================
// H. delivery.ts — channel fallback chain + plan composition
// ===========================================================================
{
  const rc = delivery.resolveDeliveryChannel;
  assert.equal(rc({ emailDelivery: { enabled: true } }), 'email', 'canonical flag');
  assert.equal(rc({ setting_value: { emailDelivery: { enabled: true } } }), 'email', 'KV blob flag');
  assert.equal(rc({ email_delivery_enabled: true }), 'email', 'legacy flat alias');
  assert.equal(rc({ delivery: { emailEnabled: true } }), 'email', 'legacy nested alias');
  assert.equal(rc({}), 'smartsheet', 'default fail-closed');
  assert.equal(rc({ emailDelivery: { enabled: 'true' } }), 'smartsheet', 'string true is NOT true');
  assert.equal(rc({ emailDelivery: { enabled: 1 } }), 'smartsheet', 'numeric 1 is NOT true');
  assert.equal(rc({ emailDelivery: { enabled: false }, email_delivery_enabled: true }), 'smartsheet', 'canonical false beats legacy true (first defined wins)');
  assert.equal(rc({ emailDelivery: { enabled: true }, email_delivery_enabled: false }), 'email', 'canonical true beats legacy false');
  assert.equal(rc({ emailDelivery: {}, email_delivery_enabled: true }), 'email', 'undefined canonical hop skipped to alias');

  const n = { to: 'C@X.COM', subject: 'Hi', body: 'Body', kind: 'estimate_ready', dedupe_key: 'k1', entity_type: 'estimate', entity_id: 'e1' };
  {
    const plan = delivery.buildDeliveryPlan({ settings: { emailDelivery: { enabled: true, default_from: 'shop@ccs.com' } }, notification: n });
    assert.equal(plan.channel, 'email');
    assert.deepEqual(plan.channels, ['email', 'internal'], 'email + always-internal lanes');
    assert.equal(plan.alwaysInternal, true);
    assert.equal(plan.email.to, 'C@X.COM');
    assert.equal(plan.email.subject, 'Hi'); assert.equal(plan.email.body, 'Body');
    assert.equal(plan.email.from, 'shop@ccs.com', 'default_from fallback');
    assert.equal(plan.smartsheetRow, undefined, 'no smartsheet row on email lane');
    assert.equal(plan.internalRow.type, 'notification');
    assert.equal(plan.internalRow.kind, 'estimate_ready');
    assert.equal(plan.internalRow.recipient_email, 'c@x.com', 'internal recipient lowercased');
    assert.equal(plan.internalRow.dedupe_key, 'k1', 'dedupe rides internal row');
    const fromCtx = delivery.buildDeliveryPlan({ settings: { emailDelivery: { enabled: true } }, notification: n, context: { from: 'ctx@x.co' } });
    assert.equal(fromCtx.email.from, 'ctx@x.co', 'context from before default_from');
    const fromN = delivery.buildDeliveryPlan({ settings: { emailDelivery: { enabled: true } }, notification: { ...n, from: 'n@x.co' }, context: { from: 'ctx@x.co' } });
    assert.equal(fromN.email.from, 'n@x.co', 'notification from wins');
  }
  {
    const plan = delivery.buildDeliveryPlan({ settings: {}, notification: { ...n, entity_type: 'customer', entity_id: 'c1' } });
    assert.equal(plan.channel, 'smartsheet');
    assert.deepEqual(plan.channels, ['smartsheet', 'internal']);
    assert.equal(plan.smartsheetRow.customer_id, 'c1', 'customer entity → customer_id');
    assert.equal(plan.smartsheetRow.work_order_id, undefined);
    const woPlan = delivery.buildDeliveryPlan({ settings: {}, notification: { ...n, entity_type: 'work_order', entity_id: 'wo9' } });
    assert.equal(woPlan.smartsheetRow.work_order_id, 'wo9', 'work order entity → work_order_id');
    const ctxIds = delivery.buildDeliveryPlan({ settings: {}, notification: n, context: { customer_id: 'cx', work_order_id: 'wx' } });
    assert.equal(ctxIds.smartsheetRow.customer_id, 'cx'); assert.equal(ctxIds.smartsheetRow.work_order_id, 'wx', 'explicit context ids win');
    assert.equal(plan.internalRow.kind, 'estimate_ready', 'internal row always composed');
    assert.equal(plan.email, undefined, 'no email payload on smartsheet lane');
  }
}

// ===========================================================================
// I. crmSuggestionModel — thresholds + dedupe incl. open-FU-event suppression
// ===========================================================================
{
  const est = (id, over = {}) => ({ id, status: 'sent', quote_issue_date: T(0), estimate_number: `E-${id}`, salesperson: 'rep@shop.com', ...over });
  const NOW = T(14); // anchor T(0) → 14 days → 'stale'

  assert.equal(crm.suggestionKey('e1', 'stale'), 'sug:e1:stale');
  assert.equal(crm.stageForDays(2), null); assert.equal(crm.stageForDays(3), 'first');
  assert.equal(crm.stageForDays(7), 'second'); assert.equal(crm.stageForDays(14), 'stale');

  // Status gate — only 'sent' estimates suggest.
  for (const st of ['draft', 'approved', 'calculated']) {
    assert.equal(crm.suggestFollowUps([est('e1', { status: st })], { now: NOW }).length, 0, `status '${st}' never suggests`);
  }
  // Thresholds: one suggestion per estimate at the highest due stage.
  assert.equal(crm.suggestFollowUps([est('e1')], { now: T(2) }).length, 0, 'under first threshold');
  assert.equal(crm.suggestFollowUps([est('e1')], { now: T(3) })[0].due_stage, 'first', 'boundary inclusive');
  assert.equal(crm.suggestFollowUps([est('e1')], { now: T(8) })[0].due_stage, 'second');
  assert.equal(crm.suggestFollowUps([est('e1')], { now: T(20) })[0].due_stage, 'stale');
  {
    const out = crm.suggestFollowUps([est('e1')], { now: NOW });
    assert.equal(out.length, 1, 'at most one suggestion per estimate');
    assert.equal(out[0].suggestion_key, 'sug:e1:stale');
    assert.equal(out[0].deep_link, '/EstimateDetail?id=e1');
    assert.equal(out[0].days_since_sent, 14);
    assert.equal(out[0].kind, 'estimate_follow_up_suggestion');
  }

  // DEDUPE: an OPEN EstimateFollowUp event covering the estimate suppresses.
  {
    const openEv = { event_type: 'Call: Estimate Follow Up', estimate_id: 'e1', status: 'open' };
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_events: [openEv] }).length, 0, 'open FU event suppresses');
    const otherEv = { event_type: 'Call: Estimate Follow Up', estimate_id: 'other', status: 'open' };
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_events: [otherEv] }).length, 1, 'open event on another estimate does not suppress');
    // Non-follow-up event type does not cover.
    const call = { event_type: 'Phone Call', estimate_id: 'e1', status: 'open' };
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_events: [call] }).length, 1, 'non-FU event does not cover');
    // Recently COMPLETED FU event covers for RECENT_EVENT_DAYS; stale doesn't.
    const recent = { event_type: 'EstimateFollowUp', estimate_id: 'e1', status: 'completed', completed_at: T(10) };
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_events: [recent] }).length, 0, 'completed ≤7d ago suppresses');
    const old = { event_type: 'EstimateFollowUp', estimate_id: 'e1', status: 'completed', completed_at: T(1) };
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_events: [old] }).length, 1, 'completed >7d ago re-opens');
    // Shared opportunity_id linkage also covers.
    const linked = { event_type: 'Estimate Follow Up', opportunity_id: 'op9', status: 'open' };
    assert.equal(crm.suggestFollowUps([est('e1', { opportunity_id: 'op9' })], { now: NOW, existing_events: [linked] }).length, 0, 'opportunity-linked event covers');
  }
  // DEDUPE: pending suggestion suppresses; used key suppresses that stage only.
  {
    const pending = [{ kind: 'estimate_follow_up_suggestion', suggestion_key: 'sug:e1:stale', status: 'pending', estimate_id: 'e1' }];
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_suggestions: pending }).length, 0, 'pending suggestion suppresses');
    const dismissed = [{ kind: 'estimate_follow_up_suggestion', suggestion_key: 'sug:e1:stale', status: 'dismissed', estimate_id: 'e1' }];
    assert.equal(crm.suggestFollowUps([est('e1')], { now: NOW, existing_suggestions: dismissed }).length, 0, 'dismissed stage never re-suggests');
    const dismissedFirst = [{ kind: 'estimate_follow_up_suggestion', suggestion_key: 'sug:e1:first', status: 'dismissed', estimate_id: 'e1' }];
    const out = crm.suggestFollowUps([est('e1')], { now: T(8), existing_suggestions: dismissedFirst });
    assert.equal(out.length, 1); assert.equal(out[0].due_stage, 'second', 'later stage still fires after dismissing earlier');
  }
  // Terminal machine stages suppress; fu2_sent still suggests (human takeover).
  for (const stg of ['answered', 'closed']) {
    assert.equal(crm.suggestFollowUps([est('e1', { follow_up_state: { stage: stg } })], { now: NOW }).length, 0, `fu stage '${stg}' suppresses`);
  }
  assert.equal(crm.suggestFollowUps([est('e1', { follow_up_state: { stage: 'fu2_sent' } })], { now: NOW }).length, 1, 'fu2_sent still suggests');
  // Sorted most-stale first.
  {
    const out = crm.suggestFollowUps([est('e_new', { quote_issue_date: T(10) }), est('e_old', { quote_issue_date: T(0) })], { now: T(14) });
    assert.deepEqual(out.map((s) => s.estimate_id), ['e_old', 'e_new'], 'most-stale first');
  }
  // Two-write contract: confirm → {event, patch}; dismiss → {patch}.
  {
    const sug = crm.suggestFollowUps([est('e1')], { now: NOW })[0];
    const row = crm.suggestionRow(sug, { actor_id: 'sys', now: NOW });
    assert.equal(row.status, 'pending'); assert.equal(row.suggestion_key, 'sug:e1:stale');
    assert.equal(row.actor, 'sys'); assert.equal(row.suggested_at, NOW);
    const { event, suggestion_patch } = crm.confirmSuggestion({ ...row, due_stage: 'stale', days_since_sent: 14 }, { actor_id: 'rep@shop.com', now: NOW });
    assert.equal(event.event_type, 'Call: Estimate Follow Up');
    assert.equal(event.status, 'open'); assert.equal(event.source, 'auto_followup');
    assert.equal(event.details.estimate_id, 'e1');
    assert.equal(event.details.suggestion_key, 'sug:e1:stale');
    assert.equal(suggestion_patch.status, 'confirmed');
    assert.equal(suggestion_patch.confirmed_by, 'rep@shop.com');
    const { suggestion_patch: dp } = crm.dismissSuggestion(row, { actor_id: 'rep@shop.com', now: NOW, reason: 'called directly' });
    assert.equal(dp.status, 'dismissed'); assert.equal(dp.dismiss_reason, 'called directly');
    // pendingSuggestions: pending only + assignee filter.
    const pend = crm.pendingSuggestions([row, { ...row, status: 'confirmed', suggestion_key: 'sug:e2:x' }], { user_email: 'rep@shop.com' });
    assert.equal(pend.length, 1); assert.equal(pend[0].suggestion_key, 'sug:e1:stale');
  }
}

// ===========================================================================
// J. paymentReminderModel — eligibility, windows, cadence buckets, dedupe
// ===========================================================================
{
  const inv = { id: 'i1', status: 'sent', balance_due: 100, due_date: '2026-11-10' };
  assert.equal(payRem.openInvoiceBalance({ total: 100, amount_paid: 30 }), 70, 'total−paid fallback');
  assert.equal(payRem.openInvoiceBalance({ balance_due: -5 }), 0, 'never negative');
  // Eligibility gates.
  assert.equal(payRem.reminderSchedule({ ...inv, status: 'draft' }, { now: '2026-11-05' }).reason, 'status_draft');
  assert.equal(payRem.reminderSchedule({ ...inv, status: 'paid' }, { now: '2026-11-05' }).reason, 'status_paid');
  assert.equal(payRem.reminderSchedule({ ...inv, status: 'void' }, { now: '2026-11-05' }).reason, 'status_void');
  assert.equal(payRem.reminderSchedule({ ...inv, balance_due: 0 }, { now: '2026-11-05' }).reason, 'no_open_balance');
  assert.equal(payRem.reminderSchedule({ id: 'i1', status: 'sent', balance_due: 5 }, { now: '2026-11-05' }).reason, 'due_date_missing');
  // Missing status reads as 'draft' (entity default) → ineligible.
  assert.equal(payRem.reminderSchedule({ id: 'i1', balance_due: 5, due_date: '2026-11-10' }, { now: '2026-11-05' }).reason, 'status_draft', 'missing status = draft');
  // T−5 window [due−5, due] inclusive.
  assert.equal(payRem.reminderSchedule(inv, { now: '2026-11-04' }).kind, null, 'before window');
  assert.equal(payRem.reminderSchedule(inv, { now: '2026-11-04' }).reason, 'not_yet_due');
  const atT5 = payRem.reminderSchedule(inv, { now: '2026-11-05' });
  assert.equal(atT5.kind, 'payment_due_5day', 'boundary day fires');
  assert.equal(atT5.days_until_due, 5);
  assert.equal(payRem.reminderSchedule(inv, { now: '2026-11-10' }).kind, 'payment_due_5day', 'due day = catch-up');
  const past = payRem.reminderSchedule(inv, { now: '2026-11-17' });
  assert.equal(past.kind, 'payment_past_due'); assert.equal(past.days_past_due, 7);
  assert.equal(past.cadence_bucket, 1, 'floor(7/7)');
  // Dedupe keys.
  assert.equal(payRem.reminderDedupeKey(inv, 'payment_due_5day', { now: '2026-11-05' }), 'payrem:i1:payment_due_5day:2026-11-05');
  assert.equal(payRem.reminderDedupeKey(inv, 'payment_past_due', { now: '2026-11-12' }), 'payrem:i1:payment_past_due:b0');
  assert.equal(payRem.reminderDedupeKey(inv, 'payment_past_due', { now: '2026-11-17' }), 'payrem:i1:payment_past_due:b1');
  // History: T−5 is once-EVER; past-due dedupes per bucket and refires next.
  {
    const logged = { ...inv, reminder_log: [{ kind: 'payment_due_5day', sent_at: '2026-11-05T00:00:00', dedupe_key: 'payrem:i1:payment_due_5day:2026-11-05' }] };
    assert.equal(payRem.alreadyReminded(logged, 'payment_due_5day', { now: '2026-11-08' }), true, 'any prior T−5 entry suppresses (once-ever)');
    const pastLogged = { ...inv, reminder_log: [{ kind: 'payment_past_due', sent_at: '2026-11-11T00:00:00', dedupe_key: 'payrem:i1:payment_past_due:b0' }] };
    assert.equal(payRem.alreadyReminded(pastLogged, 'payment_past_due', { now: '2026-11-12' }), true, 'same bucket dedupes');
    assert.equal(payRem.alreadyReminded(pastLogged, 'payment_past_due', { now: '2026-11-17' }), false, 'new bucket refires (cadence)');
  }
  // Sweep list + patch.
  {
    const needing = payRem.invoicesNeedingReminder([inv, { ...inv, id: 'i2', status: 'paid' }, { ...inv, id: 'i3', reminder_log: [{ kind: 'payment_due_5day', dedupe_key: 'x' }] }], { now: '2026-11-05' });
    assert.equal(needing.length, 1); assert.equal(needing[0].invoice.id, 'i1');
    assert.equal(needing[0].dedupe_key, 'payrem:i1:payment_due_5day:2026-11-05');
    const patch = payRem.reminderPatch(inv, 'payment_due_5day', { now: '2026-11-05' });
    assert.equal(patch.reminder_log.length, 1);
    assert.equal(patch.reminder_log[0].kind, 'payment_due_5day');
    assert.equal(patch.reminder_log[0].dedupe_key, 'payrem:i1:payment_due_5day:2026-11-05');
    assert.ok(patch.last_reminder_at.startsWith('2026-11-05'));
    const capped = payRem.reminderPatch({ ...inv, reminder_log: new Array(100).fill({ kind: 'x' }) }, 'payment_past_due', { now: '2026-11-20' });
    assert.equal(capped.reminder_log.length, 100, 'log capped at REMINDER_LOG_MAX');
    assert.equal(capped.reminder_log[99].kind, 'payment_past_due', 'newest kept');
  }
}

// ===========================================================================
// K. Template seed coverage — w-67's TEMPLATE_SEED_ROWS vs trigger references
// ===========================================================================
const seedSrc = readText('base44/functions/seedNotificationTemplates/entry.ts');
const seedMatch = seedSrc.match(/const TEMPLATE_SEED_ROWS = \[([\s\S]*?)\n\];/);
assert.ok(seedMatch, 'TEMPLATE_SEED_ROWS parseable');
const SEED_KEYS = [...seedMatch[1].matchAll(/key: '([^']+)'/g)].map((m) => m[1]);
assert.equal(SEED_KEYS.length, 15, '15 seeded templates');
assert.equal(new Set(SEED_KEYS).size, 15, 'seed keys unique');
{
  // Ready-trigger template ids exist in the seed.
  for (const key of Object.values(ready.READY_TEMPLATE_KEYS)) {
    assert.ok(SEED_KEYS.includes(key), `seed covers ready template '${key}'`);
  }
  // FU sweep template ids (extracted from the sweep source, not hardcoded).
  const sweepSrc = readText('base44/functions/followUpSweepAction/entry.ts');
  const sweepKeys = [...new Set([...sweepSrc.matchAll(/'(estimate_follow_up_\d+|proof_follow_up_\d+)'/g)].map((m) => m[1]))];
  assert.ok(sweepKeys.length >= 2, 'sweep declares FU template keys');
  for (const key of sweepKeys) {
    assert.ok(SEED_KEYS.includes(key), `seed covers FU sweep template '${key}'`);
  }
  // Proof follow-up slots exist for the (future) proof sweep.
  for (const key of ['proof_follow_up_1', 'proof_follow_up_2']) {
    assert.ok(SEED_KEYS.includes(key), `seed covers proof FU template '${key}'`);
  }
  // payment_due_5day seeded; the FULL referenced-but-unseeded set is exactly
  // the documented staff-authored/inline-fallback keys — a NEW unseeded
  // reference fails here loudly.
  assert.ok(SEED_KEYS.includes('payment_due_5day'), 'payment_due_5day seeded');
  const referenced = new Set([
    ...Object.values(ready.READY_TEMPLATE_KEYS),
    ...Object.values(vendor.VENDOR_TEMPLATE_KEYS),
    ...Object.values(payRem.REMINDER_TEMPLATE_KEYS),
    'estimate_follow_up_1', 'estimate_follow_up_2', 'proof_follow_up_1', 'proof_follow_up_2',
    'daily_digest', // digestBatchModel notification_template binding
  ]);
  const unseeded = [...referenced].filter((k) => !SEED_KEYS.includes(k)).sort();
  assert.deepEqual(
    unseeded,
    ['daily_digest', 'feedback_sent', 'file_uploaded', 'payment_past_due', 'po_created', 'quote_request'],
    'unseeded template refs = exactly the documented fallback set',
  );
  // Every seeded kind is a declared NotificationTemplate kind-enum value.
  const entityJson = JSON.parse(readText('base44/entities/NotificationTemplate.jsonc'));
  const enumKinds = new Set(entityJson.properties?.kind?.enum ?? []);
  for (const key of SEED_KEYS) {
    assert.ok(enumKinds.has(key), `seeded kind '${key}' is a legal enum value`);
  }
}

// ===========================================================================
// L. Cross-kind dedupe collision-freedom + end-to-end interop
// ===========================================================================
{
  // Same entity id 'x1' keyed by every producer → distinct, prefix-namespaced.
  const keys = [
    ready.triggerDedupeKey('estimate_ready', 'x1'),
    ready.triggerDedupeKey('proof_ready', 'x1', 1),
    vendor.notifyDedupeKey({ id: 'x1' }, 'po_created'),
    payRem.reminderDedupeKey({ id: 'x1' }, 'payment_due_5day', { now: '2026-11-05' }),
    payRem.reminderDedupeKey({ id: 'x1' }, 'payment_past_due', { now: '2026-11-12' }),
    digest.digestDedupeKey('x1', '2026-11-02'),
    digest.eventDedupeKey('x1', { kind: 'po_created', id: 'e1' }),
    crm.suggestionKey('x1', 'first'),
  ];
  assert.equal(new Set(keys).size, keys.length, 'no cross-kind dedupe collisions on same id');
  const prefixes = new Set(keys.map((k) => k.split(':')[0]));
  assert.deepEqual([...prefixes].sort(), ['alert', 'digest', 'payrem', 'ready', 'sug', 'vnotif'], 'namespace prefixes disjoint');

  // DIGEST_KIND_LABELS parity with the H-12 registry.
  const regByKey = Object.fromEntries(subs.SUBSCRIBABLE_EVENTS.map((e) => [e.key, e.label]));
  for (const [k, label] of Object.entries(digest.DIGEST_KIND_LABELS)) {
    assert.equal(regByKey[k], label, `digest label parity for '${k}'`);
  }

  // Interop: trigger notification → adapter plan → channelFromPlan → telemetry.
  {
    const rows = ready.estimateReadyNotifications({
      estimate: { id: 'e1', estimate_number: 'EST-1', contact_email: 'b@x.co' },
      settings: {},
    });
    const plan = delivery.buildDeliveryPlan({ settings: {}, notification: rows[0] });
    assert.equal(plan.channel, 'smartsheet', 'default lane for trigger row');
    assert.equal(telem.channelFromPlan(plan), 'smartsheet');
    assert.equal(plan.internalRow.kind, 'estimate_ready');
    assert.equal(plan.internalRow.dedupe_key, 'ready:estimate_ready:e1', 'dedupe propagates to internal row');
    const patch = telem.telemetryPatch({ dedupe_key: rows[0].dedupe_key }, { plan, delivered: true, now: '2026-11-02T00:00:00Z' });
    assert.equal(patch.delivery_channel, 'smartsheet');
    assert.equal(patch.delivery_status, 'delivered');
    assert.equal(patch.delivery_attempts, 1);
  }
  // Vendor notification rides the same adapter path.
  {
    const plan = vendor.vendorNotificationPlan({
      event: 'po_created',
      po: { id: 'po1', po_number: 'PO-1', vendor_name: 'V' },
      vendor: { contact_email: 'v@v.co' },
      settings: { emailDelivery: { enabled: true } },
    });
    const dp = delivery.buildDeliveryPlan({ settings: { emailDelivery: { enabled: true } }, notification: plan.notifications[0] });
    assert.equal(dp.channel, 'email');
    assert.equal(dp.email.to, 'v@v.co');
    assert.equal(telem.channelFromPlan(dp), 'email');
  }
  // Digest row → internal notification through the adapter (kind survives).
  {
    const composed = digest.composeDigest('u@shop.com', [{ kind: 'po_created', id: 'p1', title: 'PO' }], { now: '2026-11-02' });
    const plan = delivery.buildDeliveryPlan({
      settings: {},
      notification: { to: composed.notification_row.recipient_email, subject: composed.subject, body: composed.body, kind: composed.notification_row.kind, dedupe_key: composed.dedupe_key },
    });
    assert.equal(plan.internalRow.kind, 'daily_digest', 'digest kind maps to internal row');
    assert.equal(plan.internalRow.dedupe_key, 'digest:u@shop.com:2026-11-02');
  }
  // Subscription event from an actual vendor emitter kind → lanes → digest.
  {
    const pref = { user_email: 'mgr@shop.com', subscriptions: [{ event_key: 'po_created', delivery: 'both' }] };
    const event = { kind: 'po_created', id: 'po1', vendor_id: 'v1', title: 'PO 1042 issued' };
    const imm = digest.immediateCandidates([event], [pref]);
    assert.equal(imm.length, 1); assert.equal(imm[0].dedupe_key, 'alert:mgr@shop.com:po_created:po1');
    const cands = digest.digestCandidates([event], [pref], { now: '2026-11-02' });
    assert.equal(cands.length, 1); assert.equal(cands[0].items[0].title, 'PO 1042 issued');
  }
  // Machine terminal state feeds the CRM suggestion gate (interop).
  {
    const est = { id: 'e1', status: 'sent', quote_issue_date: T(0) };
    const close = fu.nextStage({ record: { ...est, status: 'approved' }, now: T(5) });
    const suppressed = { ...est, follow_up_state: close.patch };
    assert.equal(crm.suggestFollowUps([suppressed], { now: T(20) }).length, 0, 'machine-closed estimate suppresses suggestion');
    // Mid-drip (fu1_sent) does NOT suppress the human nudge.
    const fu1 = fu.nextStage({ record: est, now: T(7) });
    const midDrip = { ...est, follow_up_state: fu1.patch };
    const out = crm.suggestFollowUps([midDrip], { now: T(8) });
    assert.equal(out.length, 1); assert.equal(out[0].due_stage, 'second', 'mid-drip still suggests human touch');
    // The machine's frozen anchor is the same anchor suggestions read.
    assert.equal(crm.sentAnchor(midDrip).at, T(0), 'suggestion reads machine-frozen anchor');
  }
  // Render interop: seeded template subjects render to the model-emitted text.
  {
    const rows = ready.estimateReadyNotifications({
      estimate: { id: 'e1', estimate_number: 'EST-1', contact_email: 'b@x.co', hyperlink: 'https://est/e1' },
      settings: { company_name: 'CCS Signage' },
    });
    const seeded = 'Your estimate {{estimate.number}} is ready — {{company.name}}';
    const rendered = tplRender.renderTemplate(seeded, rows[0].context);
    assert.equal(rendered.text, rows[0].subject, 'seeded estimate_ready subject ≡ emitted subject');
    assert.deepEqual(rendered.missing, [], 'context binds every subject placeholder');
    const proofRows = ready.proofReadyNotifications({
      workOrder: { id: 'w1', title: 'Sign', contact_email: 'b@x.co' },
      product: { description: 'Face', proof_version: 1 },
      settings: { company_name: 'CCS Signage' },
    });
    const proofSeed = 'Your proof for {{order.title}} is ready — {{company.name}}';
    const pr = tplRender.renderTemplate(proofSeed, proofRows[0].context);
    assert.equal(pr.text, proofRows[0].subject, 'seeded proof_ready subject ≡ emitted subject');
    // A seeded FU body line renders against the estimate context.
    const fuLine = tplRender.renderTemplate('Just checking in on estimate {{estimate.number}} for {{customer.company_name}}', rows[0].context);
    assert.ok(fuLine.text.includes('EST-1'), 'FU body placeholders bind');
    // Digest context renders its scalar binding cleanly.
    const dg = digest.composeDigest('u@shop.com', [{ kind: 'po_created', id: 'p1' }], { now: '2026-11-02' });
    const dr = tplRender.renderTemplate('{{user.display_name}} — {{date}} — {{count}} items', dg.context);
    assert.equal(dr.text, 'u@shop.com — 2026-11-02 — 1 items');
    assert.deepEqual(dr.missing, []);
    // Template render is injection-safe: proto paths never resolve.
    const evil = tplRender.renderTemplate('{{constructor.name}}|{{__proto__.x}}|{{user.display_name}}', dg.context);
    assert.equal(evil.text, '||u@shop.com', 'prototype paths render empty');
  }
}

// ---------------------------------------------------------------------------
for (const t of TMP) rmSync(t.out, { force: true });
console.log('PASS notification-suite');
