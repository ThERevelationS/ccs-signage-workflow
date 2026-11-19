import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import FoundationWallCapsPanel from "../../src/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationTotals from "../../src/components/estimator/foundation/FoundationTotals";
import FoundationBOM from "../../src/components/estimator/foundation/FoundationBOM";
import { calcProject } from "../../src/components/estimator/foundation/foundationCalc";
import { wallCapCutLengthValue } from "../../src/components/estimator/foundation/wallCapCalculator";

const mode = new URLSearchParams(location.search).get("mode") || "current";
const freeze = value => {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const cap = { component_id: "cap-one", id: "cap-one", cap_inventory_id: "inventory-one",
  length_inches: 18, cost: 21, stock_length_inches: 48, cap_name: "Acknowledged cap" };
if (mode === "unknown") delete cap.cost;
if (mode === "legacy") { delete cap.length_inches; cap.cut_length_inches = 18; }
const initialSource = freeze({ id: "synthetic-cap-geometry-browser", items: [], poles: [], walls: [],
  selected_equipment: [], wall_caps: [cap] });
const original = JSON.stringify(initialSource);
const rawCap = { ...cap };
if (mode === "oversize") { rawCap.length_inches = 49; rawCap.cost = 25; rawCap.stock_length_inches = 96; }
if (mode === "cut_unknown") { rawCap.length_inches = ""; rawCap.cut_length_inches = 18; rawCap.cost = 25; }
if (mode === "stock_unknown") { rawCap.cost = 25; rawCap.stock_length_inches = 96; }
const inventory = freeze([
  { id: "inventory-one", material_type: "wall_cap", material_name: "Synthetic current cap",
    cap_stock_price: mode === "zero" ? 0 : ["saved", "unknown"].includes(mode) ? null : 25,
    cap_stock_length_inches: mode === "stock_unknown" ? null : 48 },
  { id: "inventory-long", material_type: "wall_cap", material_name: "Synthetic longer stock",
    cap_stock_price: 25, cap_stock_length_inches: 96 },
  { id: "inventory-short", material_type: "wall_cap", material_name: "Synthetic shorter stock",
    cap_stock_price: 30, cap_stock_length_inches: 12 },
]);

function Fixture() {
  const [project, setProject] = useState(() => ({ ...initialSource, wall_caps: [rawCap] }));
  const saved = useRef(initialSource);
  const [writes, setWrites] = useState(0);
  const [edits, setEdits] = useState(0);
  const calc = calcProject(project, inventory, {}, { savedProject: saved.current });
  const blocked = calc.catalogIssues.length > 0;
  const first = calc.wallCaps[0];
  const selected = inventory.find(row => row.id === project.wall_caps[0].cap_inventory_id);
  window.__wallCapGeometryInspect = () => ({
    sourceUnchanged: JSON.stringify(initialSource) === original,
    total: calc.totals.total_wall_cap_cost, grandTotal: calc.totals.grand_total,
    capCost: first.cost ?? null, stock: first.stock_length_inches ?? null,
    cut: wallCapCutLengthValue(first) ?? null, rawCost: project.wall_caps[0].cost ?? null,
    rawCut: wallCapCutLengthValue(project.wall_caps[0]) ?? null,
    rawCutType: typeof wallCapCutLengthValue(project.wall_caps[0]),
    canonicalOwn: Object.prototype.hasOwnProperty.call(project.wall_caps[0], "length_inches"),
    legacyCut: project.wall_caps[0].cut_length_inches ?? null,
    savedCost: saved.current.wall_caps[0].cost ?? null,
    selectedStock: selected?.cap_stock_length_inches ?? null,
    groups: calc.totals.wall_caps_by_material, issues: calc.catalogIssues,
    blocked, writes, edits, actualBusinessWrites: 0,
  });
  const recordSyntheticSave = () => {
    if (blocked) throw Error("Blocked synthetic save must never execute");
    const next = freeze({ ...project, wall_caps: calc.wallCaps });
    saved.current = next;
    setProject(next);
    setWrites(count => count + 1);
  };
  return <main className="p-4 mx-auto max-w-5xl space-y-3">
    <h1 className="text-lg font-semibold">Offline wall-cap stock fit</h1>
    <p className="text-xs">Synthetic data only. Save records an in-memory snapshot, not a business record.
      Stock-fit checks are not engineering approval.</p>
    {blocked && <div role="alert" className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-800 text-xs">
      {calc.catalogIssues.map(issue => <p key={`${issue.index}-${issue.code}`}>{issue.message}</p>)}
    </div>}
    <section data-testid="cap-panel">
      <FoundationWallCapsPanel caps={calc.wallCaps} options={inventory} onChange={next => {
        setProject(current => ({ ...current, wall_caps: next }));
        setEdits(count => count + 1);
      }} />
    </section>
    <button type="button" data-testid="synthetic-save" disabled={blocked} onClick={recordSyntheticSave}
      className="px-3 py-2 rounded bg-gray-900 text-white text-xs disabled:opacity-40">
      Record Synthetic Save
    </button>
    <section data-testid="totals-panel"><FoundationTotals totals={calc.totals} pricingUnavailable={blocked} /></section>
    <section data-testid="bom-panel"><FoundationBOM totals={calc.totals} inventory={inventory} pricingUnavailable={blocked} /></section>
  </main>;
}
createRoot(document.getElementById("root")).render(<Fixture />);
