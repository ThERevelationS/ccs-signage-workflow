// Sales history pages must not mix cursor positions from two WorkOrder versions.
// A new committed Sales edit changes WorkOrder.updated_date. Fail closed if
// it changes while walking older pages; restart from the newest page instead.
export const SALES_HISTORY_STALE_CODE = 'SALES_HISTORY_STALE';

const versionOf = (record) => typeof record?.updated_date === 'string'
  ? record.updated_date.trim() : '';

export function validateSalesHistoryPageVersion(record, page = null) {
  const actual = versionOf(record);
  if (!actual || actual.length > 128) {
    throw Object.assign(new Error('Sales history version is unavailable. Reload before paging.'), {
      status: 409, code: SALES_HISTORY_STALE_CODE,
    });
  }
  if (page !== null && (
    typeof page?.work_order_version !== 'string' ||
    page.work_order_version !== actual
  )) {
    throw Object.assign(new Error('Sales history changed while loading older entries. Refresh Sales history to restart safely.'), {
      status: 409, code: SALES_HISTORY_STALE_CODE,
    });
  }
  return actual;
}

export async function verifySalesHistoryPageVersionAfterRead(entity, workOrderId, openedVersion) {
  const latest = await entity.get(workOrderId);
  return validateSalesHistoryPageVersion(latest, { work_order_version: openedVersion });
}
