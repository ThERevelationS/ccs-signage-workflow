// FoundationProject.jsonc schema-declaration patch — declares every field the
// estimator authors that the entity layer drops on create (the 2026-11-10
// lesson, found live this round: create-path writes silently strip undeclared
// keys; update-path merges). Insertions only — additive optional props.
const fs = require("fs");
const PATH = ".audit-work/lane-de-remote/FoundationProject.jsonc";
let raw = fs.readFileSync(PATH, "utf8");

const ins = (anchor, add) => {
  const i = raw.indexOf(anchor);
  if (i < 0) { console.log("MISS:", JSON.stringify(anchor.slice(0, 70))); process.exit(1); }
  if (raw.indexOf(anchor, i + 1) >= 0) { console.log("DUP:", JSON.stringify(anchor.slice(0, 70))); process.exit(1); }
  raw = raw.slice(0, i) + add + raw.slice(i);
};
const rep = (anchor, newText) => {
  const i = raw.indexOf(anchor);
  if (i < 0) { console.log("MISS-rep:", JSON.stringify(anchor.slice(0, 70))); process.exit(1); }
  if (raw.indexOf(anchor, i + 1) >= 0) { console.log("DUP-rep:", JSON.stringify(anchor.slice(0, 70))); process.exit(1); }
  raw = raw.slice(0, i) + newText + raw.slice(i + anchor.length);
};

// array-item property blocks sit at indent 10 / inner 12
const s10 = (k, d, type = "string") =>
  `          "${k}": {\n            "type": "${type}",\n            "description": "${d}"\n          },\n`;
// design_basis props sit at indent 8 / inner 10
const s8 = (k, d, type = "string") =>
  `        "${k}": {\n          "type": "${type}",\n          "description": "${d}"\n        },\n`;
// top-level props sit at indent 4 / inner 6
const s4 = (k, d, type = "string") =>
  `    "${k}": {\n      "type": "${type}",\n      "description": "${d}"\n    },\n`;

// ── 1. items[] — B-3 support fields + O-111 support_class ────────────────────
ins(`          "reinforcement_design": {`,
  s10("support_class", "O-111 — authored support method/class; blank = not recorded") +
  s10("support_count", "B-3 — projected required support units (reinforcement projection)", "number") +
  s10("support_purchased_units", "B-3 — projected purchased support units", "number") +
  s10("support_packs", "B-3 — projected support packs", "number") +
  s10("support_material_cost", "B-3 — projected support material cost", "number") +
  s10("support_labor_cost", "B-3 — projected support labor cost", "number") +
  s10("support_labor_hours", "B-3 — projected support labor hours", "number") +
  s10("support_cost", "B-3 — projected support total cost", "number"));

// ── 2. poles[] — anchor_assembly / feasible_candidate / dim_range ────────────
ins(`          "signs": {`,
  s10("anchor_assembly", "Lane E — authored pole anchor-assembly note; blank = not recorded") +
  s10("feasible_candidate", "Lane E — operator-recorded feasible-dimension candidate flag", "boolean") +
  s10("dim_range", "Lane E — operator-recorded feasible dimension range note"));

// ── 3. poles[].signs[] — freeform canvas record (reinforcement_design precedent) ─
rep(`"component_id": {\n                  "type": "string"\n                }\n              }\n            }\n          }\n        }\n      }\n    },\n    "walls"`,
  `"component_id": {\n                  "type": "string"\n                }\n              },\n              "additionalProperties": true\n            }\n          }\n        }\n      }\n    },\n    "walls"`);

// ── 4. walls[] — brick_bond_type / corner_return_count (before "shape") ──────
rep(`"offsetFraction": {\n            "type": "number",\n            "default": 0.5\n          },\n          "shape": {`,
  `"offsetFraction": {\n            "type": "number",\n            "default": 0.5\n          },\n` +
  s10("brick_bond_type", "O-047 — authored coursing bond kind (running/stack/Flemish/soldier); blank = not recorded") +
  s10("corner_return_count", "O-047 — operator-recorded corner-return count", "number") +
  `          "shape": {`);

// ── 5. walls[].shape.points[] — declare x/z + permissive ────────────────────
rep(`"points": {\n                "type": "array",\n                "items": {\n                  "type": "object"\n                }\n              }`,
  `"points": {\n                "type": "array",\n                "items": {\n                  "type": "object",\n                  "properties": {\n                    "x": { "type": "number" },\n                    "z": { "type": "number" }\n                  },\n                  "additionalProperties": true\n                }\n              }`);

// ── 6. walls[].shape.segments[] — length + permissive ───────────────────────
rep(`"properties": {\n                    "component_id": {\n                      "type": "string"\n                    }\n                  }`,
  `"properties": {\n                    "component_id": {\n                      "type": "string"\n                    },\n                    "length": {\n                      "type": "number",\n                      "description": "Segment length in inches (derived from recorded points)"\n                    }\n                  },\n                  "additionalProperties": true`);

