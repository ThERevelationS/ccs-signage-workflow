// E-01 — proof upload pipeline model (per-product + per-part).
//
// Pure and IO-free: this module only describes what an upload SHOULD write —
// file acceptance, version bump, prior-version retention — while callers
// handle UploadFile + the entity write. Companion to
// src/components/proofs/proofModel.js, which owns status transitions; this
// owns the file-rotation half of the lifecycle.
//
// Field shape written on WorkOrder.products[] (and embedded product.parts[]
// rows), all snake_case storage fields:
//   proof_file_url / proof_file_name — current file version
//   proof_version                    — 1-based; 0 = never uploaded
//   proof_status                     — always returns to 'draft' on upload
//   proof_submitted_at               — ISO timestamp of this upload
//   proof_history[]                  — prior file versions, oldest-first:
//     { proof_file_url, proof_file_name, proof_version, replaced_at, replaced_by }
//
// STALE-APPROVAL SEMANTICS (deliberate divergence from proofModel.supersede,
// which zeroes proofApprovedVersion): an upload patch NEVER touches
// proof_approved_version. Uploading v3 while v2 was approved leaves
// proof_approved_version === 2 — that lag IS the E-05 stale-proof signal
// (proof_version > proof_approved_version ⇒ the visible file needs a fresh
// approval). Clearing it would erase the "approved v2, now viewing v3" delta
// that ProofStateChip / isProofStale render. Documented, not cleared.
//
// `proof_history` is NOT declared on products[] in WorkOrder.jsonc yet — same
// additive pattern as products[].notes (B-10): the model emits the canonical
// shape so writers are ready.

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();
const intAtLeast0 = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
};

// ---------------------------------------------------------------------------
// File criteria
// ---------------------------------------------------------------------------

// Accepted proof file kinds — by extension, case-insensitive. `accept` is the
// ready-made <input type="file" accept=…> string; `kinds` maps each accepted
// extension to a display bucket for preview rendering.
export const PROOF_FILE_CRITERIA = Object.freeze({
  extensions: Object.freeze(["pdf", "png", "jpg", "svg", "ai", "eps"]),
  accept: ".pdf,.png,.jpg,.svg,.ai,.eps",
  max_mb: 50,
  kinds: Object.freeze({
    pdf: "document",
    png: "image",
    jpg: "image",
    svg: "vector",
    ai: "vector",
    eps: "vector",
  }),
  summary: "PDF, PNG, JPG, SVG, AI, or EPS up to 50 MB",
});

const extensionOf = (name) => {
  const base = clean(name).split(/[\\/]/).pop(); // strip any path prefix
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return ""; // no ext / dotfile / trailing dot
  return base.slice(dot + 1).toLowerCase();
};

// Is `name` an accepted proof file? Extension match only — MIME sniffing is
// the uploader's job; this gate is deterministic and case-insensitive.
export function acceptsProofFile(name) {
  return PROOF_FILE_CRITERIA.extensions.includes(extensionOf(name));
}

// Display bucket for a file name: 'image' (raster), 'vector' (svg/ai/eps),
// 'document' (pdf), 'other' (unaccepted or extensionless).
export function proofFileKind(name) {
  return PROOF_FILE_CRITERIA.kinds[extensionOf(name)] || "other";
}

// Pre-upload gate → { ok, error? }. Extension must be accepted and, when a
// finite byte size is supplied, it must fit max_mb (default
// PROOF_FILE_CRITERIA.max_mb = 50). A missing/unknown size does not block —
// server-side upload limits still apply downstream. `error` is a
// human-readable sentence for toast display.
export function validateProofUpload({ file_name, file_size, max_mb } = {}) {
  const name = clean(file_name);
  if (!name) return { ok: false, error: "A proof file is required." };
  if (!acceptsProofFile(name)) {
    return {
      ok: false,
      error: `"${name}" is not a supported proof file type — upload ${PROOF_FILE_CRITERIA.extensions.join(", ")}.`,
    };
  }
  const capMb = Number.isFinite(Number(max_mb)) && Number(max_mb) > 0
    ? Number(max_mb)
    : PROOF_FILE_CRITERIA.max_mb;
  const size = Number(file_size);
  if (Number.isFinite(size)) {
    if (size < 0) return { ok: false, error: `"${name}" reports an invalid file size.` };
    if (size > capMb * 1024 * 1024) {
      return { ok: false, error: `"${name}" exceeds the ${capMb} MB proof file limit.` };
    }
  }
  return { ok: true, kind: proofFileKind(name) };
}

// ---------------------------------------------------------------------------
// Target resolution — the proof-bearing record (product itself, or one part)
// ---------------------------------------------------------------------------

// Locate the record a proof write applies to. target 'product' → the product;
// target 'part' → the row inside product.parts whose id / part_id / part_key
// matches part_id. parts may be an array (canonical — see
// EstimatorProducts `product.parts`) or an id-keyed map. Returns
// { record, key|null, container } — container null when parts is absent.
function resolveProofTarget(product, { target = "product", part_id } = {}) {
  if (!product || typeof product !== "object") return { record: null };
  if (norm(target) !== "part") return { record: product, key: null, container: null };
  const wanted = clean(part_id);
  const parts = product.parts;
  if (!wanted || parts === null || parts === undefined) return { record: null };
  if (Array.isArray(parts)) {
    const idx = parts.findIndex((p) =>
      p && typeof p === "object" &&
      [p.id, p.part_id, p.part_key].some((k) => clean(k) === wanted));
    return idx < 0
      ? { record: null }
      : { record: parts[idx], key: idx, container: "array" };
  }
  if (typeof parts === "object") {
    // Id-keyed map: exact key first, then scan values for an id field match.
    if (parts[wanted] && typeof parts[wanted] === "object") {
      return { record: parts[wanted], key: wanted, container: "map" };
    }
    const hit = Object.keys(parts).find((k) => {
      const p = parts[k];
      return p && typeof p === "object" && [p.id, p.part_id, p.part_key].some((f) => clean(f) === wanted);
    });
    return hit === undefined
      ? { record: null }
      : { record: parts[hit], key: hit, container: "map" };
  }
  return { record: null };
}

