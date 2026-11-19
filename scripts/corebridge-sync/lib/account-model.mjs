const clean = (value) => {
  const result = String(value ?? '').trim();
  return !result || /^---\s*not set\s*---$/i.test(result) || result === 'None' ? '' : result;
};
const normalized = (value) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const money = (value) => {
  const result = Number(String(value || '').replace(/[$,]/g, ''));
  return Number.isFinite(result) ? result : null;
};
const STATUS = {
  Client: ['active', true], 'Client (Inactive)': ['inactive', false],
  Prospect: ['prospect', true], Lead: ['prospect', true],
  'Prospect (Inactive)': ['inactive', false], 'Lead (Inactive)': ['inactive', false],
};
const compact = (row) => {
  for (const key of Object.keys(row)) if (row[key] === '' || row[key] === null || row[key] === undefined) delete row[key];
  return row;
};
const refContact = (references, id) => references.contacts.get(Number(id)) || references.contacts.get(String(id));
const phone = (contact, type) => {
  for (const name of ['Primary', 'Secondary', 'Tertiary']) {
    if (!String(contact?.[`${name}PhoneNumberTypeText`] || '').toLowerCase().includes(type)) continue;
    if (contact?.[`${name}PhoneNumber`]) return clean(contact[`${name}PhoneNumber`]);
  }
  return '';
};
const officePhone = (contact) => phone(contact, 'work') || phone(contact, 'office') ||
  (!/cell|mobile/i.test(contact?.PrimaryPhoneNumberTypeText || '') ? clean(contact?.PrimaryPhoneNumber) : '');
const mobilePhone = (contact) => phone(contact, 'mobile') || phone(contact, 'cell');

export function accountContacts(account, references) {
  const ids = [...new Set([...(account.contact_ids || []), account.primary_contact_id, account.billing_contact_id]
    .map(String).filter((id) => /^\d+$/.test(id) && Number(id) > 0))];
  const contacts = [...references.contacts.values()].filter((item) => String(item.AccountId) === String(account.acct_id));
  for (const id of ids) {
    const contact = refContact(references, id);
    if (!contact || String(contact.AccountId) !== String(account.acct_id)) {
      throw new Error(`Account ${account.acct_id} contact ${id} is missing from the CoreBridge contact list.`);
    }
    if (!contacts.some((item) => String(item.Id) === id)) contacts.push(contact);
  }
  return contacts.sort((a, b) => Number(a.Id) - Number(b.Id));
}

