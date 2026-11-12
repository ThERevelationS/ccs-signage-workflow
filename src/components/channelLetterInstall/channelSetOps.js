// P-10 (WS-P): bulk-set operations — bulk create, duplicate/mirror,
// substitution, reusable templates, structured dimension entry, charge
// explanations, keyboard-operable row ops, and recoverable snapshots.
// Pure functions over set/item arrays — every op returns a NEW array/object;
// nothing mutates in place, so callers can undo via snapshots.
export const CHANNEL_SET_OPS_VERSION = 1;

const num = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
let counter = 0;
const nextId = (prefix) => `${prefix}_${Date.now().toString(36)}_${(counter++).toString(36)}`;

// Bulk create — N distinct sets from one template; ids always unique.
export const bulkCreateSets = (count, template = {}) => {
  const n = Math.max(0, Math.floor(num(count) || 0));
  return Array.from({ length: n }, (_, i) => ({
    ...template,
    id: nextId("set"),
    description: template.description ? `${template.description} ${i + 1}` : `Set ${i + 1}`,
    set_index: i,
  }));
};

// Duplicate — clone with a fresh id; mirror:true flips the layout variant
// marker (the P-04 layout model renders mirrored geometry from it). Never
// shares the source id or any child ids.
export const duplicateSet = (set, { mirror = false } = {}) => ({
  ...set,
  id: nextId("set"),
  mirrored: mirror === true,
  duplicated_from: set.id,
  set_parent_id: undefined,
  override_fields: set.override_fields ? [...set.override_fields] : undefined,
});

// Substitution — replace one takeoff/material row's item, preserving qty/unit
// unless the substitute overrides them; the swap is recorded for audit.
export const substituteRow = (rows = [], itemName, substitute = {}) => ({
  rows: rows.map((r) => (r.item === itemName ? {
    ...r,
    item: substitute.item || r.item,
    qty: substitute.qty ?? r.qty,
    unit: substitute.unit || r.unit,
    substituted_from: itemName,
    substitution_note: substitute.note || null,
  } : r)),
  substitutions: [{ from: itemName, to: substitute.item || itemName, note: substitute.note || null }],
});

// Templates — extract a reusable shape (strip ids/instance fields) and apply.
const INSTANCE_FIELDS = new Set(["id", "set_id", "set_parent_id", "duplicated_from", "source_letter_purchase_id", "created_date", "updated_date"]);
export const templateFromSet = (set = {}) => {
  const t = {};
  for (const [k, v] of Object.entries(set)) if (!INSTANCE_FIELDS.has(k)) t[k] = v;
  return { version: CHANNEL_SET_OPS_VERSION, template_name: set.template_name || set.description || "set template", fields: t };
};
export const applyTemplate = (tpl, overrides = {}) => ({
  ...tpl.fields,
  ...overrides,
  id: nextId("set"),
  template_ref: tpl.template_name || null,
});

// Dimension entry — normalize count/height/depth/width inputs; malformed
// values become null (never a minted default), preserving explicit zero.
export const applyDimensionEntry = (set = {}, dims = {}) => {
  const out = { ...set };
  for (const k of ["letter_count", "letter_height_inches", "letter_depth_inches", "raceway_length_feet", "install_height_feet"]) {
    if (k in dims) out[k] = dims[k] === 0 || dims[k] === "0" ? 0 : num(dims[k]);
  }
  return out;
};

// Charge explanations — human-readable why for each priced row.
export const explainCharges = (rows = [], prices = {}) =>
  rows.map((r) => {
    const unit = num(prices[r.item]);
    const qty = num(r.qty);
    return {
      item: r.item,
      qty,
      unit: r.unit,
      unit_price: unit,
      total: qty !== null && unit !== null ? Math.round(qty * unit * 100) / 100 : null,
      explanation: qty === null ? `${r.item}: quantity unresolved` : unit === null ? `${r.item}: no unit price — excluded from total` : `${r.item}: ${qty} ${r.unit} x $${unit} = $${Math.round(qty * unit * 100) / 100}`,
      source: r.source || "computed",
    };
  });

// Keyboard-operable row ops — index moves + qty adjust, all pure.
export const moveRow = (rows = [], from, to) => {
  const out = [...rows];
  if (from < 0 || from >= out.length || to < 0 || to >= out.length) return out;
  const [r] = out.splice(from, 1);
  out.splice(to, 0, r);
  return out;
};
export const adjustQty = (rows = [], itemName, delta) =>
  rows.map((r) => (r.item === itemName && num(r.qty) !== null ? { ...r, qty: r.qty + delta } : r));

// Recoverable snapshots — versioned, restorable, stamped.
export const snapshotSets = (sets, label) => ({
  version: CHANNEL_SET_OPS_VERSION,
  snapshot_label: label || null,
  snapshot_at: new Date().toISOString(),
  sets: JSON.parse(JSON.stringify(sets)),
});
export const restoreSnapshot = (snap) =>
  snap && Array.isArray(snap.sets) ? JSON.parse(JSON.stringify(snap.sets)) : null;
