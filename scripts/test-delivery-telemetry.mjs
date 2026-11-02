// H-14 deliveryTelemetryModel — stamp shapes (delivered/failed/skipped/
// queued, error caps), channel resolution against REAL H-01
// buildDeliveryPlan outputs in both modes, idempotent telemetryPatch
// re-stamp semantics, deliveryStats rollup + windowing, and PII redaction.
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const outModel = resolve(here, '.tmp-delivery-telemetry.mjs');
const outAdapter = resolve(here, '.tmp-delivery-adapter-for-telemetry.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/deliveryTelemetryModel.ts')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
});
buildSync({
  entryPoints: [resolve(here, '../base44/shared/delivery.ts')],
  bundle: true, format: 'esm', outfile: outAdapter, logLevel: 'silent',
});
const {
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  DELIVERY_ERROR_MAX,
  REDACTED_ERROR_MAX,
  normalizeDeliveryChannel,
  toDeliveryIso,
  redactTelemetryError,
  deliveryStamp,
  channelFromPlan,
  telemetryPatch,
  deliveryStats,
} = await import(pathToFileURL(outModel).href);
const { buildDeliveryPlan } = await import(pathToFileURL(outAdapter).href);

const NOW = '2026-11-03T12:00:00.000Z';
const NOW2 = '2026-11-03T12:05:00.000Z';
const NOW3 = '2026-11-03T12:10:00.000Z';
const NOTIF = {
  to: 'customer@example.com',
  subject: 'Your estimate is ready',
  body: 'Estimate E-1042 totals $1,250.00.',
  kind: 'estimate_sent',
  entity_type: 'estimate',
  entity_id: 'est-1',
  deep_link: '/Estimates/est-1',
};

// --- Vocabulary ---------------------------------------------------------------
assert.deepEqual([...DELIVERY_CHANNELS], ['email', 'smartsheet', 'internal'],
  'channel vocabulary mirrors delivery.ts');
assert.deepEqual([...DELIVERY_STATUSES], ['delivered', 'failed', 'skipped', 'queued']);
assert.equal(DELIVERY_ERROR_MAX, 500);
assert.equal(REDACTED_ERROR_MAX, 200);
assert.equal(normalizeDeliveryChannel('EMAIL'), 'email', 'case-insensitive');
assert.equal(normalizeDeliveryChannel('fax'), '', 'unknown lane → empty');
assert.equal(normalizeDeliveryChannel(undefined), '');

// --- deliveryStamp shapes -----------------------------------------------------
{
  const s = deliveryStamp('email', { now: NOW, delivered: true });
  assert.deepEqual(s, {
    delivery_channel: 'email',
    delivery_attempted_at: NOW,
    delivery_status: 'delivered',
    delivered_at: NOW,
  }, 'delivered stamp carries delivered_at + no error key');
}
{
  const s = deliveryStamp('smartsheet', { now: NOW, delivered: false, error: 'SMTP refused' });
  assert.equal(s.delivery_status, 'failed');
  assert.equal(s.delivery_error, 'SMTP refused');
  assert.ok(!('delivered_at' in s), 'failed stamp has no delivered_at');
}
{
  const s = deliveryStamp('internal', { now: NOW, delivered: 'skipped' });
  assert.equal(s.delivery_status, 'skipped');
  assert.ok(!('delivered_at' in s));
  const q = deliveryStamp('internal', { now: NOW, delivered: 'queued' });
  assert.equal(q.delivery_status, 'queued');
  assert.equal(q.delivery_attempted_at, NOW, 'queued still stamps attempted_at');
  const d = deliveryStamp('internal', { now: NOW, status: 'delivered' });
  assert.equal(d.delivery_status, 'delivered', 'status alias resolves');
  assert.equal(d.delivered_at, NOW);
}
{
  // Fail-closed: garbage/false outcomes never claim delivery.
  assert.equal(deliveryStamp('email', { now: NOW, delivered: 'yes' }).delivery_status, 'failed');
  assert.equal(deliveryStamp('email', { now: NOW, delivered: 1 }).delivery_status, 'failed');
  assert.equal(deliveryStamp('email', { now: NOW }).delivery_status, 'failed');
}
{
  // Channel normalization inside the stamp: unknown/empty → 'internal' floor.
  assert.equal(deliveryStamp('fax', { now: NOW, delivered: true }).delivery_channel, 'internal');
  assert.equal(deliveryStamp('', { now: NOW, delivered: true }).delivery_channel, 'internal');
}
{
  // Error is PII-stripped then capped at 500 inside the stamp. (Spaced
  // words — an unbroken 600-char run redacts as a token, asserted below.)
  const s = deliveryStamp('email', { now: NOW, delivered: false, error: 'error '.repeat(100) });
  assert.equal(s.delivery_error.length, 500, 'error truncated to 500');
  const dirty = 'bounce for jane@shop.com see https://t.io/x';
  const s2 = deliveryStamp('email', { now: NOW, delivered: false, error: dirty });
  assert.ok(!s2.delivery_error.includes('jane@shop.com'), 'stamp error is PII-stripped');
  assert.ok(!s2.delivery_error.includes('t.io'));
}
{
  // delivered_at override (provider receipt time) + now normalization.
  const s = deliveryStamp('email', {
    now: NOW, delivered: true, delivered_at: '2026-11-03T12:00:09.000Z',
  });
  assert.equal(s.delivered_at, '2026-11-03T12:00:09.000Z');
  assert.equal(
    deliveryStamp('email', { now: Date.UTC(2026, 10, 3), delivered: true }).delivery_attempted_at,
    '2026-11-03T00:00:00.000Z',
    'ms-number clock → ISO',
  );
  assert.equal(
    deliveryStamp('email', { now: new Date(NOW), delivered: true }).delivered_at,
    NOW,
    'Date clock → ISO',
  );
  assert.equal(toDeliveryIso(NOW), NOW, 'string clock passes through');
  assert.ok(toDeliveryIso(undefined).length > 0, 'empty clock → now');
}

