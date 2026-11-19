// office-files.mjs — per-office file ownership helpers (LP-6).
//
// Layout:
//   .audit-work/office-files/<st>/<jurisdiction-slug>--<id4>/<office-slug>--<id4>/
//     jurisdiction.json        (jurisdiction dir, sibling of office dirs)
//     office.json              (office dossier)
//     sources/<sha256>.<ext>
//     text/<sha256>.txt
//     extraction/{unit-,out-,evidence-}<id>.json
//   .audit-work/office-files/index.json   (dashboard-facing rollup)
//
// "unassigned" under each jurisdiction dir holds docs whose issuing_office
// does not match any office name — a real visible bucket, never a wrong guess.
// Index is best-effort UI state; entity rows/mirrors remain authoritative.

import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';
import path from 'path';

export const ROOT = '.audit-work/office-files';
export const INDEX_PATH = `${ROOT}/index.json`;

export const STAGES = ['fetched', 'extracted', 'queued', 'analyzed', 'validated', 'uploaded', 'rules', 'link_only'];
const STAGE_RANK = Object.fromEntries(STAGES.map((s, i) => [s, i]));

export function slug(s) {
  return String(s || 'unknown').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'unknown';
}

const id4 = id => String(id || 'none').slice(-4);

// officeKey: <st>/<jurSlug>--<jurId4>/<officeSlug>--<officeId4>
// 'unassigned' is the office dir when no office match exists.
export function officeKey({ state, jurisdictionName, jurisdictionId, officeName, officeId }) {
  const st = slug(state || 'xx').slice(0, 8);
  const jur = `${slug(jurisdictionName)}--${id4(jurisdictionId)}`;
  const off = officeName ? `${slug(officeName)}--${id4(officeId)}` : 'unassigned';
  return `${st}/${jur}/${off}`;
}

export function jurisdictionDir(key) { return path.join(ROOT, ...key.split('/').slice(0, 2)); }
export function officeDir(key) { return path.join(ROOT, ...key.split('/')); }
export function subDir(key, sub) { return path.join(officeDir(key), sub); }

const writeJsonAtomic = (file, obj) => {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, 1));
  renameSync(tmp, file);
};

// ensureOfficeDirs — idempotent. Creates the office dir + subdirs, writes
// jurisdiction.json once per jurisdiction dir, refreshes office.json.
export function ensureOfficeDirs(key, { jurisdiction, office } = {}) {
  const jDir = jurisdictionDir(key);
  const oDir = officeDir(key);
  for (const sub of ['sources', 'text', 'extraction']) mkdirSync(path.join(oDir, sub), { recursive: true });
  const jf = path.join(jDir, 'jurisdiction.json');
  if (!existsSync(jf) && jurisdiction) {
    writeJsonAtomic(jf, {
      jurisdiction_id: jurisdiction.id || null,
      locality_id: jurisdiction.locality_id || null,
      name: jurisdiction.name || null,
      state: jurisdiction.state || null,
      county_name: jurisdiction.county_name || jurisdiction.parent_county_name || jurisdiction.parent_county || null,
      created_at: new Date().toISOString(),
    });
  }
  if (office) {
    writeJsonAtomic(path.join(oDir, 'office.json'), {
      office_id: office.id || null,
      locality_id: office.locality_id || null,
      catalog_office_id: office.catalog_office_id || null,
      government_office_id: office.government_office_id || null,
      name: office.name || null,
      office_type: office.office_type || null,
      office_types: office.office_types || [],
      authority_roles: office.authority_roles || [],
      authority_verification_status: office.authority_verification_status || null,
      contact_phone: office.contact_phone || null,
      contact_email: office.contact_email || null,
      contact_website: office.contact_website || null,
      contact_address: office.contact_address || null,
      updated_at: new Date().toISOString(),
    });
  }
  return oDir;
}

// Normalize for name matching — "Building & Zoning Dept." vs "building and zoning department".
const norm = s => String(s || '').toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/\b(dept\.?|department)\b/g, 'dept')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// matchOffice — find the locality office whose name matches issuing_office.
// Exact normalized match first, then containment (either way) as fallback.
// Returns null when ambiguous/none — caller routes to 'unassigned', never guesses.
export function matchOffice(locality, issuingOffice) {
  const target = norm(issuingOffice);
  if (!target || !Array.isArray(locality?.offices)) return null;
  const offices = locality.offices.filter(o => o && o.name);
  const exact = offices.filter(o => norm(o.name) === target);
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const contained = offices.filter(o => {
    const n = norm(o.name);
    return n.length > 8 && (n.includes(target) || target.includes(n));
  });
  return contained.length === 1 ? contained[0] : null;
}

// matchOfficeByUrl — official-url host vs offices[].contact_website host.
// Exactly one matching office wins; otherwise null.
export function matchOfficeByUrl(locality, url) {
  if (!url || !Array.isArray(locality?.offices)) return null;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
  if (!host) return null;
  const hits = locality.offices.filter((o) => {
    try { return o.contact_website && new URL(o.contact_website).hostname.replace(/^www\./, '') === host; } catch { return false; }
  });
  return hits.length === 1 ? hits[0] : null;
}

// resolveOffice — resolution order: issuing_office name match → official-url
// host match → single-office locality (one office can only own every doc).
// Null → caller routes to 'unassigned'; still never guesses between offices.
export function resolveOffice(locality, doc) {
  const hit = matchOffice(locality, doc?.issuing_office) || matchOfficeByUrl(locality, doc?.url);
  if (hit) return hit;
  const offices = (locality?.offices || []).filter(o => o && o.name);
  return offices.length === 1 ? offices[0] : null;
}

// keyFromPath — recover the office key for a local:// path living under an
// office dir, so uploaders can index without re-resolving the owner.
export function keyFromPath(p) {
  const m = String(p || '').replace(/\\/g, '/').match(/office-files\/([^/]+\/[^/]+\/[^/]+)\//);
  return m ? m[1] : null;
}

// readIndex / updateIndex — the dashboard rollup. Atomic rewrite; callers pass
// the file record fields they know. Stage only ever advances (link_only is a
// terminal alternative state, not part of the linear rank).
export function readIndex() {
  try { return JSON.parse(readFileSync(INDEX_PATH, 'utf8')); }
  catch { return { offices: {}, updated_at: null }; }
}

export function indexFile(key, meta, fileRec) {
  mkdirSync(officeDir(key), { recursive: true });
  const idx = readIndex();
  const offices = idx.offices || (idx.offices = {});
  const off = offices[key] || (offices[key] = { key, files: [] });
  Object.assign(off, { ...meta, updated_at: new Date().toISOString() });
  const files = off.files || (off.files = []);
  let rec = fileRec.sha256 && files.find(f => f.sha256 === fileRec.sha256)
      || fileRec.key && files.find(f => f.key === fileRec.key)
      || fileRec.official_url && files.find(f => f.official_url === fileRec.official_url);
  if (!rec) { rec = {}; files.push(rec); }
  const prev = rec.stage;
  Object.assign(rec, fileRec, { updated_at: new Date().toISOString() });
  if (prev && prev !== 'link_only' && fileRec.stage !== 'link_only' &&
      (STAGE_RANK[prev] || 0) > (STAGE_RANK[fileRec.stage] || 0)) rec.stage = prev;
  idx.updated_at = new Date().toISOString();
  writeJsonAtomic(INDEX_PATH, idx);
  return rec;
}

export const stageRank = s => STAGE_RANK[s] ?? -1;
