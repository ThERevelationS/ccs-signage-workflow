// CNC hardening — model suite.
// Asserts (a) valid-path parity: candidate computeCncItemPricing /
// computeCncTotals output is identical to the verbatim remote math port on
// clean inputs, and (b) strict-availability semantics: malformed inputs hold
// derived numbers to null, keep raw rows, and emit structured cnc_* issues —
// never a silent $0 — plus (c) the reprice-staleness fix (derived totals
// recompute when project rates change).
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as cand from "./candidates/src/components/estimator/cnc/cncPricingAvailability.js";
import * as remote from "./remote-cnc-math.mjs";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const failures = [];
const results = [];
const t = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond });
  if (cond) { pass++; }
  else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

// ---------- shared fixtures ----------
const SETTINGS = {
  // Copied-at-load keys (project fields are what the calc consumes; these
  // settings rows are deliberately NOT live-scanned).
  cnc_machine_rate: 75, cnc_labor_rate: 45, cnc_setup_time_percentage: 20,
  min_cnc_setup_hours: 0,
  // Live-consumed keys.
  cnc_letter_perimeter_factor: 3.5,
  min_cnc_labor_hours: 0,
  cnc_cut_speed_3_4: 50, cnc_cut_speed_1_4: 60, cnc_cut_speed_1_2: 45,
  wood_cnc_cut_multiplier: 1.0, acrylic_cnc_cut_multiplier: 1.2,
  mdf_cnc_cut_multiplier: 1.0, plywood_cnc_cut_multiplier: 1.1,
  pvc_cnc_cut_multiplier: 1.3, hdpe_cnc_cut_multiplier: 1.1,
  aluminum_cnc_cut_multiplier: 2.0, corian_cnc_cut_multiplier: 1.5,
};

const panelItem = () => ({
  builder_item_id: "cnc-item-1", description: "4x8 panel",
  item_type: "panel", material_type: "Wood", material_thickness: "3/4",
  quantity: 2, length: 96, width: 48, letter_height: 0, num_letters: 0,
  carve_area_sqin: 0, carve_depth: 0.125, cut_speed_ipm: 50, carve_speed_sqipm: 10,
  machine_time_hours: 0, setup_time_hours: 0, machine_cost: 0, labor_cost: 0,
});
const letterItem = () => ({
  builder_item_id: "cnc-item-2", description: "DIM letters",
  item_type: "lettering", material_type: "Acrylic", material_thickness: "1/4",
  quantity: 1, length: 0, width: 0, letter_height: 8, num_letters: 12,
  carve_area_sqin: 0, carve_depth: 0.125, cut_speed_ipm: 60, carve_speed_sqipm: 10,
  machine_time_hours: 0, setup_time_hours: 0, machine_cost: 0, labor_cost: 0,
});
const carveItem = () => ({
  builder_item_id: "cnc-item-3", description: "routed logo",
  item_type: "3d_carving", material_type: "MDF", material_thickness: "3/4",
  quantity: 3, length: 0, width: 0, letter_height: 0, num_letters: 0,
  carve_area_sqin: 120, carve_depth: 0.25, cut_speed_ipm: 50, carve_speed_sqipm: 15,
  machine_time_hours: 0, setup_time_hours: 0, machine_cost: 0, labor_cost: 0,
});

const PROJECT = (items, over = {}) => ({
  project_name: "P", client_name: "C",
  machine_rate_per_hour: 75, labor_rate: 45,
  setup_time_percentage: 20, fixed_setup_hours: 1.5,
  items, ...over,
});
const cleanProject = () => PROJECT([panelItem(), letterItem(), carveItem()]);

const DERIVED = ["machine_time_hours", "setup_time_hours", "machine_cost", "labor_cost"];
const sameDerived = (a, b) => DERIVED.every((f) => Object.is(a[f], b[f]) || near(a[f], b[f]));