// --- channelFromPlan against real buildDeliveryPlan results --------------------
{
  const emailPlan = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true } },
    notification: NOTIF,
  });
  assert.equal(channelFromPlan(emailPlan), 'email', 'email flag on → email lane');
  const smPlan = buildDeliveryPlan({ settings: {}, notification: NOTIF });
  assert.equal(channelFromPlan(smPlan), 'smartsheet', 'default → smartsheet lane');
  assert.equal(channelFromPlan({}), 'internal');
  assert.equal(channelFromPlan(null), 'internal');
  assert.equal(channelFromPlan(undefined), 'internal');
  assert.equal(channelFromPlan({ channels: ['internal'] }), 'internal');
  assert.equal(channelFromPlan({ channels: ['bogus', 'smartsheet', 'internal'] }), 'smartsheet',
    'first known external lane in channels[] wins');
  assert.equal(channelFromPlan({ channel: 'bogus' }), 'internal', 'bogus channel → floor');
  assert.equal(channelFromPlan({ email: { to: 'a@b.com' } }), 'email', 'payload sniffing');
  assert.equal(channelFromPlan({ smartsheetRow: { summary: 'x' } }), 'smartsheet');
}

// --- telemetryPatch — merge + idempotent re-stamp ------------------------------
{
  const notif = { id: 'n1', recipient_email: 'a@b.com', category: 'system', title: 't' };
  const smPlan = buildDeliveryPlan({ settings: {}, notification: NOTIF });
  const p1 = telemetryPatch(notif, { plan: smPlan, delivered: true, now: NOW });
  assert.equal(p1.delivery_channel, 'smartsheet', 'plan resolves the stamped lane');
  assert.equal(p1.delivery_status, 'delivered');
  assert.equal(p1.delivered_at, NOW);
  assert.equal(p1.delivery_attempted_at, NOW);
  assert.equal(p1.last_delivery_at, NOW);
  assert.equal(p1.delivery_attempts, 1, 'first stamp → attempts 1');
  assert.ok(!('recipient_email' in p1), 'patch is telemetry fields only');

  const row1 = { ...notif, ...p1 };
  const p2 = telemetryPatch(row1, { plan: smPlan, delivered: false, error: 'rate limit', now: NOW2 });
  assert.equal(p2.delivery_attempts, 2, 're-stamp increments attempts');
  assert.equal(p2.last_delivery_at, NOW2);
  assert.equal(p2.delivery_status, 'failed');
  assert.equal(p2.delivery_error, 'rate limit');
  assert.ok(!('delivered_at' in p2), 'failed re-stamp leaves delivered_at out of the patch');
  const row2 = { ...row1, ...p2 };
  assert.equal(row2.delivery_attempts, 2, 're-applying patch is stable (idempotent write)');
  assert.equal(row2.delivered_at, NOW, 'prior delivered_at survives as last-success history');

  const p3 = telemetryPatch(row2, { channel: 'email', delivered: true, now: NOW3 });
  assert.equal(p3.delivery_channel, 'email', 'explicit channel beats plan/history');
  assert.equal(p3.delivery_attempts, 3);

  // Channel precedence: no channel info → row's existing channel kept.
  const p4 = telemetryPatch(row2, { delivered: true, now: NOW3 });
  assert.equal(p4.delivery_channel, 'smartsheet');
  // Fresh row, no info at all → 'internal' floor.
  assert.equal(telemetryPatch(notif, { delivered: true, now: NOW }).delivery_channel, 'internal');
  // Error alias + status alias tolerated.
  assert.equal(telemetryPatch(notif, { status: 'skipped', now: NOW }).delivery_status, 'skipped');
  assert.equal(telemetryPatch(notif, { delivered: false, err: 'boom', now: NOW }).delivery_error, 'boom');
  // Non-finite prior attempts still bump cleanly.
  assert.equal(
    telemetryPatch({ delivery_attempts: 'oops' }, { delivered: true, now: NOW }).delivery_attempts,
    1,
  );
  // Patch error is redacted before it lands.
  const p5 = telemetryPatch(notif, {
    channel: 'email', delivered: false, error: 'user bob@shop.com bounced', now: NOW,
  });
  assert.equal(p5.delivery_error, 'user [email] bounced');
}

