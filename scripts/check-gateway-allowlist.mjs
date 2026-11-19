#!/usr/bin/env node
// Gateway allowlist drift check.
//
// Every staffEntities.X / base44.entities.X (routed) read goes through the
// staffDataRead gateway and every staffEntities write through staffEntityWrite.
// An entity used in src/ but missing from those allowlists fails at runtime
// (403 for everyone — this exact class caused the Oct-30 rate-limit storm).
//
// Run inside the app sandbox:  node scripts/check-gateway-allowlist.mjs
// Exit 0 = parity; exit 1 = drift found (prints the offenders).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!/node_modules|\.git|dist|build/.test(name)) walk(p, out);
    } else if (/\.(jsx?|tsx?)$/.test(name)) out.push(p);
  }
  return out;
}

const readFile = (rel) => readFileSync(join(root, rel), 'utf8');
const setBlock = (src, marker) => {
  const start = src.indexOf(marker);
  const end = src.indexOf(']);', start);
  return end > start ? src.slice(start, end) : '';
};

const gateway = readFile('base44/functions/staffDataRead/entry.ts');
const readAllowed = new Set([
  ...setBlock(gateway, 'STAFF_READABLE = new Set').matchAll(/'([A-Za-z_]+)'/g),
  ...setBlock(gateway, 'ADMIN_READABLE = new Set').matchAll(/'([A-Za-z_]+)'/g),
].map((m) => m[1]));

const writer = readFile('base44/functions/staffEntityWrite/entry.ts');
const writeBlock = writer.slice(writer.indexOf('WRITE_OPS'), writer.indexOf('Deno.serve'));
const writeAllowed = new Set([...writeBlock.matchAll(/^\s+([A-Za-z_]+)\s*:/gm)].map((m) => m[1]));

const client = readFile('src/api/base44Client.js');
const routed = new Set(
  [...client.slice(client.indexOf('STAFF_READ_ENTITIES'), client.indexOf('READ_METHODS')).matchAll(/'([A-Za-z_]+)'/g)].map((m) => m[1]),
);

const readsUsed = new Map();
const writesUsed = new Map();
const entitiesExist = new Set(
  readdirSync(join(root, 'base44/entities')).map((f) => f.replace(/\.jsonc$/, '')),
);

for (const file of walk(join(root, 'src'))) {
  const src = readFileSync(file, 'utf8');
  const rel = file.slice(root.length + 1);
  // staffEntities.X always hits the gateway; base44.entities.X only when the
  // client routes that entity there.
  for (const m of src.matchAll(/staffEntities\.([A-Za-z_]+)/g)) {
    if (entitiesExist.has(m[1])) readsUsed.set(m[1], rel);
  }
  for (const m of src.matchAll(/base44\.entities\.([A-Za-z_]+)/g)) {
    if (routed.has(m[1])) readsUsed.set(m[1], rel);
  }
  for (const m of src.matchAll(/staffEntities\.([A-Za-z_]+)\.(create|update|updateMany|delete)\b/g)) {
    writesUsed.set(m[1], rel);
  }
}

const problems = [];
for (const [ent, file] of readsUsed) {
  if (!readAllowed.has(ent)) problems.push(`read blocked: ${ent} (${file})`);
}
for (const [ent, file] of writesUsed) {
  if (!writeAllowed.has(ent)) problems.push(`write blocked: ${ent} (${file})`);
}
for (const ent of routed) {
  if (!readAllowed.has(ent)) problems.push(`client routes base44.entities.${ent} to the gateway but it is not allowed`);
}

if (problems.length) {
  console.error(`GATEWAY DRIFT (${problems.length}):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`gateway parity OK — ${readsUsed.size} entities read, ${writesUsed.size} written, ${routed.size} routed, ${readAllowed.size} allowed, ${writeAllowed.size} writable`);
