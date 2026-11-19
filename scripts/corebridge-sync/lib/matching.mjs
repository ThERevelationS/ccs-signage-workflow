export const normalizeAccountName = (value) => String(value || '').toLowerCase()
  .replace(/&/g, ' and ').replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ')
  .replace(/\b(the|llc|inc|incorporated|co|company|corp|corporation|ltd|pllc|pc|lp|llp)\b/g, ' ')
  .replace(/\s+/g, ' ').trim();
export const normalizePhone = (value) => String(value || '').replace(/\D/g, '').slice(-10);
export const normalizeLeadName = (value) => String(value || '').toLocaleLowerCase('en-US')
  .replace(/\p{P}/gu, '').replace(/\s+/g, ' ').trim();

export function matchAccount(account, customers) {
  const name = normalizeAccountName(account.company_name);
  const phone = normalizePhone(account.company_phone);
  const matches = customers.filter((customer) => {
    if (!customer.id || customer.deleted === true || customer.merged_into_customer_id) return false;
    const names = [customer.company_name, ...(Array.isArray(customer.legacy_client_names) ? customer.legacy_client_names : [])];
    return (name && names.some((value) => normalizeAccountName(value) === name)) ||
      (phone.length === 10 && normalizePhone(customer.company_phone) === phone);
  });
  return { kind: matches.length === 0 ? 'new' : matches.length === 1 ? 'linked' : 'ambiguous', matches };
}

export function matchLead(name, customers) {
  const key = normalizeLeadName(name);
  if (!key) return { kind: 'invalid', matches: [] };
  const matches = customers.filter((customer) => customer.id && customer.deleted !== true && !customer.merged_into_customer_id &&
    normalizeLeadName(customer.company_name) === key);
  return { kind: matches.length === 0 ? 'new' : matches.length === 1 ? 'linked' : 'ambiguous', matches };
}
