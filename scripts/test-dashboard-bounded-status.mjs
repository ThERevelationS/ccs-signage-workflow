// Integration guard for the dashboard crash mode seen 2026-11-27: a ~1GB
// outbox-done.jsonl must not crash or stall status generation. Runs the real
// dashboard script in an isolated cwd with a sparse 1GB journal.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-bounded-test-'));
fs.mkdirSync(path.join(tmp, '.audit-work'), { recursive: true });
const huge = path.join(tmp, '.audit-work', 'outbox-done.jsonl');
const fd = fs.openSync(huge, 'w');
fs.ftruncateSync(fd, 1024 ** 3);
fs.closeSync(fd);
fs.writeFileSync(path.join(tmp, '.audit-work', 'outbox.jsonl'), '{"entity":"x","op":"update"}\n');
fs.writeFileSync(path.join(tmp, '.audit-work', 'outbox-errors.jsonl'), '');

const port = 4827;
const child = spawn(process.execPath, [path.join(root, 'scripts', 'live-serve.tmp.mjs')], {
  cwd: tmp,
  env: { ...process.env, DASH_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let stderr = '';
child.stderr.on('data', (d) => { stderr += d; });
const deadline = Date.now() + 8000;
let payload = null, elapsed = 0;
const started = Date.now();
try {
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/status.json`, { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (!j.error) { payload = j; elapsed = Date.now() - started; break; }
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
} finally {
  child.kill('SIGTERM');
}
assert.ok(payload, `dashboard never produced status; stderr=${stderr.slice(0, 500)}`);
assert.ok(elapsed < 5000, `first dashboard status took ${elapsed}ms with a 1GB journal`);
assert.equal(payload.outboxDepth, 1);
assert.ok(payload.outboxDone >= 1); // sparse no-newline file estimates as one huge line
console.log(`PASS dashboard-bounded-status (${elapsed}ms with 1GB outbox-done)`);
