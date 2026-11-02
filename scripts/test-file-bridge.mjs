import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = resolve(here, '.tmp-file-bridge.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/fileBridgeModel.ts')],
  bundle: true, format: 'esm', outfile: bundlePath, logLevel: 'silent',
});
const M = await import(pathToFileURL(bundlePath).href);

// --- paths: normalize, parent, traversal guards ---
assert.equal(M.normPath('a\\b//c/'), 'a/b/c');
assert.equal(M.parentPath('a/b/c.pdf'), 'a/b');
assert.equal(M.parentPath('c.pdf'), '');
assert.equal(M.extOf('x/Logo.CDR'), 'cdr');
assert.equal(M.safeRelPath('../etc/passwd').ok, false);
assert.equal(M.safeRelPath('a/../b').ok, false);
assert.equal(M.safeRelPath('C:/win/x').ok, false);
assert.equal(M.safeRelPath('/abs/x').ok, false);
assert.equal(M.safeRelPath('a/bad:name').ok, false);
assert.equal(M.safeRelPath('Customer Files/Acme/proof.pdf').ok, true);
assert.equal(M.joinUnderRoot('/mnt/user/share', 'a/b.txt'), '/mnt/user/share/a/b.txt');
assert.equal(M.joinUnderRoot('/mnt/user/share', '../escape'), null);
assert.equal(M.sanitizeFolderName('  Acme/Corp.  '), 'Acme Corp');
assert.equal(M.sanitizeFolderName('CON'), '_CON');

// --- path_key: NFC + casefold dedupe ---
const decomposed = 'Cafe\u0301/logo.pdf';
const composed = 'Café/logo.pdf';
assert.equal(M.pathKey('a1', 'r1', decomposed), M.pathKey('a1', 'r1', composed));
assert.equal(M.pathKey('a1', 'r1', 'X/ReadMe.TXT'), M.pathKey('a1', 'r1', 'x/readme.txt'));

// --- exclusions ---
assert.equal(M.isExcluded('a/#recycle/x.txt'), true);
assert.equal(M.isExcluded('a/.DS_Store'), true);
assert.equal(M.isExcluded('.ccs_trash/r1/f.pdf.1.tmb'), true);
assert.equal(M.isExcluded('a/b/proof.pdf'), false);

// --- customer match ---
const customers = [
  { id: 'c1', name: 'Acme Sign Company' },
  { id: 'c2', name: 'Acme Anvils LLC' },
  { id: 'c3', name: 'Globex Corporation', aliases: ['Globex Industries'] },
];
const m = M.matchCustomerFolders(['Customer Files/Acme Sign Company', 'Customer Files/Globex Industries', 'Customer Files/Zeta'], customers);
const acme = m.find((x) => x.folder.includes('Acme Sign'));
assert.ok(acme && acme.customer_id === 'c1' && acme.confidence >= M.MATCH_SUGGEST);
const globex = m.find((x) => x.folder.includes('Globex'));
assert.ok(globex && globex.customer_id === 'c3' && globex.signals.some((s) => s.startsWith('alias')));
assert.ok(!m.find((x) => x.folder.includes('Zeta')));
// ambiguity cap: two near-identical customers → never auto-attach
const amb = M.matchCustomerFolders(['Customer Files/Acme Graphics'], [
  { id: 'a', name: 'Acme Graphics Inc' }, { id: 'b', name: 'Acme Graphics Co' },
]);
assert.ok(amb.length === 1 && amb[0].confidence < M.MATCH_AUTO);

// --- command spec / transitions / routing ---
assert.equal(M.canTransition('queued', 'leased'), true);
assert.equal(M.canTransition('queued', 'completed'), false);
assert.equal(M.canTransition('running', 'completed'), true);
assert.equal(M.canTransition('completed', 'queued'), false);
assert.equal(M.isTerminal('failed'), true);
assert.equal(M.commandAllowed('delete', 'backup').ok, false);   // backup refuses mutations
assert.equal(M.commandAllowed('delete', 'observer').ok, false);
assert.equal(M.commandAllowed('list_dir', 'backup').ok, true);
assert.equal(M.commandAllowed('nope', 'primary').ok, false);

