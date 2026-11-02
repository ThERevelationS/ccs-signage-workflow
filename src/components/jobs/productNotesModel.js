// Audience-routed product notes (B-10).
//
// Every product in WorkOrder.products[] carries a `notes[]` list; each note is
// routed to exactly one channel so a surface only ever shows the audience it
// serves — a staff note about a remake never leaks into the customer portal,
// and a customer-visible note is the only thing the portal renders.
//
// NOTE: WorkOrder.jsonc does NOT declare `notes` on products[] items yet —
// this model still emits the canonical field shape ({notes: [...]}) so the
// writers are ready; the schema add is tracked by
// scripts/test-notes-override.mjs (SCHEMA_GAP check). products[].notes rows:
//   { id, channel, text, author, created_at }
//
// Pure and IO-free — esbuild-bundled + unit-tested under Node by
// scripts/test-notes-override.mjs.

// The five canonical audiences. `customer` is the only channel that ever
// leaves the building; the other four are internal-only.
export const NOTE_CHANNELS = ["sales", "design", "production", "customer", "vendor"];

// Fallback channel for notes that arrive with no/unknown channel. `sales` is
// the intake end of the pipeline and — critically — internal-only, so an
// unlabeled note can never leak to the portal by accident.
export const DEFAULT_NOTE_CHANNEL = "sales";

// Surface → visible channel list. Fail-closed: a surface not listed here sees
// NO product notes rather than all of them.
//
//   portal        → customer only — the customer-facing portal renders just the
//                   channel meant for it; internal shop chatter stays hidden.
//   jobWorkspace  → all channels — internal job screen is the one place staff
//                   see the full routed note stream.
//   queue         → production + design — shop queues show ops notes only;
//                   sales pricing chatter, vendor POs, and customer-facing
//                   replies stay off the queue card.
export const SURFACE_CHANNELS = {
  portal: ["customer"],
  jobWorkspace: [...NOTE_CHANNELS],
  queue: ["production", "design"],
};

const clean = (v) => String(v ?? "").trim();

// Normalize a channel name to the canonical lowercase vocabulary. Unknown /
// blank input resolves to DEFAULT_NOTE_CHANNEL so every stored note is routed.
export function normalizeNoteChannel(raw) {
  const s = clean(raw).toLowerCase().replace(/[\s-]+/g, "_");
  return NOTE_CHANNELS.includes(s) ? s : DEFAULT_NOTE_CHANNEL;
}

// Channel list a surface may render — a COPY (callers can't mutate the map).
// Unknown surfaces get [] (fail-closed).
export function visibleChannelsForSurface(surface) {
  const s = clean(surface);
  const list = SURFACE_CHANNELS[s];
  return Array.isArray(list) ? [...list] : [];
}

// Normalize one raw note entry into the canonical stored shape:
//   { id, channel, text, author, created_at }
// Accepts the stored object, a bare string (legacy free-text note), or a
// partial row (e.g. {body, by}); missing fields normalize to "" / defaults.
// `opts.now` / `opts.id` let tests and retry-safe writers pin determinism.
export function normalizeNoteEntry(raw, opts = {}) {
  if (raw === null || raw === undefined) return null;
  const src = typeof raw === "string" ? { text: raw } : raw;
  if (typeof src !== "object") return null;

  const text = clean(src.text ?? src.body ?? src.note ?? src.message);
  const author = clean(src.author ?? src.created_by ?? src.by ?? src.actor);
  const createdAt = clean(src.created_at ?? src.timestamp ?? src.at ?? src.occurred_at)
    || clean(opts.now)
    || new Date().toISOString();
  const id = clean(src.id) || clean(opts.id);
  return {
    id,
    channel: normalizeNoteChannel(src.channel ?? src.audience),
    text,
    author,
    created_at: createdAt,
  };
}

// All normalized notes on a product, in stored (append) order — append order
// is chronological because created_at is stamped at write time.
export function productNotes(product) {
  const list = product && typeof product === "object" ? product.notes : null;
  if (!Array.isArray(list)) return [];
  return list.map((n) => normalizeNoteEntry(n)).filter(Boolean);
}

// Notes routed to one channel — unknown/blank channel → [] (fail-closed).
export function notesForChannel(product, channel) {
  const s = clean(channel).toLowerCase().replace(/[\s-]+/g, "_");
  if (!NOTE_CHANNELS.includes(s)) return [];
  return productNotes(product).filter((n) => n.channel === s);
}

// Convenience: every note a surface may render, still in append order.
export function notesForSurface(product, surface) {
  const allowed = new Set(visibleChannelsForSurface(surface));
  if (!allowed.size) return [];
  return productNotes(product).filter((n) => allowed.has(n.channel));
}

// Build the product patch appending one routed note. Returns
//   { notes: [...normalizedExisting, newEntry] }
// — the caller merges this onto the product inside WorkOrder.products[].
// Empty note text → null (nothing to append; callers treat null as no-op).
//
// opts: { id, now } — retry-safe writers pin both so a retried submit cannot
// duplicate the row.
export function appendNote(product, { channel, text, author } = {}, opts = {}) {
  const body = clean(text);
  if (!body) return null;
  const existing = productNotes(product);
  const now = clean(opts.now) || new Date().toISOString();
  const entry = normalizeNoteEntry(
    { channel, text: body, author, created_at: now },
    { id: clean(opts.id) || `note_${Date.parse(now) || existing.length + 1}_${existing.length + 1}`, now },
  );
  return { notes: [...existing, entry] };
}
