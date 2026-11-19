#!/usr/bin/env node
// MP-6.2 — New-state expansion recipe. Census gazetteer county+place lists →
// SourceCollectionQueue rows → the existing pipeline takes over (sweep adds
// profiles, researchers crawl, verifier promotes).
//
//   node scripts/permitting-expand-state.mjs --state IN [--dry-run]
//
// The recipe is deliberately thin: all jurisdiction semantics live in the
// registry (jurisdictionRegistry.mjs) — this only seeds the queue.
import { openSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { enqueue } from './lib/outbox.mjs';
import { registryFor } from '../base44/shared/jurisdictionRegistry.mjs';

const args = process.argv.slice(2);
const STATE = (args[args.indexOf('--state') + 1] || '').toUpperCase();
const DRY = args.includes('--dry-run');
const EVENTS = '.live-events.jsonl';
const evFd = openSync(EVENTS, 'a');
const emit = (e) => { try { writeFileSync(evFd, JSON.stringify({ t: Date.now(), worker: 'expand-state', ...e }) + '\n', { flag: 'a' }); } catch {} };

if (!/^[A-Z]{2}$/.test(STATE)) { console.error('usage: --state <2-letter>'); process.exit(1); }

// Census gazetteer — national places + counties, tab-delimited, free.
const PLACE_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2021_Gazetteer/2021_gaz_place_national.zip';
const COUNTY_URL = 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2021_Gazetteer/2021_gaz_counties_national.zip';

async function gazRows(url) {
  const resp = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
  if (!resp.ok) throw new Error(`gazetteer ${resp.status}`);
  const head = Buffer.from(await resp.arrayBuffer());
  if (!head.slice(0, 2).equals(Buffer.from('PK'))) throw new Error(`gazetteer WAF block (${head.length}b)`);
  const { unzipSync } = await import('node:zlib').then(() => import('fflate').catch(() => null)) ?? {};
  // Node has no built-in unzip for zip archives; use the system via temp file.
  const buf = head;
  const tmp = `.audit-work/.gaz-${Date.now()}.zip`;
  writeFileSync(tmp, buf);
  const { execFileSync } = await import('node:child_process');
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${tmp}' -DestinationPath '${tmp}.d' -Force`], { encoding: 'utf8', windowsHide: true });
    const { readdirSync } = await import('node:fs');
    const txt = readdirSync(`${tmp}.d`).find((f) => f.endsWith('.txt'));
    return readFileSync(`${tmp}.d/${txt}`, 'utf8');
  } finally { try { execFileSync('powershell', ['-NoProfile', '-Command', `Remove-Item -Recurse -Force '${tmp}','${tmp}.d' -ErrorAction SilentlyContinue`], { windowsHide: true }); } catch {} }
}

async function main() {
  const reg = registryFor(STATE);
  const rows = [];
  for (const [kind, url] of [['county', COUNTY_URL], ['place', PLACE_URL]]) {
    const text = await gazRows(url);
    const lines = text.split('\n');
    const hdr = lines[0].split('\t').map((h) => h.trim().toUpperCase());
    const iUsps = hdr.indexOf('USPS'), iName = hdr.indexOf('NAME');
    for (const l of lines.slice(1)) {
      const c = l.split('\t');
      if (String(c[iUsps]).trim() !== STATE) continue;
      const name = String(c[iName] || '').trim();
      if (!name || / County$/i.test(name) === (kind === 'place')) continue;
      rows.push({
        jurisdiction_name: name.replace(/ County$/i, ''),
        state: STATE,
        jurisdiction_type: kind === 'county' ? 'county' : 'city',
        source_category: 'sign_regulations',
        status: 'not_started',
      });
    }
  }
  emit({ stage: 'expand_scan', ok: true, detail: `${STATE}: ${rows.length} gazetteer jurisdictions${reg ? '' : ' — NOT in registry (jurisdictionRegistry.mjs entry needed)'}` });
  console.log(`${STATE}: ${rows.length} rows${DRY ? ' (dry-run, no writes)' : ''}`);
  if (!DRY) for (const r of rows) enqueue({ entity: 'SourceCollectionQueue', op: 'create', data: r, mirror: null, note: `expand ${STATE}` });
}

main().catch((e) => { emit({ stage: 'expand_error', ok: false, detail: String(e?.message || e).slice(0, 140) }); console.error(e); process.exit(1); });
