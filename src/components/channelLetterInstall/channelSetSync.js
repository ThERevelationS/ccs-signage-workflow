// P-07 (WS-P): letters-to-install synchronization contract.
// Composes over the purchase->install-item mapping: linked items track their
// source purchase, operator overrides pin individual fields against re-sync,
// deletions cascade only to auto-linked items, duplicates mint distinct links,
// and delivery/design/permit allowances plus personnel/travel attach exactly
// once — re-running the sync is idempotent.
export const CHANNEL_SET_SYNC_VERSION = 1;
export const ALLOWANCE_KINDS = ["delivery", "design", "permit"];

// Fields the purchase->install sync manages — the shared contract the page's
// updateItem uses to decide which hand-edits become pinned overrides.
export const SYNCED_ITEM_FIELDS = new Set([
  "description", "installation_type", "qty_letters", "letter_size",
  "letter_height_inches", "installation_height_feet", "raceway_length_feet",
  "wall_material", "set_id", "set_parent_id",
  "backer_width_inches", "backer_height_inches", "backer_standoff_qty",
]);

// Record operator pins: when a hand edit changes a sync-managed field on a
// linked item, that field joins override_fields so the next re-sync leaves it
// alone. Returns the updated item with override_fields merged.
export const recordFieldOverrides = (existing = {}, updated = {}) => {
  if (!existing.source_letter_purchase_id) return updated;
  const changed = [];
  for (const k of SYNCED_ITEM_FIELDS) {
    if (k in updated && JSON.stringify(updated[k]) !== JSON.stringify(existing[k])) changed.push(k);
  }
  if (!changed.length) return updated;
  return { ...updated, override_fields: [...new Set([...(updated.override_fields || existing.override_fields || []), ...changed])] };
};

const allowanceKey = (kind, scope) => `allowance:${kind}:${scope}`;

// Operator override: fields listed in item.override_fields are NOT patched by
// re-sync. Everything else propagates from the purchase.
export const applySyncOverrides = (patch, existingItem = {}) => {
  const skip = new Set(existingItem.override_fields || []);
  const out = {};
  for (const [k, v] of Object.entries(patch)) if (!skip.has(k)) out[k] = v;
  return out;
};

// Duplicate purchase rows must carry distinct ids — two purchases sharing one
// id would fight over the same install item. Report, keep first.
export const findDuplicatePurchaseIds = (purchases = []) => {
  const seen = new Map(); const dupes = [];
  for (const p of purchases) {
    if (p.id === undefined || p.id === null) continue;
    if (seen.has(p.id)) dupes.push(p.id); else seen.set(p.id, true);
  }
  return dupes;
};

// Exactly-once allowance lines (delivery/design/permit) keyed by kind+scope.
// Re-running returns the same set — qty/price patch in place, never appended.
export const ensureAllowanceLines = (items = [], allowances = []) => {
  const out = [...items];
  const byKey = new Map();
  out.forEach((it, i) => { if (it.allowance_key) byKey.set(it.allowance_key, i); });
  for (const a of allowances) {
    if (!ALLOWANCE_KINDS.includes(a.kind)) continue;
    const scope = a.scope || "estimate";
    const key = allowanceKey(a.kind, scope);
    const patch = {
      description: a.description || `${a.kind} allowance`,
      allowance_key: key,
      allowance_kind: a.kind,
      allowance_scope: scope,
      qty: a.qty ?? 1,
      unit_price: a.unit_price ?? null,
      is_allowance: true,
    };
    if (byKey.has(key)) out[byKey.get(key)] = { ...out[byKey.get(key)], ...patch };
    else { byKey.set(key, out.length); out.push(patch); }
  }
  return out;
};

// Personnel + travel are estimate-level charges — exactly one line each no
// matter how many sets feed the sync.
export const ensurePersonnelTravelLines = (items = [], { personnel, travel } = {}) => {
  const out = [...items];
  const upsert = (kind, data) => {
    if (!data) return;
    const key = `estimate_level:${kind}`;
    const i = out.findIndex((it) => it.estimate_level_key === key);
    const patch = { estimate_level_key: key, description: data.description || kind, qty: data.qty ?? 1, unit_price: data.unit_price ?? null, is_estimate_level: true };
    if (i >= 0) out[i] = { ...out[i], ...patch }; else out.push(patch);
  };
  upsert("personnel", personnel);
  upsert("travel", travel);
  return out;
};

// Full sync: purchases -> install items (override-aware), deletion cascade,
// duplicate-id detection, then allowances + estimate-level lines.
export const syncChannelSet = ({ items = [], purchases = [], mapPurchase = null, allowances = [], personnel = null, travel = null } = {}) => {
  const issues = [];
  const dupes = findDuplicatePurchaseIds(purchases);
  if (dupes.length) issues.push({ kind: "conflict", field: "purchase_id", message: `Duplicate purchase id(s) ${dupes.join(", ")} — later rows ignored for sync.` });

  const out = [...items];
  const linkedIdx = new Map();
  out.forEach((it, i) => { if (it.source_letter_purchase_id) linkedIdx.set(it.source_letter_purchase_id, i); });
  const seenIds = new Set(); const keepPurchaseIds = new Set();

  for (const p of purchases) {
    if (!p.create_install_item || p.letter_type === "raceway") continue;
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id); keepPurchaseIds.add(p.id);
    const patch = mapPurchase ? mapPurchase(p) : { description: p.description || "Letter set", qty_letters: p.qty ?? null, source_letter_purchase_id: p.id, set_id: p.set_id };
    patch.source_letter_purchase_id = p.id;
    if (linkedIdx.has(p.id)) {
      const i = linkedIdx.get(p.id);
      out[i] = { ...out[i], ...applySyncOverrides(patch, out[i]) };
    } else {
      out.push({ ...patch });
    }
  }

  // Cascade: auto-linked items whose purchase vanished are removed; manual
  // items (no source link) are never touched.
  const filtered = out.filter((it) => !it.source_letter_purchase_id || keepPurchaseIds.has(it.source_letter_purchase_id));

  const withAllowances = ensureAllowanceLines(filtered, allowances);
  const final = ensurePersonnelTravelLines(withAllowances, { personnel, travel });
  return { items: final, issues };
};
