// O-099 (CMP-H08) -- saved-vs-live revision comparison. Pure model: takes the
// last-saved normalized project and the live project, returns honest diff
// rows -- added/removed/changed per collection plus pricing + review-state
// deltas. Everything renders what it can prove; a missing saved value is
// "not saved", never a guessed baseline.

const DIM_FIELDS = [
  ["length_inches", "Length"], ["width_inches", "Width"], ["depth_inches", "Depth"],
  ["diameter", "Diameter"], ["quantity", "Qty"], ["rotation_degrees", "Rotation"],
  ["grade_offset_inches", "Grade offset"], ["include_rebar", "Rebar"],
];
const POLE_FIELDS = [
  ["height_inches", "Height"], ["embedment_inches", "Embedment"],
  ["x_inches", "X"], ["z_inches", "Z"], ["pole_shape", "Shape"],
];
const CAP_FIELDS = [
  ["length_inches", "Cut length"], ["position_along_segment_inches", "Position"],
  ["wall_component_id", "Wall"], ["segment_component_id", "Segment"],
];
const CAB_FIELDS = [
  ["width_inches", "Width"], ["height_inches", "Height"], ["depth_inches", "Depth"],
  ["mount_height_inches", "Mount height"], ["mount", "Mount"],
];
const PRICE_FIELDS = [
  ["customer_markup_percent", "Markup %"], ["customer_price_override", "Price override"],
];

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const byId = (rows) => {
  const m = new Map();
  (Array.isArray(rows) ? rows : []).forEach((r, i) => {
    const key = isObj(r) ? (r.component_id ?? `idx:${i}`) : `idx:${i}`;
    m.set(key, { row: r, index: i });
  });
  return m;
};
const fmt = (v) => {
  if (v === undefined || v === null || v === "") return "not saved";
  if (v === true) return "yes";
  if (v === false) return "no";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "invalid";
  if (typeof v === "string") return v.length > 24 ? `${v.slice(0, 21)}...` : v;
  return "recorded";
};
const sameVal = (a, b) => {
  if (a === b) return true;
  if ((a === undefined || a === null || a === "") && (b === undefined || b === null || b === "")) return true;
  if (typeof a === "number" && typeof b === "number" && !Number.isFinite(a) && !Number.isFinite(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};

const diffRows = (savedRows, liveRows, fields, labelFor) => {
  const saved = byId(savedRows), live = byId(liveRows);
  const out = [];
  for (const [key, { row: sRow, index: si }] of saved) {
    const liveHit = live.get(key);
    if (!liveHit) {
      out.push({ change: "removed", label: labelFor(sRow, si), detail: "removed from the live project" });
      continue;
    }
    for (const [field, fname] of fields) {
      if (!sameVal(sRow?.[field], liveHit.row?.[field])) {
        out.push({ change: "changed", label: labelFor(liveHit.row, liveHit.index), detail: `${fname}: ${fmt(sRow?.[field])} -> ${fmt(liveHit.row?.[field])}` });
      }
    }
  }
  for (const [key, { row: lRow, index: li }] of live) {
    if (!saved.has(key)) out.push({ change: "added", label: labelFor(lRow, li), detail: "new in the live project" });
  }
  return out;
};

const itemLabel = (it, i) => (typeof it?.description === "string" && it.description.trim()) || `Foundation ${i + 1}`;
const wallLabel = (w, i) => w?.name || `Wall ${i + 1}`;
const poleLabel = (p, i) => `Pole ${i + 1}`;
const capLabel = (c, i) => `Cap ${i + 1}`;
const cabLabel = (c, i) => `Cabinet ${i + 1}`;

export function diffFoundationProjects(saved, live) {
  const rows = [];
  if (!isObj(saved)) {
    return [{ change: "unavailable", label: "Saved baseline", detail: "no saved project snapshot is recorded for this session -- comparison unavailable." }];
  }
  if (!isObj(live)) return rows;

  const pushAll = (section, list) => list.forEach((r) => rows.push({ section, ...r }));

  pushAll("items", diffRows(saved.items, live.items, DIM_FIELDS, itemLabel));
  pushAll("walls", diffRows(saved.walls, live.walls, [["heightInches", "Height"], ["name", "Name"], ["foundation_component_id", "Foundation"]], wallLabel));
  pushAll("poles", diffRows(saved.poles, live.poles, POLE_FIELDS, poleLabel));
  pushAll("wall_caps", diffRows(saved.wall_caps, live.wall_caps, CAP_FIELDS, capLabel));
  pushAll("signage_cabinets", diffRows(saved.signage_cabinets, live.signage_cabinets, CAB_FIELDS, cabLabel));

  pushAll("pricing", PRICE_FIELDS
    .filter(([f]) => !sameVal(saved[f], live[f]))
    .map(([f, name]) => ({ change: "changed", label: "Customer pricing", detail: `${name}: ${fmt(saved[f])} -> ${fmt(live[f])}` })));

  // Review state -- reinforcement acceptance flags ride the saved snapshot.
  ["engineering_approved", "procurement_ready"].forEach((f) => {
    if (!sameVal(saved[f], live[f])) {
      rows.push({ section: "review", change: "changed", label: "Review state", detail: `${f}: ${fmt(saved[f])} -> ${fmt(live[f])}` });
    }
  });

  const land = (p) => Object.keys(p?.landscape?.cells || {}).length;
  if (land(saved) !== land(live)) {
    rows.push({ section: "landscape", change: "changed", label: "Landscape", detail: `painted cells: ${land(saved)} -> ${land(live)}` });
  }

  return rows;
}

export function summarizeFoundationDiff(rows) {
  const counts = { added: 0, removed: 0, changed: 0, unavailable: 0 };
  (rows || []).forEach((r) => { counts[r.change] = (counts[r.change] || 0) + 1; });
  return counts;
}

// O-099 (CMP-H08) -- revision-pair compare: `revisionSnapshotDiff` diffs two
// `revision_history` rows' `snapshot` fields ({item_count, wall_count,
// pole_count, cap_count, cabinet_count}) -- a pair-compare between any two
// stored revisions without a full record copy.
const SNAPSHOT_FIELDS = [
  ["item_count", "Foundations"],
  ["wall_count", "Walls"],
  ["pole_count", "Poles"],
  ["cap_count", "Caps"],
  ["cabinet_count", "Cabinets"],
];
export function revisionSnapshotDiff(older, newer) {
  const o = older?.snapshot || {};
  const n = newer?.snapshot || {};
  const rows = [];
  SNAPSHOT_FIELDS.forEach(([key, label]) => {
    const ov = Number(o[key]) || 0;
    const nv = Number(n[key]) || 0;
    if (ov !== nv) {
      rows.push({ section: "snapshot", change: "changed", label, detail: `${ov} -> ${nv}` });
    }
  });
  if (rows.length === 0) return [{ section: "snapshot", change: "unchanged", label: "Revisions", detail: "identical counts" }];
  return rows;
}
