// Order Form only: a read-only diagnostic of configuration and existing
// Google Drive backup metadata. This is NOT evidence that uploading a new
// backup or reading it back has succeeded; that needs an actual pre-write run.
export function summarizeOrderBackupReadiness({
  backupEnabled, sheetId, smartsheetConfigured, driveApiRead, driveListRead,
  files = [], checkedAt,
}) {
  const permanentId = String(sheetId ?? '').trim();
  const sheetConfigured = /^\d+$/.test(permanentId) && permanentId !== '0';
  const expectedPrefix = `CCS_OrderRequest_${permanentId}_pre_sync_`;
  const matching = (Array.isArray(files) ? files : [])
    .filter(f => typeof f?.name === 'string' &&
      f.name.startsWith(expectedPrefix) && f.name.endsWith('.json') &&
      f.mimeType === 'application/json' && Number(f.size) > 0 &&
      typeof f.id === 'string' && f.id.length > 0);
  const reasons = [];
  if (!sheetConfigured) reasons.push('Order Request has no valid permanent sheet ID.');
  if (!backupEnabled) reasons.push('Backup before write is disabled for the current configuration.');
  if (!smartsheetConfigured) reasons.push('The Smartsheet API token is unavailable.');
  if (!driveApiRead) reasons.push('Google Drive credential and API metadata could not be verified.');
  if (!driveListRead) reasons.push('Google Drive backup-file listing could not be verified.');
  const canAttemptVerifiedBackup = reasons.length === 0;
  return {
    read_only: true,
    checked_at: checkedAt,
    sheet_id: sheetConfigured ? permanentId : '',
    backup_before_write: backupEnabled === true,
    drive_metadata_readable: driveApiRead === true,
    drive_listing_readable: driveListRead === true,
    candidate_archives_found: matching.length,
    // A list entry proves only metadata exists, NOT that content is restorable.
    existing_artifact_contents_verified: false,
    new_upload_and_readback_verified: false,
    can_attempt_verified_backup: canAttemptVerifiedBackup,
    assessment: canAttemptVerifiedBackup ? 'ready_for_real_backup_test' : 'not_ready',
    reasons,
  };
}
