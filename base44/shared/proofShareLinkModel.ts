// Proof external-share links — login-free proof review URLs a customer can
// forward to a third party (ESTIMATOR_MASTERPLAN E-09). A staff or customer
// action mints a ProofShareLink row carrying an opaque token; anyone holding
// the URL (`/proof-share?t=<token>`) views the PINNED proof version plus the
// disclaimer text — no session, no portal account. Pure TS, zero imports —
// safe for Deno functions and frontend modules, same contract as
// proofBatchModel/proofFollowUpModel.
//
// ---------------------------------------------------------------------------
// ENTITY SPEC — `ProofShareLink` (orchestrator-owned jsonc; this model is the
// field authority, do NOT create the entity file here)
// ---------------------------------------------------------------------------
// Backend-only RLS (Sop.jsonc pattern — `__proofsharelink_backend_only__` role
// on create/read/update/delete): the public proof-share page NEVER reads the
// entity directly. A backend function resolves token → link → pinned proof
// payload with base44.asServiceRole so third parties render without login;
// staff mint/revoke/list through the same function behind session auth.
//
//   token            string   required — opaque lookup key; the only public
//                     credential. Real impl supplies a CSPRNG value (≥128-bit,
//                     crypto.getRandomValues); shareToken() below is a
//                     deterministic fallback for tests/dev only.
//   entity_type      string   default 'proof_share' — discriminator so the
//                     rows can never be confused with other link types if a
//                     generic links table ever absorbs them.
//   product_id       string   required — WorkOrder.products[].id the proof
//                     belongs to.
//   work_order_id    string   required — parent WorkOrder id.
//   proof_version    number   — pinned at creation. The link renders THAT
//                     version forever; a newer upload does not change what a
//                     minted link shows (canViewShareLink reports
//                     'superseded' so the page can offer the "a newer proof
//                     exists — ask the sender" state instead of silently
//                     serving stale art).
//   disclaimer_text  string   — legal line rendered under the proof (default
//                     SHARE_LINK_DEFAULT_DISCLAIMER; A-21 GlobalSettings key
//                     proof_share_disclaimer overrides per-tenant).
//   created_by       string   — actor who minted the link.
//   created_at       string   date-time.
//   expires_at       string   date-time — created_at + ttl clamped to
//                     (0, SHARE_LINK_MAX_TTL_MS]; default
//                     SHARE_LINK_DEFAULT_TTL_MS.
//   revoked          boolean  default false — staff kill switch; revocation
//                     beats expiry (a revoked link is dead even inside its
//                     TTL window).
//   revoked_at       string   date-time.
//   revoked_by       string   — actor who killed the link.
//   view_count       number   default 0 — increment per successful render
//                     (recordShareLinkView); honest "did the third party
//                     actually look" telemetry for the sender.
//   first_viewed_at  string   date-time — set once on first view.
//   last_viewed_at   string   date-time — updated every view.
//   required: [token, entity_type, product_id, work_order_id]
//
// ---------------------------------------------------------------------------
// Expiry semantics
// ---------------------------------------------------------------------------
//   active   — not revoked AND now < expires_at
//   expired  — now >= expires_at (the expiry instant itself is NOT viewable)
//   revoked  — revoked === true (checked first — revoking a link that would
//              also be expired still reports 'revoked', the honest cause)
// Missing/malformed link or unparseable expires_at fail CLOSED: status
// 'revoked' for a non-record, 'expired' for a bad stamp — a link that cannot
// prove it is alive is never viewable.
//
// TTL: caller passes ttl_ms; the model clamps into (0, SHARE_LINK_MAX_TTL_MS]
// — non-finite/non-positive → SHARE_LINK_DEFAULT_TTL_MS, over-max → max.
// There is no floor beyond "positive": a 1-minute link is a legal (if silly)
// share.
//
// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
//   SHARE_LINK_DEFAULT_TTL_MS / SHARE_LINK_MAX_TTL_MS — 7d / 30d bounds.
//   SHARE_LINK_DEFAULT_DISCLAIMER — stock disclaimer text.
//   SHARE_LINK_ENTITY_TYPE — 'proof_share' discriminator value.
//   SHARE_LINK_STATUSES / SHARE_LINK_VIEW_REASONS — vocabularies.
//   shareToken(seed)                 → deterministic 'ps_…' token (tests/dev;
//                                      prod callers pass a CSPRNG `token`).
//   createShareLinkPatch({product, workOrder, actor_id, now, ttl_ms?,
//                         disclaimer_text?, settings?, token?})
//                                    → full new-row shape (see entity spec).
//   shareLinkStatus(link, {now})     → 'active'|'expired'|'revoked'.
//   canViewShareLink(link, {now, proof_version})
//                                    → {ok, error, reason, newer_version?} —
//                                      revoked/expired/not_found reject;
//                                      pinned-version mismatch →
//                                      {ok:false, reason:'superseded',
//                                      newer_version}.
//   recordShareLinkView(link, {now}) → patch {view_count, last_viewed_at,
//                                      first_viewed_at}.
//   revokeShareLinkPatch({actor_id, now})
//                                    → patch {revoked:true, revoked_at,
//                                      revoked_by}.
//   shareUrl(token, {app_base})      → `${app_base}/proof-share?t=<token>`
//                                      ('' base → relative URL).

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SHARE_LINK_ENTITY_TYPE = 'proof_share';