// --- redactTelemetryError -------------------------------------------------------
{
  const dirty =
    'SMTP 550 for customer@example.com via https://tracker.io/px?id=abc ' +
    'api_key=sk_live_123456789 token: "secretval" Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cE';
  const r = redactTelemetryError(dirty);
  assert.ok(!r.includes('customer@example.com'), 'email stripped');
  assert.ok(!r.includes('tracker.io'), 'URL stripped');
  assert.ok(!r.includes('sk_live_123456789'), 'api key value stripped');
  assert.ok(!r.includes('secretval'), 'token value stripped');
  assert.ok(!r.includes('SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJVadQssw5cE'), 'JWT stripped');
  assert.ok(r.includes('[email]'));
  assert.ok(r.includes('[url]'));
  assert.ok(r.includes('api_key=[redacted]'));
  assert.ok(r.includes('token: [redacted]'));
  assert.equal(redactTelemetryError('word '.repeat(60)).length, 200, 'keeps first 200 chars');
  assert.equal(redactTelemetryError(''), '');
  assert.equal(redactTelemetryError(null), '');
  assert.equal(redactTelemetryError(new Error('boom a@b.com')), 'boom [email]',
    'Error objects surface .message');
  assert.equal(redactTelemetryError(42), '42');
  assert.equal(redactTelemetryError('x'.repeat(600)), '[token]',
    'unbroken 32+ char run redacts as a token');
}