// ---------------------------------------------------------------------------
// Versioning + history
// ---------------------------------------------------------------------------

// Next upload's version number for a proof-bearing record: current
// proof_version (coerced to int ≥ 0) + 1. Works on a product OR a part — both
// carry the same proof_* field shape.
export function nextProofVersion(record) {
  return intAtLeast0(record?.proof_version) + 1;
}

const normalizeHistoryRow = (row) => {
  if (!row || typeof row !== "object") return null;
  return {
    proof_file_url: clean(row.proof_file_url ?? row.file_url ?? row.url),
    proof_file_name: clean(row.proof_file_name ?? row.file_name ?? row.name),
    proof_version: intAtLeast0(row.proof_version ?? row.version),
    replaced_at: clean(row.replaced_at ?? row.at),
    replaced_by: clean(row.replaced_by ?? row.by),
  };
};

// Prior proof file versions, normalized newest-first. Stored order is append
// order (each upload pushes one row), so newest-first is the reverse. Pass a
// product plus { part_id } to read a part's history, or pass the part record
// directly — same field shape either way.
export function proofHistory(record, opts = {}) {
  const { record: target } = clean(opts.part_id)
    ? resolveProofTarget(record, { target: "part", part_id: opts.part_id })
    : { record };
  const list = Array.isArray(target?.proof_history) ? target.proof_history : [];
  return list.map(normalizeHistoryRow).filter(Boolean).reverse();
}

// The currently-visible proof file, or null when none was ever uploaded
// (no file url/name AND version 0). `status` falls back to 'none';
// `sent_at` mirrors proof_sent_at (blank until sent for approval).
// Same record-or-{part_id} resolution as proofHistory.
export function currentProofFor(record, opts = {}) {
  const { record: target } = clean(opts.part_id)
    ? resolveProofTarget(record, { target: "part", part_id: opts.part_id })
    : { record };
  if (!target || typeof target !== "object") return null;
  const url = clean(target.proof_file_url);
  const name = clean(target.proof_file_name);
  const version = intAtLeast0(target.proof_version);
  if (!url && !name && version === 0) return null;
  return {
    url,
    name,
    version,
    status: norm(target.proof_status) || "none",
    sent_at: clean(target.proof_sent_at),
  };
}

// ---------------------------------------------------------------------------
// Upload patch
// ---------------------------------------------------------------------------

// Build the storage-field patch for a completed file upload.
//
//   file   — { url | file_url, name | file_name } (e.g. UploadFile result +
//            original file name)
//   actor  — who is uploading; stamped as replaced_by on the history row
//   now    — ISO timestamp (tests pin it; defaults to current time)
//   target — 'product' (default) patches the product's own proof_* fields;
//            'part' (requires part_id) patches parts[part_id].proof_* with the
//            same shape and returns the whole rebuilt parts collection for a
//            clean merge: { parts: [...] } for array storage, { parts: {…} }
//            for id-keyed maps. Product-level proof_* is untouched — part
//            proofs version independently.
//
// Returns null when there is nothing to write (no product, unresolvable
// part, blank file, unknown target). The patch ALWAYS sets:
//   proof_file_url, proof_file_name, proof_version (bumped),
//   proof_status: 'draft'         — a new upload resets approval state,
//   proof_submitted_at: now,
//   proof_history: normalized prior rows + the replaced file's snapshot —
//   appended ONLY when a prior file actually existed (url, name, or version).
//
// proof_approved_version is deliberately ABSENT from the patch — see the
// stale-approval note at the top of this file.
export function proofUploadPatch({ product, file, actor, now, target = "product", part_id } = {}) {
  if (!product || typeof product !== "object") return null;
  const isPart = norm(target) === "part";
  if (norm(target) !== "product" && !isPart) return null; // unknown target fails closed

  const { record, key, container } = resolveProofTarget(product, { target, part_id });
  if (!record) return null;

  const url = clean(file?.url ?? file?.file_url);
  const name = clean(file?.name ?? file?.file_name);
  if (!url && !name) return null; // nothing uploaded → no patch

  const stamp = clean(now) || new Date().toISOString();
  const by = clean(actor);
  const patch = {
    proof_file_url: url,
    proof_file_name: name,
    proof_version: nextProofVersion(record),
    proof_status: "draft",
    proof_submitted_at: stamp,
    proof_history: Array.isArray(record.proof_history)
      ? record.proof_history.map(normalizeHistoryRow).filter(Boolean)
      : [],
  };

  // Retain the replaced file — only when one actually existed.
  const priorUrl = clean(record.proof_file_url);
  const priorName = clean(record.proof_file_name);
  const priorVersion = intAtLeast0(record.proof_version);
  if (priorUrl || priorName || priorVersion > 0) {
    patch.proof_history.push({
      proof_file_url: priorUrl,
      proof_file_name: priorName,
      proof_version: priorVersion,
      replaced_at: stamp,
      replaced_by: by,
    });
  }

  if (!isPart) return patch;

  // Part target: splice the patched record back into its collection, keeping
  // the caller's storage shape so `{ parts }` merges onto the product whole.
  if (container === "array") {
    const parts = product.parts.slice();
    parts[key] = { ...record, ...patch };
    return { parts };
  }
  if (container === "map") {
    return { parts: { ...product.parts, [key]: { ...record, ...patch } } };
  }
  return null;
}
