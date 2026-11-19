const fs = require("fs");
const p = "ESTIMATOR_MASTERPLAN.md";
let s = fs.readFileSync(p, "utf8");
const lines = s.split("\n");
const mark = (line, names) => {
  for (const n of names) {
    // mark `name` or name advisory/field occurrences that lack (landed)
    line = line.replace(new RegExp(`(\`${n}\`(\\s+(advisory|field|flag|count|enum doc|scaffold|markers|sweep))*)(?!;|[^|;]*\\(landed\\))`, "g"),
      (m) => `${m} (landed)`);
  }
  return line;
};
const rowMarks = {
  "O-114": ["WORKED-EX-BOUNDARY", "WORKED-EX-MONOTONIC", "WORKED-EX-UNIT-CONV"],
  "W-023": ["per-domain source-group docs"],
  "O-084": ["photo-scale-mismatch", "photo-mount-mismatch", "photo-quantity-mismatch"],
  "O-102": ["per-domain source-group docs"],
  "O-103": ["per-domain class-badge docs"],
  "O-121": ["affected_records", "stale-policy"],
  "O-047": ["mortar_joint_inches", "brick_bond_type", "corner_return_count"],
  "O-050": ["cap_miter_angle", "cap_joint_width"],
  "O-051": ["cap_miter_overlap", "cap_end_treatment"],
  "O-053": ["offcut_reuse_elected", "purchased_pieces"],
  "O-054": ["cap_anchor_state", "cap_reanchor_log"],
  "O-058": ["pole_edge_clearance", "pole_clash"],
  "O-059": ["sign_mount_mismatch", "sign_span_count"],
  "O-062": ["hardware_unsupported", "anchor_assembly"],
  "O-063": ["linked_product_missing", "linked_product_picker"],
  "O-069": ["landscape_layer", "landscape_lock"],
  "O-073": ["landscape_waste_fraction", "landscape_labor_cost"],
  "O-092": ["step_state", "step_complete"],
  "O-097": ["issue_severity", "issue_fix_hint"],
  "O-098": ["`aria-label`", "`role=status`", "`tab-index`"],
  "O-099": ["revision_label", "revision_approved_by"],
  "O-101": ["walkthrough_step", "walkthrough_video_url"],
  "O-115": ["feasible_candidate", "dim_range"],
  "O-117": ["alternative_elected", "alternative_applied"],
  "O-120": ["license_class", "licensed_source"],
};
let touched = 0;
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^\| (O-\d+|W-\d+)/);
  if (!m || !rowMarks[m[1]]) continue;
  const before = lines[i];
  lines[i] = mark(lines[i], rowMarks[m[1]]);
  if (lines[i] !== before) touched++;
}
fs.writeFileSync(p, lines.join("\n"));
console.log("rows touched:", touched);
// show a sample
lines.forEach((l) => { if (/^\| O-047|^\| O-054|^\| O-063/.test(l)) console.log(l.slice(0, 200)); });
