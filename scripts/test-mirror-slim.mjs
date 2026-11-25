// Slim mirror consistency — .audit-work/mirrors is CWD-relative in
// entity-mirror.mjs, so this test chdirs into a temp dir before touching it.
// Proves: slim companions are written, fat fields stripped, journal entries
// overlay the slim view the same as the full mirror, deletes propagate, and
// putMirror truncates the journal (the unbounded-111MB regression).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getMirror, putMirror, mirrorApply, mirrorRemove, slimRow } from './lib/entity-mirror.mjs';

const wd = fs.mkdtempSync(path.join(os.tmpdir(), 'mirrorslim-'));
process.chdir(wd);
fs.mkdirSync('.audit-work/mirrors', { recursive: true });

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log('  FAIL', label); } };

const fat = (id, extra = {}) => ({
  id, state: 'OH', name: `T${id}`, type: 'township', county_name: 'Hamilton County',
  verification_status: 'active', office_research: { roles: [{ role: 'zoning', verification_status: 'no_research' }] },
  documents: [
    { id: 'd1', title: 'Zoning code', url: 'https://t.gov/z', file_url: 'https://f/d1.pdf', doc_type: 'ordinance', source: 'crawl', catalog_state: 'done', extracted_text: 'x'.repeat(5000), ai_summary: 'y'.repeat(500), archive_state: { big: 'z'.repeat(2000) }, verification_notes: 'notes' },
    { id: 'd2', title: 'Fees', url: 'https://t.gov/f', doc_type: 'fee_schedule' },
  ],
  discovery_scan_state: { external_referrals: [{ a: 'q'.repeat(3000) }], scanned_at: 'x' },
  ai_summary: 'long ai summary',
  activity_log: [{ at: 'x', msg: 'e'.repeat(1000) }],
  ...extra,
});

// ── 1. putMirror writes the slim companion with bodies stripped ────────────
putMirror('profiles-oh', [fat('p1'), fat('p2')]);
const slim = getMirror('profiles-oh.slim');
ok(slim && slim.rows.length === 2, 'slim file written + readable');
const s0 = slim.rows.find((r) => r.id === 'p1');
ok(s0 && s0.office_research?.roles?.length === 1, 'office_research kept');
ok(s0 && !('discovery_scan_state' in s0) && !('ai_summary' in s0) && !('activity_log' in s0), 'top-level fat fields dropped');
ok(Array.isArray(s0.documents) && s0.documents.length === 2, 'documents length preserved');
ok(s0.documents[0].id === 'd1' && s0.documents[0].title === 'Zoning code' && s0.documents[0].url === 'https://t.gov/z', 'doc metadata kept');
ok(!('extracted_text' in s0.documents[0]) && !('ai_summary' in s0.documents[0]) && !('archive_state' in s0.documents[0]), 'doc bodies dropped');
ok(!fs.existsSync('.audit-work/mirrors/profiles-oh.json.journal.jsonl'), 'journal truncated after putMirror');
const fullSize = fs.statSync('.audit-work/mirrors/profiles-oh.json').size;
const slimSize = fs.statSync('.audit-work/mirrors/profiles-oh.slim.json').size;
ok(slimSize < fullSize / 2, `slim meaningfully smaller (${slimSize} vs ${fullSize})`);

// ── 2. mirrorApply overlays the journal on BOTH views identically ──────────
mirrorApply('profiles-oh', { id: 'p1', office_research: { roles: [{ role: 'zoning', verification_status: 'staff_verified' }] }, extracted_text: 'junk-top' });
const fullRow = getMirror('profiles-oh').rows.find((r) => r.id === 'p1');
const slimRowAfter = getMirror('profiles-oh.slim').rows.find((r) => r.id === 'p1');
ok(fullRow.office_research.roles[0].verification_status === 'staff_verified', 'journal merge visible on full');
ok(slimRowAfter.office_research.roles[0].verification_status === 'staff_verified', 'journal merge visible on slim — consistency');
ok(slimRowAfter.documents.length === 2, 'journal merge did not clobber documents');
ok(fs.existsSync('.audit-work/mirrors/profiles-oh.json.journal.jsonl'), 'journal file exists for pending delta');

// journal entry with fat fields gets slimmed on read
mirrorApply('profiles-oh', { id: 'p1', documents: [{ id: 'd3', title: 'New', extracted_text: 'q'.repeat(999) }] });
const sJ = getMirror('profiles-oh.slim').rows.find((r) => r.id === 'p1');
ok(sJ.documents[0].id === 'd3' && !('extracted_text' in sJ.documents[0]), 'journal row slimmed on overlay');
const fJ = getMirror('profiles-oh').rows.find((r) => r.id === 'p1');
ok(fJ.documents[0].extracted_text === 'q'.repeat(999), 'full view keeps journal body');

// write-through survives the next full putMirror (journal folds into base+slim).
// NB the journal keeps only the LAST entry per id — the documents apply above
// is the surviving delta (office_research was evicted; same for both views).
putMirror('profiles-oh', getMirror('profiles-oh').rows);
const sFold = getMirror('profiles-oh.slim').rows.find((r) => r.id === 'p1');
ok(sFold.documents[0].id === 'd3' && !('extracted_text' in sFold.documents[0]), 'journal folded into slim on rewrite');
ok(!fs.existsSync('.audit-work/mirrors/profiles-oh.json.journal.jsonl'), 'journal truncated after fold-write');

// ── 3. deletes propagate to the slim view ──────────────────────────────────
mirrorApply('profiles-oh', { id: 'p3', name: 'NewOne' });
ok(getMirror('profiles-oh.slim').rows.some((r) => r.id === 'p3'), 'journal insert visible on slim');
mirrorRemove('profiles-oh', 'p3');
ok(!getMirror('profiles-oh.slim').rows.some((r) => r.id === 'p3'), 'journal delete propagates to slim');
ok(getMirror('profiles-oh').rows.every((r) => r.id !== 'p3'), 'delete propagates to full');

// ── 4. fallback: slim read with no slim file derives from the full mirror ──
fs.unlinkSync('.audit-work/mirrors/profiles-oh.slim.json');
const fb = getMirror('profiles-oh.slim');
ok(fb && fb.rows.length === 2 && !('discovery_scan_state' in fb.rows[0]), 'missing slim file falls back to slimmed full view');

// ── 5. non-slim names untouched ────────────────────────────────────────────
putMirror('localities', [{ id: 'l1', offices: [] }]);
ok(fs.existsSync('.audit-work/mirrors/localities.json') && !fs.existsSync('.audit-work/mirrors/localities.slim.json'), 'no slim companion for non-profile mirrors');

// ── 6. slimRow unit ────────────────────────────────────────────────────────
const sr = slimRow({ id: 'x', discovery_scan_state: {}, documents: 'not-array' });
ok(!('discovery_scan_state' in sr) && sr.documents === 'not-array', 'slimRow handles non-array documents');

process.chdir(path.parse(wd).root);
fs.rmSync(wd, { recursive: true, force: true });
console.log(fail ? `FAIL mirror-slim (${fail} failing)` : `PASS mirror-slim (${pass} checks)`);
process.exit(fail ? 1 : 0);
