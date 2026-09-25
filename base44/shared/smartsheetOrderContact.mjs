// Order Form only: Smartsheet CONTACT_LIST uses value=email and displayValue=name.
// Keep shared-column translation separate from Sales and never guess an email from display text.
export function sharedOrderRequestorColumnId(bindings) {
  const nameId = String(bindings?.requestor_name ?? '').trim();
  const emailId = String(bindings?.requestor_email ?? '').trim();
  return /^\d+$/.test(nameId) && nameId === emailId ? nameId : '';
}

export function isValidContactEmail(value) {
  const email = String(value ?? '').trim();
  return email.length <= 320 && /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/.test(email);
}

export function readSharedOrderRequestor(cell) {
  const raw = typeof cell?.value === 'string' ? cell.value.trim() : '';
  const label = typeof cell?.display_value === 'string'
    ? cell.display_value.trim()
    : (typeof cell?.displayValue === 'string' ? cell.displayValue.trim() : '');
  const hasEmail = isValidContactEmail(raw);
  return {
    // When Smartsheet omits the display name, never copy an email into Name.
    name: label || (hasEmail ? undefined : (raw || undefined)),
    email: hasEmail ? raw : undefined,
  };
}

export function buildSharedOrderContactCell(record, columnId) {
  const email = String(record?.requestor_email ?? '').trim();
  if (!isValidContactEmail(email)) return null;
  const name = String(record?.requestor_name ?? '').trim().slice(0, 4000);
  return {
    columnId,
    value: email,
    ...(name && name !== email ? { displayValue: name } : {}),
  };
}
