import { classifyOrderLocalOnlyDate } from './smartsheetOrderDateEvidence.mjs';

// Order Form only. Smartsheet DATE cells usually contain ISO calendar dates,
// while legacy TEXT_NUMBER cells may contain US dates or receipt choices.
// Never let JavaScript Date.parse silently normalize an impossible date.
const DATE_FIELDS = ['date_needed', 'date_ordered', 'date_received'];
const OPTION_FIELD_BY_DATE = {
  date_needed: 'date_needed_option',
  date_ordered: 'date_ordered_option',
  date_received: 'receipt_option',
};
export const orderDateOptionField = field => OPTION_FIELD_BY_DATE[field] || '';
const numericId = value => /^\d+$/.test(String(value ?? '').trim()) ? String(value).trim() : '';
const pad = value => String(value).padStart(2, '0');

function calendarDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31) return '';
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day) return '';
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function translateOrderDateValue(value, field = 'date_received') {
  if (value == null || (typeof value === 'string' && !value.trim())) return { kind: 'blank' };
  if (typeof value !== 'string') return { kind: 'invalid', reason: 'Unexpected non-text date cell' };
  const raw = value.trim();
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/i);
  if (match) {
    const date = calendarDate(+match[1], +match[2], +match[3]);
    return date ? { kind: 'date', value: date } : { kind: 'invalid', reason: 'Impossible ISO calendar date' };
  }
  match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2}|\d{3}|\d{4})$/);
  if (match) {
    let year = +match[3];
    if (match[3].length === 2) year += year >= 70 ? 1900 : 2000;
    // Legacy Smartsheet rows contain values such as 03/09/021. Treat a
    // zero-prefixed three-digit year as the obvious 2000-series typo.
    if (match[3].length === 3 && match[3].startsWith('0')) year = 2000 + Number(match[3].slice(1));
    const date = calendarDate(year, +match[1], +match[2]);
    return date ? { kind: 'date', value: date } : { kind: 'invalid', reason: 'Impossible US calendar date' };
  }
  // Date-shaped values are NEVER interpreted as arbitrary text options.
  if (/^\d/.test(raw) || /\d[\/-]\d/.test(raw) || /\d{4}/.test(raw)) {
    return { kind: 'invalid', reason: 'Unrecognized date format; verify the Smartsheet column locale' };
  }
  // The legacy Order Request sheet intentionally mixes dates with choices and
  // notes in all three date columns (ASAP, N/A, Stock, In Stock, free text).
  return { kind: 'text', value: raw.slice(0, 120), field };
}

export function translateOrderDateCell(cell, field) {
  const raw = cell?.value === '' || cell?.value == null
    ? (cell?.display_value ?? cell?.displayValue ?? null) : cell.value;
  return translateOrderDateValue(raw, field);
}