const now = Date.now();
const healthy = (ms) => now - ms;
const agents = [
  { agent_id: 'p1', role: 'primary', last_seen_ms: healthy(10_000) },
  { agent_id: 'b1', role: 'backup', last_seen_ms: healthy(5_000) },
];
assert.equal(M.routeAgent('list_dir', agents, now).agent_id, 'p1');
assert.equal(M.routeAgent('delete', agents, now).agent_id, 'p1');
// primary down → reads fail to backup, writes queue
const stale = [{ ...agents[0], last_seen_ms: healthy(120_000) }, agents[1]];
assert.equal(M.routeAgent('list_dir', stale, now).served_by, 'backup');
assert.equal(M.routeAgent('delete', stale, now).queued, true);
// both down
const dead = stale.map((a) => ({ ...a, last_seen_ms: healthy(300_000) }));
assert.equal(M.routeAgent('list_dir', dead, now).error, 'no healthy agent');

// --- provenance ---
assert.equal(M.canDelete({ origin: 'bridge' }), true);
assert.equal(M.canDelete({ origin: 'external' }), false);
assert.equal(M.canDelete({ managed_by: 'bridge' }), false);     // organized ≠ deletable
assert.equal(M.canMove({ managed_by: 'bridge' }), true);
assert.equal(M.canMove({ origin: 'external' }), false);
assert.equal(M.isTombstonePath(M.tombstonePath('r1', 'a/b.pdf', 5)), true);

// --- delivery / chunks / revisions ---
assert.equal(M.isDeliveryStale({ mtime_ms: 100, delivered_at_ms: 50 }), true);
assert.equal(M.isDeliveryStale({ mtime_ms: 100, delivered_at_ms: 200 }), false);
assert.equal(M.isDeliveryStale({ mtime_ms: 100 }), true);
assert.equal(M.chunkCount(33 * 1024 * 1024), 2);
assert.equal(M.revisionName('proof.pdf', 2), 'proof.rev-2.pdf');
assert.equal(M.revisionName('noext', 1), 'noext.rev-1');

// --- kind registry / viewers ---
assert.equal(M.kindOf('x.cdr'), 'design');
assert.equal(M.kindOf('x.PDF'), 'pdf');
assert.equal(M.kindOf('x.qzx'), 'other');
assert.equal(M.viewerFor('design', true), 'thumb_meta');
assert.equal(M.viewerFor('sheet', true), 'preview_pdf');
assert.equal(M.viewerFor('sheet', false), 'download_only');
assert.equal(M.viewerFor('image', false), 'native');

// --- qualifiers ---
const q = M.parseQualifiers('banner proof ext:pdf folder:"A C" ext:cdr');
assert.equal(q.text, 'banner proof');
assert.deepEqual(q.filters.ext, ['pdf', 'cdr']);
assert.deepEqual(q.filters.folder, ['A C']);
const q2 = M.parseQualifiers('ext:pdf path:Acme/2026 logo');
assert.deepEqual(q2.filters.path, ['Acme/2026']);
assert.equal(q2.text, 'logo');

// --- server-copy merge ---
const merged = M.mergeServerCopies([
  { agent_id: 'b1', role: 'backup', path_key: 'b1|r1|a.pdf' },
  { agent_id: 'p1', role: 'primary', path_key: 'p1|r1|a.pdf' },
  { agent_id: 'p1', role: 'primary', path_key: 'p1|r1|b.pdf' },
]);
assert.equal(merged.length, 2);
const a = merged.find((r) => r.path_key.endsWith('a.pdf'));
assert.equal(a.copies, 2);
assert.equal(a.role, 'primary');

// --- settings normalize + role resolution ---
const s = M.normalizeFileBridgeSettings({ enabled: 1, keep_delivered_max_mb: -5, exclude_patterns: ['x'] });
assert.equal(s.enabled, true);
assert.equal(s.keep_delivered_max_mb, M.FB_KEEP_DELIVERED_MAX_MB_DEFAULT);
assert.deepEqual(s.exclude_patterns, ['x']);
assert.equal(M.normalizeFileBridgeSettings(null).enabled, false);

// config pin beats env; unpinned env works; unknown → observer
assert.equal(M.resolveRole('a1', 'primary', { primary_agent_id: 'a1' }), 'primary');
assert.equal(M.resolveRole('a2', 'primary', { primary_agent_id: 'a1' }), 'backup'); // demoted imposter
assert.equal(M.resolveRole('a2', 'backup', {}), 'backup');
assert.equal(M.resolveRole('a9', 'bogus', {}), 'observer');
assert.equal(M.resolveRole('a9', '', {}), 'observer');

console.log('PASS file-bridge');
