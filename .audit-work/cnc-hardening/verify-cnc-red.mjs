// RED suite — proves the frozen REMOTE CNC math (verbatim port from
// remote-src/src/pages/CNCEstimator.jsx) exhibits the silent-pricing defects
// this hardening fixes. Every assertion describes the OLD (bad) behavior; if
// the remote were already hardened these would fail.
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as remote from "./remote-cnc-math.mjs";

const AUDIT = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const failures = [];
const results = [];
const t = (name, cond, extra = "") => {
  results.push({ name, ok: !!cond });
  if (cond) { pass++; } else { fail++; failures.push(`FAIL ${name}${extra ? " — " + extra : ""}`); }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;

const S = {
  cnc_letter_perimeter_factor: 3.5, min_cnc_labor_hours: 0,
  wood_cnc_cut_multiplier: 1.0, acrylic_cnc_cut_multiplier: 1.2,
  mdf_cnc_cut_multiplier: 1.0, cnc_cut_speed_3_4: 50,
};
const ITEM = () => ({
  description: "p", item_type: "panel", material_type: "Wood",
  material_thickness: "3/4", quantity: 1, length: 96, width: 48,
  letter_height: 0, num_letters: 0, carve_area_sqin: 0, carve_depth: 0.125,
  cut_speed_ipm: 50, carve_speed_sqipm: 10,
  machine_time_hours: 0, setup_time_hours: 0, machine_cost: 0, labor_cost: 0,
});
const proj = (items, over = {}) => ({
  machine_rate_per_hour: 75, labor_rate: 45,
  setup_time_percentage: 20, fixed_setup_hours: 0,
  items, ...over,
});

// R1: malformed machine-rate setting silently laundered to 75 (sourceDefaults).
{
  const d = remote.remoteSourceDefaults({ cnc_machine_rate: "not-a-rate" });
  t("R1 malformed cnc_machine_rate → silent 75 default", d.machine_rate_per_hour === 75);
}
// R2: authored 0 rate setting resurrects to 75 — "free machining" is impossible.
{
  const d = remote.remoteSourceDefaults({ cnc_machine_rate: 0, cnc_labor_rate: 0, cnc_setup_time_percentage: 0 });
  t("R2 authored-0 rates resurrected (75/45/20)",
    d.machine_rate_per_hour === 75 && d.labor_rate === 45 && d.setup_time_percentage === 20);
}
// R3: reprice staleness — items priced at pct=20 keep stale labor when the
// project percentage changes to 50; remote totals never recompute.
{
  const base = proj([ITEM()]);
  const session = remote.remoteSessionTotals(base, S);
  const after = { ...base, setup_time_percentage: 50, items: session.items };
  const stale = remote.remoteCalculateTotals(after, S);
  t("R3 pct edit 20→50 leaves totals stale (no reprice)",
    near(stale.totalLabor, session.totals.totalLabor)
      && after.items[0].setup_time_hours === session.items[0].setup_time_hours,
    `stale=${stale.totalLabor} fresh-at-20=${session.totals.totalLabor}`);
}
// R4: malformed cut-speed setting silently writes 50 onto the item.
{
  const out = remote.remoteUpdateItemCalc(ITEM(), proj([ITEM()]), { ...S, cnc_cut_speed_1_4: "bogus" }, { field: "material_thickness", value: "1/4" });
  t("R4 malformed cnc_cut_speed_1_4 → silent 50 write", out.cut_speed_ipm === 50);
}
// R5: malformed multiplier setting silently resolves 1.0×.
{
  const good = remote.remoteUpdateItemCalc(ITEM(), proj([ITEM()]), S);
  const bad = remote.remoteUpdateItemCalc(ITEM(), proj([ITEM()]), { ...S, wood_cnc_cut_multiplier: "oops" });
  t("R5 malformed wood multiplier → silent 1× (identical price, no signal)",
    near(bad.machine_cost, good.machine_cost));
}
// R6: stored NaN machine_cost silently sums to $0 in totals.
{
  const badItem = { ...ITEM(), machine_cost: NaN, labor_cost: NaN, setup_time_hours: NaN };
  const totals = remote.remoteCalculateTotals(proj([badItem]), S);
  t("R6 NaN stored costs → silent $0 totals",
    totals.totalMachine === 0 && totals.totalLabor === 0 && totals.totalSetupHours === 0);
}
// R7: quantity absent → NaN machine time → NaN cost laundered to $0 in totals.
{
  const noQty = { ...ITEM(), quantity: undefined };
  const priced = remote.remoteUpdateItemCalc(noQty, proj([noQty]), S);
  const totals = remote.remoteCalculateTotals(proj([priced]), S);
  t("R7 absent quantity → NaN cost laundered to $0 silently",
    Number.isNaN(priced.machine_cost) && totals.totalMachine === 0);
}
// R8: 0 quantity → $0 row silently.
{
  const zero = remote.remoteUpdateItemCalc({ ...ITEM(), quantity: 0 }, proj([ITEM()]), S);
  t("R8 quantity 0 → silent $0 item", zero.machine_cost === 0 && zero.machine_time_hours === 0);
}
// R9: recorded-0 letter factor resurrects to 3.5.
{
  const letter = { ...ITEM(), item_type: "lettering", letter_height: 8, num_letters: 10, cut_speed_ipm: 50 };
  const out = remote.remoteUpdateItemCalc(letter, proj([letter]), { ...S, cnc_letter_perimeter_factor: 0 });
  t("R9 letter factor 0 → resurrected 3.5 (nonzero cutLength prices anyway)",
    out.machine_time_hours > 0);
}
// R10: no availability metadata anywhere — page can only trust the numbers.
{
  const session = remote.remoteSessionTotals(proj([ITEM()]), S);
  t("R10 remote math exposes no issues/held channel",
    session.totals.issues === undefined && session.totals.pricingUnavailable === undefined
      && !("issues" in session.items[0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.writeFileSync(path.join(AUDIT, "cnc-model-red-verification.json"), JSON.stringify({ pass, fail, results }, null, 2));
if (failures.length) { console.log(failures.join("\n")); process.exit(1); }
console.log("PASS cnc-red (remote defects confirmed)");