// Full-sheet read-only parity report; row matching uses permanent IDs only.
// No missing remote cell is treated as permission to clear a live Base44 date.
export function auditOrderDateParity(orders, rows, bindings, sheetId, fieldAudits = []) {
  if (!Array.isArray(orders) || !Array.isArray(rows) || !numericId(sheetId)) {
    throw new Error('Complete Order and Smartsheet evidence with a permanent sheet ID is required.');
  }
  const byRow = new Map();
  for (const order of orders) {
    if (order?.deleted || String(order?.smartsheet_sheet_id) !== String(sheetId)) continue;
    const id = numericId(order?.smartsheet_row_id);
    if (!id) continue;
    const matches = byRow.get(id) || [];
    matches.push(order);
    byRow.set(id, matches);
  }
  const counts = { matched: 0, unlinked_smartsheet_rows: 0, duplicate_base44_links: 0,
    smartsheet_date_missing_in_base44: 0, different_dates: 0, invalid_date_values: 0,
    text_option_differences: 0, text_receipt_differences: 0, stale_text_options: 0,
    base44_date_missing_in_smartsheet: 0,
    verified_newer_local_dates: 0, preserved_historical_dates: 0,
    remote_blank_changed_since_sync: 0, remote_blank_after_same_date: 0,
    remote_blank_after_other_value: 0, unverified_local_only_dates: 0 };
  const byField = Object.fromEntries(DATE_FIELDS.map(field => [field,
    { smartsheet_dates: 0, missing_base44: 0, different: 0, invalid: 0, text_choices: 0, stale_text_options: 0,
      verified_newer_local: 0, preserved_historical: 0, remote_blank_changed_since_sync: 0,
      remote_blank_after_same_date: 0, remote_blank_after_other_value: 0,
      unverified_local_only: 0 }]));
  const samples = { missing_dates: [], different_dates: [], invalid_values: [], text_choices: [],
    stale_text_options: [], ambiguous_links: [], unlinked_rows: [],
    verified_newer_local_dates: [], preserved_historical_dates: [],
    remote_blank_changed_since_sync: [], unverified_local_only_dates: [] };
  const sample = (key, item) => { if (samples[key].length < 20) samples[key].push(item); };
  for (const row of rows) {
    const rowId = numericId(row?.id);
    if (!rowId) throw new Error('Smartsheet evidence includes an invalid permanent row ID.');
    const matches = byRow.get(rowId) || [];
    if (matches.length === 0) {
      counts.unlinked_smartsheet_rows++;
      // Preserve source identity for admin review. Never infer a Base44 link
      // from the row's position, customer name, or neighboring rows.
      sample('unlinked_rows', { row_id: rowId });
    } else if (matches.length > 1) {
      counts.duplicate_base44_links++;
      sample('ambiguous_links', { row_id: rowId, base44_order_ids: matches.map(o => o.id).slice(0, 5) });
    } else counts.matched++;
    for (const field of DATE_FIELDS) {
      const columnId = numericId(bindings?.[field]);
      if (!columnId) continue;
      const cell = row.cells?.find(c => String(c.column_id ?? c.columnId) === columnId);
      const parsed = translateOrderDateCell(cell, field);
      // A lingering Base44 text choice can override the displayed date even
      // when the ISO date matches Smartsheet. Blank remote cells are evidence
      // for review, never permission to clear local values automatically.
      if (matches.length === 1 && (parsed.kind === 'date' || parsed.kind === 'blank')) {
        const staleText = String(matches[0]?.[orderDateOptionField(field)] ?? '').trim();
        if (staleText) {
          counts.stale_text_options++;
          byField[field].stale_text_options++;
          sample('stale_text_options', { row_id: rowId, base44_order_id: matches[0].id,
            field, smartsheet_date: parsed.kind === 'date' ? parsed.value : '',
            smartsheet_blank: parsed.kind === 'blank', base44_value: staleText });
        }
      }
      if (parsed.kind === 'blank') {
        if (matches.length === 1 && matches[0][field]) {
          counts.base44_date_missing_in_smartsheet++;
          const evidence = classifyOrderLocalOnlyDate(matches[0], field, columnId, fieldAudits);
          const localDate = String(matches[0][field]).trim();
          let priorRemoteNormalizedDate = '';
          let priorRemoteMatchesBase44 = false;
          if (evidence.prior_remote_value) {
            const priorParsed = translateOrderDateValue(evidence.prior_remote_value, field);
            if (priorParsed.kind === 'date') {
              priorRemoteNormalizedDate = priorParsed.value;
              priorRemoteMatchesBase44 = priorParsed.value === localDate;
            }
          }
          const item = { row_id: rowId, base44_order_id: matches[0].id, field,
            base44_date: localDate,
            last_synced_at: evidence.last_synced_at || '',
            ...(evidence.local_modified_at ? { local_modified_at: evidence.local_modified_at } : {}),
            ...(evidence.prior_remote_value ? { prior_remote_value: evidence.prior_remote_value } : {}),
            ...(priorRemoteNormalizedDate ? { prior_remote_normalized_date: priorRemoteNormalizedDate,
              prior_remote_matches_base44: priorRemoteMatchesBase44 } : {}) };
          if (evidence.state === 'verified_newer_local') {
            counts.verified_newer_local_dates++;
            byField[field].verified_newer_local++;
            sample('verified_newer_local_dates', item);
          } else if (evidence.state === 'preserved_historical') {
            counts.preserved_historical_dates++;
            byField[field].preserved_historical++;
            sample('preserved_historical_dates', item);
          } else if (evidence.state === 'remote_blank_changed_since_sync') {
            counts.remote_blank_changed_since_sync++;
            byField[field].remote_blank_changed_since_sync++;
            if (priorRemoteMatchesBase44) {
              counts.remote_blank_after_same_date++;
              byField[field].remote_blank_after_same_date++;
            } else {
              counts.remote_blank_after_other_value++;
              byField[field].remote_blank_after_other_value++;
            }
            sample('remote_blank_changed_since_sync', item);
          } else {
            counts.unverified_local_only_dates++;
            byField[field].unverified_local_only++;
            sample('unverified_local_only_dates', item);
          }
        }
        continue;
      }
      if (parsed.kind === 'invalid') {
        counts.invalid_date_values++;
        byField[field].invalid++;
        sample('invalid_values', { row_id: rowId, field, column_id: columnId,
          raw: String(cell?.value ?? cell?.display_value ?? '').slice(0, 120), reason: parsed.reason });
        continue;
      }
      if (parsed.kind === 'text') {
        byField[field].text_choices++;
        const optionField = orderDateOptionField(field);
        if (matches.length === 1 &&
            (String(matches[0]?.[optionField] ?? '').trim() !== parsed.value || !!matches[0]?.[field])) {
          counts.text_option_differences++;
          if (field === 'date_received') counts.text_receipt_differences++;
          sample('text_choices', { row_id: rowId, base44_order_id: matches[0].id, field,
            smartsheet_value: parsed.value, base44_value: matches[0]?.[optionField] || matches[0]?.[field] || '' });
        }
        continue;
      }
      byField[field].smartsheet_dates++;
      if (matches.length !== 1) continue;
      const local = String(matches[0]?.[field] ?? '').trim();
      if (!local) {
        counts.smartsheet_date_missing_in_base44++;
        byField[field].missing_base44++;
        sample('missing_dates', { row_id: rowId, base44_order_id: matches[0].id,
          field, smartsheet_date: parsed.value });
      } else if (local !== parsed.value) {
        counts.different_dates++;
        byField[field].different++;
        sample('different_dates', { row_id: rowId, base44_order_id: matches[0].id,
          field, smartsheet_date: parsed.value, base44_date: local });
      }
    }
  }
  return { read_only: true, total_orders_examined: orders.length, total_smartsheet_rows: rows.length,
    counts, by_field: byField, samples,
    sample_limit: 20, destructive_actions: false };
}
