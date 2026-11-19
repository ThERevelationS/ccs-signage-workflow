import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-portal-payment.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/portalPaymentModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  PORTAL_SOURCE_VALUE, RECORDED_VIA_PORTAL, PORTAL_EVENT_LABEL, STAFF_EVENT_LABEL,
  PORTAL_SOURCE_CLASSES, SOURCE_FILTER_OPTIONS,
  portalSourcePatch, stampPortalSource,
  paymentSourceClass, isPortalPayment,
  registerFilterExtension, portalEventLabel, paymentDedupeContext,
} = await import(pathToFileURL(out).href);

// ── Constants ────────────────────────────────────────────────────────────
assert.equal(PORTAL_SOURCE_VALUE, 'customer_portal');
assert.equal(RECORDED_VIA_PORTAL, 'portal');
assert.equal(PORTAL_EVENT_LABEL, 'Payment added from Customer Portal');
assert.deepEqual([...PORTAL_SOURCE_CLASSES], ['portal', 'possible_portal', 'staff']);
assert.deepEqual([...SOURCE_FILTER_OPTIONS], ['all', 'portal', 'staff']);

// ── portalSourcePatch ────────────────────────────────────────────────────
// Contracted stored-field set: the four keys are always present.
{
  const p = portalSourcePatch({ link_kind: 'invoice', actor_label: 'Acme Signs portal' });
  assert.equal(p.portal_source, 'customer_portal');
  assert.equal(p.portal_link_kind, 'invoice');
  assert.equal(p.portal_actor, 'Acme Signs portal');
  assert.equal(p.recorded_via, 'portal');
  assert.ok(!('portal_recorded_at' in p), 'no timestamp without now');
}
// Missing args keep the shape stable with empty strings.
{
  const p = portalSourcePatch();
  assert.deepEqual(Object.keys(p).sort(), ['portal_actor', 'portal_link_kind', 'portal_source', 'recorded_via']);
  assert.equal(p.portal_link_kind, '');
  assert.equal(p.portal_actor, '');
}
// `now` adds an ISO portal_recorded_at (Date | ISO | epoch accepted).
{
  const p = portalSourcePatch({ link_kind: 'customer', now: '2026-11-02T14:30:00Z' });
  assert.equal(p.portal_recorded_at, '2026-11-02T14:30:00.000Z');
  assert.equal(portalSourcePatch({ now: new Date('2026-11-02T14:30:00Z') }).portal_recorded_at, '2026-11-02T14:30:00.000Z');
  assert.ok(!('portal_recorded_at' in portalSourcePatch({ now: 'not-a-date' })), 'unparseable now is dropped');
}

// ── stampPortalSource ────────────────────────────────────────────────────
// Minimal stamp adds only portal_source; the payload is never mutated.
{
  const payload = { action: 'record_payment', invoice_id: 'inv-1', amount: 120, method: 'card' };
  const stamped = stampPortalSource(payload);
  assert.equal(stamped.portal_source, 'customer_portal');
  assert.equal(stamped.action, 'record_payment');
  assert.ok(!('portal_source' in payload), 'input not mutated');
  assert.ok(!('recorded_via' in stamped), 'minimal stamp stays minimal');
}
// Full stamp merges the stored-field set over the payload.
{
  const stamped = stampPortalSource(
    { invoice_id: 'inv-1', amount: 50, method: 'ach', created_by: 'svc' },
    { link_kind: 'invoice', actor_label: 'Bayside Marina', now: '2026-11-02T09:00:00Z' },
  );
  assert.equal(stamped.portal_source, 'customer_portal');
  assert.equal(stamped.portal_link_kind, 'invoice');
  assert.equal(stamped.portal_actor, 'Bayside Marina');
  assert.equal(stamped.recorded_via, 'portal');
  assert.equal(stamped.portal_recorded_at, '2026-11-02T09:00:00.000Z');
  assert.equal(stamped.amount, 50, 'payload fields preserved');
}
// Round-trip: a Payment row built from the stamped payload classifies portal.
{
  const payment = { id: 'p1', invoice_id: 'inv-1', amount: 50, method: 'ach', status: 'recorded', ...stampPortalSource({}, { link_kind: 'customer' }) };
  assert.equal(isPortalPayment(payment), true, 'stamped row detects as portal');
  assert.equal(paymentSourceClass(payment), 'portal');
}

// ── paymentSourceClass / isPortalPayment — explicit flag wins ────────────
// The A-15 example value and the canonical value both classify 'portal'.
assert.equal(paymentSourceClass({ portal_source: 'customer_portal' }), 'portal');
assert.equal(paymentSourceClass({ portal_source: 'added from Customer Portal' }), 'portal');
assert.equal(isPortalPayment({ portal_source: 'added from Customer Portal' }), true);
// Explicit staff sentinel beats every heuristic — precedence both directions.
{
  const row = { portal_source: 'staff', recorded_via: 'portal', portal_link_id: 'lnk-9', created_by: 'customer_portal' };
  assert.equal(paymentSourceClass(row), 'staff', 'explicit staff flag wins over heuristics');
  assert.equal(isPortalPayment(row), false);
}