// ---------- A. valid-path byte-parity ----------
{
  const proj = cleanProject();
  for (const [i, item] of proj.items.entries()) {
    const r = remote.remoteUpdateItemCalc(JSON.parse(JSON.stringify(item)), proj, SETTINGS);
    const d = cand.computeCncItemPricing(JSON.parse(JSON.stringify(item)), proj, SETTINGS);
    t(`A${i + 1} derived item ${i + 1} matches remote updateItem math`, sameDerived(r, d),
      `remote=${JSON.stringify(r && { m: r.machine_time_hours, s: r.setup_time_hours, mc: r.machine_cost, lc: r.labor_cost })} cand=${JSON.stringify(d)}`);
  }
  const remotePriced = proj.items.map((it) => remote.remoteUpdateItemCalc(JSON.parse(JSON.stringify(it)), proj, SETTINGS));
  const remoteTotals = remote.remoteCalculateTotals({ ...proj, items: remotePriced }, SETTINGS);
  const derived = proj.items.map((it) => cand.computeCncItemPricing(it, proj, SETTINGS));
  const candTotals = cand.computeCncTotals(derived, proj, SETTINGS);
  t("A4 totals identical to remote calculateTotals", JSON.stringify(remoteTotals) === JSON.stringify(candTotals),
    `remote=${JSON.stringify(remoteTotals)} cand=${JSON.stringify(candTotals)}`);

  const { items, totals, issues, held } = cand.calcCncPricing(JSON.parse(JSON.stringify(proj)), { ...SETTINGS });
  t("A5 clean calc issues empty", issues.length === 0, JSON.stringify(issues));
  t("A6 clean calc not held", held === false);
  t("A7 calc items carry derived fields", items.every((it) => DERIVED.every((f) => Number.isFinite(it[f]))));
  t("A8 calc totals identical to remote", JSON.stringify(totals) === JSON.stringify(remoteTotals),
    `remote=${JSON.stringify(remoteTotals)} cand=${JSON.stringify(totals)}`);
  t("A9 calc preserves raw item fields",
    items[0].description === "4x8 panel" && items[1].num_letters === 12 && items[2].carve_area_sqin === 120);
}

// ---------- B. strict parsers ----------
const SN = cand.cncStrictNumber;
t("B1 strict accepts number", SN(5) === 5);
t("B2 strict accepts numeric string", SN(" 5 ") === 5);
t("B3 strict accepts 0", SN(0) === 0 && SN("0") === 0);
t("B4 strict rejects blank", SN("") === null && SN("   ") === null);
t("B5 strict rejects nullish", SN(null) === null && SN(undefined) === null);
t("B6 strict rejects malformed", SN("abc") === null && SN("1/2") === null && SN({}) === null);
t("B7 strict rejects NaN/Infinity", SN(NaN) === null && SN(Infinity) === null && SN(-Infinity) === null);
t("B8 nonneg rejects negative", cand.cncNonNegativeNumber(-1) === null && cand.cncNonNegativeNumber(0) === 0);
t("B9 positive rejects 0", cand.cncPositiveNumber(0) === null && cand.cncPositiveNumber(0.5) === 0.5);

// ---------- C. settings scanner ----------
t("C1 clean settings → no issues", cand.cncSettingIssues(SETTINGS).length === 0,
  JSON.stringify(cand.cncSettingIssues(SETTINGS)));

const LIVE_KEYS = [
  ["cnc_letter_perimeter_factor", true], ["min_cnc_labor_hours", false],
  ["cnc_cut_speed_3_4", true], ["wood_cnc_cut_multiplier", true],
  ["aluminum_cnc_cut_multiplier", true],
];
for (const [key, positive] of LIVE_KEYS) {
  const iss = cand.cncSettingIssues({ ...SETTINGS, [key]: "not-a-number" });
  t(`C2 malformed ${key} → issue`, iss.length === 1 && iss[0].kind === "cnc_catalog"
    && iss[0].field === key && iss[0].hold === "project" && iss[0].code === "cnc_setting_unavailable",
    JSON.stringify(iss));
}
// Explicit-zero legitimacy: positive-required keys reject 0; nonneg accepts.
for (const key of ["cnc_letter_perimeter_factor", "cnc_cut_speed_3_4", "wood_cnc_cut_multiplier", "acrylic_cnc_cut_multiplier"]) {
  const iss = cand.cncSettingIssues({ ...SETTINGS, [key]: 0 });
  t(`C3 explicit-0 rejected: ${key}`, iss.length === 1 && iss[0].field === key, JSON.stringify(iss));
}
{
  const iss = cand.cncSettingIssues({ ...SETTINGS, min_cnc_labor_hours: 0 });
  t("C4 explicit-0 valid: min_cnc_labor_hours", iss.length === 0, JSON.stringify(iss));
}
// Negative rejected everywhere live.
for (const [key] of LIVE_KEYS) {
  const iss = cand.cncSettingIssues({ ...SETTINGS, [key]: -1 });
  t(`C5 negative rejected: ${key}`, iss.length === 1 && iss[0].field === key, JSON.stringify(iss));
}
// Absent keys fall back to defaults — never an issue.
{
  const iss = cand.cncSettingIssues({});
  t("C6 absent settings → no issues (defaults apply)", iss.length === 0, JSON.stringify(iss));
}
// Copied-at-load settings keys are NOT settings-scanned (the project field is
// the consumed value — flagged there instead).
{
  const iss = cand.cncSettingIssues({ cnc_machine_rate: "bogus", cnc_labor_rate: "bogus", cnc_setup_time_percentage: "bogus", min_cnc_setup_hours: "bogus" });
  t("C7 copied keys not settings-scanned", iss.length === 0, JSON.stringify(iss));
}

