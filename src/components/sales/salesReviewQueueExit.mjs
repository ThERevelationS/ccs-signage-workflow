import { classifySalesTaskStatusAudit } from '../../../base44/shared/salesTaskStatusAudit.mjs';

// A review row that was corrected locally may leave its filtered queue.
// Retain its already-open details, but never retain a hidden row because
// filters changed, another row was opened, or an external update hid it.
export function salesReviewQueueFilterKey({
  attentionFilter, recordScope, filterStatus, searchTerm, outcomePeriod,
  customFilters, customHeaderFilter,
} = {}) {
  return JSON.stringify({
    attentionFilter, recordScope, filterStatus, searchTerm, outcomePeriod,
    customFilters, customHeaderFilter,
  });
}

export function canKeepLocallyResolvedSalesReview({ selectedId, workOrderBefore, workOrderAfter, attentionFilter }) {
  return Boolean(selectedId && selectedId === workOrderBefore?.id &&
    selectedId === workOrderAfter?.id && attentionFilter === 'task_status_review' &&
    classifySalesTaskStatusAudit(workOrderBefore).kind === 'modern_review' &&
    classifySalesTaskStatusAudit(workOrderAfter).kind === 'none');
}

export function keepLocallyResolvedSalesReviewDetails({ selectedId, exit, filterKey, latestRow }) {
  return Boolean(selectedId && exit?.id === selectedId && exit.filterKey === filterKey &&
    latestRow?.id === selectedId &&
    classifySalesTaskStatusAudit(latestRow).kind === 'none');
}

export function nextSalesReviewQueueIndex({ filteredRows = [], selectedId, anchor, direction }) {
  const currentIndex = filteredRows.findIndex(row => row.id === selectedId);
  const position = currentIndex >= 0 ? currentIndex :
    Number.isInteger(anchor) ? anchor : 0;
  const targetIndex = currentIndex >= 0 ? currentIndex + direction :
    direction > 0 ? position : position - 1;
  return targetIndex >= 0 && targetIndex < filteredRows.length ? targetIndex : -1;
}
