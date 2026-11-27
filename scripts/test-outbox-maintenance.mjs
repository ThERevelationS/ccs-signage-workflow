// Offline maintenance tests for the write outbox + bounded dashboard readers.
// No network, no fleet, no Base44 access.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { countJsonlLines, scanJsonRows, rotateAppendFileCopyTruncate } from './lib/bounded-files.mjs';
import { deepEqual, rotateJournalIfBig, journalArchivePath, flusherRateForDepth } from './lib/outbox.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'outbox-maintenance-test-'));
const write = (f, s) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// ── bounded JSONL counting ───────────────────────────────────────────────
{
  const small = path.join(tmp, 'small.jsonl');
  write(small, '{"a":1}\n\n   \n{"b":2}\n{"c":3}');
  const c = countJsonlLines(small);
  assert.equal(c.count, 3);
  assert.equal(c.estimated, false);

  // A sparse 1GB file must be a bounded head/tail sample, not a materialized
  // string or a one-second-plus synchronous scan.
  const huge = path.join(tmp, 'huge.jsonl');
  const fd = fs.openSync(huge, 'w');
  fs.ftruncateSync(fd, 1024 ** 3);
  fs.closeSync(fd);
  const t0 = process.hrtime.bigint();
  const hc = countJsonlLines(huge);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(hc.estimated, true);
  assert.ok(ms < 500, `1GB sample count took ${ms}ms`);
}

// Copy+truncate rotation keeps the live path/fd model and archives content.
{
  const live = path.join(tmp, 'events-live.jsonl');
  const prev = path.join(tmp, 'events-prev.jsonl');
  write(live, 'a\nb\n');
  assert.equal(rotateAppendFileCopyTruncate(live, prev, 1), true);
  assert.equal(fs.readFileSync(prev, 'utf8'), 'a\nb\n');
  assert.equal(fs.statSync(live).size, 0);
}

// ── streaming mirror row scanner ─────────────────────────────────────────
{
  const mirror = path.join(tmp, 'mirror.json');
  const rows = [
    { id: 'a', text: 'brace } and quote \\" inside string', offices: [{ roles: ['x'] }] },
    { id: 'b', nested: { arr: [{ x: '{' }, { y: '}' }] } },
  ];
  write(mirror, JSON.stringify({ at: 123, rows }));
  const seen = [];
  const result = scanJsonRows(mirror, (r) => seen.push(r));
  assert.equal(result.rows, 2);
  assert.deepEqual(seen, rows);
}

// ── journal rotation + retention ─────────────────────────────────────────
{
  const dir = path.join(tmp, 'rot'); fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, 'outbox-done.jsonl');
  write(f, 'x'.repeat(300));
  const day = new Date('2026-11-27T12:00:00Z');
  assert.equal(rotateJournalIfBig(f, { maxBytes: 100, now: day }), true);
  assert.equal(fs.existsSync(f), false); // rename path: fresh journal starts on next append
  const archive = journalArchivePath(f, day);
  assert.ok(fs.existsSync(archive));
  assert.equal(fs.statSync(archive).size, 300);

  // Same-day archive is overwritten, not duplicated.
  write(f, 'y'.repeat(250));
  assert.equal(rotateJournalIfBig(f, { maxBytes: 100, now: day }), true);
  assert.equal(fs.readFileSync(archive, 'utf8')[0], 'y');

  // Retention keeps exactly five dated archives.
  for (const d of ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25']) {
    write(path.join(dir, `outbox-done-archived-${d}.jsonl`), d);
  }
  write(f, 'z'.repeat(200));
  rotateJournalIfBig(f, { maxBytes: 100, now: new Date('2026-11-28T00:00:00Z') });
  const archives = fs.readdirSync(dir).filter((x) => /^outbox-done-archived-.*\.jsonl$/.test(x)).sort();
  assert.equal(archives.length, 5);
  assert.ok(!archives.some((x) => x.includes('2026-11-20')));
  assert.ok(archives.some((x) => x.includes('2026-11-28')));
}

// ── deep equality + adaptive rate model ──────────────────────────────────
{
  assert.equal(deepEqual({ a: 1, b: [2, { c: 3 }] }, { b: [2, { c: 3 }], a: 1 }), true);
  assert.equal(deepEqual({ a: [1, 2] }, { a: [2, 1] }), false);
  assert.equal(flusherRateForDepth(0, 35, 120), 35);
  assert.equal(flusherRateForDepth(300, 35, 120), 60);
  assert.equal(flusherRateForDepth(1200, 35, 120), 90);
  assert.equal(flusherRateForDepth(5000, 35, 120), 120);
  assert.equal(flusherRateForDepth(5000, 35, 90), 90); // configured ceiling wins
}

// ── takeBatch fairness + compaction dedupe (isolated cwd) ────────────────
{
  const wd = path.join(tmp, 'wd'); fs.mkdirSync(path.join(wd, '.audit-work'), { recursive: true });
  const old = process.cwd(); process.chdir(wd);
  try {
    const { takeBatch, compactOutbox, OUTBOX } = await import('./lib/outbox.mjs');
    // Fairness: a mixed batch reserves 20% for non-priority rows instead of
    // letting an endless priority sweep starve them forever.
    const lines = [];
    for (let i = 0; i < 30; i++) lines.push(JSON.stringify({ entity: 'PermitLocality', op: 'update', id: `p${i}`, priority: 1, data: { x: i } }));
    for (let i = 0; i < 5; i++) lines.push(JSON.stringify({ entity: 'JurisdictionProfile', op: 'update', id: `f${i}`, data: { x: i } }));
    fs.writeFileSync(OUTBOX, lines.join('\n') + '\n');
    const batch = takeBatch(20);
    assert.equal(batch.length, 20);
    assert.equal(batch.filter((r) => r.priority).length, 16);
    assert.equal(batch.filter((r) => !r.priority).length, 4);

    // Compaction merges repeated update targets into one write.
    fs.writeFileSync(OUTBOX, [
      JSON.stringify({ entity: 'PermitLocality', op: 'update', id: 'same', data: { a: 1 } }),
      JSON.stringify({ entity: 'PermitLocality', op: 'update', id: 'same', data: { b: 2 } }),
      JSON.stringify({ entity: 'PermitLocality', op: 'update', id: 'other', data: { c: 3 } }),
    ].join('\n') + '\n');
    const c = compactOutbox();
    assert.equal(c.before, 3);
    assert.equal(c.after, 2);
    assert.equal(c.dropped, 1);
  } finally { process.chdir(old); }
}

console.log('PASS outbox-maintenance');