// ---------- D. item scanner ----------
t("D1 clean items → no issues",
  cleanProject().items.every((it, i) => cand.cncItemIssues(it, i).length === 0),
  JSON.stringify(cleanProject().items.flatMap((it, i) => cand.cncItemIssues(it, i))));

{
  t("D2 unknown item_type flagged", cand.cncItemIssues({ ...panelItem(), item_type: "mystery" }, 0).some(i => i.field === "item_type" && i.code === "cnc_item_type_unavailable"));
  t("D3 absent item_type flagged", cand.cncItemIssues({ ...panelItem(), item_type: undefined }, 0).some(i => i.field === "item_type"));
  t("D4 unknown material flagged", cand.cncItemIssues({ ...panelItem(), material_type: "Unobtanium" }, 0).some(i => i.field === "material_type" && i.code === "cnc_material_unavailable"));
  t("D5 missing material flagged", cand.cncItemIssues({ ...panelItem(), material_type: undefined }, 0).some(i => i.field === "material_type"));
  t("D6 lowercase material ok", cand.cncItemIssues({ ...panelItem(), material_type: "wood" }, 0).length === 0);
  t("D7 material not consumed for 3d", !cand.cncItemIssues({ ...carveItem(), material_type: "Unobtanium" }, 0).some(i => i.field === "material_type"));
  for (const [field, val] of [["quantity", 0], ["quantity", ""], ["quantity", "x"], ["quantity", undefined]]) {
    t(`D8 quantity=${JSON.stringify(val)} flagged`,
      cand.cncItemIssues({ ...panelItem(), [field]: val }, 0).some(i => i.field === "quantity" && i.code === "cnc_quantity_unavailable"));
  }
  t("D9 lettering quantity skipped", cand.cncItemIssues({ ...letterItem(), quantity: 0 }, 0).length === 0);
  t("D10 panel length negative flagged", cand.cncItemIssues({ ...panelItem(), length: -2 }, 0).some(i => i.field === "length"));
  t("D11 panel width malformed flagged", cand.cncItemIssues({ ...panelItem(), width: "x" }, 0).some(i => i.field === "width"));
  t("D12 panel width blank flagged", cand.cncItemIssues({ ...panelItem(), width: "" }, 0).some(i => i.field === "width"));
  t("D13 panel 0x0 flagged", cand.cncItemIssues({ ...panelItem(), length: 0, width: 0 }, 0).some(i => i.code === "cnc_dimension_unavailable"));
  t("D14 panel single-0 tolerated", cand.cncItemIssues({ ...panelItem(), length: 0 }, 0).length === 0);
  t("D15 lettering height 0 flagged", cand.cncItemIssues({ ...letterItem(), letter_height: 0 }, 0).some(i => i.field === "letter_height"));
  t("D16 lettering count blank flagged", cand.cncItemIssues({ ...letterItem(), num_letters: "" }, 0).some(i => i.field === "num_letters"));
  t("D17 3d carve area 0 flagged", cand.cncItemIssues({ ...carveItem(), carve_area_sqin: 0 }, 0).some(i => i.field === "carve_area_sqin"));
  t("D18 3d carve speed blank flagged", cand.cncItemIssues({ ...carveItem(), carve_speed_sqipm: "" }, 0).some(i => i.field === "carve_speed_sqipm" && i.code === "cnc_carve_speed_unavailable"));
  t("D19 cut speed 0 flagged", cand.cncItemIssues({ ...panelItem(), cut_speed_ipm: 0 }, 0).some(i => i.field === "cut_speed_ipm" && i.code === "cnc_cut_speed_unavailable"));
  t("D20 cut speed malformed flagged", cand.cncItemIssues({ ...letterItem(), cut_speed_ipm: "fast" }, 0).some(i => i.field === "cut_speed_ipm"));
  t("D21 cut speed skipped for 3d", !cand.cncItemIssues(carveItem(), 0).some(i => i.field === "cut_speed_ipm"));
  t("D22 panel carve area + bad speed flagged",
    cand.cncItemIssues({ ...panelItem(), carve_area_sqin: 40, carve_speed_sqipm: 0 }, 0).some(i => i.field === "carve_speed_sqipm"));
  t("D23 non-3d malformed carve area flagged",
    cand.cncItemIssues({ ...panelItem(), carve_area_sqin: "junk" }, 0).some(i => i.field === "carve_area_sqin"));
  t("D24 carve_depth unconsumed → never flagged",
    cand.cncItemIssues({ ...carveItem(), carve_depth: "junk" }, 0).every(i => i.field !== "carve_depth"));
}