// 7-day default window, 30-day ceiling — long enough for a forwarded link to
// be useful, short enough that a stale proof can't circulate indefinitely.
export const SHARE_LINK_DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SHARE_LINK_MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Stock disclaimer — tenants override via GlobalSettings
// proof_share_disclaimer (A-21 settings object) or per-link disclaimer_text.
export const SHARE_LINK_DEFAULT_DISCLAIMER =
  'This proof is provided for review purposes only and does not constitute ' +
  'approval for production. Colors, materials, and dimensions shown are ' +
  'approximations and may differ from the finished product. Please contact ' +
  'the sender with any questions before relying on this document.';

export const SHARE_LINK_STATUSES = ['active', 'expired', 'revoked'] as const;

// Machine codes for canViewShareLink.reason — 'active' is the ok:true code;
// every ok:false row carries one of the rejection codes.
export const SHARE_LINK_VIEW_REASONS = [
  'active',     // viewable right now
  'not_found',  // no usable link record at all
  'revoked',    // staff killed it
  'expired',    // past expires_at
  'superseded', // link alive but a newer proof version exists
] as const;

// ---------------------------------------------------------------------------
// Normalization helpers (same conventions as proofBatchModel)
// ---------------------------------------------------------------------------

const cleanStr = (value: any): string => String(value ?? '').trim();

const num = (value: any, fallback = 0): number =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

// now → epoch ms. Accepts Date | epoch ms | parseable string; falls back to
// the real clock so a missing `now` never produces an undated link.
const toInstant = (value: any): number | null => {
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const t = Date.parse(String(value ?? ''));
  return Number.isNaN(t) ? null : t;
};

const nowMs = (now: any): number => toInstant(now) ?? Date.now();
const toIso = (t: number): string => new Date(t).toISOString();

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

// FNV-1a 32-bit — deterministic, dependency-free. Four passes at different
// offset bases yield 32 hex chars of stable output; NOT a security primitive
// (that's why production callers mint their own CSPRNG token and pass it in).
const fnv1a = (input: string, basis: number): string => {
  let h = basis >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
};

