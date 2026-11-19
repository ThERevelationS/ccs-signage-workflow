// Unit checks for base44/shared/vendorNotifyModel.ts (masterplan H-09):
// vendor notifications for po_created / quote_request / feedback_sent /
// file_uploaded — recipient chain, portal-link chain, arrive-by formatting,
// PO email subject/body, internal-only flag, dedupe keys.
// esbuild-bundle pattern — same as test-payment-reminders.mjs.
//
// Run: node scripts/test-vendor-notify.mjs  →  prints "PASS vendor-notify"

import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { rmSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-vendor-notify-model.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/vendorNotifyModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  VENDOR_EVENT_KINDS,
  VENDOR_TEMPLATE_KEYS,
  DEFAULT_COMPANY_NAME,
  DEFAULT_APP_BASE_URL,
  VENDOR_PORTAL_PATH,
  VENDOR_NOTIFY_CATEGORY,
  normalizeVendorEventKind,
  formatMoney,
  formatArriveBy,
  companyNameFor,
  appBaseUrlFor,
  purchaseContactFor,
  portalLinkFor,
  poDeepLink,
  recipientsFor,
  internalRecipientsFor,
  poTemplateContext,
  notifyDedupeKey,
  vendorNotificationPlan,
} = await import(pathToFileURL(out).href);

const po = (over = {}) => ({
  id: 'po1',
  po_number: 'PO-1042',
  status: 'sent',
  vendor_name: 'Acme Plastics',
  vendor_id: 'v1',
  vendor_email: '',
  expected_date: '2026-06-15',
  line_items: [
    { description: 'Acrylic sheet 4x8', quantity: 4, unit_cost: 75 },
    { description: 'Standoffs', quantity: 20, unit_cost: 1.5 },
  ],
  subtotal: 330,
  shipping_fee: 20,
  total: 350,
  ship_to: 'Shop dock',
  created_by: 'buyer@clayco.com',
  ...over,
});

const vendor = (over = {}) => ({
  id: 'v1',
  name: 'Acme Plastics',
  contact_email: 'sales@acme.example',
  email: 'info@acme.example',
  comm_prefs: { email: 'orders@acme.example' },
  contacts: [{ name: 'Sam', email: 'sam@acme.example' }],
  statement_email: 'ap@acme.example',
  ...over,
});

// ---------------------------------------------------------------------------
// vocabulary + constants
// ---------------------------------------------------------------------------
assert.deepEqual(
  [...VENDOR_EVENT_KINDS],
  ['po_created', 'quote_request', 'feedback_sent', 'file_uploaded'],
  'vendor event kind set',
);
for (const k of VENDOR_EVENT_KINDS) {
  assert.equal(VENDOR_TEMPLATE_KEYS[k], k, `template_key for ${k}`);
}
assert.equal(DEFAULT_COMPANY_NAME, 'CCS Signage', 'default company mirrors repo convention');
assert.equal(VENDOR_PORTAL_PATH, '/vendor', 'portal path per spec');
assert.ok(DEFAULT_APP_BASE_URL.startsWith('https://'), 'default app base is an https origin');
assert.equal(VENDOR_NOTIFY_CATEGORY, 'system', 'vendor rows ride the declared system bucket');

// ---------------------------------------------------------------------------
// normalizeVendorEventKind — string or {kind|type|event}, strict
// ---------------------------------------------------------------------------
assert.equal(normalizeVendorEventKind('po_created'), 'po_created', 'bare string kind');
assert.equal(normalizeVendorEventKind({ kind: 'quote_request' }), 'quote_request', 'event.kind');
assert.equal(normalizeVendorEventKind({ type: 'feedback_sent' }), 'feedback_sent', 'event.type');
assert.equal(normalizeVendorEventKind({ event: 'file_uploaded' }), 'file_uploaded', 'event.event');
assert.equal(normalizeVendorEventKind('PO_CREATED'), 'po_created', 'kind normalizes case');
assert.equal(normalizeVendorEventKind('po_sent'), '', 'non-canonical alias fails closed');
assert.equal(normalizeVendorEventKind({ kind: 'nonsense' }), '', 'unknown kind → ""');
assert.equal(normalizeVendorEventKind(null), '', 'null event → ""');
assert.equal(normalizeVendorEventKind(42), '', 'numeric event → ""');