// ---------- E. held calc semantics ----------
{
  const proj = cleanProject();
  proj.items[1] = { ...proj.items[1], letter_height: "bogus" };
  const { items, totals, issues, held } = cand.calcCncPricing(proj, SETTINGS);
  t("E1 held=true", held === true);
  t("E2 pricingUnavailable metadata", cand.calcCncPricing(proj, SETTINGS).pricingUnavailable === true);
  t("E3 held item derived null", DERIVED.every((f) => items[1][f] === null));
  t("E4 held item raw fields preserved",
    items[1].letter_height === "bogus" && items[1].description === "DIM letters" && items[1].num_letters === 12);
  t("E5 unheld items keep derived numbers",
    DERIVED.every((f) => Number.isFinite(items[0][f]) && Number.isFinite(items[2][f])));
  t("E6 all totals null", Object.values(totals).every((v) => v === null), JSON.stringify(totals));
}
// Settings hold → everything null.
{
  const { items, totals, issues } = cand.calcCncPricing(cleanProject(), { ...SETTINGS, cnc_letter_perimeter_factor: "x" });
  t("E7 settings hold → all totals null", Object.values(totals).every((v) => v === null));
  t("E8 settings hold → all item derived null",
    items.every((it) => DERIVED.every((f) => it[f] === null)));
  t("E9 issue kind cnc_catalog", issues[0].kind === "cnc_catalog" && issues[0].hold === "project");
}
// Project-level holds.
{
  t("E10 non-array items flagged", cand.calcCncPricing({ ...cleanProject(), items: "oops" }, SETTINGS).issues.some(i => i.code === "cnc_items_unavailable" && i.hold === "project"));
  for (const field of ["machine_rate_per_hour", "labor_rate", "setup_time_percentage", "fixed_setup_hours"]) {
    const iss = cand.calcCncPricing({ ...cleanProject(), [field]: "abc" }, SETTINGS).issues;
    t(`E11 malformed ${field} flagged`, iss.some(i => i.field === field && i.code === "cnc_project_rate_unavailable" && i.hold === "project"));
  }
  t("E12 negative rate flagged", cand.calcCncPricing({ ...cleanProject(), labor_rate: -5 }, SETTINGS).issues.some(i => i.field === "labor_rate"));
  t("E13 null-seeded rate flagged", cand.calcCncPricing({ ...cleanProject(), machine_rate_per_hour: null }, SETTINGS).issues.some(i => i.field === "machine_rate_per_hour"));
}

// ---------- F. explicit-zero paths ----------
// F1–F3: authored 0 machine rate → machine costs $0 (remote resurrected 75).
{
  const proj = { ...cleanProject(), machine_rate_per_hour: 0 };
  const { items, totals, issues } = cand.calcCncPricing(proj, SETTINGS);
  t("F1 honored-0 machine rate → no issue", issues.length === 0, JSON.stringify(issues));
  t("F2 honored-0 machine rate → $0 machine cost",
    items.every((it) => it.machine_cost === 0) && totals.totalMachine === 0);
  // The defect is at the settings→project seed: remote resurrects an authored
  // 0 cnc_machine_rate to 75, so the remote SEEDED project prices machine time
  // anyway while the candidate honors the authored 0.
  const remoteSeeded = remote.remoteSourceDefaults({ cnc_machine_rate: 0 }).machine_rate_per_hour;
  t("F3 remote seed resurrects 0 → 75 (bug being fixed)",
    remoteSeeded === 75 && totals.totalMachine === 0);
}
// F4: authored 0 cut multiplier → flagged (positive-required), not resurrected.
{
  const { issues, held } = cand.calcCncPricing(cleanProject(), { ...SETTINGS, wood_cnc_cut_multiplier: 0 });
  t("F4 recorded-0 cut multiplier flagged", held === true && issues.some(i => i.field === "wood_cnc_cut_multiplier" && i.kind === "cnc_catalog"));
}
// F5: authored 0 letter factor → flagged.
{
  const { issues } = cand.calcCncPricing(cleanProject(), { ...SETTINGS, cnc_letter_perimeter_factor: 0 });
  t("F5 recorded-0 letter factor flagged", issues.some(i => i.field === "cnc_letter_perimeter_factor"));
}
// F6: min labor floor 0 → fine (documented default).
{
  const { issues, held } = cand.calcCncPricing(cleanProject(), { ...SETTINGS, min_cnc_labor_hours: 0 });
  t("F6 min_labor 0 → no issue", !held && issues.length === 0);
}