// Deterministic share token for tests/dev: same seed → same token, different
// seed → different token. Real implementations supply a CSPRNG value via
// createShareLinkPatch({token}) — this exists so the model can always produce
// a complete row shape without importing a crypto module.
export function shareToken(seed: any): string {
  const s = cleanStr(seed) || 'proof-share';
  return (
    'ps_' +
    fnv1a(s, 0x811c9dc5) +
    fnv1a(s, 0x811c9dc5 ^ 0x9e3779b9) +
    fnv1a(`${s}:2`, 0x811c9dc5) +
    fnv1a(`${s}:3`, 0x811c9dc5 ^ 0x85ebca6b)
  );
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

// Clamp ttl_ms into (0, SHARE_LINK_MAX_TTL_MS]; non-finite/non-positive →
// SHARE_LINK_DEFAULT_TTL_MS (see header "TTL").
const clampTtl = (ttl_ms: any): number => {
  const t = Number(ttl_ms);
  if (!Number.isFinite(t) || t <= 0) return SHARE_LINK_DEFAULT_TTL_MS;
  return Math.min(t, SHARE_LINK_MAX_TTL_MS);
};

// Disclaimer precedence: explicit disclaimer_text arg →
// settings.proof_share_disclaimer / settings.proofShareDisclaimer (A-21) →
// SHARE_LINK_DEFAULT_DISCLAIMER.
const resolveDisclaimer = (disclaimer_text: any, settings: any): string => {
  const explicit = cleanStr(disclaimer_text);
  if (explicit) return explicit;
  const fromSettings =
    cleanStr(settings?.proof_share_disclaimer) || cleanStr(settings?.proofShareDisclaimer);
  return fromSettings || SHARE_LINK_DEFAULT_DISCLAIMER;
};

// Full new-row shape for one ProofShareLink. Pins proof_version from the
// product AT CREATION — the rendered artifact is the version the sender saw,
// not whatever is current later. `token` arg wins; absent, a deterministic
// shareToken() over the identifying seed keeps the row complete (callers in
// production MUST pass a CSPRNG token — see header).
export function createShareLinkPatch({
  product,
  workOrder,
  actor_id,
  now,
  ttl_ms,
  disclaimer_text,
  settings,
  token,
}: any = {}) {
  const at = nowMs(now);
  const productId = cleanStr(product?.id);
  const workOrderId = cleanStr(workOrder?.id ?? product?.work_order_id);
  const version = num(product?.proof_version, 0);
  const by = cleanStr(actor_id);
  const createdAt = toIso(at);
  const tok =
    cleanStr(token) ||
    shareToken(`${workOrderId}:${productId}:${version}:${by}:${createdAt}`);
  return {
    token: tok,
    entity_type: SHARE_LINK_ENTITY_TYPE,
    product_id: productId,
    work_order_id: workOrderId,
    proof_version: version,
    created_by: by,
    created_at: createdAt,
    expires_at: toIso(at + clampTtl(ttl_ms)),
    revoked: false,
    view_count: 0,
    disclaimer_text: resolveDisclaimer(disclaimer_text, settings),
  };
}

// ---------------------------------------------------------------------------
// Status / view gate
// ---------------------------------------------------------------------------

// 'active' | 'expired' | 'revoked'. Revoked wins over expired — the honest
// cause of death. Fail-closed: no record → 'revoked'; unparseable expiry →
// 'expired' (a link that cannot prove it is alive is not alive).
export function shareLinkStatus(link: any, { now }: any = {}): string {
  if (!link || typeof link !== 'object' || Array.isArray(link)) return 'revoked';
  if (link.revoked === true) return 'revoked';
  const expires = toInstant(link.expires_at);
  if (expires === null) return 'expired';
  return nowMs(now) >= expires ? 'expired' : 'active';
}

// May a visitor holding this link view the proof right now?
//   {ok:true,  reason:'active',  error:''}
//   {ok:false, reason:'not_found'|'revoked'|'expired'|'superseded', error:<human>, newer_version?}
// `proof_version` is the product's CURRENT version (optional). A link pinned
// to an older version is still a valid link — it returns 'superseded' so the
// page renders "a newer proof exists" instead of silently serving stale art;
// the sender decides whether to mint a fresh link.
export function canViewShareLink(link: any, { now, proof_version }: any = {}) {
  const status = shareLinkStatus(link, { now });
  if (status === 'revoked') {
    const missing = !link || typeof link !== 'object' || Array.isArray(link);
    return {
      ok: false,
      reason: missing ? 'not_found' : 'revoked',
      error: missing
        ? 'This proof link is not valid.'
        : 'This proof link has been revoked.',
    };
  }
  if (status === 'expired') {
    return { ok: false, reason: 'expired', error: 'This proof link has expired.' };
  }
  const current = Number(proof_version);
  if (Number.isFinite(current) && current !== num(link?.proof_version, 0)) {
    return {
      ok: false,
      reason: 'superseded',
      error: 'A newer proof exists for this item. Please request an updated link from the sender.',
      newer_version: current,
    };
  }
  return { ok: true, reason: 'active', error: '' };
}

// ---------------------------------------------------------------------------
// View bookkeeping / revocation
// ---------------------------------------------------------------------------

// Per-render telemetry patch. view_count always increments; last_viewed_at
// always moves; first_viewed_at is written once (existing value preserved so
// a re-view never rewrites the first-look stamp).
export function recordShareLinkView(link: any, { now }: any = {}) {
  const at = toIso(nowMs(now));
  const first = toInstant(link?.first_viewed_at);
  return {
    view_count: num(link?.view_count, 0) + 1,
    last_viewed_at: at,
    first_viewed_at: first === null ? at : toIso(first),
  };
}

// Staff kill-switch patch. Unconditional — callers gate on their own policy;
// revoked beats every other state forever after.
export function revokeShareLinkPatch({ actor_id, now }: any = {}) {
  return {
    revoked: true,
    revoked_at: toIso(nowMs(now)),
    revoked_by: cleanStr(actor_id),
  };
}

// ---------------------------------------------------------------------------
// URL
// ---------------------------------------------------------------------------

// Public URL for a token — `${app_base}/proof-share?t=<token>`. Trailing
// slashes are normalized off the base; a blank base yields a site-relative
// URL. Token is URI-encoded so any CSPRNG alphabet survives the querystring.
export function shareUrl(token: any, { app_base }: any = {}): string {
  const base = cleanStr(app_base).replace(/\/+$/, '');
  const t = encodeURIComponent(cleanStr(token));
  return `${base}/proof-share?t=${t}`;
}
