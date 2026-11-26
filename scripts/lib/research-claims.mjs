// Shared work claims + cooldowns for the researcher fleet — replaces fixed
// hash slicing so ANY number of researchers can share work without overlap.
//
// Claim locks: .audit-work/research-claims/<id>.pid<PID>.lock — one file per
// claimant, created with 'wx' (atomic across processes), content
// {pid, worker, at}. Reclamation never renames or deletes a live lock: dead
// or expired lock files are just swept, so two racers can never both end up
// believing they hold the claim. A simultaneous-create race resolves
// deterministically — earliest `at` wins (filename order breaks ties), the
// loser deletes its own file.
//
// Cooldowns: .audit-work/research-cooldowns/<id>.json — one file per work
// key, written only by the claim holder, so there are no read-modify-write
// races across processes.
import fs from 'node:fs';

export const AUDIT_DIR = process.env.PERMIT_AUDIT_DIR || '.audit-work';
export const CLAIMS_DIR = `${AUDIT_DIR}/research-claims`;
export const COOLDOWN_DIR = `${AUDIT_DIR}/research-cooldowns`;
export const CLAIM_TTL = 30 * 60 * 1000;
export const TARGETS_FILE = `${AUDIT_DIR}/research-targets.json`;

const enc = (id) => encodeURIComponent(String(id));
const cooldownPath = (id) => `${COOLDOWN_DIR}/${enc(id)}.json`;
const readJSON = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const pidAlive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const MID_WRITE_MS = 10000; // unparseable lock younger than this = mid-write → held
const fileId = (f) => { const m = /^(.*)\.pid\d+\.lock$/.exec(f); return m ? decodeURIComponent(m[1]) : null; };
const myLockPath = (id) => `${CLAIMS_DIR}/${enc(id)}.pid${process.pid}.lock`;

// Live claim files for one id: parses each <id>.pid<N>.lock and classifies
// it — dead pid / expired TTL / old corrupt → swept; fresh live record or
// young unparseable (mid-write) → a holder. Returns {file, pid, at, unwritten}[].
function liveHolders(id) {
  const out = [];
  try {
    for (const f of fs.readdirSync(CLAIMS_DIR)) {
      if (fileId(f) !== id) continue;
      const p = `${CLAIMS_DIR}/${f}`;
      const cur = readJSON(p);
      if (cur?.pid && cur.at) {
        const stale = !pidAlive(cur.pid) || Date.now() - new Date(cur.at).getTime() > CLAIM_TTL;
        if (stale) { try { fs.unlinkSync(p); } catch {} continue; }
        out.push({ file: f, pid: cur.pid, at: new Date(cur.at).getTime() });
        continue;
      }
      let mt = 0;
      try { mt = fs.statSync(p).mtimeMs; } catch { continue; } // vanished — fine
      if (Date.now() - mt < MID_WRITE_MS) out.push({ file: f, pid: null, at: mt, unwritten: true });
      else try { fs.unlinkSync(p); } catch {} // old corrupt — sweep
    }
  } catch {}
  return out;
}

// Returns true when this process now holds the claim.
export function claim(id, worker = 'worker') {
  fs.mkdirSync(CLAIMS_DIR, { recursive: true });
  const mine = myLockPath(id);
  // Fast path: someone (possibly me — re-entrant) already holds it.
  const held = liveHolders(id);
  if (held.some((h) => h.pid === process.pid)) return true;
  if (held.length) return false;
  // Free — create my own pid-named lock. wx means a crashed earlier attempt
  // by THIS pid would have been swept above, not fail the create.
  const rec = JSON.stringify({ pid: process.pid, worker, at: new Date().toISOString() });
  try { fs.writeFileSync(mine, rec, { flag: 'wx' }); } catch { /* fell behind a racer — yield check below */ }
  // Settle a simultaneous-create race: re-scan, and if ANY other live lock
  // for this id exists I yield — delete my own file and lose. Whoever's
  // file landed second necessarily sees the first's and yields; whoever's
  // landed first saw a clean directory and legitimately holds. Worst case
  // both yield (nobody holds — safe); never both win.
  const hs = liveHolders(id);
  const me = hs.find((h) => h.pid === process.pid);
  if (me && hs.length === 1) return true;
  try { fs.unlinkSync(mine); } catch {}
  return false;
}

export function releaseClaim(id) {
  try { fs.unlinkSync(myLockPath(id)); } catch {}
}

// Currently-held claim keys. A fresh live lock or a young unparseable
// (mid-write) file both count; dead/expired/corrupt files are swept.
export function claimedIds() {
  const out = new Set();
  try {
    for (const f of fs.readdirSync(CLAIMS_DIR)) {
      const id = fileId(f);
      if (id == null) continue;
      const p = `${CLAIMS_DIR}/${f}`;
      const cur = readJSON(p);
      if (cur?.pid && cur.at) {
        const stale = !pidAlive(cur.pid) || Date.now() - new Date(cur.at).getTime() > CLAIM_TTL;
        if (stale) { try { fs.unlinkSync(p); } catch {} continue; }
        out.add(id);
        continue;
      }
      let mt = 0;
      try { mt = fs.statSync(p).mtimeMs; } catch { continue; }
      if (Date.now() - mt < MID_WRITE_MS) out.add(id); // mid-write → held
      else try { fs.unlinkSync(p); } catch {}
    }
  } catch {}
  return out;
}

// Cooldown store — last result per work key, same {result, at} shape the old
// per-slice claims files used, so GAP_CD/NO_SITE_COOLDOWN logic is unchanged.
export function readCooldowns() {
  const out = {};
  try {
    for (const f of fs.readdirSync(COOLDOWN_DIR)) {
      if (!f.endsWith('.json')) continue;
      const j = readJSON(`${COOLDOWN_DIR}/${f}`);
      if (j?.at) out[decodeURIComponent(f.slice(0, -5))] = j;
    }
  } catch {}
  return out;
}
export function writeCooldown(id, entry) {
  fs.mkdirSync(COOLDOWN_DIR, { recursive: true });
  try { fs.writeFileSync(cooldownPath(id), JSON.stringify({ ...entry, at: entry?.at || new Date().toISOString() })); } catch {}
}

// One-time fold of the old per-slice claims files into the shared cooldown
// store. Idempotent (newest timestamp wins per key) — every worker may run it.
export function migrateSliceClaims(dir = AUDIT_DIR) {
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!/^local-research-claims-\d+\.json$/.test(f)) continue;
      const j = readJSON(`${dir}/${f}`);
      for (const [k, v] of Object.entries(j || {})) {
        if (!v?.at) continue;
        const ex = readJSON(cooldownPath(k));
        if (!ex?.at || new Date(v.at) > new Date(ex.at)) { writeCooldown(k, v); n++; }
      }
    }
  } catch {}
  return n;
}

// Work-availability publication — the last researcher to build a target list
// records how much work is claimable right now. The controller reads this to
// stop spawning once the fleet outnumbers the work.
export function publishTargets(counts) {
  try { fs.writeFileSync(TARGETS_FILE, JSON.stringify({ at: Date.now(), pid: process.pid, ...counts })); } catch {}
}
