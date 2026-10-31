import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calculator, Clock, Cog, Plus, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PricingMatrixTable from "@/components/pricing/PricingMatrixTable";
import PricingCrudTable from "@/components/pricing/PricingCrudTable";
import { loadPricingCatalog } from "@/components/pricing/pricingPersistence";
import { priceQuote } from "@/components/pricing/pricingEngine";

// Pricing Admin — CoreBridge-style pricing engine management.
// Tier×category matrix rules, labor levels, machine rates, and a live quote
// simulator that runs the pure pricing engine on the loaded catalog.

const MACHINE_TYPE_OPTIONS = [
  { value: "vinyl", label: "Vinyl" },
  { value: "cnc", label: "CNC" },
  { value: "laser", label: "Laser" },
  { value: "printer", label: "Printer" },
  { value: "other", label: "Other" },
];

const LABOR_COLUMNS = [
  { key: "name", label: "Name", placeholder: "Journeyman Installer" },
  { key: "level_rank", label: "Rank", numeric: true, width: 64 },
  { key: "hourly_rate", label: "$/hr", numeric: true, width: 90 },
  { key: "applies_to_categories", label: "Categories (comma list)", type: "list", placeholder: "blank = all" },
  { key: "description", label: "Description" },
  {
    key: "status", label: "Status", type: "select",
    options: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }],
  },
];

const MACHINE_COLUMNS = [
  { key: "name", label: "Name", placeholder: "54in Vinyl Plotter" },
  {
    key: "machine_type", label: "Type", type: "select",
    options: [{ value: "", label: "—" }, ...MACHINE_TYPE_OPTIONS],
  },
  { key: "setup_minutes", label: "Setup min", numeric: true, width: 80 },
  { key: "runtime_rate_per_hour", label: "$/hr run", numeric: true, width: 90 },
  { key: "maintenance_rate_per_hour", label: "$/hr maint", numeric: true, width: 90 },
  { key: "material_waste_pct", label: "Waste %", numeric: true, width: 80 },
  {
    key: "status", label: "Status", type: "select",
    options: [{ value: "active", label: "active" }, { value: "inactive", label: "inactive" }],
  },
];

const fmt$ = (n) => `$${(Number(n) || 0).toFixed(2)}`;

let simLineSeq = 0;
const newSimLine = () => ({ _key: `sim_${(simLineSeq += 1)}`, label: "", category: "", qty: 1, unitCost: 0 });

