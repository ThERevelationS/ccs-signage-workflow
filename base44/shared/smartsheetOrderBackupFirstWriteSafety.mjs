// Order Form only: a durable backup is not authorization to write to a
// different Smartsheet revision. Guard the first Order POST or PUT after
// the backup; do not change the shared Sales/pagination behavior.
const permanentId = value => String(value ?? '').trim();

export function orderBackupStillMatchesSheetBeforeFirstWrite(backup, currentSheet, sheetId) {
  const id = permanentId(sheetId);
  return /^\d+$/.test(id) &&
    backup != null && currentSheet != null &&
    permanentId(backup.sheet_id) === id &&
    permanentId(currentSheet.id) === id &&
    Number.isSafeInteger(backup.version) && backup.version >= 0 &&
    Number.isSafeInteger(currentSheet.version) &&
    currentSheet.version === backup.version &&
    Number.isSafeInteger(backup.row_count) && backup.row_count >= 0 &&
    Number.isSafeInteger(currentSheet.totalRowCount) &&
    currentSheet.totalRowCount === backup.row_count &&
    typeof backup.drive_file_id === 'string' &&
    /^[A-Za-z0-9_-]{10,}$/.test(backup.drive_file_id);
}
