// Build + locally simulate the O-010 sandbox-edit payloads.
// For each target file: assert every old_text occurs exactly once in the
// baseline (EOL-adjusted), apply edits, assert result === candidate (EOL-adjusted).
// Emits apply/*.edits.json (payload for `sandbox edit` stdin).
import fs from "node:fs";
import path from "node:path";

const DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const read = (p) => fs.readFileSync(path.join(DIR, p), "utf8");

// ---- builderService.js (LF remote) ----
const bsEdits = [
  {
    old_text: [
      '    const known = [',
      '      "total_concrete_cost",',
      '      "total_rebar_cost",',
      '      "total_excavation_cost",',
      '      "total_forming_materials_cost",',
      '      "total_labor_cost",',
      '      "total_wall_cost",',
      '      "total_pole_cost",',
      '      "total_pole_painting_cost",',
      '      "total_equipment_cost",',
      '      "total_wall_cap_cost",',
      '      "total_signage_cabinet_cost",',
      '      "total_landscape_cost",',
      '    ];',
      '    return known.reduce((sum, key) => sum + num(record[key]), 0);',
    ].join("\n"),
    new_text:
      '    return FOUNDATION_RECORD_TOTAL_FIELDS.reduce((sum, key) => sum + num(record[key]), 0);',
  },
  {
    old_text:
      '  return num(record.total_cost, num(line?.total_snapshot));\n}\n\nasync function findBuilderProduct(line, estimateId) {',
    new_text: [
      '  return num(record.total_cost, num(line?.total_snapshot));',
      '}',
      '',
      '// The 12 persisted split-total cost fields — the authoritative cost partition',
      '// on a saved FoundationProject record. total_brick_cost and total_fill_cost',
      '// are deliberately absent: they are subsets of total_wall_cost, so counting',
      '// them would double-count wall cost. grand_total is never persisted; it is',
      '// recomputed from these fields by the Builder. Shared by sourceProjectTotal\'s',
      '// foundation branch and foundationRecordSavedTotal (CMP-A10).',
      'export const FOUNDATION_RECORD_TOTAL_FIELDS = [',
      '  "total_concrete_cost",',
      '  "total_rebar_cost",',
      '  "total_excavation_cost",',
      '  "total_forming_materials_cost",',
      '  "total_labor_cost",',
      '  "total_wall_cost",',
      '  "total_pole_cost",',
      '  "total_pole_painting_cost",',
      '  "total_equipment_cost",',
      '  "total_wall_cap_cost",',
      '  "total_signage_cabinet_cost",',
      '  "total_landscape_cost",',
      '];',
      '',
      '// The acknowledged section total persisted on a FoundationProject record —',
      '// the same split-field sum the linked estimate stores as live_total_snapshot',
      '// at each Builder save (manual add-on Product parts live only on the estimate',
      '// side and are intentionally not represented here). Null when the record',
      '// carries no persisted totals at all (never priced/saved with totals); absent',
      '// fields count as $0, matching sourceProjectTotal\'s foundation branch.',
      'export function foundationRecordSavedTotal(record) {',
      '  if (!record || typeof record !== "object") return null;',
      '  const direct = num(record.grand_total, NaN);',
      '  if (Number.isFinite(direct)) return direct;',
      '  if (!FOUNDATION_RECORD_TOTAL_FIELDS.some((key) => Number.isFinite(Number(record[key])))) return null;',
      '  return FOUNDATION_RECORD_TOTAL_FIELDS.reduce((sum, key) => sum + num(record[key]), 0);',
      '}',
      '',
      'async function findBuilderProduct(line, estimateId) {',
    ].join("\n"),
  },
];

