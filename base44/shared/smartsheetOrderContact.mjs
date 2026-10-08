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

// Add-only Order Requestor dropdown update. Existing contact emails and display
// names are never translated, relabeled, removed, or reordered.
export function planOrderRequestorContactAppend(existingOptions, user) {
  if (!Array.isArray(existingOptions)) {
    throw new Error('Smartsheet Requestor contact options were not returned as a list.');
  }
  const email = String(user?.email ?? '').trim().toLowerCase();
  const name = String(user?.full_name ?? '').trim();
  if (!isValidContactEmail(email) || !name || name.length > 120) {
    throw new Error('The new app user needs a valid email and full name before joining the Smartsheet Requestor dropdown.');
  }
  const seen = new Set();
  for (const contact of existingOptions) {
    if (!contact || typeof contact !== 'object' || Array.isArray(contact) ||
        !isValidContactEmail(contact.email) || (contact.name != null && typeof contact.name !== 'string')) {
      throw new Error('Existing Smartsheet Requestor contact options could not be verified. No options were changed.');
    }
    const key = contact.email.trim().toLowerCase();
    if (seen.has(key)) {
      throw new Error('Smartsheet Requestor dropdown contains duplicate contact emails. Review it before adding users.');
    }
    seen.add(key);
  }
  // Existing same-email contacts retain their historical labels, including
  // first-name display aliases; never replace them with the new full name.
  if (seen.has(email)) return { changed: false, options: existingOptions };
  return {
    changed: true,
    options: [...existingOptions, { email, name }],
  };
}

export function orderRequestorOptionsPreserved(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual) || actual.length < expected.length) return false;
  return expected.every((contact) => actual.some((row) =>
    String(row?.email || '').trim().toLowerCase() === String(contact?.email || '').trim().toLowerCase() &&
    String(row?.name || '') === String(contact?.name || '')
  ));
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
