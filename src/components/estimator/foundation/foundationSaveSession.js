const CONFLICT_RE = /409|conflict|changed by another|changed in another session/i;

function classify(error) {
  const msg = String(error && (error.message || error) || '');
  if (CONFLICT_RE.test(msg) || error?.status === 409 || error?.code === 409) return 'conflict';
  return 'failed';
}

export function createFoundationSaveSession() {
  let inFlight = null;

  const run = ({ sourceId, editRevision, getCurrent, saveSource, syncBuilder }) => {
    if (inFlight) return inFlight;
    const attempt = Promise.resolve().then(async () => {
      const warnings = [];
      const base = { sourceId, sourceVersion: null, savedEditRevision: editRevision, sourceSaved: false, builderSync: 'not_required', error: null, warnings };
      const isCurrent = () => {
        try {
          const c = getCurrent() || {};
          return c.sourceId === sourceId && c.editRevision === editRevision && c.loaded === true;
        } catch { return false; }
      };
      if (!isCurrent()) return { ...base, status: 'superseded' };
      let savedProject;
      try {
        savedProject = await saveSource();
      } catch (error) {
        // conflictDetected marks a REAL classified concurrent-edit conflict
        // (CAS moved under the save) — distinct from the local 'conflict'
        // outcomes the page synthesizes for its draft-pending/reload gates, so
        // the merge-conflict dialog opens only for genuine source divergence.
        const cls = classify(error);
        return { ...base, status: isCurrent() ? cls : 'superseded', error, ...(cls === 'conflict' ? { conflictDetected: true } : {}) };
      }
      if (!savedProject || savedProject.id !== sourceId || typeof savedProject.updated_date !== 'string' || !savedProject.updated_date) {
        const error = new Error('Source save returned an unverified record.');
        const cls = classify(error);
        return { ...base, status: isCurrent() ? cls : 'superseded', error, ...(cls === 'conflict' ? { conflictDetected: true } : {}) };
      }
      base.sourceSaved = true;
      base.sourceVersion = savedProject.updated_date;
      if (!isCurrent()) {
        return { ...base, status: 'superseded', builderSync: syncBuilder ? 'pending' : 'not_required' };
      }
      if (syncBuilder) {
        try {
          await syncBuilder(savedProject);
          base.builderSync = 'synced';
        } catch (error) {
          base.builderSync = 'pending';
          base.error = error;
          warnings.push('builder_sync_failed');
          return { ...base, status: isCurrent() ? 'partial' : 'superseded' };
        }
      }
      return { ...base, status: isCurrent() ? 'saved' : 'superseded' };
    });
    const shared = attempt.finally(() => { if (inFlight === shared) inFlight = null; });
    inFlight = shared;
    return shared;
  };

  return { run, isSaving: () => inFlight !== null };
}