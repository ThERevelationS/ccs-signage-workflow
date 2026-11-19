import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-ready-triggers.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/readyTriggerModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  READY_EVENT_KINDS, READY_TEMPLATE_KEYS, NOTIFY_KILL_SWITCHES,
  NOTIFY_MASTER_SWITCH, PORTAL_FLAG_PATHS, PORTAL_LINK_PATHS, PORTAL_DEFAULT_ENABLED,
  settingsBlock, shouldNotify, resolvePortalEnabled, resolvePortalLink,
  estimateDeepLink, jobWorkspaceDeepLink, triggerDedupeKey,
  resolveCustomerEmail, productReadyLabel, proofEntityRef, resolveDesignerRecipient,
  estimateReadyNotifications, proofReadyNotifications,
} = await import(pathToFileURL(out).href);

const settings = { notifications: {}, company_name: 'CCS Signage', company_phone: '859-555-0100' };
const estimate = {
  id: 'est-1', estimate_number: 'EST-01042', project_name: 'Monument sign',
  client_name: 'Acme Signs', company_name: 'CCS Signage',
  quote_total: 4250, hyperlink: 'https://portal.example/q/est-1',
  contact_email: 'Amy@Acme.test', contact_name: 'Amy R', salesperson: 'Brett',
};
const customer = {
  id: 'cust-1', company_name: 'Acme Signs', contact_first_name: 'Amy', contact_last_name: 'Rivera',
  contact_email: 'amy@acme.test', billing_contact_email: 'billing@acme.test',
};
const workOrder = {
  id: 'wo-1', title: 'Acme channel letters', corbridge_invoice_number: 'INV-01042',
  client_name: 'Acme Signs', assigned_to: 'dana@ccs.test', sales_rep: 'Brett',
};
const product = { id: 'prod-1', description: 'Channel letters', designer: 'design@ccs.test', proof_version: 2, proof_file_url: 'https://files.example/p2.pdf', proof_file_name: 'p2.pdf' };

// --- registry ---------------------------------------------------------------------
assert.deepEqual(READY_EVENT_KINDS, ['estimate_ready', 'proof_ready']);
assert.equal(READY_TEMPLATE_KEYS.estimate_ready, 'estimate_ready');
assert.equal(READY_TEMPLATE_KEYS.proof_ready, 'proof_ready');
assert.equal(NOTIFY_KILL_SWITCHES.estimate_ready, 'estimate_ready_enabled');
assert.equal(NOTIFY_KILL_SWITCHES.proof_ready, 'proof_ready_enabled');
assert.equal(NOTIFY_MASTER_SWITCH, 'enabled');
assert.ok(PORTAL_FLAG_PATHS.includes('customerPortal.enabled') && PORTAL_FLAG_PATHS.includes('setting_value.portal_enabled'));
assert.ok(PORTAL_LINK_PATHS.includes('customer_portal_url') && PORTAL_LINK_PATHS.includes('portal_url'));
assert.equal(PORTAL_DEFAULT_ENABLED, true);

