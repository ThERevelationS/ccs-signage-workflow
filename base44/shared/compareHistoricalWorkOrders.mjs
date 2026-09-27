// Pure, read-only comparison of the original WorkOrders_Backup worksheet IDs
// to a complete current WorkOrder snapshot. Neither data set is modified.
const LIMIT = 10000;
const SAMPLE = 12;

function rowId(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function compareHistoricalWorkOrderIds(worksheet, currentRows) {
  if (!Array.isArray(worksheet) || !Array.isArray(currentRows) || !worksheet.length) {
    throw new Error("The historic workbook or current WorkOrder snapshot was incomplete.");
  }
  if (worksheet.length > LIMIT + 1 || currentRows.length > LIMIT) {
    throw new Error("The comparison exceeds its verified record limit.");
  }
  const header = worksheet[0];
  if (!Array.isArray(header)) throw new Error("The historic workbook header is invalid.");
  const idColumns = header.flatMap((cell, index) => String(cell ?? "").trim().toLowerCase() === "id" ? [index] : []);
  if (idColumns.length !== 1) {
    throw new Error("The historic WorkOrder ID column is missing or ambiguous.");
  }
  const backupIds = new Set();
  for (const row of worksheet.slice(1)) {
    if (!Array.isArray(row)) throw new Error("Historic workbook row is invalid.");
    const id = rowId(row[idColumns[0]]);
    if (!id && !row.some(cell => String(cell ?? "").trim())) continue;
    if (!id || id.length > 128 || backupIds.has(id)) {
      throw new Error("Historic workbook contains a missing, invalid, or repeated WorkOrder ID.");
    }
    backupIds.add(id);
  }
  if (!backupIds.size) throw new Error("Historic workbook has no valid WorkOrder IDs.");

  const current = new Map();
  for (const record of currentRows) {
    const id = rowId(record?.id);
    if (!id || id.length > 128 || current.has(id)) {
      throw new Error("Current WorkOrder IDs were missing or repeated.");
    }
    current.set(id, record);
  }

  let matchedNonDeleted = 0, matchedDeleted = 0, missing = 0;
  const samples = { missing_backup_ids: [], matched_backup_ids: [], new_current_ids: [] };
  for (const id of backupIds) {
    const record = current.get(id);
    if (!record) {
      missing += 1;
      if (samples.missing_backup_ids.length < SAMPLE) samples.missing_backup_ids.push(id);
    } else {
      if (record.deleted === true) matchedDeleted += 1;
      else matchedNonDeleted += 1;
      if (samples.matched_backup_ids.length < SAMPLE) samples.matched_backup_ids.push(id);
    }
  }
  let currentOnly = 0, currentOnlyNonDeleted = 0;
  for (const [id, record] of current) {
    if (backupIds.has(id)) continue;
    currentOnly += 1;
    if (record.deleted !== true) currentOnlyNonDeleted += 1;
    if (samples.new_current_ids.length < SAMPLE) samples.new_current_ids.push(id);
  }
  return {
    backup_record_count: backupIds.size,
    current_record_count: current.size,
    backup_ids_found_non_deleted: matchedNonDeleted,
    backup_ids_found_deleted: matchedDeleted,
    backup_ids_absent_from_current: missing,
    current_ids_absent_from_backup: currentOnly,
    current_non_deleted_ids_absent_from_backup: currentOnlyNonDeleted,
    ...samples,
  };
}
