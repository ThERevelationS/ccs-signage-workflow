// src/components/channelLetterInstall/channelSetOps.js
var CHANNEL_SET_OPS_VERSION = 1;
var num = (v) => v === null || v === void 0 || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;
var counter = 0;
var nextId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;
var bulkCreateSets = (count, template = {}) => {
  const n = Math.max(0, Math.floor(num(count) || 0));
  return Array.from({ length: n }, (_, i) => ({
    ...template,
    id: nextId("set"),
    description: template.description ? `${template.description} ${i + 1}` : `Set ${i + 1}`,
    set_index: i
  }));
};
var duplicateSet = (set, { mirror = false } = {}) => ({
  ...set,
  id: nextId("set"),
  mirrored: mirror === true,
  duplicated_from: set.id,
  set_parent_id: void 0,
  override_fields: set.override_fields ? [...set.override_fields] : void 0
});
var substituteRow = (rows = [], itemName, substitute = {}) => ({
  rows: rows.map((r) => r.item === itemName ? {
    ...r,
    item: substitute.item || r.item,
    qty: substitute.qty ?? r.qty,
    unit: substitute.unit || r.unit,
    substituted_from: itemName,
    substitution_note: substitute.note || null
  } : r),
  substitutions: [{ from: itemName, to: substitute.item || itemName, note: substitute.note || null }]
});
var INSTANCE_FIELDS = /* @__PURE__ */ new Set(["id", "set_id", "set_parent_id", "duplicated_from", "source_letter_purchase_id", "created_date", "updated_date"]);
var templateFromSet = (set = {}) => {
  const t = {};
  for (const [k, v] of Object.entries(set)) if (!INSTANCE_FIELDS.has(k)) t[k] = v;
  return { version: CHANNEL_SET_OPS_VERSION, template_name: set.template_name || set.description || "set template", fields: t };
};
var applyTemplate = (tpl, overrides = {}) => ({
  ...tpl.fields,
  ...overrides,
  id: nextId("set"),
  template_ref: tpl.template_name || null
});
var applyDimensionEntry = (set = {}, dims = {}) => {
  const out = { ...set };
  for (const k of ["letter_count", "letter_height_inches", "letter_depth_inches", "raceway_length_feet", "install_height_feet"]) {
    if (k in dims) out[k] = dims[k] === 0 || dims[k] === "0" ? 0 : num(dims[k]);
  }
  return out;
};
var explainCharges = (rows = [], prices = {}) => rows.map((r) => {
  const unit = num(prices[r.item]);
  const qty = num(r.qty);
  return {
    item: r.item,
    qty,
    unit: r.unit,
    unit_price: unit,
    total: qty !== null && unit !== null ? Math.round(qty * unit * 100) / 100 : null,
    explanation: qty === null ? `${r.item}: quantity unresolved` : unit === null ? `${r.item}: no unit price \u2014 excluded from total` : `${r.item}: ${qty} ${r.unit} x $${unit} = $${Math.round(qty * unit * 100) / 100}`,
    source: r.source || "computed"
  };
});
var moveRow = (rows = [], from, to) => {
  const out = [...rows];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [r] = out.splice(from, 1);
  out.splice(to, 0, r);
  return out;
};
var adjustQty = (rows = [], itemName, delta) => rows.map((r) => r.item === itemName && num(r.qty) !== null ? { ...r, qty: r.qty + delta } : r);
var snapshotSets = (sets, label) => ({
  version: CHANNEL_SET_OPS_VERSION,
  snapshot_label: label || null,
  snapshot_at: (/* @__PURE__ */ new Date()).toISOString(),
  sets: JSON.parse(JSON.stringify(sets))
});
var restoreSnapshot = (snap) => snap && Array.isArray(snap.sets) ? JSON.parse(JSON.stringify(snap.sets)) : null;
export {
  CHANNEL_SET_OPS_VERSION,
  adjustQty,
  applyDimensionEntry,
  applyTemplate,
  bulkCreateSets,
  duplicateSet,
  explainCharges,
  moveRow,
  restoreSnapshot,
  snapshotSets,
  substituteRow,
  templateFromSet
};
