// E-03 contract test — proof-change requests: reason-code vocabulary,
// validateChangeRequest gate (awaiting_proof_approval only, 'other' needs
// text, actor classes), requestProofChangesPatch shape + count increment +
// companion writes (proof_status revision_requested, approved_version
// zeroed, status-changed stamp), designerNotificationFor internal row +
// dedupe/ordinal semantics, changeRequestAuditEvent ProductActivity shape.
// Run: node scripts/test-proof-change-request.mjs
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(here, '.tmp-proof-change-request.mjs');

buildSync({
  entryPoints: [resolve(root, 'base44/shared/proofChangeRequestModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const M = await import(pathToFileURL(out).href);
const {
  CHANGE_REASON_CODES, CHANGE_REASON_LABELS, CHANGE_REQUEST_ACTOR_TYPES,
  PROOF_CHANGES_REQUESTED_STATUS, CHANGE_REQUEST_SOURCE_STATUS,
  reasonLabel, changeRequestDedupeKey, proofChangeCount,
  proofChangeProductLabel, validateChangeRequest, requestProofChangesPatch,
  designerNotificationFor, changeRequestAuditEvent,
} = M;

const T1 = '2026-11-10T09:00:00.000Z';
const T2 = '2026-11-11T10:00:00.000Z';
const apply = (prod, patch) => ({ ...prod, ...patch });

// === Vocabulary =============================================================
assert.deepEqual([...CHANGE_REASON_CODES],
  ['text_correction', 'color_change', 'size_change', 'layout_change', 'other'],
  'exactly the five spec’d reason codes');
assert.equal(PROOF_CHANGES_REQUESTED_STATUS, 'proof_changes_requested');
assert.equal(CHANGE_REQUEST_SOURCE_STATUS, 'awaiting_proof_approval');
assert.deepEqual([...CHANGE_REQUEST_ACTOR_TYPES], ['customer', 'staff'], 'customer + staff only');
assert.equal(reasonLabel('text_correction'), 'Text correction');
assert.equal(reasonLabel('color_change'), 'Color change');
assert.equal(reasonLabel('size_change'), 'Size change');
assert.equal(reasonLabel('layout_change'), 'Layout change');
assert.equal(reasonLabel('other'), 'Other');
assert.equal(reasonLabel('COLOR-CHANGE'), 'Color change', 'labels normalize case/hyphens');
assert.equal(reasonLabel('bogus'), '', 'unknown code → blank label');
assert.equal(reasonLabel(''), '');
for (const code of CHANGE_REASON_CODES) {
  assert.equal(CHANGE_REASON_LABELS[code], reasonLabel(code), `label map covers ${code}`);
}

assert.equal(changeRequestDedupeKey('p1', 1), 'pcreq:p1:1');
assert.equal(changeRequestDedupeKey('p1', 3), 'pcreq:p1:3', 'each request ordinal dedupes separately');
assert.equal(changeRequestDedupeKey('', 0), 'pcreq:unknown:1', 'blank ref/zero count fail closed');
assert.equal(proofChangeCount({}), 0);
assert.equal(proofChangeCount({ proof_change_count: '2' }), 2, 'string count coerced');
assert.equal(proofChangeCount({ proof_change_count: -4 }), 0, 'negative clamps to 0');

// === validateChangeRequest ==================================================
const awaiting = { id: 'p1', operational_status: 'awaiting_proof_approval' };
assert.equal(validateChangeRequest(awaiting, { reason_code: 'text_correction' }).ok, true,
  'awaiting_proof_approval + coded reason passes');
assert.equal(validateChangeRequest(awaiting, {}).ok, false, 'missing reason_code fails');
assert.match(validateChangeRequest(awaiting, {}).error, /Pick a reason/);
assert.equal(validateChangeRequest(awaiting, { reason_code: 'bogus' }).ok, false, 'unknown code fails');
assert.match(validateChangeRequest(awaiting, { reason_code: 'bogus' }).error, /not a valid/);
assert.equal(validateChangeRequest(awaiting, { reason_code: 'other' }).ok, false,
  "'other' without text fails");
assert.match(validateChangeRequest(awaiting, { reason_code: 'other' }).error, /Describe the changes/);
assert.equal(validateChangeRequest(awaiting, { reason_code: 'other', reason_text: 'make it pop' }).ok, true,
  "'other' with text passes");
assert.equal(validateChangeRequest(awaiting, { reason_code: 'Color Change', reason_text: 'bluer' }).ok, true,
  'codes normalize');
assert.equal(validateChangeRequest(awaiting, { reason_code: 'text_correction', actor_type: 'staff' }).ok, true,
  'staff may file on the customer’s behalf');
assert.equal(validateChangeRequest(awaiting, { reason_code: 'text_correction', actor_type: 'vendor' }).ok, false,
  'vendor rejected');
assert.equal(validateChangeRequest(awaiting, { reason_code: 'text_correction', actor_type: 'system' }).ok, false,
  'system rejected');

// Wrong-status rejections.
for (const s of ['proof_approved', 'in_production', 'design_review', 'order_review', 'built', 'completed', 'voided']) {
  assert.equal(validateChangeRequest({ operational_status: s }, { reason_code: 'text_correction' }).ok, false,
    `${s} rejected — awaiting_proof_approval only`);
}
assert.match(validateChangeRequest({ operational_status: 'proof_approved' }, { reason_code: 'other', reason_text: 'x' }).error,
  /already approved/, 'post-approval window explicitly closed');
assert.equal(validateChangeRequest({ operational_status: 'proof_changes_requested' }, { reason_code: 'text_correction' }).ok, false,
  'already-requested rejected');
assert.match(validateChangeRequest({ operational_status: 'proof_changes_requested' }, { reason_code: 'text_correction' }).error,
  /already requested/);
assert.equal(validateChangeRequest(null, { reason_code: 'other', reason_text: 'x' }).ok, false, 'null product fails');
assert.equal(validateChangeRequest({ operational_status: 'Awaiting Proof Approval' }, { reason_code: 'text_correction' }).ok,
  true, 'status gate normalizes spaces/case');
assert.equal(validateChangeRequest(awaiting, { reason_code: 'text_correction' }).reason_code, 'text_correction',
  'ok result echoes normalized code');

// === requestProofChangesPatch — shape + companion writes ====================
const product = {
  id: 'prod-9', work_order_id: 'wo-7', description: 'Channel letters',
  operational_status: 'awaiting_proof_approval',
  proof_status: 'awaiting_approval',
  proof_version: 2, proof_approved_version: 1, // stale pointer from the E-01 path
  designer: 'kim@shop.com',
};
const P1 = requestProofChangesPatch(product, {
  reason_code: 'color_change', reason_text: 'use the darker blue',
  actor_id: 'customer@acme.com', now: T1,
});
assert.equal(P1.operational_status, 'proof_changes_requested', 'regresses to the change-requested status');
assert.equal(P1.proof_status, 'revision_requested', 'proof_status flips — closes H-06 follow-ups');
assert.equal(P1.proof_approved_version, 0, 'request invalidates the stale approval pointer');
assert.equal(P1.operational_status_changed_at, T1, 'status-change stamp written');
assert.equal(P1.proof_change_reason_code, 'color_change');
assert.equal(P1.proof_change_reason, 'use the darker blue');
assert.equal(P1.proof_change_requested_at, T1);
assert.equal(P1.proof_change_requested_by, 'customer@acme.com');
assert.equal(P1.proof_change_count, 1, 'first request → count 1');
assert.ok(!('customer_facing_status' in P1), 'stored customer label left to the status-label map');

// Fail-closed: bad input → null (validateChangeRequest owns the error text).
assert.equal(requestProofChangesPatch(product, {}), null, 'missing reason → null');
assert.equal(requestProofChangesPatch(product, { reason_code: 'other' }), null, "'other' sans text → null");
assert.equal(requestProofChangesPatch({ operational_status: 'in_production' }, { reason_code: 'text_correction' }), null,
  'wrong status → null');
assert.equal(requestProofChangesPatch(null, { reason_code: 'text_correction' }), null, 'null product → null');
assert.equal(requestProofChangesPatch(product, { reason_code: 'text_correction', actor_type: 'vendor' }), null,
  'bad actor_type → null');

// Count increments across repeated cycles (re-request after a new proof round).
const afterFirst = apply(product, P1);
const backToAwaiting = apply(afterFirst, {
  operational_status: 'awaiting_proof_approval',
  proof_status: 'awaiting_approval', proof_version: 3,
});
const P2 = requestProofChangesPatch(backToAwaiting, {
  reason_code: 'other', reason_text: 'can we move the tagline up?', now: T2,
});
assert.equal(P2.proof_change_count, 2, 'second request → count 2');
assert.equal(P2.proof_change_reason_code, 'other');
assert.equal(P2.proof_change_requested_at, T2, 'each request re-stamps');
assert.equal(P2.proof_change_requested_by, '', 'blank actor stores blank');
assert.equal(proofChangeCount(apply(backToAwaiting, P2)), 2);

// No-mutation guarantee on frozen input.
const frozen = Object.freeze({ operational_status: 'awaiting_proof_approval', proof_change_count: 1 });
assert.equal(requestProofChangesPatch(frozen, { reason_code: 'layout_change', now: T1 }).proof_change_count, 2);
assert.equal(frozen.proof_change_count, 1, 'input untouched');

// === designerNotificationFor ================================================
const wo = {
  id: 'wo-7', title: 'Acme monument', corbridge_invoice_number: 'INV-1042',
  assigned_to: 'brett@clay.com',
};
const prod = { id: 'prod-9', description: 'Channel letters', designer: 'KIM@shop.com', proof_version: 2 };
const N1 = designerNotificationFor(prod, wo, {
  reason_code: 'color_change', reason_text: 'use the darker blue',
});
assert.equal(N1.audience, 'internal');
assert.equal(N1.type, 'notification');
assert.equal(N1.kind, 'proof_changes_requested');
assert.equal(N1.recipient_email, 'kim@shop.com', 'product.designer wins, lowercased');
assert.equal(N1.title, 'Proof changes requested — Channel letters');
assert.equal(N1.link, '/JobWorkspace?wo=wo-7', 'D-12 workspace link');
assert.equal(N1.entity_type, 'work_order');
assert.equal(N1.entity_id, 'wo-7');
assert.equal(N1.product_id, 'prod-9');
assert.equal(N1.dedupe_key, 'pcreq:prod-9:1', 'pre-patch product → ordinal 1');
assert.match(N1.message, /Channel letters/);
assert.match(N1.message, /v2/, 'message names the proof version');
assert.match(N1.message, /INV-1042/, 'message names the order number');
assert.match(N1.message, /Color change — "use the darker blue"/, 'reason label + quoted text in message');
assert.equal(N1.missing_recipient, false);

// Recipient chain: designer → assigned_to → settings default.
const N2 = designerNotificationFor({ id: 'p2', client_product_name: 'Pylon' }, wo, { reason_code: 'text_correction' });
assert.equal(N2.recipient_email, 'brett@clay.com', 'workOrder.assigned_to second rung');
assert.equal(N2.title, 'Proof changes requested — Pylon');
const N3 = designerNotificationFor({ id: 'p3' }, { id: 'wo-9' }, {
  reason_code: 'size_change', settings: { notifications: { default_designer: 'design@clay.com' } },
});
assert.equal(N3.recipient_email, 'design@clay.com', 'settings.default_designer tail');
assert.equal(N3.title, 'Proof changes requested — Product', 'bare product → generic label');
const N4 = designerNotificationFor({ id: 'p4' }, { id: 'wo-9' }, { reason_code: 'layout_change' });
assert.equal(N4.missing_recipient, true, 'unresolvable recipient flagged');
assert.equal(N4.recipient_email, '');

// Dedupe ordinal: explicit count wins; post-patch product carries stored count.
const N5 = designerNotificationFor({ id: 'prod-9', proof_change_count: 2 }, wo, { reason_code: 'other', reason_text: 'x' });
assert.equal(N5.dedupe_key, 'pcreq:prod-9:2', 'stored count drives the ordinal');
const N6 = designerNotificationFor({ id: 'prod-9' }, wo, { reason_code: 'other', reason_text: 'x', count: 4 });
assert.equal(N6.dedupe_key, 'pcreq:prod-9:4', 'explicit count overrides');
assert.notEqual(N5.dedupe_key, N1.dedupe_key, 'distinct requests never collide');

// Id-less product falls back to wo:index; reason_label arg wins over code.
const N7 = designerNotificationFor({}, wo, { reason_code: 'bogus', reason_label: 'Wording fix', index: 2 });
assert.equal(N7.product_id, 'wo-7:2', 'embedded id fallback');
assert.equal(N7.dedupe_key, 'pcreq:wo-7:2:1');
assert.match(N7.message, /Wording fix/, 'explicit reason_label used');
assert.equal(N7.title, 'Proof changes requested — Product 3', 'index-aware label');

// Fail-closed paths.
assert.equal(designerNotificationFor(prod, null, { reason_code: 'other', reason_text: 'x' }), null, 'no workOrder → null');
assert.equal(designerNotificationFor(prod, {}, { reason_code: 'other', reason_text: 'x' }), null, 'no wo id → null');
assert.equal(designerNotificationFor(null, wo, {}), null, 'no product → null');

// === changeRequestAuditEvent ================================================
const A1 = changeRequestAuditEvent(product, {
  reason_code: 'color_change', reason_text: 'use the darker blue',
  actor_type: 'customer', actor_id: 'customer@acme.com', now: T1,
});
assert.equal(A1.schema_version, 1);
assert.equal(A1.work_order_id, 'wo-7', 'product.work_order_id fallback');
assert.equal(A1.product_id, 'prod-9');
assert.equal(A1.product_label, 'Channel letters');
assert.equal(A1.event_type, 'proof_changes_requested');
assert.equal(A1.actor_type, 'customer');
assert.equal(A1.actor_label, 'customer@acme.com');
assert.equal(A1.from_value, 'awaiting_proof_approval', 'pre-patch status captured');
assert.equal(A1.to_value, 'proof_changes_requested');
assert.equal(A1.note, 'Color change — "use the darker blue"', 'reason lands in note');
assert.equal(A1.occurred_at, T1);
assert.equal(A1.details.field, 'operational_status');
assert.equal(A1.details.reason_code, 'color_change');
assert.equal(A1.details.reason_label, 'Color change');
assert.equal(A1.details.proof_version, 2);

// actor_type clamp + staff pass-through; work_order_id + from_status overrides.
const A2 = changeRequestAuditEvent({ id: 'p2', operational_status: 'proof_changes_requested' }, {
  reason_code: 'text_correction', actor_type: 'staff', actor_id: 'brett',
  work_order_id: 'wo-88', from_status: 'awaiting_proof_approval', now: T2, count: 3,
});
assert.equal(A2.actor_type, 'staff', 'staff actor preserved');
assert.equal(A2.work_order_id, 'wo-88', 'explicit work_order_id wins');
assert.equal(A2.from_value, 'awaiting_proof_approval', 'from_status override pins pre-change value');
assert.equal(A2.details.proof_change_count, 3, 'explicit count echoed');
const A3 = changeRequestAuditEvent({ id: 'p3' }, { reason_code: 'other', reason_text: 'x', actor_type: 'robot' });
assert.equal(A3.actor_type, 'customer', 'odd actor_type clamps to customer default');

// No status gate on audit (post-patch views are legal), but reason still gates.
assert.equal(changeRequestAuditEvent({ operational_status: 'proof_changes_requested' }, { reason_code: 'other', reason_text: 'x' }).event_type,
  'proof_changes_requested', 'post-patch product view is a legal audit source');
assert.equal(changeRequestAuditEvent(product, { reason_code: 'bogus' }), null, 'bad code → null');
assert.equal(changeRequestAuditEvent(product, { reason_code: 'other' }), null, "'other' sans text → null");
assert.equal(changeRequestAuditEvent(null, { reason_code: 'other', reason_text: 'x' }), null, 'null product → null');
assert.equal(changeRequestAuditEvent(product, { reason_code: 'text_correction' }).note, 'Text correction',
  'code-only reason → label-only note');

// === End-to-end: validate → patch → notify → audit =========================
const e2eProduct = {
  id: 'prod-e2e', work_order_id: 'wo-e2e', description: 'Vinyl banner',
  operational_status: 'awaiting_proof_approval', proof_status: 'awaiting_approval',
  proof_version: 1, designer: 'kim@shop.com',
};
const e2eCheck = validateChangeRequest(e2eProduct, { reason_code: 'layout_change', reason_text: 'center the logo', actor_type: 'customer' });
assert.equal(e2eCheck.ok, true);
const e2ePatch = requestProofChangesPatch(e2eProduct, { reason_code: 'layout_change', reason_text: 'center the logo', actor_id: 'customer@acme.com', now: T1 });
const e2eMerged = apply(e2eProduct, e2ePatch);
assert.equal(validateChangeRequest(e2eMerged, { reason_code: 'text_correction' }).ok, false,
  'patched product can no longer re-request (status left the window)');
const e2eNotice = designerNotificationFor(e2eMerged, { id: 'wo-e2e' }, { reason_code: e2ePatch.proof_change_reason_code, reason_text: e2ePatch.proof_change_reason });
assert.equal(e2eNotice.dedupe_key, 'pcreq:prod-e2e:1', 'post-patch product + stored count → same ordinal');
const e2eAudit = changeRequestAuditEvent(e2eMerged, {
  reason_code: 'layout_change', reason_text: 'center the logo',
  actor_type: 'customer', actor_id: 'customer@acme.com', now: T1, from_status: 'awaiting_proof_approval',
});
assert.equal(e2eAudit.from_value, 'awaiting_proof_approval');
assert.equal(e2eAudit.to_value, 'proof_changes_requested');

rmSync(out, { recursive: true, force: true });
console.log('PASS proof-change-request');
