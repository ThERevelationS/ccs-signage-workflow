export function orderSaveSyncStatus(status = {}) {
  const pending = Math.max(0, Number(status?.pendingSyncCount) || 0);
  const syncError = String(status?.saveError || '').startsWith(
    'Saved in Base44, but Smartsheet sync needs attention:'
  );

  if (status?.isSyncing) {
    return status?.isPulling
      ? { kind: 'working', text: 'Checking Smartsheet…', title: 'Checking for changes to linked Orders in Smartsheet.' }
      : { kind: 'working', text: 'Syncing to Smartsheet…', title: 'Your saved Order changes are being synchronized to Smartsheet.' };
  }
  if (status?.isSaving) {
    return { kind: 'working', text: 'Saving locally…', title: 'Your Order edits are being saved to Base44 before synchronization.' };
  }
  if (syncError) {
    return { kind: 'error', text: 'Saved locally · Sync needs attention', title: 'Your Base44 save succeeded, but Smartsheet has not been confirmed. Use Retry Sync.' };
  }
  if (String(status?.saveError || '').startsWith('Smartsheet pull')) {
    return { kind: 'error', text: 'Smartsheet pull needs attention', title: status.saveError };
  }
  if (status?.saveError) {
    return { kind: 'error', text: 'Save needs attention', title: 'One or more Order changes could not be saved safely.' };
  }
  if (status?.readError) {
    return { kind: 'error', text: 'Reload Orders', title: 'Order records could not be verified. Reload the Order Form before saving, syncing, or exporting.' };
  }
  if (status?.customerDraftActive) {
    return { kind: 'unsaved', text: 'Finish customer edit', title: 'Finish or leave the customer field before Save & Sync or a Smartsheet pull.' };
  }
  if (status?.hasUnsavedChanges) {
    return { kind: 'unsaved', text: 'Unsaved changes', title: 'Order edits are waiting to be saved.' };
  }
  if (pending > 0) {
    return {
      kind: 'pending',
      text: pending === 1 ? '1 saved · waiting to sync' : `${pending} saved · waiting to sync`,
      title: 'These Order changes are safely saved in Base44 and waiting for Smartsheet confirmation.',
    };
  }
  if (status?.lastSynced) {
    return status?.lastSyncDirection === 'pull'
      ? { kind: 'success', text: 'Smartsheet checked', title: 'The latest manual Smartsheet Order pull completed and the app was refreshed.' }
      : { kind: 'success', text: 'Saved & synced', title: 'The latest Order changes were saved and confirmed in Smartsheet.' };
  }
  if (status?.lastSaved) {
    return { kind: 'local', text: 'Saved locally', title: 'The latest Order changes are saved in Base44.' };
  }
  return { kind: 'ready', text: 'Ready', title: 'No Order changes are currently waiting to save or sync.' };
}
