// Order Form only: never offer a recovery button that the protected-draft
// reload guard would silently reject. Do not infer remote sync completion.
const remoteSyncFailurePrefix = 'Saved in Base44, but Smartsheet sync needs attention:';

export function orderSaveRecoveryAction({
  saveError = '',
  readError = '',
  hasProtectedDrafts = false,
  busy = false,
} = {}) {
  if (!saveError) return null;
  if (hasProtectedDrafts) {
    return {
      kind: 'protected_edits',
      label: '',
      disabled: true,
      guidance: 'Unsaved Order edits are protected. Review them, then use Save & Sync above. Reloading is unavailable while edits remain.',
    };
  }
  if (String(saveError).startsWith(remoteSyncFailurePrefix) && !readError) {
    return { kind: 'retry_sync', label: 'Retry Sync', disabled: Boolean(busy), guidance: '' };
  }
  return { kind: 'reload', label: 'Reload Orders', disabled: Boolean(busy), guidance: '' };
}
