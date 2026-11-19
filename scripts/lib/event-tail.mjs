// Tail-follower for .live-events.jsonl — offset-persisted per consumer so a
// restart resumes where it left off. Handles truncation (file shrank → the
// rotator truncated it → restart from 0) and never consumes a partial last
// line (a writer mid-append leaves it unterminated — we stop at the last \n).
import fs from 'node:fs';

export function createTail(eventsPath, cursorPath) {
  let offset = 0;
  try { offset = JSON.parse(fs.readFileSync(cursorPath, 'utf8')).offset || 0; } catch {}
  return function readNew() {
    let size = 0;
    try { size = fs.statSync(eventsPath).size; } catch { return []; }
    if (size <= offset) { if (size < offset) offset = 0; else return []; }
    let buf;
    try {
      const fd = fs.openSync(eventsPath, 'r');
      buf = Buffer.alloc(size - offset);
      fs.readSync(fd, buf, 0, buf.length, offset);
      fs.closeSync(fd);
    } catch { return []; }
    const text = buf.toString('utf8');
    const lastNl = text.lastIndexOf('\n');
    if (lastNl < 0) return [];          // nothing complete yet
    offset += lastNl + 1;               // leave the partial tail unconsumed
    try { fs.writeFileSync(cursorPath, JSON.stringify({ offset })); } catch {}
    const out = [];
    for (const line of text.slice(0, lastNl).split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch {}
    }
    return out;
  };
}

// Consumer side of the pipeline trigger — the trigger daemon writes one file
// per hinted jurisdiction into .audit-work/triggers/<kind>/. Draining reads +
// unlinks each file; the caller normalizes names its own way.
export function drainTriggers(kind) {
  const dir = `.audit-work/triggers/${kind}`;
  const out = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return out; }
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
      if (j?.name) out.push(j);
    } catch {}
    try { fs.unlinkSync(`${dir}/${f}`); } catch {}
  }
  return out;
}

// Trigger-aware idle: replaces a flat sleep(ms) between passes. Wakes every
// `tickMs` to drain hints and run a targeted pass via runHinted(hints).
// Returns after `ms` total — the caller's full pass still runs on schedule.
export async function idleWait(ms, kind, runHinted, { tickMs = 20000, emit = () => {} } = {}) {
  const end = Date.now() + ms;
  const sleep = (t) => new Promise((r) => setTimeout(r, t));
  while (true) {
    const left = end - Date.now();
    if (left <= 0) return;
    await sleep(Math.min(tickMs, left));
    const hints = drainTriggers(kind);
    if (hints.length) {
      try { await runHinted(hints); } catch (e) { emit({ stage: 'trigger_pass_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); }
    }
  }
}
