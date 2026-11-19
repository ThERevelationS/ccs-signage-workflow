// H-01 deliveryChannel adapter — flag on/off matrix incl. legacy aliases,
// plan shapes per channel, internal row always present, missing settings and
// edge-case notifications (empty `to`, missing deep_link).
import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-delivery-adapter.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/delivery.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  DELIVERY_CHANNELS,
  DELIVERY_SETTING_PATHS,
  resolveDeliveryChannel,
  resolveEmailDeliveryBlock,
  buildDeliveryPlan,
} = await import(pathToFileURL(out).href);

const NOTIF = {
  to: 'Customer@Example.com',
  subject: 'Your estimate is ready',
  body: 'Estimate E-1042 totals $1,250.00.',
  kind: 'estimate_sent',
  entity_type: 'estimate',
  entity_id: 'est-1',
  deep_link: '/Estimates/est-1',
};

// --- Vocabulary ---------------------------------------------------------------
assert.deepEqual(DELIVERY_CHANNELS, ['email', 'smartsheet', 'internal']);
for (const path of [
  'emailDelivery.enabled',
  'email_delivery_enabled',
  'delivery.emailEnabled',
]) {
  assert.ok(DELIVERY_SETTING_PATHS.includes(path), `setting path documented: ${path}`);
}
assert.equal(
  DELIVERY_SETTING_PATHS[0],
  'emailDelivery.enabled',
  'canonical A-21 key resolves first',
);

// --- Flag matrix: canonical key ----------------------------------------------
assert.equal(resolveDeliveryChannel({ emailDelivery: { enabled: true } }), 'email');
assert.equal(resolveDeliveryChannel({ emailDelivery: { enabled: false } }), 'smartsheet');
assert.equal(resolveDeliveryChannel({ emailDelivery: {} }), 'smartsheet');
assert.equal(resolveDeliveryChannel({ emailDelivery: null }), 'smartsheet');
assert.equal(resolveDeliveryChannel(undefined), 'smartsheet', 'missing settings → smartsheet');
assert.equal(resolveDeliveryChannel(null), 'smartsheet');
assert.equal(resolveDeliveryChannel({}), 'smartsheet');
assert.equal(
  resolveDeliveryChannel({ emailDelivery: { enabled: 'true' } }),
  'smartsheet',
  'string "true" is not the boolean switch — fail closed',
);
assert.equal(
  resolveDeliveryChannel({ emailDelivery: { enabled: 1 } }),
  'smartsheet',
  'numeric 1 is not the boolean switch',
);

// --- Flag matrix: legacy aliases ----------------------------------------------
assert.equal(resolveDeliveryChannel({ email_delivery_enabled: true }), 'email');
assert.equal(resolveDeliveryChannel({ email_delivery_enabled: false }), 'smartsheet');
assert.equal(resolveDeliveryChannel({ delivery: { emailEnabled: true } }), 'email');
assert.equal(resolveDeliveryChannel({ delivery: { emailEnabled: false } }), 'smartsheet');
// KV-blob locations (raw GlobalSettings row shape).
assert.equal(
  resolveDeliveryChannel({ setting_key: 'x', setting_value: { emailDelivery: { enabled: true } } }),
  'email',
  'setting_value.emailDelivery.enabled resolves',
);
assert.equal(
  resolveDeliveryChannel({ setting_value: { email_delivery_enabled: true } }),
  'email',
  'flat alias inside setting_value resolves',
);
assert.equal(
  resolveDeliveryChannel({ setting_value: { delivery: { emailEnabled: true } } }),
  'email',
  'nested alias inside setting_value resolves',
);
// Precedence: first defined path decides — canonical explicit-off beats a stale alias.
assert.equal(
  resolveDeliveryChannel({ emailDelivery: { enabled: false }, email_delivery_enabled: true }),
  'smartsheet',
  'canonical false overrides legacy true (fail closed)',
);
assert.equal(
  resolveDeliveryChannel({ emailDelivery: { enabled: true }, email_delivery_enabled: false }),
  'email',
  'canonical true overrides legacy false',
);

// --- resolveEmailDeliveryBlock -------------------------------------------------
assert.deepEqual(
  resolveEmailDeliveryBlock({ emailDelivery: { enabled: true, default_from: 'sales@x.com' } }),
  { enabled: true, default_from: 'sales@x.com' },
);
assert.deepEqual(
  resolveEmailDeliveryBlock({ setting_value: { emailDelivery: { default_from: 'kv@x.com' } } }),
  { default_from: 'kv@x.com' },
  'KV-blob block resolves',
);
assert.deepEqual(resolveEmailDeliveryBlock({}), {});
assert.deepEqual(resolveEmailDeliveryBlock({ emailDelivery: 'oops' }), {}, 'non-object → {}');

// --- Plan shape: smartsheet lane (default) --------------------------------------
{
  const plan = buildDeliveryPlan({ settings: {}, notification: NOTIF });
  assert.deepEqual(plan.channels, ['smartsheet', 'internal']);
  assert.equal(plan.channel, 'smartsheet');
  assert.equal(plan.alwaysInternal, true);
  assert.equal(plan.email, undefined, 'no email payload on the smartsheet lane');
  assert.deepEqual(plan.smartsheetRow, {
    type: 'notification',
    kind: 'estimate_sent',
    summary: 'Your estimate is ready',
    detail: 'Estimate E-1042 totals $1,250.00.',
  });
  assert.deepEqual(plan.internalRow, {
    type: 'notification',
    kind: 'estimate_sent',
    title: 'Your estimate is ready',
    message: 'Estimate E-1042 totals $1,250.00.',
    link: '/Estimates/est-1',
    recipient_email: 'customer@example.com',
  }, 'internal row present on the smartsheet lane, recipient lowercased');
}