// ---- FoundationEstimator.jsx (LF remote) ----
const feEdits = [
  {
    old_text:
      'import { recordBuilderSave } from "@/components/estimator/builder/builderService";',
    new_text:
      'import { recordBuilderSave, foundationRecordSavedTotal } from "@/components/estimator/builder/builderService";',
  },
  {
    old_text:
      '  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null\n' +
      '    ? null\n' +
      '    : calc.totals.grand_total + cabinetCost + landscapeCost;\n\n' +
      '  const undo = () => {',
    new_text:
      '  const sectionTotal = calc.totals.grand_total === null || cabinetCost === null || landscapeCost === null\n' +
      '    ? null\n' +
      '    : calc.totals.grand_total + cabinetCost + landscapeCost;\n\n' +
      '  // Saved-vs-current reconciliation (CMP-A10): the acknowledged record\'s\n' +
      '  // persisted 12-field split-total sum — the same number the linked estimate\n' +
      '  // stored as live_total_snapshot at the last Builder save (manual add-on\n' +
      '  // Product parts live only on the estimate side, so record-sum is the right\n' +
      '  // comparator for this module-scoped sectionTotal). Null for a never-priced\n' +
      '  // record; the totals panel renders the advisory delta, never blocking.\n' +
      '  const savedSectionTotal = foundationRecordSavedTotal(savedSourceProject);\n\n' +
      '  const undo = () => {',
  },
  {
    old_text:
      '<FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} />',
    new_text:
      '<FoundationTotals totals={calc.totals} pricingUnavailable={pricingBlocked} savedSectionTotal={savedSectionTotal} sectionTotal={sectionTotal} />',
  },
];

// ---- FoundationTotals.jsx (LF remote) ----
const ftEdits = [
  {
    old_text:
      'export default function FoundationTotals({ totals, pricingUnavailable = false }) {\n' +
      '  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite)\n' +
      '    ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost\n' +
      '    : null;',
    new_text:
      'export default function FoundationTotals({ totals, pricingUnavailable = false, savedSectionTotal = null, sectionTotal = null }) {\n' +
      '  const wallMortar = [totals.total_wall_cost, totals.total_brick_cost, totals.total_fill_cost].every(Number.isFinite)\n' +
      '    ? totals.total_wall_cost - totals.total_brick_cost - totals.total_fill_cost\n' +
      '    : null;\n' +
      '  // Saved-vs-current reconciliation (CMP-A10): `savedSectionTotal` is the\n' +
      '  // acknowledged record\'s persisted split-total sum (the same number the\n' +
      '  // linked estimate stored as live_total_snapshot at the last Builder save);\n' +
      '  // `sectionTotal` is the live recalculation including cabinets + landscape.\n' +
      '  // Advisory only — never blocks — and |delta| <= $0.005 never fires, the\n' +
      '  // same tolerance builderService.sameNumber / useSectionSync / ProductRow\n' +
      '  // already use for frozen-vs-live snapshot comparisons.\n' +
      '  const saved = Number.isFinite(savedSectionTotal) ? savedSectionTotal : null;\n' +
      '  const currentKnown = Number.isFinite(sectionTotal);\n' +
      '  const savedDelta = saved !== null && currentKnown ? sectionTotal - saved : null;\n' +
      '  const savedDiffers = savedDelta !== null && Math.abs(savedDelta) > 0.005;',
  },
  {
    old_text: '      </div>\n    </div>\n  );\n}',
    new_text:
      '      </div>\n\n' +
      '      {saved !== null && !currentKnown && (\n' +
      '        <div role="status" className="mt-3 rounded-sm border border-gray-300 bg-slate-50 px-2 py-1 text-[11px] text-gray-700">\n' +
      '          Saved section total {money(saved)} — current pricing unavailable.\n' +
      '        </div>\n' +
      '      )}\n' +
      '      {savedDiffers && (\n' +
      '        <div role="status" className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-800">\n' +
      '          Saved {money(saved)} — current {money(sectionTotal)} ({savedDelta > 0 ? "+" : "−"}{money(Math.abs(savedDelta))}) — recalculated from current inputs and catalog. Save to update the estimate.\n' +
      '        </div>\n' +
      '      )}\n' +
      '    </div>\n  );\n}',
  },
];

