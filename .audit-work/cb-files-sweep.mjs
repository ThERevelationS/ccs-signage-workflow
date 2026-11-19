// Download every product proof image referenced by archived orders (ProofFileName). Resumable.
import { appendFileSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BASE } from './cb-http.mjs';
const st = JSON.parse(readFileSync('.playwright-mcp/cb-session.json', 'utf8'));
const cookie = st.cookies.filter((c) => c.domain.includes('corebridge')).map((c) => `${c.name}=${c.value}`).join('; ');
const DIR = 'imports/corebridge-2026-11-16/files/proofs/'; mkdirSync(DIR, { recursive: true });
const LOG = 'imports/corebridge-2026-11-16/files/proofs.jsonl';
const limit = Number(process.argv[2] || Infinity);
const want = [];
for (const l of readFileSync('imports/corebridge-2026-11-16/orders/orders.jsonl', 'utf8').split('\n')) {
  if (!l) continue; const o = JSON.parse(l);
  for (const p of o.products || []) if (p.ProofFileName) want.push({ order_id: o.order_id, product_id: p.Id, file: p.ProofFileName });
}
const done = new Set(existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).file) : []);
const todo = want.filter((w) => !done.has(w.file)).slice(0, limit);
console.log(`proof refs ${want.length}, todo ${todo.length}`);
let next = 0, n = 0, ok = 0, bad = 0;
async function worker() {
  while (next < todo.length) {
    const w = todo[next++];
    try {
      const r = await fetch(`${BASE}/ShowImage.aspx?LoadLocalProof=${encodeURIComponent(w.file)}`, { headers: { cookie }, redirect: 'manual' });
      if (r.status >= 300 && r.status < 400) { console.log('SESSION LOST'); process.exit(3); }
      const buf = Buffer.from(await r.arrayBuffer());
      const type = r.headers.get('content-type') || '';
      const safe = w.file.replace(/[^A-Za-z0-9._-]/g, '_');
      if (r.status === 200 && buf.length > 0 && /image|pdf|octet/.test(type)) { writeFileSync(DIR + safe, buf); ok++; } else bad++;
      appendFileSync(LOG, JSON.stringify({ ...w, status: r.status, type, bytes: buf.length, sha1: createHash('sha1').update(buf).digest('hex'), saved_as: r.status === 200 && /image|pdf|octet/.test(type) ? safe : null }) + '\n');
    } catch (e) { bad++; appendFileSync(LOG.replace('.jsonl', '-errors.jsonl'), JSON.stringify({ ...w, error: String(e.message).slice(0, 200) }) + '\n'); }
    if (++n % 200 === 0) process.stdout.write(`\n${n}/${todo.length} ok=${ok} bad=${bad}`);
  }
}
await Promise.all([worker(), worker(), worker()]);
console.log(`\nDONE ok=${ok} bad=${bad}`);
