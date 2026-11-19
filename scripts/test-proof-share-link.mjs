import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '.tmp-proof-share-link.mjs');
buildSync({
  entryPoints: [resolve(here, '../base44/shared/proofShareLinkModel.ts')],
  bundle: true, format: 'esm', outfile: out, logLevel: 'silent',
});
const {
  SHARE_LINK_ENTITY_TYPE, SHARE_LINK_DEFAULT_TTL_MS, SHARE_LINK_MAX_TTL_MS,
  SHARE_LINK_DEFAULT_DISCLAIMER, SHARE_LINK_STATUSES, SHARE_LINK_VIEW_REASONS,
  shareToken, createShareLinkPatch, shareLinkStatus, canViewShareLink,
  recordShareLinkView, revokeShareLinkPatch, shareUrl,
} = await import(pathToFileURL(out).href);

const NOW = '2026-11-03T10:00:00Z';
const NOW_MS = Date.parse(NOW);
const DAY = 24 * 60 * 60 * 1000;
const PRODUCT = { id: 'prod-1', proof_version: 2, proof_file_url: 'https://x/proof-v2.pdf' };
const WO = { id: 'wo-1' };

// --- vocabulary ---------------------------------------------------------------
assert.equal(SHARE_LINK_ENTITY_TYPE, 'proof_share');
assert.equal(SHARE_LINK_DEFAULT_TTL_MS, 7 * DAY, 'default TTL = 7 days');
assert.equal(SHARE_LINK_MAX_TTL_MS, 30 * DAY, 'max TTL = 30 days');
assert.ok(SHARE_LINK_DEFAULT_DISCLAIMER.startsWith('This proof is provided for review'), 'default disclaimer text');
assert.deepEqual([...SHARE_LINK_STATUSES], ['active', 'expired', 'revoked']);
for (const r of ['active', 'not_found', 'revoked', 'expired', 'superseded']) {
  assert.ok(SHARE_LINK_VIEW_REASONS.includes(r), `reason ${r} declared`);
}

// --- shareToken: deterministic test tokens -------------------------------------
assert.equal(shareToken('seed-a'), shareToken('seed-a'), 'same seed → same token');
assert.notEqual(shareToken('seed-a'), shareToken('seed-b'), 'different seed → different token');
assert.match(shareToken('seed-a'), /^ps_[0-9a-f]{32}$/, 'opaque prefixed hex shape');
assert.equal(shareToken(''), shareToken('   '), 'blank seeds converge (no crash)');

// --- createShareLinkPatch: full record shape -----------------------------------
{
  const row = createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: ' staff@x.com ', now: NOW, token: 'tok-abc' });
  assert.deepEqual(row, {
    token: 'tok-abc',
    entity_type: 'proof_share',
    product_id: 'prod-1',
    work_order_id: 'wo-1',
    proof_version: 2,
    created_by: 'staff@x.com',
    created_at: '2026-11-03T10:00:00.000Z',
    expires_at: '2026-11-10T10:00:00.000Z',
    revoked: false,
    view_count: 0,
    disclaimer_text: SHARE_LINK_DEFAULT_DISCLAIMER,
  }, 'new-row shape: pinned version, default TTL, default disclaimer');
  assert.equal(row.token, 'tok-abc', 'caller-supplied CSPRNG token wins');
}

// --- createShareLinkPatch: TTL clamp --------------------------------------------
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: 60 * 60 * 1000 }).expires_at,
  '2026-11-03T11:00:00.000Z', 'explicit 1h TTL honored');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: 90 * DAY }).expires_at,
  '2026-12-03T10:00:00.000Z', 'over-max TTL clamps to 30 days');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: SHARE_LINK_MAX_TTL_MS }).expires_at,
  new Date(NOW_MS + 30 * DAY).toISOString(), 'exactly max is allowed');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: -5 }).expires_at,
  new Date(NOW_MS + 7 * DAY).toISOString(), 'negative TTL → default');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: 0 }).expires_at,
  new Date(NOW_MS + 7 * DAY).toISOString(), 'zero TTL → default');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: 'not-a-number' }).expires_at,
  new Date(NOW_MS + 7 * DAY).toISOString(), 'non-numeric TTL → default');
assert.equal(
  createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, ttl_ms: '3600000' }).expires_at,
  '2026-11-03T11:00:00.000Z', 'numeric-string TTL parses');

// --- createShareLinkPatch: token fallback + disclaimer precedence ----------------
{
  const a = createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW });
  const b = createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW });
  const c = createShareLinkPatch({ product: { ...PRODUCT, proof_version: 3 }, workOrder: WO, actor_id: 'a', now: NOW });
  assert.equal(a.token, b.token, 'no token arg → deterministic fallback');
  assert.notEqual(a.token, c.token, 'different pinned version → different fallback token');
  assert.match(a.token, /^ps_/, 'fallback token carries ps_ prefix');
  assert.equal(
    createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, disclaimer_text: ' Custom line ' }).disclaimer_text,
    'Custom line', 'explicit disclaimer_text wins + trims');
  assert.equal(
    createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, settings: { proof_share_disclaimer: 'Tenant terms' } }).disclaimer_text,
    'Tenant terms', 'settings.proof_share_disclaimer overrides default');
  assert.equal(
    createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, disclaimer_text: 'Per-link', settings: { proof_share_disclaimer: 'Tenant terms' } }).disclaimer_text,
    'Per-link', 'arg beats settings beats default');
  assert.equal(
    createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, settings: { proofShareDisclaimer: 'Camel too' } }).disclaimer_text,
    'Camel too', 'camelCase settings key honored');
}
// Missing bits still produce a complete row.
{
  const row = createShareLinkPatch({});
  assert.equal(row.entity_type, 'proof_share');
  assert.equal(row.proof_version, 0, 'unversioned product pins 0');
  assert.equal(row.revoked, false);
  assert.ok(row.expires_at.includes('T'), 'missing now → real-clock expiry');
  assert.match(row.token, /^ps_/, 'empty args still mint a deterministic token');
}

