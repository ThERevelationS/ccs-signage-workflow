// Fleet-wide per-domain politeness — at least `minMs` between requests to
// the same host across EVERY worker process. A mkdir lock per host serializes
// the wait+stamp so 30+ researchers can't hammer one county site.
import fs from 'node:fs';
import crypto from 'node:crypto';

const DIR = '.audit-work/host-pace';
const LOCK_STALE_MS = 20000; // a crashed holder's lock is abandoned after 20s
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function paceHost(url, minMs = 1000) {
  let host;
  try { host = new URL(url).host; } catch { return; }
  if (!host) return;
  const key = crypto.createHash('md5').update(host).digest('hex');
  try { fs.mkdirSync(DIR, { recursive: true }); } catch {}
  const lock = `${DIR}/${key}.lock`, ts = `${DIR}/${key}.ts`;
  let held = false;
  for (let i = 0; i < 300 && !held; i++) {
    try { fs.mkdirSync(lock); held = true; }
    catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) { fs.rmdirSync(lock); continue; } } catch {}
      await sleep(15 + Math.random() * 25);
    }
  }
  if (!held) return; // lock wedged — proceed unpaced rather than stall work
  try {
    let last = 0;
    try { last = Number(fs.readFileSync(ts, 'utf8')) || 0; } catch {}
    const wait = last + minMs - Date.now();
    if (wait > 0) await sleep(wait);
    try { fs.writeFileSync(ts, String(Date.now())); } catch {}
  } finally { try { fs.rmdirSync(lock); } catch {} }
}
