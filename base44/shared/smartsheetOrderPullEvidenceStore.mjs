// Order Form ONLY. A separate GlobalSettings record retains unresolved pull
// write evidence even if the shared Smartsheet coordinator is replaced by Sales.
// No automatic reconciliation, deletion, or replay is ever performed.
export const ORDER_PULL_EVIDENCE_SETTING_KEY = 'smartsheetOrderPullWriteEvidence';

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((out, key) => {
    out[key] = stable(value[key]);
    return out;
  }, {});
}
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));
const validRun = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const attempted = value => Number.isSafeInteger(value?.attempted_batches) && value.attempted_batches > 0;
const failure = message => Object.assign(new Error(message), { status: 409 });

export async function readOrderPullEvidenceStore(entity) {
  const rows = await entity.filter({ setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY });
  if (!Array.isArray(rows) || rows.length > 1) {
    throw failure('Order pull evidence storage is missing an unambiguous record. No Order pull writes are allowed.');
  }
  return rows[0] || null;
}

export async function assertNoUnresolvedOrderPullEvidence(entity) {
  const record = await readOrderPullEvidenceStore(entity);
  const saved = record?.setting_value;
  if (saved?.state === 'unresolved' || (saved?.state && !['unresolved', 'verified_complete'].includes(saved.state))) {
    throw failure('A previous Order pull has unresolved permanent-ID batch write evidence in independent storage. Review the Base44 Order and Smartsheet row IDs before another pull; no writes were retried.');
  }
  // Invalid or incomplete existing evidence is not grounds to assume success.
  if (record && (!saved || !['verified_complete'].includes(saved.state))) {
    throw failure('Independent Order pull evidence has an unknown outcome. Review before starting another Order pull.');
  }
  return record;
}

async function verifySaved(entity, id, expected) {
  const readback = await entity.get(id);
  if (!readback?.id || String(readback.id) !== String(id) ||
      readback.setting_key !== ORDER_PULL_EVIDENCE_SETTING_KEY ||
      !same(readback.setting_value, expected)) {
    throw failure('Order pull evidence could not be verified after saving. No further Order writes are allowed.');
  }
  return readback;
}

export async function saveOrderPullEvidence(entity, { startedAt, sheetId, batchEvidence } = {}) {
  if (!validRun(startedAt) || !/^\d+$/.test(String(sheetId || '')) ||
      !attempted(batchEvidence) || !Array.isArray(batchEvidence.recent_batches) ||
      batchEvidence.recent_batches.length > 5) {
    throw failure('Order pull batch evidence is incomplete. No further Order writes are allowed.');
  }
  const current = await readOrderPullEvidenceStore(entity);
  const before = current?.setting_value;
  if (before?.state === 'unresolved') {
    if (before.run_started_at !== startedAt || before.smartsheet_sheet_id !== String(sheetId)) {
      throw failure('A different Order pull or sheet has unresolved write evidence. Do not overwrite or retry it.');
    }
    if (Number(before.batch_evidence?.attempted_batches) > batchEvidence.attempted_batches) {
      throw failure('Order pull batch evidence regressed. No further Order writes are allowed.');
    }
  }
  if (current && (!before || !['unresolved', 'verified_complete'].includes(before.state))) {
    throw failure('The existing Order pull evidence state is unknown; no further writes are allowed.');
  }
  const next = {
    state: 'unresolved',
    run_started_at: startedAt,
    smartsheet_sheet_id: String(sheetId),
    batch_evidence: batchEvidence,
    evidence_updated_at: new Date().toISOString(),
  };
  if (!current) {
    // Never retry ambiguous creates. A second attempt must first re-read the
    // store to avoid silently duplicating a permanent evidence record.
    const created = await entity.create({ setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY, setting_value: next });
    if (!created?.id) throw failure('Order pull evidence creation was not confirmed. No Order writes are allowed.');
    await verifySaved(entity, created.id, next);
    const sole = await readOrderPullEvidenceStore(entity);
    if (sole?.id !== created.id) throw failure('Order pull evidence has conflicting records. No Order writes are allowed.');
    return next;
  }
  const result = await entity.updateMany(
    { id: current.id, setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY, updated_date: current.updated_date },
    { $set: { setting_value: next } },
  );
  if (result?.updated !== 1) throw failure('Order pull evidence changed concurrently. No further Order writes are allowed.');
  await verifySaved(entity, current.id, next);
  return next;
}

export async function verifyCompletedOrderPullEvidence(entity, { startedAt } = {}) {
  if (!validRun(startedAt)) throw failure('Missing Order pull run identity; evidence cannot be confirmed.');
  const current = await readOrderPullEvidenceStore(entity);
  const before = current?.setting_value;
  if (!current || before?.state !== 'unresolved' || before.run_started_at !== startedAt ||
      !attempted(before.batch_evidence)) {
    throw failure('The Order pull evidence run does not match; its outcome remains unresolved.');
  }
  const next = { ...before, state: 'verified_complete', verified_at: new Date().toISOString() };
  const result = await entity.updateMany(
    { id: current.id, setting_key: ORDER_PULL_EVIDENCE_SETTING_KEY, updated_date: current.updated_date },
    { $set: { setting_value: next } },
  );
  if (result?.updated !== 1) throw failure('Order pull evidence completion was not saved; review is required.');
  await verifySaved(entity, current.id, next);
  return next;
}
