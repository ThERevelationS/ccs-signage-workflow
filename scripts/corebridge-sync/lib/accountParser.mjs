const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', hellip: '…', copy: '©', reg: '®', trade: '™' };
const decode = (value) => String(value ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);?/gi, (whole, entity) => {
  if (entity[0] === '#') {
    const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }
  return ENTITIES[entity.toLowerCase()] ?? whole;
});

function parseHtml(html) {
  const root = { tag: 'root', attrs: {}, children: [], parent: null };
  const nodes = [], byId = new Map(), stack = [root];
  const source = String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '').replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  for (const match of source.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<\/[a-z][^>]*>|<[a-z](?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+/gi)) {
    const token = match[0];
    if (token.startsWith('<!')) continue;
    if (token.startsWith('</')) {
      const name = token.slice(2).match(/^[\w:-]+/)?.[0].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === name) { stack.length = i; break; }
      }
    } else if (token.startsWith('<')) {
      const name = token.slice(1).match(/^[\w:-]+/)?.[0].toLowerCase();
      if (!name) continue;
      const attrs = {};
      const raw = token.slice(name.length + 1, -1);
      for (const attr of raw.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        attrs[attr[1].toLowerCase()] = decode(attr[2] ?? attr[3] ?? attr[4] ?? '');
      }
      const parent = stack[stack.length - 1];
      const node = { tag: name, attrs, children: [], parent };
      parent.children.push(node);
      nodes.push(node);
      if (attrs.id && !byId.has(attrs.id)) byId.set(attrs.id, node);
      if (!VOID.has(name) && !/\/\s*>$/.test(token)) stack.push(node);
    } else stack[stack.length - 1].children.push(decode(token));
  }
  return { nodes, byId };
}

const flatText = (node) => !node ? '' : node.children.map((child) => typeof child === 'string' ? child : flatText(child)).join('');
const text = (node) => flatText(node).replace(/\s+/g, ' ').trim();
const descendants = (node, tag) => {
  if (!node) return [];
  const out = [];
  const walk = (item) => {
    for (const child of item.children) if (typeof child !== 'string') {
      if (child.tag === tag) out.push(child);
      walk(child);
    }
  };
  walk(node);
  return out;
};

export function parseAccount(html, id) {
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid CoreBridge account ID.');
  const { byId } = parseHtml(html);
  const node = (key) => byId.get(key);
  const value = (key) => node(key)?.attrs.value ?? '';
  const label = (key) => text(node(key));
  const checked = (key) => Object.hasOwn(node(key)?.attrs || {}, 'checked');
  const selected = (key) => {
    const select = node(key);
    if (!select) return null;
    const option = descendants(select, 'option').find((item) => Object.hasOwn(item.attrs, 'selected'));
    return option ? { text: text(option), value: option.attrs.value ?? '' } : null;
  };
  const prefix = 'ctl00_ContentPlaceHolder1_';
  const accountId = Number(value('hfAccountId'));
  if (accountId !== id || !node('CompanyNameLabel') || !node(`${prefix}lblAccountStatus`)) {
    throw new Error(`CoreBridge account ${id} returned an invalid detail page.`);
  }
  const primary = node(`${prefix}ucContactManager_rdoChangePrimaryContact`);
  let contactRow = primary;
  while (contactRow && contactRow.tag !== 'tr') contactRow = contactRow.parent;
  const contacts = [text(contactRow), ...descendants(primary, 'label').map(text), label('contactSelectionHeader')].filter(Boolean);
  const tableRows = (key) => descendants(node(key), 'tr').map(text).filter(Boolean);
  const address = (kind) => ({
    ...(kind === 'Shipping' ? { name: label('lblShippingAddressName') } : {}),
    street1: label(`${kind}AddressStreet1Label`), street2: label(`${kind}AddressStreet2Label`),
    city: label(`${kind}AddressCityLabel`), state: label(`${kind}AddressStateLabel`),
    zip: label(`${kind}AddressZipLabel`), country: label(`${kind}AddressCountryLabel`),
  });
  const account = {
    acct_id: id, company_name: label('CompanyNameLabel'), date_created: label(`${prefix}DateCreatedLabel`),
    account_status: label(`${prefix}lblAccountStatus`), company_phone: label('lblCompanyPhone'),
    pricing_tier: selected('ddCustomerPricingTier'), payment_terms: selected(`${prefix}PaymentTermsDropDown`),
    salesperson: selected(`${prefix}SalesPeopleDropDown`), salesperson2: selected(`${prefix}SalesPeople2DropDown`),
    referred_by: selected(`${prefix}ddlReferredBy`), industry_type: selected(`${prefix}ddlIndustryTypes`),
    master_account: selected(`${prefix}ddlMasterAccount`), tax_exempt: checked('radiobtnTaxExemptYes'),
    tax_id_number: label('txtTaxIdNumber'), tax_id_expiration: label('lblTxtTaxIDExpirationDate'),
    tax_exempt_reason: label('lblTxtTaxExemptReason'), require_po: checked('rbRequirePoYes'),
    opt_out_statement: checked('rdoOptOutMonthlyStatementYes'), credit_limit: value('txtCreditLimit'),
    credit_balance: label(`${prefix}lblCreditBalance`), in_store_credit: label('divNumberInStoreCredit'),
    balance_due: label('divBalanceDue'), shipping_account: label('txtShippingAccount'),
    tax_group: label('PreviewShippingAddressTaxGroupLabel'),
    billing: address('Billing'), shipping: address('Shipping'),
    shipping_address_list: descendants(node('ddlShippingAddresses'), 'option').map((option) => ({
      id: option.attrs.value ?? '', name: text(option),
    })),
    primary_contact_id: value('hfPrimaryContactId'), billing_contact_id: value('hfBillingContactId'),
    contacts_raw: contacts, notes_raw: tableRows(`${prefix}accountNotes_tblNotes`),
    flags_raw: tableRows(`${prefix}accountFlags_tblFlags`),
  };
  Object.defineProperty(account, 'contact_ids', {
    value: [...new Set(descendants(primary, 'input').map((item) => item.attrs.value || '').filter((item) => /^\d+$/.test(item) && Number(item) > 0))],
    enumerable: false,
  });
  return account;
}