// ── Heuristics → possible_portal ─────────────────────────────────────────
assert.equal(paymentSourceClass({ recorded_via: 'portal' }), 'possible_portal');
assert.equal(paymentSourceClass({ recorded_via: 'customer_portal' }), 'possible_portal');
assert.equal(paymentSourceClass({ portal_link_kind: 'invoice' }), 'possible_portal');
assert.equal(paymentSourceClass({ portal_link_id: 'lnk-1' }), 'possible_portal');
assert.equal(paymentSourceClass({ portal_actor: 'Acme portal' }), 'possible_portal');
assert.equal(paymentSourceClass({ created_by: 'customer_portal' }), 'possible_portal', 'actor chain');
assert.equal(paymentSourceClass({ recorded_by_name: 'Customer Portal' }), 'possible_portal');
assert.equal(paymentSourceClass({ source: 'portal' }), 'possible_portal');
assert.equal(paymentSourceClass({ from_portal: true }), 'possible_portal', 'boolean marker');
assert.equal(paymentSourceClass({ notes: 'Customer paid via the portal link' }), 'possible_portal', 'free-text marker');
assert.equal(isPortalPayment({ recorded_via: 'portal' }), true, 'heuristic rows count for the register bucket');

// ── Staff rows ───────────────────────────────────────────────────────────
assert.equal(paymentSourceClass({ created_by: 'ar@ccssigns.com', method: 'check' }), 'staff');
assert.equal(paymentSourceClass({}), 'staff');
assert.equal(paymentSourceClass(null), 'staff');
assert.equal(isPortalPayment({ created_by: 'ar@ccssigns.com', notes: 'phoned in a check' }), false);
assert.equal(isPortalPayment({ notes: 'sent from portaloo site office' }), false, 'bare substring without portal phrase stays staff');

// ── registerFilterExtension ──────────────────────────────────────────────
{
  const spec = registerFilterExtension();
  assert.equal(spec.key, 'source');
  assert.deepEqual([...spec.options], ['all', 'portal', 'staff']);
  assert.equal(spec.default, 'all');
  const portalRow = { id: 'p1', portal_source: 'customer_portal' };
  const possibleRow = { id: 'p2', recorded_via: 'portal' };
  const staffRow = { id: 'p3', created_by: 'ar@ccssigns.com' };
  assert.equal(spec.match(portalRow, 'portal'), true);
  assert.equal(spec.match(possibleRow, 'portal'), true, 'portal bucket keeps possible rows');
  assert.equal(spec.match(staffRow, 'portal'), false);
  assert.equal(spec.match(staffRow, 'staff'), true);
  assert.equal(spec.match(portalRow, 'staff'), false, 'staff bucket is the complement');
  assert.equal(spec.match(staffRow, 'all'), true);
  assert.equal(spec.match(portalRow, ''), true, 'blank = all');
  assert.equal(spec.match(staffRow, 'whatever'), true, 'unknown options fail open');
}

// ── portalEventLabel ─────────────────────────────────────────────────────
assert.equal(portalEventLabel({ portal_source: 'customer_portal' }), 'Payment added from Customer Portal');
assert.equal(portalEventLabel({ recorded_via: 'portal' }), 'Payment added from Customer Portal', 'possible rows share the portal label');
assert.equal(portalEventLabel({ created_by: 'ar@ccssigns.com' }), 'Payment recorded');
assert.equal(portalEventLabel(null), STAFF_EVENT_LABEL);

// ── paymentDedupeContext ─────────────────────────────────────────────────
{
  const ctx = paymentDedupeContext({
    id: 'pay-77', invoice_id: 'inv-9', customer_id: 'c-2',
    creation_request_key: 'portal-pay:inv-9:abc', portal_source: 'customer_portal',
    portal_link_kind: 'invoice', portal_actor: 'Acme', recorded_via: 'portal',
    created_by: 'customer_portal', method: 'card', amount: 285.7,
    paid_date: '2026-11-02', status: 'recorded',
  });
  assert.equal(ctx.payment_id, 'pay-77');
  assert.equal(ctx.source_class, 'portal');
  assert.equal(ctx.dedupe_key, 'portal-pay:inv-9:abc', 'receipt key wins');
  assert.ok(ctx.matched_fields.includes('portal_source'));
  assert.ok(ctx.matched_fields.includes('recorded_via'));
  assert.ok(ctx.matched_fields.includes('portal_link_kind'));
  assert.ok(ctx.matched_fields.includes('created_by'), 'actor chain hit recorded');
}
// Fallback fingerprint: no receipt key → stable invoice+amount+method+date key.
{
  const a = paymentDedupeContext({ invoice_id: 'inv-1', amount: 100, method: 'card', paid_date: '2026-11-02' });
  const b = paymentDedupeContext({ invoice_id: 'inv-1', amount: 100, method: 'card', paid_date: '2026-11-02' });
  const c = paymentDedupeContext({ invoice_id: 'inv-1', amount: 200, method: 'card', paid_date: '2026-11-02' });
  assert.equal(a.dedupe_key, 'payment:inv-1:100:card:2026-11-02');
  assert.equal(a.dedupe_key, b.dedupe_key, 'same logical payment dedupes');
  assert.notEqual(a.dedupe_key, c.dedupe_key, 'different amount differs');
  assert.equal(a.source_class, 'staff');
  assert.equal(a.matched_fields.length, 0);
  assert.ok(a.dedupe_key.length <= 256);
}
// Null input is safe and classified staff.
{
  const ctx = paymentDedupeContext(null);
  assert.equal(ctx.source_class, 'staff');
  assert.equal(ctx.dedupe_key, 'payment::0:other:');
}

rmSync(out, { force: true });
console.log('PASS portal-payment');
