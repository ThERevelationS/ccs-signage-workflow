// Build import rows (app field names) from the CoreBridge captures + match plan.
const fs = require('fs');
const D = 'imports/corebridge-2026-11-16/';
const cb = JSON.parse(fs.readFileSync(D + 'accounts-detail.json', 'utf8')).accounts;
const app = new Map(JSON.parse(fs.readFileSync(D + 'app-customers-before.json', 'utf8')).map((r) => [r.id, r]));
const plan = JSON.parse(fs.readFileSync(D + 'match-plan.json', 'utf8'));
const s = (v) => { const t = String(v ?? '').trim(); return !t || /^---\s*not set\s*---$/i.test(t) || t === 'None' ? '' : t; };
const money = (v) => { const n = Number(String(v || '').replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
const STATUS = { 'Client': ['active', true], 'Client (Inactive)': ['inactive', false], 'Prospect': ['prospect', true], 'Lead': ['prospect', true], 'Prospect (Inactive)': ['inactive', false], 'Lead (Inactive)': ['inactive', false] };
// CSV parse (quoted fields)
function csv(text) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; } if (f || row.length) { row.push(f); rows.push(row); } const [h, ...b] = rows; return b.filter((r) => r.length > 1).map((r) => Object.fromEntries(h.map((k, i) => [k, r[i] ?? '']))); }
const contactsCsv = csv(fs.readFileSync(D + 'customers.csv', 'utf8').replace(/^\uFEFF/, ''));
const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (x) => String(x || '').replace(/\D/g, '').slice(-10);
const byName = new Map(); for (const a of cb) { const k = norm(a.company_name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(a); }
const contactsByAcct = new Map(); const unassigned = [];
for (const r of contactsCsv) {
  let cands = byName.get(norm(r.CompanyName)) || [];
  if (cands.length > 1) { const p = digits(r.BusinessPhone), ad = norm(r.BillingAddress1); const f = cands.filter((a) => (p && digits(a.company_phone) === p) || (ad && norm(a.billing.street1) === ad)); cands = f.length === 1 ? f : cands; }
  if (cands.length !== 1) { unassigned.push({ company: r.CompanyName, contact: `${r.ContactFirstName} ${r.ContactLastName}`.trim(), reason: cands.length ? 'duplicate CoreBridge company name' : 'company not found' }); continue; }
  const id = cands[0].acct_id; if (!contactsByAcct.has(id)) contactsByAcct.set(id, []); contactsByAcct.get(id).push(r);
}
function customerRow(a) {
  const [status, active] = STATUS[a.account_status] || ['prospect', true];
  const cs = contactsByAcct.get(a.acct_id) || [];
  const prim = cs.find((c) => /Primary/.test(c.ContactType) && (c.ContactFirstName || c.ContactLastName || c.ContactEmail)) || null;
  const bill = cs.find((c) => /Billing/.test(c.ContactType) && (c.ContactFirstName || c.ContactLastName || c.ContactEmail)) || null;
  const anyRow = cs[0] || {};
  const notes = [...a.notes_raw.map((n) => `CoreBridge note: ${n.replace(/Remove$/, '').trim()}`), ...a.flags_raw.map((n) => `CoreBridge flag: ${n.replace(/Remove$/, '').trim()}`)].join('\n');
  const ship = a.shipping;
  const r = {
    __source_id__: String(a.acct_id), company_name: s(a.company_name), company_phone: s(a.company_phone) || s(anyRow.BusinessPhone), company_fax: s(anyRow.BusinessFax),
    customer_status: status, is_active: active, pricing_tier: Number(a.pricing_tier?.value) || 1,
    terms: s(a.payment_terms?.text), salesperson: s(a.salesperson?.text), customer_origination: s(a.referred_by?.text), industry_type: s(a.industry_type?.text),
    master_account: s(a.master_account?.text), default_tax_group: s(a.tax_group).replace(/\s*\([\d.]+%\)\s*$/, ''),
    tax_exempt: !!a.tax_exempt, tax_id_number: s(a.tax_id_number), tax_exempt_reason: s(a.tax_exempt_reason), tax_exempt_expiration: s(a.tax_id_expiration),
    require_purchase_order: !!a.require_po, send_monthly_statements: !a.opt_out_statement, credit_limit: money(a.credit_limit), shipping_account: /no shipping/i.test(a.shipping_account) ? '' : s(a.shipping_account),
    billing_address_1: s(a.billing.street1), billing_address_2: s(a.billing.street2), billing_city: s(a.billing.city), billing_state: s(a.billing.state), billing_postal_code: s(a.billing.zip), billing_country: (s(a.billing.country) === 'US' ? '' : s(a.billing.country)) || 'United States',
    location_address_1: s(ship.street1), location_address_2: s(ship.street2), location_city: s(ship.city), location_state: s(ship.state), location_postal_code: s(ship.zip),
    location_same_as_billing: !s(ship.street1) || (norm(ship.street1) === norm(a.billing.street1) && norm(ship.zip) === norm(a.billing.zip)),
    contact_first_name: s(prim?.ContactFirstName), contact_last_name: s(prim?.ContactLastName), contact_email: s(prim?.ContactEmail), contact_office_phone: s(prim?.ContactWorkPhone), contact_cell_phone: s(prim?.ContactCellPhone),
    job_authority: s(prim?.JobAuthority).replace(/^N\/A$/, ''), location: s(anyRow.Location),
    billing_contact_same: !bill || bill === prim, billing_contact_name: bill && bill !== prim ? `${s(bill.ContactFirstName)} ${s(bill.ContactLastName)}`.trim() : '', billing_contact_email: bill && bill !== prim ? s(bill.ContactEmail) : '', billing_contact_phone: bill && bill !== prim ? s(bill.ContactWorkPhone) || s(bill.ContactCellPhone) : '',
    notes: [`CoreBridge ID: ${a.acct_id}`, `CoreBridge status: ${a.account_status}; created ${a.date_created}`, notes].filter(Boolean).join('\n'),
  };
  for (const k of Object.keys(r)) if (r[k] === '' || r[k] === null) delete r[k];
  return r;
}
const cbById = new Map(cb.map((a) => [a.acct_id, a]));
const empty = (v) => v === null || v === undefined || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
const AUTH = new Set(['pricing_tier', 'customer_status', 'is_active', '__source_id__', 'company_name']);
const newRows = plan.new.map((id) => customerRow(cbById.get(id)));
const linked = [...plan.exact.map(([acct, id]) => [acct, id]), ...plan.phone.map((x) => [x.acct, x.app_id])];
const updateRows = linked.map(([acct, id]) => {
  const full = customerRow(cbById.get(acct)); const cur = app.get(id); const r = {};
  for (const [k, v] of Object.entries(full)) if (AUTH.has(k) || empty(cur[k]) || (k === 'tax_exempt' && v === true) || (k === 'require_purchase_order' && v === true)) r[k] = v;
  r.company_name = cur.company_name; // keep the app's own name
  r.notes = empty(cur.notes) ? full.notes : `${cur.notes}\n${full.notes}`;
  // booleans the app holds as placeholder defaults: only override when CB says otherwise
  for (const k of ['billing_contact_same', 'location_same_as_billing', 'send_monthly_statements']) if (!empty(cur[k]) && cur[k] !== full[k] && k in r === false) r[k] = full[k];
  return { app_id: id, row: r };
});
const contactRows = [];
for (const [acct, cs] of contactsByAcct) { const seen = new Set(); cs.forEach((c, i) => {
  const first = s(c.ContactFirstName), last = s(c.ContactLastName), email = s(c.ContactEmail);
  if (!first && !last && !email) return;
  const key = norm(`${first} ${last} ${email}`); if (seen.has(key)) return; seen.add(key);
  const types = c.ContactType || '';
  const r = { __source_id__: `${acct}:${i}`, customer_id: String(acct), first_name: first, last_name: last, middle: s(c.ContactMiddleName), email, phone: s(c.ContactWorkPhone), mobile_phone: s(c.ContactCellPhone),
    is_primary: /Primary/.test(types), is_billing_contact: /Billing/.test(types), authority_role: /Billing/.test(types) && !/Primary/.test(types) ? 'accounts_payable' : 'unknown', is_active: !/Inactive/i.test(c.ContactStatus),
    notes: [`CoreBridge contact type: ${types}`, s(c.JobAuthority).replace(/^N\/A$/, '') && `Job authority: ${c.JobAuthority}`].filter(Boolean).join('\n') };
  if (!r.first_name && !r.last_name) r.display_name = email;
  delete r.middle; for (const k of Object.keys(r)) if (r[k] === '') delete r[k];
  contactRows.push(r);
}); }
const skipped = plan.ambiguous.map((x) => ({ acct: x.acct, name: x.name, app_ids: x.app_ids, cb_same_name: x.cb_same_name }));
fs.writeFileSync(D + 'rows-new-customers.json', JSON.stringify(newRows));
fs.writeFileSync(D + 'rows-linked-updates.json', JSON.stringify(updateRows));
fs.writeFileSync(D + 'rows-contacts.json', JSON.stringify(contactRows.filter((r) => !skipped.some((x) => String(x.acct) === r.customer_id))));
fs.writeFileSync(D + 'skipped-for-review.json', JSON.stringify({ ambiguous_customers: skipped, unassigned_contacts: unassigned }, null, 1));
console.log({ csvRows: contactsCsv.length, new: newRows.length, linked: updateRows.length, contacts: contactRows.length, contactsForSkippedAccts: contactRows.filter((r) => skipped.some((x) => String(x.acct) === r.customer_id)).length, unassignedContacts: unassigned.length, skipped: skipped.length });
console.log(JSON.stringify(newRows.find((r) => r.tax_exempt) || newRows[0]));
console.log(JSON.stringify(updateRows[0]));