// --- deliveryStats rollup -------------------------------------------------------
{
  const rows = [
    { id: 'a', delivery_channel: 'email', delivery_status: 'delivered', delivery_attempted_at: '2026-11-03T10:00:00Z', delivered_at: '2026-11-03T10:00:01Z' },
    { id: 'b', delivery_channel: 'email', delivery_status: 'failed', delivery_attempted_at: '2026-11-03T11:00:00Z', delivery_error: 'bounce' },
    { id: 'c', delivery_channel: 'email', delivery_status: 'failed', delivery_attempted_at: '2026-11-03T12:00:00Z', delivery_error: 'bounce' },
    { id: 'd', delivery_channel: 'smartsheet', delivery_status: 'delivered', delivery_attempted_at: '2026-11-03T13:00:00Z' },
    { id: 'e', delivery_channel: 'smartsheet', delivery_status: 'skipped', delivery_attempted_at: '2026-11-03T14:00:00Z' },
    { id: 'f', delivery_channel: 'internal', delivery_status: 'queued', delivery_attempted_at: '2026-11-03T15:00:00Z' },
    { id: 'g', title: 'unstamped row — ignored' },
    'garbage row',
  ];
  const stats = deliveryStats(rows, {});
  assert.equal(stats.by_channel.email.sent, 3);
  assert.equal(stats.by_channel.email.delivered, 1);
  assert.equal(stats.by_channel.email.failed, 2);
  assert.equal(stats.by_channel.smartsheet.sent, 2);
  assert.equal(stats.by_channel.smartsheet.delivered, 1);
  assert.equal(stats.by_channel.smartsheet.skipped, 1);
  assert.equal(stats.by_channel.internal.sent, 1, 'queued counts toward sent');
  assert.equal(stats.by_channel.internal.delivered, 0);
  assert.equal(stats.sent, 6);
  assert.equal(stats.delivered, 2);
  assert.equal(stats.delivery_rate, Math.round((2 / 6) * 10000) / 10000);
  assert.deepEqual(stats.error_top, [{ error: 'bounce', count: 2 }]);

  // Window filter — anchors on delivery_attempted_at.
  const w = deliveryStats(rows, { from: '2026-11-03T11:30:00Z', to: '2026-11-03T14:30:00Z' });
  assert.equal(w.sent, 3, 'only c/d/e fall in window');
  assert.equal(w.by_channel.email.failed, 1);
  assert.equal(w.by_channel.smartsheet.delivered, 1);
  // Date-only `to` covers the whole day.
  const w2 = deliveryStats(rows, { from: '2026-11-03', to: '2026-11-03' });
  assert.equal(w2.sent, 6);
  // Out-of-window → zeros; unparseable-window rows drop when bounds exist.
  const w3 = deliveryStats(rows, { from: '2026-12-01' });
  assert.equal(w3.sent, 0);
  assert.equal(w3.delivery_rate, 0);
  assert.deepEqual(w3.error_top, []);

  // Empty + unstamped inputs.
  const st0 = deliveryStats([], {});
  assert.equal(st0.sent, 0);
  assert.deepEqual(Object.keys(st0.by_channel), ['email', 'smartsheet', 'internal'],
    'all known channels present zero-filled');
  const stU = deliveryStats([{ id: 'x', title: 'hi' }, { id: 'y', delivery_channel: 'email' }], {});
  assert.equal(stU.sent, 0, 'channel without a stamp is not sent');

  // error_top ordering: count-desc then alpha; warnings on delivered rows
  // do not enter the error rollup.
  const tie = [
    { delivery_channel: 'email', delivery_status: 'failed', delivery_attempted_at: NOW, delivery_error: 'zeta' },
    { delivery_channel: 'email', delivery_status: 'failed', delivery_attempted_at: NOW, delivery_error: 'alpha' },
    { delivery_channel: 'email', delivery_status: 'delivered', delivery_attempted_at: NOW, delivery_error: 'warn' },
  ];
  assert.deepEqual(deliveryStats(tie, {}).error_top, [
    { error: 'alpha', count: 1 },
    { error: 'zeta', count: 1 },
  ]);

  // Status-less stamped rows: delivered_at infers 'delivered'; bare stamps
  // count sent without inventing failures.
  const infer = [
    { delivery_channel: 'smartsheet', delivery_attempted_at: NOW, delivered_at: NOW },
    { delivery_channel: 'email', delivery_attempts: 2 },
  ];
  const si = deliveryStats(infer, {});
  assert.equal(si.by_channel.smartsheet.delivered, 1);
  assert.equal(si.by_channel.email.sent, 1);
  assert.equal(si.by_channel.email.failed, 0);
}

// --- End-to-end: adapter plan → patch → stats, both modes -----------------------
{
  const notif = { id: 'e2e', recipient_email: 'staff@ccs.com', category: 'system', title: 'x' };
  for (const [settings, lane] of [
    [{}, 'smartsheet'],
    [{ emailDelivery: { enabled: true } }, 'email'],
  ]) {
    const plan = buildDeliveryPlan({ settings, notification: NOTIF });
    const patch = telemetryPatch(notif, { plan, delivered: true, now: NOW });
    assert.equal(patch.delivery_channel, lane, `${lane} mode stamps its lane`);
    const row = { ...notif, ...patch };
    const stats = deliveryStats([row], {});
    assert.equal(stats.by_channel[lane].delivered, 1, `${lane} row rolls up delivered`);
    assert.equal(stats.delivery_rate, 1);
  }
}

rmSync(outModel, { force: true });
rmSync(outAdapter, { force: true });
console.log('PASS delivery-telemetry');
