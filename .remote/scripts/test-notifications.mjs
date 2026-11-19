import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = resolve(here, '../src');
const out = resolve(here, '.tmp-notifications.mjs');
const outModel = resolve(here, '.tmp-notify-model.mjs');
buildSync({
  entryPoints: [resolve(src, 'components/comms/notificationTemplates.js')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
  alias: { '@': src },
});
buildSync({
  entryPoints: [resolve(src, 'components/comms/notifyModel.js')],
  bundle: true, format: 'esm', outfile: outModel, logLevel: 'silent',
  alias: { '@': src },
});
const {
  CUSTOMER_NOTIFICATION_TEMPLATES_KEY,
  NOTIFY_MERGE_FIELDS,
  NOTIFICATION_KINDS,
  NOTIFICATION_KIND_KEYS,
  NOTIFICATION_KIND_MAP,
  normalizeNotificationTemplateOverrides,
  notificationTemplateFor,
  renderNotification,
  effectiveNotificationTemplates,
  loadNotificationTemplates,
  saveNotificationTemplates,
} = await import(pathToFileURL(out).href);
const {
  statusGateAllows,
  buildNotifyContext,
  resolveCustomerEmail,
  SAMPLE_NOTIFY_CONTEXT,
} = await import(pathToFileURL(outModel).href);

// --- Registry shape -------------------------------------------------------------
assert.deepEqual(
  NOTIFICATION_KIND_KEYS,
  ['estimate_ready', 'proof_ready', 'order_built', 'order_completed', 'payment_due', 'monthly_statement'],
  'the six customer notification kinds are registered in order',
);
assert.equal(NOTIFICATION_KINDS.length, 6);
for (const kind of NOTIFICATION_KINDS) {
  assert.ok(kind.label && typeof kind.label === 'string', `${kind.key} has a label`);
  assert.ok(kind.defaultSubject.includes('{{'), `${kind.key} default subject merges fields`);
  assert.ok(kind.defaultBody.includes('{{'), `${kind.key} default body merges fields`);
  assert.ok(kind.defaultBody.includes('{{contact_name}}'), `${kind.key} greets the contact`);
  assert.ok(Array.isArray(kind.mergeFields) && kind.mergeFields.length > 0, `${kind.key} lists merge fields`);
  for (const field of kind.mergeFields) {
    assert.ok(NOTIFY_MERGE_FIELDS.includes(field), `${kind.key}.${field} is a known merge field`);
  }
  assert.ok(kind.statusGate?.description, `${kind.key} documents its gate`);
  assert.ok(Array.isArray(kind.statusGate?.anyOf) && kind.statusGate.anyOf.length > 0, `${kind.key} has gate rules`);
  assert.equal(NOTIFICATION_KIND_MAP[kind.key], kind, 'map mirrors the registry');
}

// --- Default render -------------------------------------------------------------
const ctx = {
  customer_name: 'Acme Signs', contact_name: 'Amy', order_ref: 'INV-01042',
  estimate_number: 'EST-01042', invoice_number: 'INV-01088', total: '$4,250.00',
  balance: '$1,875.50', due_date: '2026-03-15', statement_date: '2026-02-28',
  company_name: 'CCS Signage', salesperson_name: 'brett@ccssigns.com',
  portal_link: 'https://portal.example/o/1', product_name: 'Channel letters',
};
for (const { key } of NOTIFICATION_KINDS) {
  const { subject, body } = renderNotification(key, ctx);
  assert.ok(subject && body, `${key} renders subject+body`);
  assert.ok(!/\{\{/.test(subject + body), `${key} leaks no raw merge fields`);
}
assert.equal(renderNotification('estimate_ready', ctx).subject, 'Your estimate EST-01042 is ready — CCS Signage');
assert.ok(renderNotification('proof_ready', ctx).subject.includes('INV-01042'), 'proof_ready merges order_ref');
assert.ok(renderNotification('payment_due', ctx).body.includes('$1,875.50'), 'payment_due merges balance');
assert.ok(renderNotification('monthly_statement', ctx).subject.includes('2026-02-28'), 'statement merges as-of date');
assert.deepEqual(renderNotification('bogus_kind', ctx), { subject: '', body: '' }, 'unknown kind fails closed');
// Missing ctx renders blanks, never throws or leaks.
const blank = renderNotification('estimate_ready', {});
assert.ok(!/\{\{/.test(blank.subject + blank.body), 'empty ctx leaves no raw merge fields');
assert.equal(blank.subject, 'Your estimate  is ready — ', 'missing values render empty');

// --- Override normalize + render ---------------------------------------------------
assert.deepEqual(normalizeNotificationTemplateOverrides(), {}, 'blank overrides');
assert.deepEqual(normalizeNotificationTemplateOverrides('junk'), {});
assert.deepEqual(
  normalizeNotificationTemplateOverrides({ bogus_kind: { subject: 'x', body: 'y' } }),
  {},
  'unknown kinds are dropped',
);
assert.deepEqual(
  normalizeNotificationTemplateOverrides({ proof_ready: { subject: '  ', body: 'Hi {{customer_name}}' } }),
  { proof_ready: { body: 'Hi {{customer_name}}' } },
  'blank fields drop out of the override',
);
const overrides = { proof_ready: { subject: 'PROOF {{order_ref}}!', body: 'See {{portal_link}}' } };
assert.deepEqual(
  renderNotification('proof_ready', ctx, overrides),
  { subject: 'PROOF INV-01042!', body: 'See https://portal.example/o/1' },
  'saved overrides win over defaults',
);
assert.equal(
  renderNotification('estimate_ready', ctx, overrides).subject,
  'Your estimate EST-01042 is ready — CCS Signage',
  'kinds without overrides still use defaults',
);
assert.deepEqual(
  notificationTemplateFor('proof_ready', overrides),
  { subject: 'PROOF {{order_ref}}!', body: 'See {{portal_link}}' },
  'templateFor resolves the effective text',
);
assert.equal(
  effectiveNotificationTemplates({ order_built: { subject: 'Built {{order_ref}}' } }).order_built.subject,
  'Built {{order_ref}}',
);
assert.equal(
  effectiveNotificationTemplates({ order_built: { subject: 'Built {{order_ref}}' } }).order_built.body,
  NOTIFICATION_KIND_MAP.order_built.defaultBody,
  'effective templates merge partial overrides over defaults',
);

// --- statusGateAllows ---------------------------------------------------------------
// estimate_ready — sent estimates only.
assert.equal(statusGateAllows('estimate_ready', { status: 'sent' }), true);
for (const s of ['draft', 'calculated', 'approved', 'archived', 'cancelled']) {
  assert.equal(statusGateAllows('estimate_ready', { status: s }), false, `estimate_ready blocks ${s}`);
}
// proof_ready — proof out for the customer.
assert.equal(statusGateAllows('proof_ready', { proof_status: 'sent' }), true);
assert.equal(statusGateAllows('proof_ready', { proof_status: 'awaiting_approval' }), true);
for (const s of ['none', 'draft', 'approved', 'revision_requested']) {
  assert.equal(statusGateAllows('proof_ready', { proof_status: s }), false, `proof_ready blocks ${s}`);
}
// order_built — QC or awaiting fulfillment.
assert.equal(statusGateAllows('order_built', { operational_status: 'quality_control' }), true);
assert.equal(statusGateAllows('order_built', { fulfillment_state: 'awaiting_installation' }), true);
assert.equal(statusGateAllows('order_built', { fulfillment_state: 'awaiting_pickup' }), true);
assert.equal(statusGateAllows('order_built', { operational_status: 'in_production' }), false);
assert.equal(statusGateAllows('order_built', { fulfillment_state: 'delivered' }), false, 'delivered is complete, not built');
assert.equal(statusGateAllows('order_built', { operational_status: 'in_design', fulfillment_state: 'none' }), false);
// order_completed — WO completed flag or terminal fulfillment.
assert.equal(statusGateAllows('order_completed', { completed: true }), true);
assert.equal(statusGateAllows('order_completed', { fulfillment_state: 'installed' }), true);
assert.equal(statusGateAllows('order_completed', { fulfillment_state: 'picked_up' }), true);
assert.equal(statusGateAllows('order_completed', { completed: false }), false);
assert.equal(statusGateAllows('order_completed', { fulfillment_state: 'awaiting_shipping' }), false);
// payment_due — issued invoice with an open balance.
assert.equal(statusGateAllows('payment_due', { balance_due: 800, status: 'sent' }), true);
assert.equal(statusGateAllows('payment_due', { balance_due: 0.01, status: 'partially_paid' }), true);
assert.equal(statusGateAllows('payment_due', { balance_due: 0, status: 'sent' }), false, 'zero balance');
assert.equal(statusGateAllows('payment_due', { balance_due: 800, status: 'draft' }), false);
assert.equal(statusGateAllows('payment_due', { balance_due: 800, status: 'paid' }), false);
assert.equal(statusGateAllows('payment_due', { balance_due: 800, status: 'void' }), false);
// monthly_statement — any statement activity.
assert.equal(statusGateAllows('monthly_statement', { invoiceCount: 2, paymentCount: 0, balance: 0 }), true);
assert.equal(statusGateAllows('monthly_statement', { invoiceCount: 0, paymentCount: 1, balance: -50 }), true);
assert.equal(statusGateAllows('monthly_statement', { invoiceCount: 0, paymentCount: 0, balance: 120 }), true);
assert.equal(statusGateAllows('monthly_statement', { invoiceCount: 0, paymentCount: 0, balance: 0 }), false, 'empty statement is not sendable');
// Fail-closed edges.
assert.equal(statusGateAllows('bogus_kind', { status: 'sent' }), false);
assert.equal(statusGateAllows('proof_ready', null), false);
assert.equal(statusGateAllows('proof_ready', 'sent'), false, 'a bare string is not an entity');

// --- buildNotifyContext -------------------------------------------------------------
const customer = {
  id: 'cust1', company_name: 'Acme Signs', contact_first_name: 'Amy', contact_last_name: 'Rivera',
  contact_email: 'amy@acme.test',
};
const estimate = {
  estimate_number: 'EST-01042', client_name: 'Acme Signs', contact_name: 'Amy R',
  quote_total: 4250, quote_issue_date: '2026-02-01', quote_valid_days: 30, status: 'sent',
};
const workOrder = {
  id: 'wo1', corbridge_invoice_number: 'INV-01042', client_name: 'Acme Signs',
  sales_rep: 'brett@ccssigns.com', project_install_date: '2026-03-20', customer_id: 'cust1',
};
const invoice = {
  invoice_number: 'INV-01088', customer_id: 'cust1', total: 1875.5, balance_due: 1875.5,
  due_date: '2026-03-15', status: 'sent',
};
const statement = { asOf: '2026-02-28', balance: 1875.5, totalBilled: 3000, invoiceCount: 2, paymentCount: 1 };
const company = { company_name: 'Clay Co Sign', customer_portal_url: 'https://portal.clayco.test' };

const product = { id: 'p1', description: 'Illuminated channel letters', proof_status: 'sent' };
const full = buildNotifyContext({ customer, estimate, workOrder, product, invoice, statement, company });
assert.equal(full.customer_name, 'Acme Signs');
assert.equal(full.contact_name, 'Amy Rivera', 'customer contact name wins');
assert.equal(full.order_ref, 'INV-01042', 'corbridge invoice number is the order ref');
assert.equal(full.estimate_number, 'EST-01042');
assert.equal(full.invoice_number, 'INV-01088');
assert.equal(full.total, '$4,250.00', 'estimate total wins');
assert.equal(full.balance, '$1,875.50', 'invoice balance wins');
assert.equal(full.due_date, '2026-03-15', 'invoice due date wins');
assert.equal(full.statement_date, '2026-02-28');
assert.equal(full.company_name, 'Clay Co Sign');
assert.equal(full.salesperson_name, 'brett@ccssigns.com', 'WO sales_rep merges');
assert.equal(full.portal_link, 'https://portal.clayco.test');

// Fallback ladders.
const woOnly = buildNotifyContext({ workOrder, company });
assert.equal(woOnly.customer_name, 'Acme Signs', 'WO client_name is the customer fallback');
assert.equal(woOnly.contact_name, 'Acme Signs', 'contact falls back to customer name');
assert.equal(woOnly.due_date, '2026-03-20', 'install date is the WO due fallback');
assert.equal(woOnly.invoice_number, '');

const estOnly = buildNotifyContext({ estimate, company });
assert.equal(estOnly.contact_name, 'Amy R', 'estimate contact_name merges');
assert.equal(estOnly.due_date, '2026-03-03', 'issue date + valid days computes the expiry');

const stmtOnly = buildNotifyContext({ customer, statement });
assert.equal(stmtOnly.balance, '$1,875.50', 'statement balance merges');
assert.equal(stmtOnly.statement_date, '2026-02-28');
assert.equal(stmtOnly.company_name, 'CCS Signage', 'missing company falls back');

const empty = buildNotifyContext();
for (const field of NOTIFY_MERGE_FIELDS) {
  assert.ok(field in empty, `${field} key is present with no inputs`);
  if (field === 'company_name') {
    assert.equal(empty[field], 'CCS Signage', 'company_name falls back with no inputs');
  } else {
    assert.equal(empty[field], '', `${field} is empty with no inputs`);
  }
}
assert.equal(buildNotifyContext({ company: { company_name: 'X' } }).portal_link, '', 'portal_link is a placeholder until configured');
assert.equal(buildNotifyContext({ company }).portal_link, 'https://portal.clayco.test', 'configured portal url merges');
assert.equal(buildNotifyContext({ portalLink: 'https://x.test', company }).portal_link, 'https://x.test', 'explicit portal link wins');
assert.equal(buildNotifyContext({ product: { description: 'Pylon sign' } }).product_name, 'Pylon sign');

// Every registry merge field is produced by the context builder.
const produced = new Set(Object.keys(full));
for (const { key, mergeFields } of NOTIFICATION_KINDS) {
  for (const field of mergeFields) {
    assert.ok(produced.has(field), `${key}.${field} is produced by buildNotifyContext`);
    assert.notEqual(full[field], '', `${key}.${field} merges non-empty for a full ctx`);
  }
}

// --- resolveCustomerEmail -------------------------------------------------------------
assert.equal(resolveCustomerEmail(customer), 'amy@acme.test');
assert.equal(resolveCustomerEmail(customer, 'first@wins.test'), 'first@wins.test', 'explicit contact email wins');
assert.equal(
  resolveCustomerEmail({ billing_contact_email: 'Billing@Acme.test' }),
  'billing@acme.test',
  'billing contact is next and lowercases',
);
assert.equal(resolveCustomerEmail({ contacts: [{ email: '' }, { email: 'c2@acme.test' }] }), 'c2@acme.test');
assert.equal(resolveCustomerEmail({}), '', 'no address resolves empty');
assert.equal(resolveCustomerEmail(null, 'wo-contact@acme.test'), 'wo-contact@acme.test', 'WO contact email fallback');

// --- Sample context covers every merge field -------------------------------------------
for (const field of NOTIFY_MERGE_FIELDS) {
  assert.ok(field in SAMPLE_NOTIFY_CONTEXT, `sample ctx has ${field}`);
}
for (const { key } of NOTIFICATION_KINDS) {
  const { subject, body } = renderNotification(key, SAMPLE_NOTIFY_CONTEXT);
  assert.ok(!/\{\{/.test(subject + body), `${key} fully renders against the sample ctx`);
}

// --- Settings load/save shape ----------------------------------------------------------
// A minimal GlobalSettings fake implementing the contract
// loadSingleGlobalSetting + saveGlobalSettingValueIfUnchanged use.
const makeFakeSettings = () => {
  const rows = [];
  return {
    rows,
    filter: async (q) => rows.filter((r) => !q?.setting_key || r.setting_key === q.setting_key),
    get: async (id) => rows.find((r) => r.id === id) || null,
    create: async (data) => {
      const row = { id: `gs${rows.length + 1}`, created_date: 'c1', updated_date: 'v1', ...data };
      rows.push(row);
      return row;
    },
    updateMany: async (query, { $set }) => {
      const row = rows.find((r) => r.id === query.id && String(r.updated_date) === String(query.updated_date));
      if (!row) return { updated: 0 };
      Object.assign(row, $set);
      row.updated_date = 'v2';
      return { updated: 1 };
    },
  };
};

const fake = makeFakeSettings();
const emptyLoad = await loadNotificationTemplates({ entity: fake });
assert.deepEqual(emptyLoad, { record: null, templates: {} }, 'missing setting loads empty');

await saveNotificationTemplates({
  entity: fake,
  loadedRecord: null,
  nextTemplates: { proof_ready: { subject: 'P {{order_ref}}', body: 'B {{customer_name}}' }, bogus: { subject: 'x' } },
});
assert.equal(fake.rows.length, 1, 'first save creates the settings row');
assert.equal(fake.rows[0].setting_key, CUSTOMER_NOTIFICATION_TEMPLATES_KEY);
assert.equal(fake.rows[0].setting_key, 'customerNotificationTemplates');
assert.deepEqual(
  fake.rows[0].setting_value,
  { proof_ready: { subject: 'P {{order_ref}}', body: 'B {{customer_name}}' } },
  'the saved value is a normalized {kind:{subject,body}} map',
);

const loaded = await loadNotificationTemplates({ entity: fake });
assert.equal(loaded.record.id, 'gs1');
assert.deepEqual(loaded.templates, { proof_ready: { subject: 'P {{order_ref}}', body: 'B {{customer_name}}' } });

await saveNotificationTemplates({
  entity: fake,
  loadedRecord: loaded.record,
  nextTemplates: { payment_due: { body: 'Only body override' } },
});
assert.equal(fake.rows.length, 1, 'CAS save updates in place, no duplicate row');
assert.equal(fake.rows[0].updated_date, 'v2');
assert.deepEqual(
  fake.rows[0].setting_value,
  { payment_due: { body: 'Only body override' } },
);

// A stale loadedRecord fails closed — the CAS guard sees a newer version.
await assert.rejects(
  saveNotificationTemplates({
    entity: fake,
    loadedRecord: { ...loaded.record, updated_date: 'stale' },
    nextTemplates: {},
  }),
  /changed in another session/i,
  'stale settings rows fail closed rather than clobbering',
);

console.log('PASS notifications (registry, render, overrides, gates, context, email resolution, settings shape)');