// ---------------------------------------------------------------------------
// formatMoney / formatArriveBy
// ---------------------------------------------------------------------------
assert.equal(formatMoney(350), '$350.00');
assert.equal(formatMoney('1234.5'), '$1,234.50');
assert.equal(formatMoney(-7.25), '-$7.25');
assert.equal(formatMoney('abc'), '', 'non-numeric money → ""');
assert.equal(formatMoney(undefined), '', 'missing money → ""');

assert.equal(formatArriveBy('2026-06-15'), '6/15/2026', 'date-only renders M/D/YYYY');
assert.equal(formatArriveBy('2026-01-01'), '1/1/2026', 'UTC-anchored — no day drift');
assert.equal(formatArriveBy('2026-06-15T23:30:00Z'), '6/15/2026', 'ISO datetime → its UTC date');
assert.equal(formatArriveBy('Next Friday'), 'Next Friday', 'free-text expected_date passes through');
assert.equal(formatArriveBy(''), 'TBD', 'missing date → TBD');
assert.equal(formatArriveBy(undefined), 'TBD');

// ---------------------------------------------------------------------------
// settings resolution — flat + KV blob + block twins
// ---------------------------------------------------------------------------
assert.equal(companyNameFor({ company_name: 'Clay Co' }, po()), 'Clay Co');
assert.equal(companyNameFor({ setting_value: { company_name: 'KV Co' } }, po()), 'KV Co', 'company name inside setting_value blob');
assert.equal(companyNameFor({ company: { name: 'Block Co' } }, po()), 'Block Co');
assert.equal(companyNameFor({}, po({ company_name: 'PO Co' })), 'PO Co', 'po.company_name hop');
assert.equal(companyNameFor({}, po()), DEFAULT_COMPANY_NAME, 'company fallback');

assert.equal(appBaseUrlFor({ app_url: 'https://app.example.com/' }), 'https://app.example.com', 'app_url wins, trailing slash stripped');
assert.equal(appBaseUrlFor({ setting_value: { app_base_url: 'https://kv.example.com' } }), 'https://kv.example.com');
assert.equal(appBaseUrlFor({ vendorNotify: { base_url: 'https://vend.example.com' } }), 'https://vend.example.com');
assert.equal(appBaseUrlFor({}), DEFAULT_APP_BASE_URL, 'app base fallback');

assert.equal(purchaseContactFor({ purchase_contact_email: 'Buy@Shop.com' }), 'buy@shop.com', 'purchase contact lowercased');
assert.equal(purchaseContactFor({ purchasing_email: 'p@shop.com' }), 'p@shop.com', 'purchasing_email alias');
assert.equal(purchaseContactFor({ setting_value: { purchase_contact_email: 'kv@shop.com' } }), 'kv@shop.com');
assert.equal(purchaseContactFor({}), '', 'no purchase contact → ""');

// ---------------------------------------------------------------------------
// portalLinkFor — vendor.portal_link → comm_prefs → po.portal_link → fallback
// ---------------------------------------------------------------------------
assert.equal(
  portalLinkFor(po(), vendor({ portal_link: 'https://portal.acme.example/po/9' })),
  'https://portal.acme.example/po/9',
  'vendor.portal_link wins',
);
assert.equal(
  portalLinkFor(po(), vendor({ comm_prefs: { portal_link: 'https://cp.acme.example/x' } })),
  'https://cp.acme.example/x',
  'comm_prefs.portal_link second',
);
assert.equal(
  portalLinkFor(po({ portal_link: 'https://po.example/link' }), vendor()),
  'https://po.example/link',
  'po.portal_link third',
);
assert.equal(
  portalLinkFor(po(), vendor(), { app_url: 'https://app.example.com' }),
  'https://app.example.com/vendor?po=po1',
  'fallback builds <app>/vendor?po=<id> from settings',
);
assert.equal(
  portalLinkFor(po(), vendor()),
  `${DEFAULT_APP_BASE_URL}/vendor?po=po1`,
  'fallback uses published app origin',
);
assert.equal(
  portalLinkFor({ po_number: 'PO-7' }, vendor(), { app_url: 'https://a.example' }),
  'https://a.example/vendor?po=PO-7',
  'fallback id falls back to po_number',
);
assert.equal(portalLinkFor({}, vendor()), '', 'no id + no stored link → ""');

// ---------------------------------------------------------------------------
// poDeepLink — staff route
// ---------------------------------------------------------------------------
assert.equal(poDeepLink(po()), '/PurchaseOrders?po=po1', 'staff deep link');
assert.equal(poDeepLink({ po_number: 'PO-9' }), '/PurchaseOrders?po=PO-9', 'deep link falls back to po_number');
assert.equal(poDeepLink({}), '/PurchaseOrders', 'no id → page root');

