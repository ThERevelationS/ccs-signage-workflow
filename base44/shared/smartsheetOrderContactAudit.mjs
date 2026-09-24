import { isValidContactEmail, readSharedOrderRequestor } from './smartsheetOrderContact.mjs';

// Read-only Order Form diagnostic. It never selects a repair or changes either system.
// Row IDs are kept as strings so sorting and 64-bit Smartsheet IDs cannot affect matching.
export function auditOrderRequestorContacts(orders, sheetRows, contactColumnId) {
  const columnId = String(contactColumnId ?? '').trim();
  if (!/^\d+$/.test(columnId)) throw new Error('A permanent Requestor column ID is required.');
  if (!Array.isArray(orders) || !Array.isArray(sheetRows)) {
    throw new Error('Complete Order and Smartsheet row arrays are required.');
  }

  const smartsheetById = new Map();
  for (const row of sheetRows) {
    const rowId = String(row?.id ?? '').trim();
    if (!/^\d+$/.test(rowId) || smartsheetById.has(rowId)) {
      throw new Error('Smartsheet audit received an invalid or repeated permanent row ID.');
    }
    smartsheetById.set(rowId, row);
  }

  const activeOrders = orders.filter((order) => !order?.deleted);
  const linkCounts = new Map();
  for (const order of activeOrders) {
    const rowId = String(order?.smartsheet_row_id ?? '').trim();
    if (/^\d+$/.test(rowId)) linkCounts.set(rowId, (linkCounts.get(rowId) || 0) + 1);
  }

  const categories = [
    'same_name_valid_smartsheet_email',
    'smartsheet_name_mismatch',
    'smartsheet_name_unverified',
    'smartsheet_contact_has_no_valid_email',
    'smartsheet_row_missing',
    'duplicate_base44_row_link',
    'base44_row_link_missing',
  ];
  const counts = Object.fromEntries(categories.map((category) => [category, 0]));
  const recordIds = Object.fromEntries(categories.map((category) => [category, []]));
  const nameKeys = new Set();
  let invalidBase44EmailCount = 0;
  let invalidEmailMatchesName = 0;
  let validBase44EmailCount = 0;
  let blankBase44EmailCount = 0;

  const normalizedName = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

  for (const order of activeOrders) {
    const currentEmail = String(order?.requestor_email ?? '').trim();
    if (!currentEmail) { blankBase44EmailCount++; continue; }
    if (isValidContactEmail(currentEmail)) { validBase44EmailCount++; continue; }

    invalidBase44EmailCount++;
    const baseName = normalizedName(order?.requestor_name);
    nameKeys.add(baseName);
    if (baseName && normalizedName(currentEmail) === baseName) invalidEmailMatchesName++;

    const rowId = String(order?.smartsheet_row_id ?? '').trim();
    let category;
    if (!/^\d+$/.test(rowId)) category = 'base44_row_link_missing';
    else if ((linkCounts.get(rowId) || 0) > 1) category = 'duplicate_base44_row_link';
    else if (!smartsheetById.has(rowId)) category = 'smartsheet_row_missing';
    else {
      const sheetRow = smartsheetById.get(rowId);
      const contactCell = (Array.isArray(sheetRow?.cells) ? sheetRow.cells : [])
        .find((cell) => String(cell?.column_id ?? cell?.columnId ?? '').trim() === columnId);
      const contact = readSharedOrderRequestor(contactCell);
      if (!contact.email) category = 'smartsheet_contact_has_no_valid_email';
      else if (!baseName || !contact.name || normalizedName(contact.name) === normalizedName(contact.email)) {
        category = 'smartsheet_name_unverified';
      } else if (normalizedName(contact.name) !== baseName) {
        category = 'smartsheet_name_mismatch';
      } else {
        // Review candidate only: no automatic update or preference over the current record.
        category = 'same_name_valid_smartsheet_email';
      }
    }
    counts[category]++;
    if (recordIds[category].length < 100) {
      recordIds[category].push({ base44_record_id: String(order.id), smartsheet_row_id: rowId });
    }
  }

  return {
    read_only: true,
    total_active_orders_examined: activeOrders.length,
    smartsheet_rows_examined: sheetRows.length,
    invalid_base44_email_count: invalidBase44EmailCount,
    invalid_email_matches_name: invalidEmailMatchesName,
    distinct_invalid_requestor_names: nameKeys.size,
    valid_base44_email_count: validBase44EmailCount,
    blank_base44_email_count: blankBase44EmailCount,
    counts,
    record_ids_by_category: recordIds,
    record_id_lists_truncated: Object.fromEntries(categories.map((category) =>
      [category, counts[category] > recordIds[category].length])),
  };
}