// --- Plan shape: email lane ------------------------------------------------------
{
  const plan = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true, default_from: 'sales@ccs.com' } },
    notification: NOTIF,
  });
  assert.deepEqual(plan.channels, ['email', 'internal']);
  assert.equal(plan.channel, 'email');
  assert.equal(plan.alwaysInternal, true);
  assert.equal(plan.smartsheetRow, undefined, 'no smartsheet row on the email lane');
  assert.deepEqual(plan.email, {
    to: 'Customer@Example.com',
    subject: 'Your estimate is ready',
    body: 'Estimate E-1042 totals $1,250.00.',
    from: 'sales@ccs.com',
  }, 'email payload is the Core.SendEmail shape incl. default_from');
  assert.ok(plan.internalRow, 'internal row still present on the email lane');
  assert.equal(plan.internalRow.recipient_email, 'customer@example.com');
}
{
  // `from` precedence: notification.from > context.from > settings default_from.
  const plan = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true, default_from: 'settings@x.com' } },
    notification: { ...NOTIF, from: 'notif@x.com' },
    context: { from: 'ctx@x.com' },
  });
  assert.equal(plan.email.from, 'notif@x.com');
  const plan2 = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true, default_from: 'settings@x.com' } },
    notification: NOTIF,
    context: { from: 'ctx@x.com' },
  });
  assert.equal(plan2.email.from, 'ctx@x.com');
  const plan3 = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true } },
    notification: NOTIF,
  });
  assert.equal(plan3.email.from, undefined, 'no from → key omitted');
}

// --- Linked ids on the smartsheet row ---------------------------------------------
{
  const plan = buildDeliveryPlan({
    settings: {},
    notification: NOTIF,
    context: { customer_id: 'cust-9', work_order_id: 'wo-7' },
  });
  assert.equal(plan.smartsheetRow.customer_id, 'cust-9');
  assert.equal(plan.smartsheetRow.work_order_id, 'wo-7');
}
{
  // entity_type/entity_id on the notification derive the link columns.
  const plan = buildDeliveryPlan({
    settings: {},
    notification: { ...NOTIF, entity_type: 'customer', entity_id: 'cust-5' },
  });
  assert.equal(plan.smartsheetRow.customer_id, 'cust-5');
  const plan2 = buildDeliveryPlan({
    settings: {},
    notification: { ...NOTIF, entity_type: 'work_order', entity_id: 'wo-5' },
  });
  assert.equal(plan2.smartsheetRow.work_order_id, 'wo-5');
}
{
  // Context ids beat entity-derived ids; unrelated entity types link nothing.
  const plan = buildDeliveryPlan({
    settings: {},
    notification: { ...NOTIF, entity_type: 'invoice', entity_id: 'inv-3' },
  });
  assert.equal(plan.smartsheetRow.customer_id, undefined);
  assert.equal(plan.smartsheetRow.work_order_id, undefined);
}

// --- Optional extras --------------------------------------------------------------
{
  const plan = buildDeliveryPlan({
    settings: {},
    notification: { ...NOTIF, severity: 'critical', dedupe_key: 'est-1:sent' },
  });
  assert.equal(plan.internalRow.severity, 'critical');
  assert.equal(plan.internalRow.dedupe_key, 'est-1:sent');
  const plain = buildDeliveryPlan({ settings: {}, notification: NOTIF });
  assert.equal(plain.internalRow.severity, undefined, 'extras omitted when absent');
  assert.equal(plain.internalRow.dedupe_key, undefined);
}

// --- Edge cases -------------------------------------------------------------------
{
  // Empty `to` — plan still builds; recipient stays blank for the writer to reject.
  const plan = buildDeliveryPlan({ settings: {}, notification: { ...NOTIF, to: '' } });
  assert.equal(plan.internalRow.recipient_email, '');
  assert.equal(plan.alwaysInternal, true);
}
{
  // Missing deep_link — internal link is ''.
  const n = { ...NOTIF };
  delete n.deep_link;
  const plan = buildDeliveryPlan({ settings: {}, notification: n });
  assert.equal(plan.internalRow.link, '');
}
{
  // Missing kind → 'system'; missing subject/body → ''.
  const plan = buildDeliveryPlan({
    settings: {},
    notification: { to: 'a@b.com' },
  });
  assert.equal(plan.internalRow.kind, 'system');
  assert.equal(plan.internalRow.title, '');
  assert.equal(plan.internalRow.message, '');
  assert.equal(plan.smartsheetRow.summary, '');
}
{
  // Missing settings + missing notification → still a valid smartsheet plan.
  const plan = buildDeliveryPlan({});
  assert.deepEqual(plan.channels, ['smartsheet', 'internal']);
  assert.ok(plan.internalRow && plan.smartsheetRow);
}
{
  // deepLink camelCase tolerated; cc/reply_to pass through on the email lane.
  const plan = buildDeliveryPlan({
    settings: { emailDelivery: { enabled: true } },
    notification: { ...NOTIF, deep_link: undefined, deepLink: '/x', cc: ['b@x.com'], reply_to: 'r@x.com' },
  });
  assert.equal(plan.internalRow.link, '/x');
  assert.deepEqual(plan.email.cc, ['b@x.com']);
  assert.equal(plan.email.reply_to, 'r@x.com');
}

rmSync(out, { force: true });
console.log('PASS delivery-adapter');