export function accountCustomerRow(account, contacts) {
  const [status, active] = STATUS[account.account_status] || ['prospect', true];
  const primary = contacts.find((item) => String(item.Id) === String(account.primary_contact_id));
  const billing = contacts.find((item) => String(item.Id) === String(account.billing_contact_id));
  const notes = [...account.notes_raw.map((item) => `CoreBridge note: ${item.replace(/Remove$/, '').trim()}`),
    ...account.flags_raw.map((item) => `CoreBridge flag: ${item.replace(/Remove$/, '').trim()}`)].join('\n');
  const a = account.billing, s = account.shipping;
  return compact({
    __source_id__: String(account.acct_id), company_name: clean(account.company_name), company_phone: clean(account.company_phone),
    customer_status: status, is_active: active, pricing_tier: Number(account.pricing_tier?.value) || 1,
    terms: clean(account.payment_terms?.text), salesperson: clean(account.salesperson?.text),
    customer_origination: clean(account.referred_by?.text), industry_type: clean(account.industry_type?.text),
    master_account: clean(account.master_account?.text), default_tax_group: clean(account.tax_group).replace(/\s*\([\d.]+%\)\s*$/, ''),
    tax_exempt: !!account.tax_exempt, tax_id_number: clean(account.tax_id_number),
    tax_exempt_reason: clean(account.tax_exempt_reason), tax_exempt_expiration: clean(account.tax_id_expiration),
    require_purchase_order: !!account.require_po, send_monthly_statements: !account.opt_out_statement,
    credit_limit: money(account.credit_limit), shipping_account: /no shipping/i.test(account.shipping_account) ? '' : clean(account.shipping_account),
    billing_address_1: clean(a.street1), billing_address_2: clean(a.street2), billing_city: clean(a.city), billing_state: clean(a.state),
    billing_postal_code: clean(a.zip), billing_country: clean(a.country) === 'US' ? 'United States' : clean(a.country) || 'United States',
    location_address_1: clean(s.street1), location_address_2: clean(s.street2), location_city: clean(s.city),
    location_state: clean(s.state), location_postal_code: clean(s.zip),
    location_same_as_billing: !clean(s.street1) || (normalized(s.street1) === normalized(a.street1) && normalized(s.zip) === normalized(a.zip)),
    contact_first_name: clean(primary?.FirstName), contact_last_name: clean(primary?.LastName), contact_email: clean(primary?.Email),
    contact_office_phone: officePhone(primary), contact_cell_phone: mobilePhone(primary),
    billing_contact_same: !billing || String(billing.Id) === String(primary?.Id),
    billing_contact_name: billing && billing !== primary ? `${clean(billing.FirstName)} ${clean(billing.LastName)}`.trim() : '',
    billing_contact_email: billing && billing !== primary ? clean(billing.Email) : '',
    billing_contact_phone: billing && billing !== primary ? officePhone(billing) || mobilePhone(billing) : '',
    notes: [`CoreBridge ID: ${account.acct_id}`, `CoreBridge status: ${account.account_status}; created ${account.date_created}`, notes].filter(Boolean).join('\n'),
  });
}

export function accountContactRows(account, contacts) {
  return contacts.filter((contact) => clean(contact.FirstName) || clean(contact.LastName) || clean(contact.Email)).map((contact) => {
    const id = String(contact.Id);
    const isPrimary = id === String(account.primary_contact_id), isBilling = id === String(account.billing_contact_id);
    const type = [isPrimary && 'Primary', isBilling && 'Billing'].filter(Boolean).join(' / ');
    const first = clean(contact.FirstName), last = clean(contact.LastName), email = clean(contact.Email);
    return compact({
      __source_id__: `${account.acct_id}:cb-${id}`, customer_id: String(account.acct_id),
      first_name: first, last_name: last, display_name: !first && !last ? email : '',
      email, phone: officePhone(contact), mobile_phone: mobilePhone(contact),
      is_primary: isPrimary, is_billing_contact: isBilling,
      authority_role: isBilling && !isPrimary ? 'accounts_payable' : 'unknown',
      is_active: contact.IsActive !== false, notes: `CoreBridge contact type: ${type || 'Contact'}`,
    });
  });
}

export function accountAddressRows(account) {
  const addresses = [];
  const a = account.billing, s = account.shipping;
  const same = clean(a.street1) && normalized(a.street1) === normalized(s.street1) && normalized(a.zip) === normalized(s.zip);
  if (clean(a.street1)) addresses.push(compact({
    __source_id__: `${account.acct_id}:billing`, customer_id: String(account.acct_id),
    label: 'Billing', address_line_1: clean(a.street1), address_line_2: clean(a.street2),
    city: clean(a.city), state: clean(a.state), postal_code: clean(a.zip), country: clean(a.country) || 'US',
    site_type: same ? 'install_and_billing' : 'billing', is_billing_address: true, is_primary_site: !!same, is_active: true,
  }));
  if (clean(s.street1) && !same) addresses.push(compact({
    __source_id__: `${account.acct_id}:shipping`, customer_id: String(account.acct_id),
    label: clean(s.name) || 'Shipping', address_line_1: clean(s.street1), address_line_2: clean(s.street2),
    city: clean(s.city), state: clean(s.state), postal_code: clean(s.zip), country: clean(s.country) || 'US',
    site_type: 'install', is_billing_address: false, is_primary_site: true, is_active: true,
  }));
  return addresses;
}
