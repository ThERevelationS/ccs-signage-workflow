// Archive-authoritative office matching for PermitLocality writes.
//
// Scan-generated office ids are positional (`scan-<profile>-office-<n>`), so
// a fresh research union can re-index the same real-world office. Names also
// arrive with scrape duplication ("Ohio Ohio Civil Rights Commission" vs the
// retired "Ohio Civil Rights Commission"). Exact object/id/name equality is
// therefore not enough: an active or rebuilt office is archived when it has
// the same id, or when the normalized office name matches AND their role
// evidence overlaps.

import { cleanOfficeName } from './office-name-clean.mjs';
import { normalizePermitJurisdictionName } from '../../src/components/permitting/jurisdictionPermitBridge.js';

const collapseRepeatedWords = (s) => String(s || '')
  .split(' ')
  .filter((w, i, a) => w && (!i || w !== a[i - 1]))
  .join(' ');

export function normalizeOfficeArchiveName(value) {
  // cleanOfficeName conservatively strips scrape/navigation glue and already
  // collapses doubled words; the second collapse catches duplicates created by
  // punctuation normalization ("Ohio, Ohio" → "ohio ohio").
  return collapseRepeatedWords(normalizePermitJurisdictionName(cleanOfficeName(value).clean));
}

// Roles ever associated with the office count as match evidence. Retirement
// preserves the pre-retirement authority_roles snapshot, but some rows have
// already had roles adjudicated into tombstone maps; including those keys keeps
// the match conservative without treating bare same-name coincidences as equal.
export function officeRoleEvidence(office) {
  return new Set([
    ...(Array.isArray(office?.authority_roles) ? office.authority_roles : []),
    ...(Array.isArray(office?.unproven_roles) ? office.unproven_roles : []),
    ...Object.keys(office?.not_applicable_roles || {}),
  ].filter(Boolean));
}

export function officeRolesOverlap(a, b) {
  const ar = officeRoleEvidence(a);
  const br = officeRoleEvidence(b);
  if (!ar.size || !br.size) return false;
  for (const role of ar) if (br.has(role)) return true;
  return false;
}

export function officeMatchesArchivedOffice(office, archivedOffice) {
  if (!office || !archivedOffice) return false;
  if (office.id && archivedOffice.id && office.id === archivedOffice.id) return true;
  const officeName = normalizeOfficeArchiveName(office.name);
  const archivedName = normalizeOfficeArchiveName(archivedOffice.name);
  return Boolean(officeName && archivedName && officeName === archivedName && officeRolesOverlap(office, archivedOffice));
}

export function matchingArchiveFor(office, archivedOffices) {
  return (Array.isArray(archivedOffices) ? archivedOffices : []).find((archived) => officeMatchesArchivedOffice(office, archived)) || null;
}

export function filterArchivedOffices(offices, archivedOffices) {
  const rows = Array.isArray(offices) ? offices : [];
  const archive = Array.isArray(archivedOffices) ? archivedOffices : [];
  if (!rows.length || !archive.length) return { offices: rows, removed: [] };
  const removed = [];
  const kept = [];
  for (const office of rows) {
    if (matchingArchiveFor(office, archive)) removed.push(office);
    else kept.push(office);
  }
  return { offices: kept, removed };
}

// Union archive snapshots without collapsing same-name reindexed variants away.
// Distinct scan ids may both be needed as tombstones; exact id+name duplicates
// keep the later (usually richer) copy.
export function mergeArchivedOfficeLists(...lists) {
  const out = [];
  const index = new Map();
  for (const list of lists) {
    for (const office of Array.isArray(list) ? list : []) {
      if (!office || typeof office !== 'object') continue;
      const key = `${office.id || ''}|${normalizeOfficeArchiveName(office.name)}`;
      if (!key.replace(/[|]/g, '')) continue;
      if (index.has(key)) out[index.get(key)] = office;
      else { index.set(key, out.length); out.push(office); }
    }
  }
  return out;
}

export function isArchiveRestoreWrite(rec) {
  return Boolean(rec?.archive_restore || /\b(revert|restore)\b/i.test(String(rec?.note || '')));
}

// Merge two full/partial PermitLocality update payloads. Ordinary fields keep
// last-write-wins semantics; archived_offices are tombstones and are unioned so
// a stale full-array writer cannot silently discard a pending retirement. An
// explicit revert/restore write is the only escape hatch: its archive array
// replaces the accumulated tombstones, after which normal unioning resumes.
export function mergeLocalityWriteData(previous = {}, next = {}, { archiveRestore = false } = {}) {
  const prev = previous && typeof previous === 'object' ? previous : {};
  const later = next && typeof next === 'object' ? next : {};
  const merged = { ...prev, ...later };
  const prevHasArchive = Array.isArray(prev.archived_offices);
  const nextHasArchive = Array.isArray(later.archived_offices);
  if (!prevHasArchive && !nextHasArchive) return merged;

  let archives = prevHasArchive ? prev.archived_offices : [];
  if (nextHasArchive) {
    archives = archiveRestore
      ? later.archived_offices
      : mergeArchivedOfficeLists(archives, later.archived_offices);
  }
  merged.archived_offices = archives;
  if (Array.isArray(merged.offices)) {
    merged.offices = filterArchivedOffices(merged.offices, archives).offices;
  }
  return merged;
}

// Extract the locality-shaped payload from an outbox write record. Most
// locality writes use data; older CAS-shaped writes use update.$set.
export function localityPatchForWrite(write) {
  if (!write || typeof write !== 'object') return {};
  if (!write.entity && !write.op && !write.update && !write.data) return write; // already a patch
  return {
    ...(write.data && typeof write.data === 'object' ? write.data : {}),
    ...(write.update?.$set && typeof write.update.$set === 'object' ? write.update.$set : {}),
  };
}

// Overlay pending full-array locality writes onto a mirror/live row and union
// archive tombstones across every pending write. This raw overlay deliberately
// does NOT remove matching active offices itself: callers that are about to
// build a replacement offices[] need filterArchivedOffices' removed count to
// know whether the pending state already corrected the row. Use the wrapper
// below when only the final effective row is needed.
export function overlayPendingLocalityWriteData(base, writes) {
  if (!base || typeof base !== 'object') return base;
  const ordered = (Array.isArray(writes) ? writes : [])
    .map((write, index) => ({ write, index }))
    .sort((a, b) => ((a.write?.at || 0) - (b.write?.at || 0)) || (a.index - b.index))
    .map((x) => x.write);

  let merged = { ...base };
  let archives = Array.isArray(base.archived_offices) ? base.archived_offices : undefined;
  for (const write of ordered) {
    const patch = localityPatchForWrite(write);
    if (!patch || !Object.keys(patch).length) continue;
    merged = { ...merged, ...patch };
    if (Array.isArray(patch.archived_offices)) {
      archives = isArchiveRestoreWrite(write)
        ? patch.archived_offices
        : mergeArchivedOfficeLists(archives || [], patch.archived_offices);
    }
  }
  if (Array.isArray(archives)) merged.archived_offices = archives;
  return merged;
}

// Effective-row convenience wrapper: archive tombstones are authoritative over
// the overlaid active offices as well.
export function overlayPendingLocalityWrites(base, writes) {
  const merged = overlayPendingLocalityWriteData(base, writes);
  if (!merged || !Array.isArray(merged.archived_offices) || !Array.isArray(merged.offices)) return merged;
  return { ...merged, offices: filterArchivedOffices(merged.offices, merged.archived_offices).offices };
}
