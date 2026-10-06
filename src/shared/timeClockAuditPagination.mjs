export function validateAuthoritativeAuditPage({
  page,
  scopedId,
  previousPageOldestTimestampMs = null,
  seenPageAuditIds = new Set(),
  seenCursors = new Set(),
}) {
  if (!page || typeof page !== "object" || Array.isArray(page)) {
    throw new Error("Integrity investigation pagination returned a malformed authoritative page.");
  }
  if (!Array.isArray(page.items)) {
    throw new Error("Integrity investigation pagination returned authoritative page items in an invalid format.");
  }
  if (typeof page.has_more !== "boolean") {
    throw new Error("Integrity investigation pagination returned an invalid has_more completeness flag.");
  }
  if (page.next_cursor !== null && page.next_cursor !== undefined && typeof page.next_cursor !== "string") {
    throw new Error("Integrity investigation pagination returned a continuation cursor in an invalid format.");
  }

  const pageItems = page.items;
  if (page.has_more && pageItems.length === 0) {
    throw new Error("Integrity investigation pagination reported more authoritative audit records but returned an empty non-terminal page, so evidence progress cannot be proven.");
  }

  const malformedPageItemIndexes = pageItems
    .map((row, rowIndex) => (!row || typeof row !== "object" || Array.isArray(row) ? rowIndex : -1))
    .filter((rowIndex) => rowIndex >= 0);
  if (malformedPageItemIndexes.length > 0) {
    throw new Error(`Integrity investigation pagination returned ${malformedPageItemIndexes.length} malformed authoritative audit record${malformedPageItemIndexes.length === 1 ? "" : "s"} inside a valid page.`);
  }

  const scopedIdNormalized = String(scopedId || "").trim();
  const mismatchedPageRows = pageItems.filter((row) => String(row.time_entry_id || "").trim() !== scopedIdNormalized);
  if (mismatchedPageRows.length > 0) {
    throw new Error(`Integrity investigation pagination returned ${mismatchedPageRows.length} authoritative audit record${mismatchedPageRows.length === 1 ? "" : "s"} outside the requested TimeEntry scope.`);
  }

  const pageTimestampMs = pageItems.map((row) => Date.parse(String(row.server_timestamp || "")));
  const invalidTimestampIndexes = pageTimestampMs
    .map((timestampMs, rowIndex) => (!Number.isFinite(timestampMs) ? rowIndex : -1))
    .filter((rowIndex) => rowIndex >= 0);
  if (invalidTimestampIndexes.length > 0) {
    throw new Error(`Integrity investigation pagination returned ${invalidTimestampIndexes.length} authoritative audit record${invalidTimestampIndexes.length === 1 ? "" : "s"} without a valid server timestamp required to prove cursor ordering.`);
  }

  const pageOrderingReversalIndex = pageTimestampMs.findIndex((timestampMs, rowIndex) => rowIndex > 0 && timestampMs > pageTimestampMs[rowIndex - 1]);
  if (pageOrderingReversalIndex >= 0) {
    throw new Error("Integrity investigation pagination returned an authoritative page outside newest-to-oldest server timestamp order.");
  }
  if (previousPageOldestTimestampMs !== null && pageTimestampMs.length > 0) {
    const currentPageNewestTimestampMs = pageTimestampMs[0];
    if (currentPageNewestTimestampMs > previousPageOldestTimestampMs) {
      throw new Error("Integrity investigation pagination crossed the prior page timestamp boundary and cannot prove newest-to-oldest cursor ordering.");
    }
    // Equal server timestamps are therefore a legitimate boundary tie; immutable Audit ID
    // uniqueness across pages prevents a tied record from being accepted twice.
  }

  const acceptedPageOldestTimestampMs = pageTimestampMs.length > 0
    ? pageTimestampMs[pageTimestampMs.length - 1]
    : previousPageOldestTimestampMs;
  const pageAuditIds = pageItems.map((row) => String(row.id || "").trim());
  const missingAuditIdIndexes = pageAuditIds
    .map((auditId, rowIndex) => (!auditId ? rowIndex : -1))
    .filter((rowIndex) => rowIndex >= 0);
  if (missingAuditIdIndexes.length > 0) {
    throw new Error(`Integrity investigation pagination returned ${missingAuditIdIndexes.length} authoritative audit record${missingAuditIdIndexes.length === 1 ? "" : "s"} without an immutable Audit ID.`);
  }

  const duplicateAuditIdsWithinPage = [...new Set(pageAuditIds.filter((id, index) => pageAuditIds.indexOf(id) !== index))];
  if (duplicateAuditIdsWithinPage.length > 0) {
    throw new Error(`Integrity investigation pagination returned ${duplicateAuditIdsWithinPage.length} duplicate immutable Audit ID${duplicateAuditIdsWithinPage.length === 1 ? "" : "s"} inside one authoritative page.`);
  }
  const repeatedPageAuditIds = [...new Set(pageAuditIds.filter((id) => seenPageAuditIds.has(id)))];
  if (repeatedPageAuditIds.length > 0) {
    throw new Error(`Integrity investigation pagination repeated ${repeatedPageAuditIds.length} immutable audit record${repeatedPageAuditIds.length === 1 ? "" : "s"} across authoritative pages.`);
  }

  const newPageAuditIds = pageAuditIds.filter((id) => !seenPageAuditIds.has(id));
  if (pageItems.length > 0 && newPageAuditIds.length === 0) {
    throw new Error("Integrity investigation pagination returned a nonempty authoritative page without any new immutable Audit IDs, so cursor evidence progress cannot be proven.");
  }

  const nextCursor = String(page.next_cursor || "").trim();
  if (!page.has_more && nextCursor) {
    throw new Error("Integrity investigation pagination returned a continuation cursor on a terminal authoritative page.");
  }
  if (page.has_more && !nextCursor) {
    throw new Error("Integrity investigation pagination reported more authoritative audit records without a continuation cursor.");
  }
  if (page.has_more && seenCursors.has(nextCursor)) {
    throw new Error("Integrity investigation pagination repeated a continuation cursor and was stopped before it could loop indefinitely.");
  }

  return {
    pageItems,
    newPageAuditIds,
    nextCursor,
    hasMore: page.has_more,
    acceptedPageOldestTimestampMs,
  };
}
