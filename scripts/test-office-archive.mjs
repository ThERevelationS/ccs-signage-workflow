// Regression tests for archive-authoritative PermitLocality office writes.
// Uses the real Jasper/Bloomingburg/Venice shapes observed in the 2026-11-27
// outbox/mirror evidence; no network and no fleet access.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeOfficeArchiveName,
  officeMatchesArchivedOffice,
  filterArchivedOffices,
  mergeArchivedOfficeLists,
  mergeLocalityWriteData,
  overlayPendingLocalityWriteData,
  overlayPendingLocalityWrites,
} from './lib/office-archive.mjs';
import { compactOutbox, readPendingWritesFor, sanitizeLocalityWriteData, OUTBOX } from './lib/outbox.mjs';

// ── Jasper Township: same office, reindexed id + doubled scrape token ─────
{
  const archived = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-4',
    name: 'Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
    retired_reason: 'not a permitting office',
    retired_at: '2026-11-27T07:59:25.251Z',
    retired_by: 'nonpermit-selective-cleanup',
  };
  const activeVariant = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-9',
    name: 'Ohio Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
    contact_phone: '(614) 644-1559',
    authority_verification_status: 'needs_verification',
  };
  const rebuiltVariant = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-4',
    name: 'Ohio Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
  };

  assert.equal(normalizeOfficeArchiveName('Ohio Ohio Civil Rights Commission'), 'ohio civil rights commission');
  assert.equal(officeMatchesArchivedOffice(activeVariant, archived), true, 'Jasper active variant must match despite reindex + doubled token');
  assert.equal(officeMatchesArchivedOffice(rebuiltVariant, archived), true, 'Jasper rebuilt variant matches by id as well');
  const filtered = filterArchivedOffices([activeVariant, rebuiltVariant], [archived]);
  assert.equal(filtered.offices.length, 0);
  assert.equal(filtered.removed.length, 2);
}

// ── Venice Township: same name+role, profile reindexed across duplicates ──
{
  const archived = {
    id: 'scan-6ae9a84a6fd312e31e5a72e8-office-4',
    name: 'Election Inspector',
    authority_roles: ['electrical_inspection'],
    retired_reason: 'not a permitting office',
  };
  const activeVariant = {
    id: 'scan-6adf9a101cd470f25fc8b10e-office-4',
    name: 'Election Inspector',
    authority_roles: ['electrical_inspection'],
    contact_website: 'https://www.venicetownship.org/index.php/resources',
  };
  assert.equal(officeMatchesArchivedOffice(activeVariant, archived), true, 'Venice active variant must match by normalized name + role overlap');

  // Both halves of the predicate are required: a bare name collision or a bare
  // role collision is not enough to archive a genuinely distinct office.
  assert.equal(officeMatchesArchivedOffice({ ...activeVariant, authority_roles: ['zoning'] }, archived), false);
  assert.equal(officeMatchesArchivedOffice({ ...activeVariant, name: 'Seneca County Building Department' }, archived), false);
}

// ── Bloomingburg/write-boundary shape: exact name duplicate is stripped ───
{
  const archived = {
    id: 'scan-6ad05e480031e5e6c2086992-office-2',
    name: 'Ohio Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
    retired_reason: 'not a permitting office',
  };
  const data = sanitizeLocalityWriteData({
    offices: [{ ...archived, retired_reason: undefined, retired_at: undefined }, { id: 'keep', name: 'Fayette County Zoning', authority_roles: ['zoning'] }],
    archived_offices: [archived],
  });
  assert.deepEqual(data.offices.map((o) => o.id), ['keep']);
  assert.equal(data.archived_offices.length, 1);
}

// ── Stale backfill cannot merge away a retirement ─────────────────────────
{
  const retiredArchive = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-4',
    name: 'Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
    retired_reason: 'not a permitting office',
  };
  const activeNoise = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-9',
    name: 'Ohio Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
  };
  const keep = { id: 'keep', name: 'Fayette County Zoning', authority_roles: ['zoning'] };
  const retirementData = {
    offices: [keep],
    archived_offices: [retiredArchive],
  };
  const staleBackfillData = {
    offices: [keep, activeNoise],
    archived_offices: [], // pre-archive mirror shape: the clobbering write evidence
  };
  const merged = mergeLocalityWriteData(retirementData, staleBackfillData);
  assert.deepEqual(merged.offices.map((o) => o.id), ['keep'], 'later stale full-array write loses the archived active copy');
  assert.equal(merged.archived_offices.length, 1);
  assert.equal(merged.archived_offices[0].id, retiredArchive.id);
}