// --- estimate_ready: shape + D-12 deep link -----------------------------------------
{
  const [n] = estimateReadyNotifications({ estimate, customer, settings });
  assert.equal(n.kind, 'estimate_ready');
  assert.equal(n.audience, 'customer');
  assert.equal(n.to, 'amy@acme.test', 'estimate contact_email is the recipient (lowercased)');
  assert.equal(n.entity_type, 'estimate');
  assert.equal(n.entity_id, 'est-1');
  assert.equal(n.template_key, 'estimate_ready');
  assert.equal(n.deep_link, '/EstimateDetail?id=est-1', 'portal link unresolvable → D-12 estimate detail');
  assert.equal(n.dedupe_key, 'ready:estimate_ready:est-1', 'no quote_version → bare id key');
  assert.equal(n.missing_email, false);
  // render context — the spec'd H-03 shape
  assert.deepEqual(n.context.estimate, {
    number: 'EST-01042', title: 'Monument sign', total: 4250,
    approval_url: 'https://portal.example/q/est-1',
  });
  assert.equal(n.context.customer.company_name, 'Acme Signs');
  assert.equal(n.context.contact.name, 'Amy Rivera');
  assert.equal(n.context.company.name, 'CCS Signage');
  assert.equal(n.context.user.display_name, 'Brett');
  assert.equal(n.context.location.phone, '859-555-0100');
  // fallback text renders the same strings the seeded template produces
  assert.equal(n.subject, 'Your estimate EST-01042 is ready — CCS Signage');
  assert.ok(n.body.includes('Total: $4,250.00'), 'money-formatted total in body');
  assert.ok(n.body.includes('https://portal.example/q/est-1'), 'approval_url in body');
  assert.ok(!/\{\{/.test(n.subject + n.body), 'no unrendered placeholders');
}

// --- estimate_ready: portal flag ON + link resolves → portal deep link --------------
{
  const s = { customerPortal: { enabled: true }, company_name: 'CCS' };
  const [n] = estimateReadyNotifications({ estimate, customer, settings: s, portal_link: 'https://app.example/customerportal?token=t1' });
  assert.equal(n.deep_link, 'https://app.example/customerportal?token=t1', 'explicit portal link wins');
  const [n2] = estimateReadyNotifications({ estimate, customer, settings: { ...s, customer_portal_url: 'https://app.example/customerportal?token=cfg' } });
  assert.equal(n2.deep_link, 'https://app.example/customerportal?token=cfg', 'settings portal URL resolves');
  const [n3] = estimateReadyNotifications({ estimate, customer, settings: { ...s, customerPortal: { enabled: false }, customer_portal_url: 'https://x.test' } });
  assert.equal(n3.deep_link, '/EstimateDetail?id=est-1', 'portal disabled flag forces D-12 staff link');
  const [n4] = estimateReadyNotifications({ estimate: { ...estimate, hyperlink: '' }, customer, settings: { ...s, customer_portal_url: 'https://p.test/x' } });
  assert.equal(n4.context.estimate.approval_url, 'https://p.test/x', 'portal link is the approval_url fallback');
}

// --- estimate_ready: recipient ladder + guards ---------------------------------------
assert.equal(resolveCustomerEmail('', customer), 'amy@acme.test', 'customer contact_email');
assert.equal(resolveCustomerEmail('', { ...customer, contact_email: '', billing_contact_email: 'BILL@acme.test' }), 'bill@acme.test', 'billing fallback');
assert.equal(resolveCustomerEmail('', { contacts: [{ email: 'c1@x.test' }] }), 'c1@x.test', 'contacts[] fallback');
assert.equal(resolveCustomerEmail('', {}), '', 'no resolvable email');
assert.deepEqual(estimateReadyNotifications({ estimate: null, customer, settings }), [], 'missing estimate → no rows');
assert.deepEqual(estimateReadyNotifications({ estimate: { estimate_number: 'E-1' }, customer, settings }), [], 'id-less estimate → no rows');
{
  const [n] = estimateReadyNotifications({ estimate: { ...estimate, contact_email: '' }, customer: {}, settings });
  assert.equal(n.to, '');
  assert.equal(n.missing_email, true, 'unaddressable row emits w/ missing_email (smartsheet lane still works)');
}
{
  const [n] = estimateReadyNotifications({ estimate: { ...estimate, quote_version: 3 }, customer, settings });
  assert.equal(n.dedupe_key, 'ready:estimate_ready:est-1:v3', 'quote_version rides the dedupe key (revised quote re-notifies)');
}

// --- proof_ready: pair shape ----------------------------------------------------------
{
  const [cust, internal] = proofReadyNotifications({ workOrder, product, customer, settings });
  assert.equal(cust.kind, 'proof_ready');
  assert.equal(cust.audience, 'customer');
  assert.equal(cust.to, 'amy@acme.test', 'customer email resolves (WO has no contact_email → customer row)');
  assert.equal(cust.entity_type, 'work_order');
  assert.equal(cust.entity_id, 'wo-1');
  assert.equal(cust.product_id, 'prod-1');
  assert.equal(cust.template_key, 'proof_ready');
  assert.equal(cust.dedupe_key, 'ready:proof_ready:prod-1:v2', 'proof_version in the key');
  assert.equal(cust.deep_link, '/JobWorkspace?wo=wo-1', 'portal unresolvable → D-12 job workspace fallback');
  assert.equal(cust.context.order.number, 'INV-01042', 'corbridge_invoice_number is the order ref');
  assert.equal(cust.context.order.title, 'Acme channel letters');
  assert.equal(cust.context.proof.version, 2);
  assert.equal(cust.context.proof.file_name, 'p2.pdf');
  assert.equal(cust.context.proof.approval_url, 'https://files.example/p2.pdf', 'proof file is the approval fallback');
  assert.equal(cust.subject, 'Your proof for Acme channel letters is ready — CCS Signage');
  assert.ok(cust.body.includes('INV-01042'), 'order number in body');
  assert.ok(!/\{\{/.test(cust.subject + cust.body), 'no unrendered placeholders');

  // internal row — the delivery.ts internalRow vocabulary
  assert.equal(internal.audience, 'internal');
  assert.equal(internal.type, 'notification');
  assert.equal(internal.kind, 'proof_ready');
  assert.equal(internal.recipient_email, 'design@ccs.test', 'product.designer wins the chain');
  assert.equal(internal.title, 'Proof ready — Channel letters');
  assert.ok(internal.message.includes('v2'), 'version noted in the internal message');
  assert.ok(internal.message.includes('INV-01042'), 'order ref in the internal message');
  assert.equal(internal.link, '/JobWorkspace?wo=wo-1');
  assert.equal(internal.dedupe_key, 'ready:proof_ready:prod-1:v2');
  assert.equal(internal.missing_recipient, false);
}

// --- proof_ready: designer recipient chain + portal link ------------------------------
assert.equal(resolveDesignerRecipient({ designer: '  D@x.test ' }, workOrder, settings), 'D@x.test', 'product.designer first');
assert.equal(resolveDesignerRecipient({}, workOrder, settings), 'dana@ccs.test', 'wo.assigned_to second');
assert.equal(resolveDesignerRecipient({}, {}, { default_designer: 'dd@ccs.test' }), 'dd@ccs.test', 'settings.default_designer last');
assert.equal(resolveDesignerRecipient({}, {}, { notifications: { default_designer: 'nd@ccs.test' } }), 'nd@ccs.test', 'notifications.default_designer nested');
assert.equal(resolveDesignerRecipient({}, {}, {}), '', 'empty chain');
{
  const [, internal] = proofReadyNotifications({ workOrder: { ...workOrder, assigned_to: '' }, product: { ...product, designer: '' }, customer, settings: { default_designer: 'DD@ccs.test' } });
  assert.equal(internal.recipient_email, 'dd@ccs.test', 'default_designer resolves lowercased');
  const [, i2] = proofReadyNotifications({ workOrder: { ...workOrder, assigned_to: '' }, product: { ...product, designer: '' }, customer, settings });
  assert.equal(i2.missing_recipient, true, 'empty chain flags missing_recipient');
}
{
  const [cust, internal] = proofReadyNotifications({
    workOrder, product, customer,
    settings: { customerPortal: { enabled: true }, customer_portal_url: 'https://app.example/customerportal?token=t9' },
  });
  assert.equal(cust.deep_link, 'https://app.example/customerportal?token=t9', 'portal proof view when enabled');
  assert.equal(cust.context.proof.approval_url, 'https://app.example/customerportal?token=t9');
  assert.equal(internal.link, '/JobWorkspace?wo=wo-1', 'internal row always links the staff workspace');
  const [c2] = proofReadyNotifications({ workOrder, product, customer, settings, proof_link: 'https://share.example/proof/abc' });
  assert.equal(c2.deep_link, 'https://share.example/proof/abc', 'explicit proof_link (E-09 share) wins everything');
}

// --- dedupe scheme ---------------------------------------------------------------------
assert.equal(triggerDedupeKey('estimate_ready', 'est-1'), 'ready:estimate_ready:est-1');
assert.equal(triggerDedupeKey('proof_ready', 'prod-1', 2), 'ready:proof_ready:prod-1:v2');
assert.equal(triggerDedupeKey('proof_ready', 'prod-1', '3'), 'ready:proof_ready:prod-1:v3', 'string version');
assert.equal(triggerDedupeKey('proof_ready', 'prod-1', 0), 'ready:proof_ready:prod-1', 'version 0 = no proof → bare key');
assert.equal(triggerDedupeKey('proof_ready', 'prod-1', ''), 'ready:proof_ready:prod-1');
assert.equal(triggerDedupeKey('x', 'y', 'beta'), 'ready:x:y:vbeta', 'non-numeric version tag');
assert.equal(triggerDedupeKey('', ''), 'ready:unknown:unknown', 'fail-soft empties');
{
  const [a] = proofReadyNotifications({ workOrder, product: { ...product, proof_version: 1 }, customer, settings });
  const [b] = proofReadyNotifications({ workOrder, product, customer, settings });
  assert.notEqual(a.dedupe_key, b.dedupe_key, 'v1 vs v2 → re-notify on new proof file');
  const [c] = proofReadyNotifications({ workOrder, product: { ...product, proof_version: 2 }, customer, settings });
  assert.equal(b.dedupe_key, c.dedupe_key, 'same version dedupes');
  const [d] = proofReadyNotifications({ workOrder, product: { description: 'No-id', proof_version: 1 }, customer, settings, index: 4 });
  assert.equal(d.dedupe_key, 'ready:proof_ready:wo-1:4:v1', 'id-less product keys on wo:index');
}

// --- kill-switches ----------------------------------------------------------------------
assert.equal(shouldNotify('estimate_ready', { settings }), true, 'default ON');
assert.equal(shouldNotify('proof_ready', { settings }), true);
assert.equal(shouldNotify('estimate_ready', { settings: { notifications: { estimate_ready_enabled: false } } }), false, 'explicit false disables estimate_ready');
assert.equal(shouldNotify('proof_ready', { settings: { notifications: { estimate_ready_enabled: false } } }), true, 'other kind unaffected');
assert.equal(shouldNotify('proof_ready', { settings: { notifications: { proof_ready_enabled: false } } }), false);
assert.equal(shouldNotify('estimate_ready', { settings: { notifications: { enabled: false } } }), false, 'master switch');
assert.equal(shouldNotify('proof_ready', { settings: { notifications: { enabled: false } } }), false, 'master covers both kinds');
assert.equal(shouldNotify('estimate_ready', { settings: { notifications: { estimate_ready_enabled: true } } }), true, 'explicit true stays on');
assert.equal(shouldNotify('estimate_ready', { settings: { notifications: { estimate_ready_enabled: 'false' } } }), true, 'only literal false disables (string "false" stays on)');
assert.equal(shouldNotify('estimate_ready', { settings: { setting_value: { notifications: { estimate_ready_enabled: false } } } }), false, 'KV-blob mirror honored');
assert.equal(shouldNotify('estimate_ready', { notifications: { estimate_ready_enabled: false } }), false, 'bare settings object arg-form');
assert.equal(shouldNotify('bogus_kind', { settings }), false, 'unknown kind fails closed');
assert.equal(shouldNotify('estimate_ready', {}), true, 'empty arg still defaults on');
assert.equal(shouldNotify('estimate_ready', { settings: null }), true, 'null settings → default on');
assert.deepEqual(settingsBlock({ setting_value: { notifications: { proof_ready_enabled: false } } }), { proof_ready_enabled: false });
// builders always compose — shouldNotify is the caller's gate (documented contract)
assert.equal(estimateReadyNotifications({ estimate, customer, settings: { notifications: { estimate_ready_enabled: false } } }).length, 1, 'model builds rows regardless; the gate lives in shouldNotify');

// --- portal resolution ------------------------------------------------------------------
assert.equal(resolvePortalEnabled({}), true, 'portal defaults on');
assert.equal(resolvePortalEnabled({ customerPortal: { enabled: false } }), false);
assert.equal(resolvePortalEnabled({ portal_enabled: false }), false);
assert.equal(resolvePortalEnabled({ customerPortal: { enabled: true }, portal_enabled: false }), true, 'first defined path wins');
assert.equal(resolvePortalEnabled({ setting_value: { customer_portal_enabled: false } }), false, 'KV mirror');
assert.equal(resolvePortalLink({ portal_link: 'https://x.test/p/' }), 'https://x.test/p', 'trailing slashes stripped');
assert.equal(resolvePortalLink({ settings: { customer_portal_url: 'https://c.test' } }), 'https://c.test');
assert.equal(resolvePortalLink({ settings: { setting_value: { portal_url: 'https://kv.test' } } }), 'https://kv.test');
assert.equal(resolvePortalLink({}), '', 'unresolvable → empty (caller falls back to D-12)');

// --- misc helpers -------------------------------------------------------------------------
assert.equal(estimateDeepLink('est 1'), '/EstimateDetail?id=est%201', 'id is URL-encoded');
assert.equal(estimateDeepLink(''), '/EstimateDetail');
assert.equal(jobWorkspaceDeepLink('wo-1'), '/JobWorkspace?wo=wo-1');
assert.equal(jobWorkspaceDeepLink(''), '/JobWorkspace');
assert.equal(productReadyLabel({ client_product_name: 'Monument' }), 'Monument');
assert.equal(productReadyLabel({ product_type: 'Vinyl' }), 'Vinyl');
assert.equal(productReadyLabel({}, 0), 'Product 1');
assert.equal(productReadyLabel({}), 'Product');
assert.equal(proofEntityRef(workOrder, { id: 'p9' }), 'p9');
assert.equal(proofEntityRef(workOrder, {}, 2), 'wo-1:2');
assert.equal(proofEntityRef({}, {}), 'unknown');
assert.equal(resolveCustomerEmail('  A@B.test  ', customer), 'a@b.test', 'primary hint lowercased');
{
  // estimate without contact falls back through the customer record
  const [n] = estimateReadyNotifications({ estimate: { ...estimate, contact_email: '' }, customer, settings });
  assert.equal(n.to, 'amy@acme.test');
  // multi-product WO — index feeds label + dedupe entity
  const [, i3] = proofReadyNotifications({ workOrder, product: { client_product_name: 'Pylon', proof_version: 1 }, customer, settings, index: 0 });
  assert.equal(i3.title, 'Proof ready — Pylon', 'client_product_name label');
}

rmSync(out, { force: true });
console.log('PASS ready-triggers');