// ---------------------------------------------------------------------------
// recipientsFor — vendor.contact_email → vendor.email → comm_prefs → contacts
// → statement_email → settings.purchase_contact_email; missing → flag
// ---------------------------------------------------------------------------
assert.equal(recipientsFor(vendor()).to, 'sales@acme.example', 'contact_email is the spec head');
assert.equal(recipientsFor(vendor()).source, 'contact_email');
assert.equal(recipientsFor(vendor({ contact_email: '' })).to, 'info@acme.example', 'vendor.email second (spec order)');
assert.equal(
  recipientsFor(vendor({ contact_email: '', email: '' })).to,
  'orders@acme.example',
  'comm_prefs.email (declared Vendor home)',
);
assert.equal(
  recipientsFor(vendor({ contact_email: '', email: '', comm_prefs: {} })).to,
  'sam@acme.example',
  'first contacts[] email',
);
assert.equal(
  recipientsFor(vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [] })).to,
  'ap@acme.example',
  'statement_email last vendor-side hop',
);
assert.equal(
  recipientsFor(vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' }), { settings: { purchase_contact_email: 'buy@shop.com' } }).to,
  'buy@shop.com',
  'settings.purchase_contact_email tail of chain',
);
assert.equal(
  recipientsFor(vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' }), { settings: { purchase_contact_email: 'buy@shop.com' } }).source,
  'purchase_contact_email',
);
{
  const r = recipientsFor({});
  assert.equal(r.to, '', 'empty vendor → no recipient');
  assert.equal(r.missing_email, true, 'missing_email flag raised');
  assert.equal(r.source, 'none');
}
assert.equal(recipientsFor({ email: 'not-an-email' }).missing_email, true, 'non-@ value never resolves');

// ---------------------------------------------------------------------------
// internalRecipientsFor — purchasing inbox + extras + po.created_by, deduped
// ---------------------------------------------------------------------------
assert.deepEqual(
  internalRecipientsFor({ po: po(), settings: { purchase_contact_email: 'buy@shop.com' } }),
  ['buy@shop.com', 'buyer@clayco.com'],
  'purchase contact + po writer',
);
assert.deepEqual(
  internalRecipientsFor({ po: po(), settings: { purchase_contact_email: 'buyer@clayco.com' } }),
  ['buyer@clayco.com'],
  'deduped when writer == purchase contact',
);
assert.deepEqual(
  internalRecipientsFor({ po: po(), settings: { vendor_notify_emails: ['a@shop.com', 'b@shop.com'] } }),
  ['a@shop.com', 'b@shop.com', 'buyer@clayco.com'],
  'extra internal recipient list',
);
assert.deepEqual(internalRecipientsFor({ po: po({ created_by: 'system' }) }), [], 'non-email writer yields no row');

// ---------------------------------------------------------------------------
// poTemplateContext — exact {po,vendor} shape for templateRender
// ---------------------------------------------------------------------------
{
  const ctx = poTemplateContext(po({ portal_link: 'https://po.link/x' }), vendor());
  assert.deepEqual(Object.keys(ctx).sort(), ['po', 'vendor'], 'context top-level shape');
  assert.deepEqual(
    Object.keys(ctx.po).sort(),
    ['arrive_by', 'line_count', 'number', 'portal_link', 'total', 'vendor_name'],
    'po context keys per spec',
  );
  assert.deepEqual(Object.keys(ctx.vendor).sort(), ['contact_email', 'name'], 'vendor context keys per spec');
  assert.equal(ctx.po.number, 'PO-1042');
  assert.equal(ctx.po.arrive_by, '2026-06-15', 'raw date for `| date` formatter');
  assert.equal(ctx.po.total, 350, 'numeric total for `| money`');
  assert.equal(ctx.po.vendor_name, 'Acme Plastics');
  assert.equal(ctx.po.portal_link, 'https://po.link/x', 'portal link resolved');
  assert.equal(ctx.po.line_count, 2);
  assert.equal(ctx.vendor.name, 'Acme Plastics');
  assert.equal(ctx.vendor.contact_email, 'sales@acme.example');
}
{
  const ctx = poTemplateContext(
    po({ expected_date: '', arrive_by: '2026-07-01' }),
    vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' }),
  );
  assert.equal(ctx.po.arrive_by, '2026-07-01', 'explicit arrive_by field outranks expected_date');
  assert.equal(ctx.vendor.contact_email, '', 'no vendor email → ""');
}

// ---------------------------------------------------------------------------
// notifyDedupeKey — vnotif:<po_id>:<kind>, once per po per kind
// ---------------------------------------------------------------------------
assert.equal(notifyDedupeKey(po(), 'po_created'), 'vnotif:po1:po_created');
assert.equal(notifyDedupeKey(po(), 'file_uploaded'), 'vnotif:po1:file_uploaded', 'per-kind key');
assert.equal(notifyDedupeKey({ po_number: 'PO-9' }, 'quote_request'), 'vnotif:PO-9:quote_request', 'id falls back to po_number');
assert.equal(notifyDedupeKey({}, 'feedback_sent'), 'vnotif:unknown:feedback_sent', 'missing id → unknown');
assert.equal(notifyDedupeKey(po(), 'PO_CREATED'), 'vnotif:po1:po_created', 'kind lowercased');
assert.notEqual(
  notifyDedupeKey(po({ id: 'po2' }), 'po_created'),
  notifyDedupeKey(po(), 'po_created'),
  'per-po key',
);

// ---------------------------------------------------------------------------
// vendorNotificationPlan — po_created
// ---------------------------------------------------------------------------
{
  const plan = vendorNotificationPlan({ event: 'po_created', po: po(), vendor: vendor(), settings: { company_name: 'Clay Co' } });
  assert.equal(plan.kind, 'po_created');
  assert.equal(plan.dedupe_key, 'vnotif:po1:po_created');
  assert.equal(plan.notifications.length, 1, 'one outbound vendor notification');
  const n = plan.notifications[0];
  assert.equal(n.to, 'sales@acme.example');
  assert.equal(n.subject, 'PO PO-1042 from Clay Co', 'spec-pinned subject "PO <number> from <company>"');
  assert.ok(n.body.includes('Arrive by: 6/15/2026'), 'body carries formatted arrive-by');
  assert.ok(n.body.includes(`${DEFAULT_APP_BASE_URL}/vendor?po=po1`), 'body carries portal fallback link');
  assert.ok(n.body.includes('Total: $350.00'), 'body carries money total');
  assert.ok(n.body.includes('Line items: 2'), 'body carries line count');
  assert.ok(n.body.includes('Ship to: Shop dock'), 'ship_to line when present');
  assert.equal(n.kind, 'po_created');
  assert.equal(n.template_key, 'po_created', 'template_key = kind');
  assert.equal(n.deep_link, '/PurchaseOrders?po=po1', 'deep_link is the staff route');
  assert.equal(n.entity_type, 'purchase_order');
  assert.equal(n.entity_id, 'po1');
  assert.equal(n.dedupe_key, 'vnotif:po1:po_created');
  assert.ok(plan.internal.length >= 1, 'always-on internal row present');
  assert.equal(plan.internal[0].link, '/PurchaseOrders?po=po1');
  assert.ok(plan.internal[0].title.includes('PO-1042'));
  assert.deepEqual(plan.flags, [], 'no flags on a fully-resolved plan');
}

// ---------------------------------------------------------------------------
// vendorNotificationPlan — quote_request / feedback_sent / file_uploaded
// ---------------------------------------------------------------------------
{
  const plan = vendorNotificationPlan({ event: { kind: 'quote_request' }, po: po(), vendor: vendor(), settings: {} });
  const n = plan.notifications[0];
  assert.equal(n.template_key, 'quote_request');
  assert.ok(n.subject.includes('PO-1042'), 'quote subject references the PO');
  assert.ok(n.body.includes('Needed by: 6/15/2026'), 'quote body carries arrive-by');
  assert.ok(n.body.includes('/vendor?po=po1'), 'quote body carries portal link');
  assert.ok(plan.internal[0].title.includes('PO-1042'));
}
{
  const plan = vendorNotificationPlan({
    event: { kind: 'feedback_sent', feedback: 'Two panels arrived scratched.', lines: [0, 1] },
    po: po(), vendor: vendor(), settings: {},
  });
  const n = plan.notifications[0];
  assert.equal(n.template_key, 'feedback_sent');
  assert.ok(n.body.includes('Two panels arrived scratched.'), 'feedback text lands in body');
  assert.ok(plan.internal[0].message.includes('2 lines'), 'internal message counts feedback lines');
}
{
  const plan = vendorNotificationPlan({
    event: { kind: 'file_uploaded', file_name: 'packing-slip.pdf', uploaded_by: 'sam@acme.example' },
    po: po(), vendor: vendor(), settings: {},
  });
  const n = plan.notifications[0];
  assert.equal(n.template_key, 'file_uploaded');
  assert.ok(n.body.includes('"packing-slip.pdf"'), 'vendor ack names the file');
  assert.equal(plan.internal[0].title, 'Vendor file uploaded — PO-1042');
  assert.ok(plan.internal[0].message.includes('packing-slip.pdf'));
}
{
  // file name via event.file object; feedback via event.message alias
  const fu = vendorNotificationPlan({ event: { kind: 'file_uploaded', file: { name: 'cert.pdf' } }, po: po(), vendor: vendor() });
  assert.ok(fu.notifications[0].body.includes('"cert.pdf"'), 'event.file.name accepted');
  const fb = vendorNotificationPlan({ event: { kind: 'feedback_sent', message: 'Short count' }, po: po(), vendor: vendor() });
  assert.ok(fb.notifications[0].body.includes('Short count'), 'event.message alias accepted');
}

// ---------------------------------------------------------------------------
// missing vendor email → internal-only + flag
// ---------------------------------------------------------------------------
{
  const bare = vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' });
  const plan = vendorNotificationPlan({ event: 'po_created', po: po(), vendor: bare, settings: {} });
  assert.equal(plan.notifications.length, 0, 'no vendor email → internal-only');
  assert.deepEqual(plan.flags, ['missing_vendor_email'], 'flag raised');
  assert.equal(plan.internal.length, 1, 'internal row still lands');
  assert.equal(plan.internal[0].recipient_email, 'buyer@clayco.com', 'po.created_by receives the internal row');
  assert.ok(plan.internal[0].message.includes('No vendor email on file'), 'internal message explains the flag');
}
{
  // PO's denormalized vendor_email rescues a vendor record with no emails
  const bare = vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' });
  const plan = vendorNotificationPlan({ event: 'po_created', po: po({ vendor_email: 'orders@acme.example' }), vendor: bare, settings: {} });
  assert.equal(plan.notifications[0].to, 'orders@acme.example', 'po.vendor_email hop in plan chain');
}
{
  // settings purchase contact is the tail of the chain
  const bare = vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' });
  const plan = vendorNotificationPlan({ event: 'po_created', po: po({ vendor_email: '' }), vendor: bare, settings: { purchase_contact_email: 'buy@shop.com' } });
  assert.equal(plan.notifications[0].to, 'buy@shop.com', 'purchase_contact_email delivers as last resort');
  assert.deepEqual(plan.flags, [], 'resolving via settings is not a missing_email flag');
}
{
  // unresolved internal recipient → single row with '' (writer fans out)
  const bare = vendor({ contact_email: '', email: '', comm_prefs: {}, contacts: [], statement_email: '' });
  const plan = vendorNotificationPlan({ event: 'po_created', po: po({ created_by: '' }), vendor: bare, settings: {} });
  assert.equal(plan.internal.length, 1);
  assert.equal(plan.internal[0].recipient_email, '', 'unresolved internal recipient → ""');
}

// ---------------------------------------------------------------------------
// fail-closed edges — never throw
// ---------------------------------------------------------------------------
{
  const plan = vendorNotificationPlan({ event: 'po_created', po: null, vendor: vendor() });
  assert.equal(plan.notifications.length, 0);
  assert.equal(plan.internal.length, 0);
  assert.deepEqual(plan.flags, ['missing_po'], 'missing po → flag only');
}
{
  const plan = vendorNotificationPlan({ event: 'bogus_kind', po: po(), vendor: vendor() });
  assert.equal(plan.kind, '', 'unknown kind reported');
  assert.equal(plan.notifications.length, 0);
  assert.deepEqual(plan.flags, ['unknown_event'], 'unknown_event flag');
}
{
  const plan = vendorNotificationPlan();
  assert.equal(plan.notifications.length, 0, 'empty call fails closed');
  assert.ok(plan.flags.includes('missing_po'));
}
{
  // dedupe stability — same po + kind, different events → same key
  const a = vendorNotificationPlan({ event: 'po_created', po: po(), vendor: vendor() });
  const b = vendorNotificationPlan({ event: { kind: 'po_created', actor: 'x' }, po: po(), vendor: vendor() });
  assert.equal(a.dedupe_key, b.dedupe_key, 'dedupe key ignores event extras');
}
{
  // vendor-facing notification deep_link + body work for undated POs
  const plan = vendorNotificationPlan({ event: 'po_created', po: po({ expected_date: '' }), vendor: vendor() });
  assert.ok(plan.notifications[0].body.includes('Arrive by: TBD'), 'arrive-by line always present');
}

rmSync(out);
console.log('PASS vendor-notify');