// ---- CustomerPricingPanel.jsx (CRLF remote) — build LF then CRLF-ify ----
const cpEditsLF = [
  {
    old_text: 'import { money } from "./foundationCalc";',
    new_text:
      'import { money } from "./foundationCalc";\n' +
      'import { foundationHasEnginePricing } from "./foundationSellPricing";',
  },
  {
    old_text:
      '  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;\n\n  return (',
    new_text:
      '  const margin = price > 0 ? ((price - cost) / price) * 100 : 0;\n\n' +
      '  // Sell-side precedence (CMP-A10; mirrors sourceProjectEconomics\' foundation\n' +
      '  // branch in customerPricing.js): explicit pricing-engine config resolves\n' +
      '  // the live customer price first; absent engine config an applied Markup\n' +
      '  // Tier snapshot (customer_pricing.applied === true with a numeric total)\n' +
      '  // replaces it wholesale; otherwise the manual baseline below wins —\n' +
      '  // customer_price_override > 0 beats cost x (1 + markup %). `price` here is\n' +
      '  // therefore the MANUAL baseline: honest whenever neither upstream layer is\n' +
      '  // engaged, advisory-shadowed otherwise.\n' +
      '  const enginePriced = foundationHasEnginePricing(project);\n' +
      '  const tierTotal = project.customer_pricing?.applied === true && Number.isFinite(Number(project.customer_pricing?.total))\n' +
      '    ? Number(project.customer_pricing.total)\n' +
      '    : null;\n' +
      '  const tierShadowsBaseline = !enginePriced && tierTotal !== null && Math.abs(tierTotal - price) > 0.005;\n\n' +
      '  return (',
  },
  {
    old_text:
      '      </div>\n\n      <div className="flex justify-between text-[12px] text-gray-600">',
    new_text:
      '      </div>\n\n' +
      '      {enginePriced && (\n' +
      '        <p role="status" className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">\n' +
      '          Pricing-engine configuration on this project resolves the live customer price (precedence: pricing engine → applied tier → price override → markup %). The manual markup/override below still applies to components without engine config.\n' +
      '        </p>\n' +
      '      )}\n' +
      '      {tierShadowsBaseline && (\n' +
      '        <p role="status" className="rounded-sm border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-800">\n' +
      '          Applied Tier {project.customer_pricing?.tier_number} pricing ({money(tierTotal)}) is the live customer price — the markup/override below is stored but not used while a tier is applied. Editing either field switches this section back to manual pricing.\n' +
      '        </p>\n' +
      '      )}\n\n' +
      '      <div className="flex justify-between text-[12px] text-gray-600">',
  },
  {
    old_text: '  );\n}',
    new_text: '  );\n}\n',
  },
];

const crlf = (s) => s.replace(/\n/g, "\r\n");
const cpEdits = cpEditsLF.map((e) => ({ old_text: crlf(e.old_text), new_text: crlf(e.new_text) }));

const targets = [
  { file: "builderService.js", remote: "src/components/estimator/builder/builderService.js", edits: bsEdits, eol: "LF" },
  { file: "FoundationEstimator.jsx", remote: "src/pages/FoundationEstimator.jsx", edits: feEdits, eol: "LF" },
  { file: "FoundationTotals.jsx", remote: "src/components/estimator/foundation/FoundationTotals.jsx", edits: ftEdits, eol: "LF" },
  { file: "CustomerPricingPanel.jsx", remote: "src/components/estimator/foundation/CustomerPricingPanel.jsx", edits: cpEdits, eol: "CRLF" },
];

fs.mkdirSync(path.join(DIR, "apply"), { recursive: true });
let ok = true;
for (const t of targets) {
  let baseline = read(`baseline/${t.file}`);
  const candidate = read(`candidates/${t.file}`);
  if (t.eol === "CRLF") baseline = crlf(baseline);
  const expected = t.eol === "CRLF" ? crlf(candidate) : candidate;

  let work = baseline;
  for (const [i, e] of t.edits.entries()) {
    const count = work.split(e.old_text).length - 1;
    if (count !== 1) {
      console.log(`FAIL ${t.file} edit[${i}]: old_text occurs ${count}x (need 1)`);
      ok = false;
      continue;
    }
    work = work.replace(e.old_text, e.new_text);
  }
  if (work !== expected) {
    // locate first divergence
    let k = 0;
    while (k < work.length && k < expected.length && work[k] === expected[k]) k++;
    console.log(`FAIL ${t.file}: simulated result != candidate at byte ${k}`);
    console.log(`  got:      ${JSON.stringify(work.slice(Math.max(0, k - 40), k + 40))}`);
    console.log(`  expected: ${JSON.stringify(expected.slice(Math.max(0, k - 40), k + 40))}`);
    ok = false;
  } else {
    console.log(`OK ${t.file}: ${t.edits.length} edits, ${t.eol}, simulation == candidate`);
  }
  const out = t.edits.map(({ old_text, new_text }) => ({ old_text, new_text, replace_all: false }));
  fs.writeFileSync(path.join(DIR, "apply", `${t.file}.edits.json`), JSON.stringify(out));
}
process.exit(ok ? 0 : 1);
