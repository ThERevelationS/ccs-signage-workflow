// Office dedupe — same-name offices on a locality are role-split duplicates
// (workers appended one row per discovered role instead of updating). Merge:
// union authority_roles/gaps/contacts, prefer staff_verified + richest fields.
// Writes through the outbox; mirrorApply keeps mirrors warm. Idempotent.
import { readFileSync, openSync, writeFileSync } from 'node:fs';
import { enqueue } from './lib/outbox.mjs';
import { mirrorApply } from './lib/entity-mirror.mjs';
const evFd = openSync('.live-events.jsonl', 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'office-dedupe', ...e }) + '\n', { flag: 'a' }); } catch {} };
const norm = (n) => String(n || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const richness = (o) => (o?.authority_verification_status === 'staff_verified' ? 1000 : 0)
  + (o?.authority_roles?.length || 0) * 10 + (o?.contacts?.length || o?.contact_info ? 3 : 0)
  + Object.values(o || {}).filter((v) => v != null && String(v).trim() !== '').length;
const uniq = (a) => [...new Set(a.filter(Boolean))];
function mergeOffices(list) {
  const base = [...list].sort((a, b) => richness(b) - richness(a))[0];
  const out = { ...base };
  out.authority_roles = uniq(list.flatMap((o) => o.authority_roles || []));
  const held = new Set(out.authority_roles);
  out.auto_verification_gaps = uniq(list.flatMap((o) => o.auto_verification_gaps || [])).filter((g) => !held.has(String(g).split(':')[0]));
  out.unproven_roles = uniq(list.flatMap((o) => o.unproven_roles || [])).filter((r) => !held.has(r));
  const contactKeys = new Set();
  out.contacts = list.flatMap((o) => (Array.isArray(o.contacts) ? o.contacts : [])).filter((c) => {
    const k = typeof c === 'string' ? c : JSON.stringify(c);
    if (contactKeys.has(k)) return false; contactKeys.add(k); return true;
  });
  if (!out.contacts.length) delete out.contacts;
  if (list.some((o) => o.authority_verification_status === 'staff_verified')) out.authority_verification_status = 'staff_verified';
  for (const o of list) for (const [k, v] of Object.entries(o)) {
    if (out[k] == null || String(out[k]).trim() === '') out[k] = v;
    else if (k === 'authority_verification_notes' && String(out[k]).length < String(v).length) out[k] = v;
  }
  if (!out.auto_verification_gaps?.length) delete out.auto_verification_gaps;
  if (!out.unproven_roles?.length) delete out.unproven_roles;
  return out;
}
const locs = JSON.parse(readFileSync('.audit-work/mirrors/localities.json', 'utf8')).rows || [];
let changed = 0, removed = 0;
for (const loc of locs) {
  const offices = loc.offices || [];
  if (offices.length < 2) continue;
  const groups = new Map();
  for (const o of offices) {
    const k = norm(o?.name);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const next = [];
  let locRemoved = 0;
  for (const g of groups.values()) {
    if (g.length === 1) { next.push(g[0]); continue; }
    next.push(mergeOffices(g));
    locRemoved += g.length - 1;
  }
  if (!locRemoved) continue;
  enqueue({ entity: 'PermitLocality', op: 'update', id: loc.id, data: { offices: next }, note: `office dedupe -${locRemoved} — ${loc.name}` });
  mirrorApply('localities', { id: loc.id, offices: next });
  changed++; removed += locRemoved;
}
emit({ stage: 'office_dedupe_done', ok: true, detail: `${changed} localities · ${removed} duplicate office rows merged` });
console.log(`localities rewritten: ${changed} · duplicate rows removed: ${removed}`);