export default function PricingAdmin() {
  const [catalog, setCatalog] = useState({ matrices: [], laborLevels: [], machineRates: [], tiers: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = async () => {
    try {
      const data = await loadPricingCatalog();
      setCatalog(data);
      setError("");
    } catch (e) {
      setError(e.message || "Could not load the pricing catalog.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, []);

  // --- Quote simulator state ------------------------------------------------
  const [simLines, setSimLines] = useState(() => [newSimLine()]);
  const [simTier, setSimTier] = useState("");
  const [simLaborHours, setSimLaborHours] = useState("");
  const [simLaborLevel, setSimLaborLevel] = useState("");
  const [simMachineHours, setSimMachineHours] = useState("");
  const [simMachineType, setSimMachineType] = useState("");
  const [simMaterialCost, setSimMaterialCost] = useState("");
  const [simDefaultMarkup, setSimDefaultMarkup] = useState("0");

  const patchLine = (key, field, value) =>
    setSimLines((prev) => prev.map((l) => (l._key === key ? { ...l, [field]: value } : l)));

  const simResult = useMemo(() => {
    const tier = (catalog.tiers || []).find((t) => (t.tier_name || t.name) === simTier) || simTier || null;
    return priceQuote({
      lines: simLines.map((l) => ({ label: l.label, category: l.category, qty: l.qty, unitCost: l.unitCost })),
      customerTier: tier,
      laborHours: simLaborHours,
      laborLevel: simLaborLevel || null,
      machineHours: simMachineHours,
      machineType: simMachineType || null,
      matrices: catalog.matrices,
      laborLevels: catalog.laborLevels,
      machineRates: catalog.machineRates,
      materialCost: simMaterialCost,
      defaultMarkupPct: simDefaultMarkup,
    });
  }, [catalog, simLines, simTier, simLaborHours, simLaborLevel, simMachineHours, simMachineType, simMaterialCost, simDefaultMarkup]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading pricing admin…</div>;

  return (
    <div className="min-h-full bg-gray-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Link to="/EstimatorSettings" className="inline-flex items-center gap-1 text-[12px] font-semibold text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" /> Estimator Settings
          </Link>
          <Button variant="outline" className="h-[30px] text-[11px]" onClick={() => { setLoading(true); reload(); }}>Reload catalog</Button>
        </div>

        <div className="bg-white border border-gray-200 rounded-md px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded bg-emerald-100 text-emerald-700 flex items-center justify-center"><Calculator className="w-5 h-5" /></div>
          <div>
            <h1 className="text-[18px] font-bold text-gray-900">Pricing Admin</h1>
            <p className="text-[10px] text-gray-500">CoreBridge-style tier matrices, labor levels, machine rates, and live quote simulation.</p>
          </div>
        </div>

        {error && <div className="px-3 py-2 rounded border border-red-200 bg-red-50 text-[11px] text-red-700">{error}</div>}

        <Tabs defaultValue="matrices" className="space-y-4">
          <TabsList className="grid grid-cols-4 h-auto bg-white border border-gray-200 p-1">
            <TabsTrigger value="matrices" className="text-[11px] py-2"><Table2 className="w-3.5 h-3.5 mr-1.5" /> Tier Matrices</TabsTrigger>
            <TabsTrigger value="labor" className="text-[11px] py-2"><Clock className="w-3.5 h-3.5 mr-1.5" /> Labor Levels</TabsTrigger>
            <TabsTrigger value="machines" className="text-[11px] py-2"><Cog className="w-3.5 h-3.5 mr-1.5" /> Machine Rates</TabsTrigger>
            <TabsTrigger value="simulator" className="text-[11px] py-2"><Calculator className="w-3.5 h-3.5 mr-1.5" /> Quote Simulator</TabsTrigger>
          </TabsList>

          <TabsContent value="matrices" className="mt-0">
            <PricingMatrixTable
              rows={catalog.matrices}
              tierOptions={catalog.tiers}
              categoryOptions={catalog.categories}
              onSaved={reload}
            />
          </TabsContent>

          <TabsContent value="labor" className="mt-0">
            <PricingCrudTable
              entityName="LaborLevel"
              title="Labor Levels"
              hint="Billable labor rates by skill level. The engine prices labor as hours x level hourly_rate."
              columns={LABOR_COLUMNS}
              rows={catalog.laborLevels}
              newRow={() => ({ name: "", level_rank: 0, hourly_rate: "", applies_to_categories: [], description: "", status: "active" })}
              onSaved={reload}
            />
          </TabsContent>

          <TabsContent value="machines" className="mt-0">
            <PricingCrudTable
              entityName="MachineRate"
              title="Machine Rates"
              hint="Setup minutes bill at the runtime rate; maintenance rate adds per runtime hour; waste % applies to material cost."
              columns={MACHINE_COLUMNS}
              rows={catalog.machineRates}
              newRow={() => ({ name: "", machine_type: "vinyl", setup_minutes: 0, runtime_rate_per_hour: "", maintenance_rate_per_hour: 0, material_waste_pct: 0, status: "active" })}
              onSaved={reload}
            />
          </TabsContent>

          <TabsContent value="simulator" className="mt-0 space-y-4">
            <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Quote Simulator</div>
                  <div className="text-[9px] text-gray-500 mt-0.5">Runs pricingEngine.priceQuote live against the catalog above — nothing is saved.</div>
                </div>
                <Button variant="outline" className="h-[30px] text-[11px]" onClick={() => setSimLines((p) => [...p, newSimLine()])}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Line
                </Button>
              </div>
              <div className="p-4 space-y-3">
                <div className="grid sm:grid-cols-4 gap-3">
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Customer Tier</span>
                    <select className="h-[30px] w-full text-[11px] border border-gray-200 rounded bg-white px-1.5" value={simTier} onChange={(e) => setSimTier(e.target.value)}>
                      <option value="">(none / default)</option>
                      {(catalog.tiers || []).map((t) => <option key={t.id || t.tier_name} value={t.tier_name || t.name}>{t.tier_name || t.name}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Default markup % (no matrix match)</span>
                    <Input type="number" step="0.01" className="h-[30px] text-[11px]" value={simDefaultMarkup} onChange={(e) => setSimDefaultMarkup(e.target.value)} />
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Labor hours</span>
                    <Input type="number" step="0.25" min="0" className="h-[30px] text-[11px]" value={simLaborHours} onChange={(e) => setSimLaborHours(e.target.value)} />
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Labor level</span>
                    <select className="h-[30px] w-full text-[11px] border border-gray-200 rounded bg-white px-1.5" value={simLaborLevel} onChange={(e) => setSimLaborLevel(e.target.value)}>
                      <option value="">(none)</option>
                      {(catalog.laborLevels || []).filter((l) => l.status !== "inactive").map((l) => <option key={l.id || l.name} value={l.name}>{l.name} — {fmt$(l.hourly_rate)}/hr</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Machine hours</span>
                    <Input type="number" step="0.25" min="0" className="h-[30px] text-[11px]" value={simMachineHours} onChange={(e) => setSimMachineHours(e.target.value)} />
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Machine type</span>
                    <select className="h-[30px] w-full text-[11px] border border-gray-200 rounded bg-white px-1.5" value={simMachineType} onChange={(e) => setSimMachineType(e.target.value)}>
                      <option value="">(none)</option>
                      {MACHINE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </label>
                  <label className="text-[10px] text-gray-500"><span className="block mb-1">Material cost $ (for waste %)</span>
                    <Input type="number" step="0.01" min="0" className="h-[30px] text-[11px]" value={simMaterialCost} onChange={(e) => setSimMaterialCost(e.target.value)} />
                  </label>
                </div>

                <table className="w-full border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-2 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase">Label</th>
                      <th className="px-2 py-1.5 text-left text-[9px] font-bold text-gray-500 uppercase">Category</th>
                      <th className="px-2 py-1.5 text-right text-[9px] font-bold text-gray-500 uppercase">Qty</th>
                      <th className="px-2 py-1.5 text-right text-[9px] font-bold text-gray-500 uppercase">Unit cost</th>
                      <th className="px-2 py-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {simLines.map((l) => (
                      <tr key={l._key} className="border-t border-gray-100">
                        <td className="px-1.5 py-1"><Input className="h-[28px] text-[11px]" value={l.label} onChange={(e) => patchLine(l._key, "label", e.target.value)} placeholder="Line" /></td>
                        <td className="px-1.5 py-1">
                          <select className="h-[28px] w-full text-[11px] border border-gray-200 rounded bg-white px-1" value={l.category} onChange={(e) => patchLine(l._key, "category", e.target.value)}>
                            <option value="">(none)</option>
                            {(catalog.categories || []).map((c) => <option key={c.id || c.category_key} value={c.category_key}>{c.category_name || c.category_key}</option>)}
                          </select>
                        </td>
                        <td className="px-1.5 py-1"><Input type="number" min="0" className="h-[28px] w-20 text-[11px] text-right" value={l.qty} onChange={(e) => patchLine(l._key, "qty", e.target.value)} /></td>
                        <td className="px-1.5 py-1"><Input type="number" step="0.01" min="0" className="h-[28px] w-24 text-[11px] text-right" value={l.unitCost} onChange={(e) => patchLine(l._key, "unitCost", e.target.value)} /></td>
                        <td className="px-1.5 py-1 text-right">
                          <button className="p-1 text-gray-400 hover:text-red-600" onClick={() => setSimLines((p) => p.filter((x) => x._key !== l._key))}><Trash2 className="w-3.5 h-3.5" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-white border border-gray-200 rounded-md overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200"><div className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">Breakdown</div></div>
              <div className="p-4 space-y-2">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-left text-[9px] font-bold text-gray-500 uppercase">
                      <th className="py-1">Line</th><th>Source</th><th className="text-right">Unit</th><th className="text-right">Qty</th><th className="text-right">Extended</th>
                    </tr>
                  </thead>
                  <tbody>
                    {simResult.linePrices.map((l, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        <td className="py-1">{l.label || `Line ${i + 1}`}{l.category ? <span className="text-gray-400"> · {l.category}</span> : null}</td>
                        <td className="text-gray-500">
                          {l.source === "qty_break" ? `qty break ≥${l.breakApplied?.qty}` :
                           l.source === "matrix_markup" ? `matrix: ${l.matchedRowName || l.matchedRowId}` : "default markup"}
                          {l.minimumApplied ? <span className="ml-1 text-amber-600 font-semibold">(min {fmt$(l.minimumCharge)})</span> : null}
                        </td>
                        <td className="text-right">{fmt$(l.unitPrice)}</td>
                        <td className="text-right">{l.qty}</td>
                        <td className="text-right font-medium">{fmt$(l.extended)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-gray-200 pt-2 space-y-1 text-[11px]">
                  <div className="flex justify-between"><span className="text-gray-500">Lines subtotal</span><span>{fmt$(simResult.linesSubtotal)}</span></div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Labor — {simResult.laborCost.hours}h{simResult.laborCost.levelName ? ` @ ${simResult.laborCost.levelName} ${fmt$(simResult.laborCost.rate)}/hr` : ""}</span>
                    <span>{fmt$(simResult.laborCost.cost)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">
                      Machine — {simResult.machineCost.hours}h{simResult.machineCost.rowName ? ` on ${simResult.machineCost.rowName}` : ""}
                      {simResult.machineCost.setupMinutes ? ` + ${simResult.machineCost.setupMinutes}m setup` : ""}
                      {simResult.machineCost.wasteCost ? ` + ${fmt$(simResult.machineCost.wasteCost)} waste` : ""}
                    </span>
                    <span>{fmt$(simResult.machineCost.total)}</span>
                  </div>
                  {simResult.minimumsApplied.length > 0 && (
                    <div className="text-[10px] text-amber-700">
                      Minimums applied: {simResult.minimumsApplied.map((m) => `${m.label} (${fmt$(m.computedExtended)} → ${fmt$(m.minimumCharge)})`).join(", ")}
                    </div>
                  )}
                  <div className="flex justify-between pt-1 border-t border-gray-200 text-[13px] font-bold text-gray-900"><span>Total</span><span>{fmt$(simResult.total)}</span></div>
                </div>
              </div>
            </section>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
