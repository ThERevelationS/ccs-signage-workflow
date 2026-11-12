// src/components/channelLetterInstall/channelSetSync.js
var CHANNEL_SET_SYNC_VERSION = 1;
var ALLOWANCE_KINDS = ["delivery", "design", "permit"];
var SYNCED_ITEM_FIELDS = /* @__PURE__ */ new Set([
  "description",
  "installation_type",
  "qty_letters",
  "letter_size",
  "letter_height_inches",
  "installation_height_feet",
  "raceway_length_feet",
  "wall_material",
  "set_id",
  "set_parent_id",
  "backer_width_inches",
  "backer_height_inches",
  "backer_standoff_qty"
]);
var recordFieldOverrides = (existing = {}, updated = {}) => {
  if (!existing.source_letter_purchase_id) return updated;
  const changed = [];
  for (const k of SYNCED_ITEM_FIELDS) {
    if (k in updated && JSON.stringify(updated[k]) !== JSON.stringify(existing[k])) changed.push(k);
  }
  if (!changed.length) return updated;
  return { ...updated, override_fields: [.../* @__PURE__ */ new Set([...updated.override_fields || existing.override_fields || [], ...changed])] };
};
var allowanceKey = (kind, scope) => `allowance:${kind}:${scope}`;
var applySyncOverrides = (patch, existingItem = {}) => {
  const skip = new Set(existingItem.override_fields || []);
  const out = {};
  for (const [k, v] of Object.entries(patch)) if (!skip.has(k)) out[k] = v;
  return out;
};
var findDuplicatePurchaseIds = (purchases = []) => {
  const seen = /* @__PURE__ */ new Map();
  const dupes = [];
  for (const p of purchases) {
    if (p.id === void 0 || p.id === null) continue;
    if (seen.has(p.id)) dupes.push(p.id);
    else seen.set(p.id, true);
  }
  return dupes;
};
var ensureAllowanceLines = (items = [], allowances = []) => {
  const out = [...items];
  const byKey = /* @__PURE__ */ new Map();
  out.forEach((it, i) => {
    if (it.allowance_key) byKey.set(it.allowance_key, i);
  });
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
      is_allowance: true
    };
    if (byKey.has(key)) out[byKey.get(key)] = { ...out[byKey.get(key)], ...patch };
    else {
      byKey.set(key, out.length);
      out.push(patch);
    }
  }
  return out;
};
var ensurePersonnelTravelLines = (items = [], { personnel, travel } = {}) => {
  const out = [...items];
  const upsert = (kind, data) => {
    if (!data) return;
    const key = `estimate_level:${kind}`;
    const i = out.findIndex((it) => it.estimate_level_key === key);
    const patch = { estimate_level_key: key, description: data.description || kind, qty: data.qty ?? 1, unit_price: data.unit_price ?? null, is_estimate_level: true };
    if (i >= 0) out[i] = { ...out[i], ...patch };
    else out.push(patch);
  };
  upsert("personnel", personnel);
  upsert("travel", travel);
  return out;
};
var syncChannelSet = ({ items = [], purchases = [], mapPurchase = null, allowances = [], personnel = null, travel = null } = {}) => {
  const issues = [];
  const dupes = findDuplicatePurchaseIds(purchases);
  if (dupes.length) issues.push({ kind: "conflict", field: "purchase_id", message: `Duplicate purchase id(s) ${dupes.join(", ")} \u2014 later rows ignored for sync.` });
  const out = [...items];
  const linkedIdx = /* @__PURE__ */ new Map();
  out.forEach((it, i) => {
    if (it.source_letter_purchase_id) linkedIdx.set(it.source_letter_purchase_id, i);
  });
  const seenIds = /* @__PURE__ */ new Set();
  const keepPurchaseIds = /* @__PURE__ */ new Set();
  for (const p of purchases) {
    if (!p.create_install_item || p.letter_type === "raceway") continue;
    if (seenIds.has(p.id)) continue;
    seenIds.add(p.id);
    keepPurchaseIds.add(p.id);
    const patch = mapPurchase ? mapPurchase(p) : { description: p.description || "Letter set", qty_letters: p.qty ?? null, source_letter_purchase_id: p.id, set_id: p.set_id };
    patch.source_letter_purchase_id = p.id;
    if (linkedIdx.has(p.id)) {
      const i = linkedIdx.get(p.id);
      out[i] = { ...out[i], ...applySyncOverrides(patch, out[i]) };
    } else {
      out.push({ ...patch });
    }
  }
  const filtered = out.filter((it) => !it.source_letter_purchase_id || keepPurchaseIds.has(it.source_letter_purchase_id));
  const withAllowances = ensureAllowanceLines(filtered, allowances);
  const final = ensurePersonnelTravelLines(withAllowances, { personnel, travel });
  return { items: final, issues };
};
export {
  ALLOWANCE_KINDS,
  CHANNEL_SET_SYNC_VERSION,
  SYNCED_ITEM_FIELDS,
  applySyncOverrides,
  ensureAllowanceLines,
  ensurePersonnelTravelLines,
  findDuplicatePurchaseIds,
  recordFieldOverrides,
  syncChannelSet
};