// --- shareLinkStatus transitions -------------------------------------------------
const LINK = createShareLinkPatch({ product: PRODUCT, workOrder: WO, actor_id: 'a', now: NOW, token: 't1' });
assert.equal(shareLinkStatus(LINK, { now: NOW }), 'active');
assert.equal(shareLinkStatus(LINK, { now: NOW_MS + 6 * DAY }), 'active', 'still inside window');
assert.equal(shareLinkStatus(LINK, { now: NOW_MS + 7 * DAY }), 'expired', 'expiry instant itself is NOT viewable');
assert.equal(shareLinkStatus(LINK, { now: NOW_MS + 8 * DAY }), 'expired');
assert.equal(shareLinkStatus({ ...LINK, revoked: true }, { now: NOW }), 'revoked');
assert.equal(shareLinkStatus({ ...LINK, revoked: true }, { now: NOW_MS + 30 * DAY }), 'revoked', 'revoked beats expired');
assert.equal(shareLinkStatus(null, { now: NOW }), 'revoked', 'missing record fails closed');
assert.equal(shareLinkStatus({}, { now: NOW }), 'expired', 'unparseable expiry fails closed');
assert.equal(shareLinkStatus({ ...LINK, expires_at: 'garbage' }, { now: NOW }), 'expired', 'bad stamp → expired');
assert.equal(shareLinkStatus({ ...LINK, revoked: 'yes' }, { now: NOW }), 'active', 'non-boolean revoked is not revoked');

// --- canViewShareLink --------------------------------------------------------------
assert.deepEqual(canViewShareLink(LINK, { now: NOW }), { ok: true, reason: 'active', error: '' });
{
  const v = canViewShareLink(null, { now: NOW });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'not_found');
  assert.ok(v.error.length > 0, 'rejection carries human-readable error');
}
assert.equal(canViewShareLink({ ...LINK, revoked: true }, { now: NOW }).reason, 'revoked');
assert.equal(canViewShareLink(LINK, { now: NOW_MS + 8 * DAY }).reason, 'expired');
// Pinned-version supersede: link alive, but a newer proof exists.
{
  const v = canViewShareLink(LINK, { now: NOW, proof_version: 3 });
  assert.equal(v.ok, false, 'pinned v2 vs current v3 → not ok');
  assert.equal(v.reason, 'superseded');
  assert.equal(v.newer_version, 3, 'reports the newer version');
  assert.ok(/newer proof/.test(v.error), 'error explains the newer-proof state');
}
assert.equal(canViewShareLink(LINK, { now: NOW, proof_version: 2 }).ok, true, 'current == pinned → viewable');
assert.equal(canViewShareLink(LINK, { now: NOW }).ok, true, 'no version passed → no supersede check');
// Check order: revoked beats expired beats superseded.
assert.equal(canViewShareLink({ ...LINK, revoked: true }, { now: NOW_MS + 9 * DAY, proof_version: 9 }).reason, 'revoked', 'revoked first');
assert.equal(canViewShareLink(LINK, { now: NOW_MS + 9 * DAY, proof_version: 9 }).reason, 'expired', 'expired before supersede');

// --- recordShareLinkView ------------------------------------------------------------
{
  const v1 = recordShareLinkView(LINK, { now: NOW });
  assert.deepEqual(v1, {
    view_count: 1,
    last_viewed_at: '2026-11-03T10:00:00.000Z',
    first_viewed_at: '2026-11-03T10:00:00.000Z',
  }, 'first view stamps both clocks');
  const later = '2026-11-04T09:00:00Z';
  const v2 = recordShareLinkView({ ...LINK, ...v1 }, { now: later });
  assert.equal(v2.view_count, 2, 'view_count accumulates');
  assert.equal(v2.last_viewed_at, '2026-11-04T09:00:00.000Z');
  assert.equal(v2.first_viewed_at, '2026-11-03T10:00:00.000Z', 'first_viewed_at written once, never moved');
  assert.equal(recordShareLinkView({ view_count: '4' }, { now: NOW }).view_count, 5, 'string counts coerce');
}

// --- revokeShareLinkPatch -------------------------------------------------------------
assert.deepEqual(revokeShareLinkPatch({ actor_id: ' admin@x.com ', now: NOW }), {
  revoked: true,
  revoked_at: '2026-11-03T10:00:00.000Z',
  revoked_by: 'admin@x.com',
});
{
  const dead = { ...LINK, ...revokeShareLinkPatch({ actor_id: 'a', now: NOW }) };
  assert.equal(canViewShareLink(dead, { now: NOW }).reason, 'revoked', 'revoked link rejects (verify criterion)');
}

// --- shareUrl --------------------------------------------------------------------------
assert.equal(shareUrl('tok-abc', { app_base: 'https://app.example.com' }), 'https://app.example.com/proof-share?t=tok-abc');
assert.equal(shareUrl('tok-abc', { app_base: 'https://app.example.com/' }), 'https://app.example.com/proof-share?t=tok-abc', 'trailing slash normalized');
assert.equal(shareUrl('ps_++==', { app_base: 'https://x' }), 'https://x/proof-share?t=ps_%2B%2B%3D%3D', 'token URI-encoded');
assert.equal(shareUrl('tok-abc', {}), '/proof-share?t=tok-abc', 'blank base → relative URL');

rmSync(out, { force: true });
console.log('PASS proof-share-link');