// ── Pending-outbox overlay: retirement survives a later stale backfill ────
{
  const archivedOld = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-4',
    name: 'Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
  };
  const archivedVariant = {
    id: 'scan-6adf7b64ecf742a8d366dfb9-office-9',
    name: 'Ohio Ohio Civil Rights Commission',
    authority_roles: ['right_of_way'],
  };
  const noise = { ...archivedVariant, authority_verification_status: 'needs_verification' };
  const keep = { id: 'keep', name: 'Fayette County Zoning', authority_roles: ['zoning'] };
  const base = { id: 'loc', offices: [keep, noise], archived_offices: [archivedOld] };
  const writes = [
    { at: 100, note: 'retire non-permit body', data: { offices: [keep], archived_offices: [archivedOld, archivedVariant] } },
    // Stale scan built from a pre-repair mirror, enqueued after the retirement.
    { at: 200, note: 'office backfill — Jasper Township, OH', data: { offices: [keep, noise], archived_offices: [archivedOld] } },
  ];
  const raw = overlayPendingLocalityWriteData(base, writes);
  assert.equal(raw.archived_offices.length, 2, 'both reindexed archive tombstones survive the stale later write');
  const filtered = filterArchivedOffices(raw.offices, raw.archived_offices);
  assert.deepEqual(filtered.offices.map((o) => o.id), ['keep']);
  assert.equal(filtered.removed.length, 1);

  const effective = overlayPendingLocalityWrites(base, writes);
  assert.deepEqual(effective.offices.map((o) => o.id), ['keep']);
}

// Explicit revert/restore writes remain the escape hatch from a tombstone.
{
  const office = { id: 'o1', name: 'Election Inspector', authority_roles: ['electrical_inspection'] };
  const archived = { ...office, retired_reason: 'not a permitting office' };
  const base = { id: 'loc', offices: [], archived_offices: [archived] };
  const effective = overlayPendingLocalityWrites(base, [
    { at: 1, note: 'ai-audit revert — retire o1', archive_restore: true, data: { offices: [office], archived_offices: [] } },
  ]);
  assert.deepEqual(effective.offices.map((o) => o.id), ['o1']);
  assert.equal(effective.archived_offices.length, 0);
}

// ── compactOutbox integration: archives union, active copy stripped, mirror kept ─
{
  const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'office-archive-outbox-test-'));
  fs.mkdirSync(path.join(wd, '.audit-work'), { recursive: true });
  const old = process.cwd();
  process.chdir(wd);
  try {
    const archived = {
      id: 'scan-6adf7b64ecf742a8d366dfb9-office-4',
      name: 'Ohio Civil Rights Commission',
      authority_roles: ['right_of_way'],
      retired_reason: 'not a permitting office',
    };
    const noise = {
      id: 'scan-6adf7b64ecf742a8d366dfb9-office-9',
      name: 'Ohio Ohio Civil Rights Commission',
      authority_roles: ['right_of_way'],
    };
    const keep = { id: 'keep', name: 'Fayette County Zoning', authority_roles: ['zoning'] };
    const retirement = {
      at: 1000,
      entity: 'PermitLocality', op: 'update', id: 'loc-jasper', priority: 1,
      data: { offices: [keep], archived_offices: [archived] },
      note: 'retire non-permit body (repair clobbered retirement)',
    };
    const staleBackfill = {
      at: 2000,
      entity: 'PermitLocality', op: 'update', id: 'loc-jasper', mirror: 'localities',
      data: { offices: [keep, noise], archived_offices: [] },
      note: 'office backfill — Jasper Township, OH',
    };
    fs.writeFileSync(OUTBOX, `${JSON.stringify(retirement)}\n${JSON.stringify(staleBackfill)}\n`);

    const pending = readPendingWritesFor('PermitLocality', 'loc-jasper');
    assert.equal(pending.length, 2);
    assert.equal(pending[0].note, retirement.note);

    const compacted = compactOutbox();
    assert.deepEqual(compacted, { before: 2, after: 1, dropped: 1 });
    const out = fs.readFileSync(OUTBOX, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.equal(out.length, 1);
    assert.equal(out[0].mirror, 'localities', 'compaction preserves write-through metadata');
    assert.equal(out[0].priority, 1, 'priority survives the merge');
    assert.deepEqual(out[0].data.offices.map((o) => o.id), ['keep'], 'compacted stale backfill cannot resurrect the archive');
    assert.equal(out[0].data.archived_offices.length, 1);
    assert.equal(out[0].data.archived_offices[0].retired_reason, 'not a permitting office');
  } finally {
    process.chdir(old);
    fs.rmSync(wd, { recursive: true, force: true });
  }
}

// Archive union keeps same-name reindexed tombstones as distinct keys (Venice
// had one archive row per profile generation) while exact copies dedupe.
{
  const a = { id: 'scan-old-office-4', name: 'Election Inspector', authority_roles: ['electrical_inspection'] };
  const b = { id: 'scan-new-office-4', name: 'Election Inspector', authority_roles: ['electrical_inspection'] };
  const merged = mergeArchivedOfficeLists([a], [b, a]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((o) => o.id), [a.id, b.id]);
}

console.log('PASS office-archive');