// ---------- G. reprice-staleness fix ----------
// Remote: items priced at pct=20 keep baked labor when pct → 50 (stale).
// Candidate: derived totals recompute — the defect cannot persist.
{
  const proj20 = { ...cleanProject(), setup_time_percentage: 20 };
  const remoteSession = remote.remoteSessionTotals(JSON.parse(JSON.stringify(proj20)), SETTINGS);
  const staleProject = { ...proj20, setup_time_percentage: 50, items: remoteSession.items };
  const remoteStale = remote.remoteCalculateTotals(staleProject, SETTINGS);
  const candNow = cand.calcCncPricing(staleProject, SETTINGS);
  t("G1 remote totals stay stale after pct edit (defect confirmed)",
    near(remoteStale.totalLabor, remoteSession.totals.totalLabor),
    `remote stale=${remoteStale.totalLabor} original=${remoteSession.totals.totalLabor}`);
  t("G2 candidate totals recompute on rate edit",
    !near(candNow.totals.totalLabor, remoteSession.totals.totalLabor)
      && candNow.totals.totalLabor > remoteSession.totals.totalLabor,
    `cand=${candNow.totals.totalLabor} stale=${remoteSession.totals.totalLabor}`);
  t("G3 candidate setup hours scale with pct",
    near(candNow.totals.totalSetupHours, remoteSession.totals.totalSetupHours * 2.5),
    `cand=${candNow.totals.totalSetupHours} remote=${remoteSession.totals.totalSetupHours}`);
  // Min-labor floor path: setup hours below floor → floor applies.
  const floorSettings = { ...SETTINGS, min_cnc_labor_hours: 100 };
  const candFloor = cand.calcCncPricing(cleanProject(), floorSettings);
  const remoteFloor = remote.remoteSessionTotals(JSON.parse(JSON.stringify(cleanProject())), floorSettings).totals;
  t("G4 min-labor floor identical to remote",
    near(candFloor.totals.totalLabor, remoteFloor.totalLabor)
      && near(candFloor.totals.minimumDynamicLaborAdjustment, remoteFloor.minimumDynamicLaborAdjustment),
    `cand=${candFloor.totals.totalLabor} remote=${remoteFloor.totalLabor}`);
}

// ---------- H. UI helpers ----------
{
  t("H1 snapshot gate", cand.hasCncCostSnapshot(5) && cand.hasCncCostSnapshot(0)
    && !cand.hasCncCostSnapshot(null) && !cand.hasCncCostSnapshot("5") && !cand.hasCncCostSnapshot(NaN));
  t("H2 draft preserves blank", cand.cncDraftValue("") === "");
  t("H3 draft parses number", cand.cncDraftValue("5.5") === 5.5);
  t("H4 draft keeps raw junk", cand.cncDraftValue("abc") === "abc");
  const iss = [{ field: "length", itemIndex: 2, code: "x" }, { field: "length", itemIndex: 0, code: "y" }];
  t("H5 issuesForField item-scoped", cand.issuesForField(iss, "length", 2).length === 1);
  t("H6 hasIssueFor", cand.hasIssueFor(iss, "length", 0) && !cand.hasIssueFor(iss, "width", 0));
  t("H7 settingNumber strict read",
    cand.cncSettingNumber({ k: "4.5" }, "k") === 4.5 && cand.cncSettingNumber({ k: "abc" }, "k") === null
      && cand.cncSettingNumber({}, "k") === null);
  t("H8 settingRecorded", cand.cncSettingRecorded({ k: 0 }, "k") && cand.cncSettingRecorded({ k: "0" }, "k")
    && !cand.cncSettingRecorded({ k: "" }, "k") && !cand.cncSettingRecorded({ k: "  " }, "k")
    && !cand.cncSettingRecorded({ k: null }, "k") && !cand.cncSettingRecorded({}, "k"));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.writeFileSync(path.join(AUDIT, "cnc-model-verification.json"), JSON.stringify({ pass, fail, results }, null, 2));
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS cnc-model");