// ── 7. wall_caps[] — geometry/cost/anchor fields (after lateral_offset) ──────
const capFields =
  s10("width_inches", "Cap width in inches", "number") +
  s10("height_inches", "Cap height in inches", "number") +
  s10("elevation_inches", "Cap elevation above wall top in inches", "number") +
  s10("joint_spacing_inches", "Cap joint spacing in inches", "number") +
  s10("joint_width_inches", "Cap joint width in inches", "number") +
  s10("overhang_inches", "Cap overhang in inches", "number") +
  s10("miter_angle_deg", "Lane E — authored miter angle (deg) for the cap end", "number") +
  s10("purchased_pieces", "Lane E — operator-recorded purchased cap piece count", "number") +
  s10("cut_labor_cost", "Cap cut labor cost", "number") +
  s10("supplies_cost", "Cap supplies cost", "number") +
  s10("profile", "Cap profile kind") +
  s10("slope", "Cap slope kind") +
  s10("end_treatment", "Cap end treatment kind") +
  s10("cap_anchor_state", "Lane E — authored cap anchor state", "string") +
  s10("locked", "Operator lock on the cap's authored fields", "boolean") +
  s10("offcut_reuse_elected", "Lane E — operator elected to reuse offcuts", "boolean") +
  `          "reanchor_log": {\n            "type": "array",\n            "description": "Lane E — recorded bulk re-anchor entries ({at, by, ...})",\n            "items": { "type": "object", "additionalProperties": true }\n          }`;
rep(`"description": "Side-to-side offset from wall centerline (negative = outer side)"\n          }`,
  `"description": "Side-to-side offset from wall centerline (negative = outer side)"\n          },\n` + capFields);

// ── 8. signage_cabinets[] — mount_hardware fields (after unit_cost) ──────────
rep(`"unit_cost": {\n            "type": "number",\n            "default": 0\n          }\n        }\n      }\n    },\n    "landscape"`,
  `"unit_cost": {\n            "type": "number",\n            "default": 0\n          },\n` +
  s10("mount_hardware", "O-061 — authored cabinet mount hardware kind (bracket/base_plate/anchor/other)") +
  s10("mount_hardware_model", "O-061 — typed mount model reference").slice(0, -2) +
  `\n        }\n      }\n    },\n    "landscape"`);

// ── 9. design_basis — every authored/read key (after basis_locked block) ────
const dbFields =
  s8("sign_wind", "O-106 — authored sign-wind method/source note") +
  s8("footing_basis", "O-107 — authored footing-bearing method/source note") +
  s8("shaft_basis", "O-108 — authored drilled-shaft/embedment method/source note") +
  s8("lateral", "O-108 — authored lateral-load method/source note") +
  s8("frost_depth", "O-110 — authored frost-depth source note") +
  s8("pillar_bar", "O-111 — authored pillar-bar method/source note") +
  s8("base_plate", "O-111 — authored base-plate method/source note") +
  s8("cap_detail", "O-112 — authored masonry cap detail method/source note") +
  s8("basis_reference", "Lane E — free-text source citation (e.g. 'ACI 318'); distinct from basis_source enum provenance") +
  s8("license_class", "O-120 — license class of the source the basis relies on") +
  s8("licensed_source", "O-120 — whether the basis relies on a licensed engineering source", "boolean") +
  s8("bearing", "Legacy authored footing-bearing note (superseded by footing_basis; preserved for pre-rename records)") +
  s8("shaft", "Legacy authored shaft note (superseded by shaft_basis; preserved for pre-rename records)") +
  s8("soil", "O-109 — authored soil assumption note") +
  s8("groundwater", "O-109 — authored groundwater assumption note") +
  s8("wind", "O-109 — authored wind assumption note") +
  s8("concrete", "O-110 — authored concrete assumption note") +
  s8("rebar", "O-110 — authored rebar assumption note") +
  s8("cover", "O-110 — authored cover assumption note") +
  s8("durability", "O-110 — authored durability assumption note") +
  s8("masonry", "O-112 — authored masonry assumption note") +
  s8("cap_material", "O-112 — authored cap material assumption note") +
  s8("coping", "O-112 — authored coping assumption note") +
  s8("site", "O-118 — authored site note") +
  s8("signs_loads", "O-118 — authored signs/loads note") +
  s8("geometry", "O-118 — authored geometry note") +
  s8("open_questions", "O-118 — authored open-questions note") +
  s8("quantity_cost_revision", "O-118 — authored quantity/cost revision note") +
  s8("policy_sensitivity", "O-118 — authored policy-sensitivity note");
rep(`Stripped when no basis content remains."\n        }\n      }\n    },\n    "site_hazard"`,
  `Stripped when no basis content remains."\n        },\n` + dbFields.slice(0, -2) +
  `\n      }\n    },\n    "site_hazard"`);

// ── 10. top-level walkthrough fields (before customer_markup_percent) ────────
ins(`    "customer_markup_percent": {`,
  s4("walkthrough_step", "O-101 — operator-recorded walkthrough position", "number") +
  s4("walkthrough_video_url", "O-101 — authored walkthrough video URL"));

// ── validate JSONC parses ────────────────────────────────────────────────────
const clean = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
try {
  const j = JSON.parse(clean);
  const p = j.schema?.properties || j.properties || {};
  const db = Object.keys(p.design_basis?.properties || {});
  const caps = Object.keys(p.wall_caps?.items?.properties || {});
  console.log("VALID — design_basis props:", db.length, "| wall_caps props:", caps.length,
    "| signs addlProps:", p.poles?.items?.properties?.signs?.items?.additionalProperties,
    "| walkthrough:", !!p.walkthrough_step);
} catch (e) { console.log("PARSE FAIL:", e.message); process.exit(1); }
fs.writeFileSync(PATH, raw);
console.log("patched bytes:", raw.length);
