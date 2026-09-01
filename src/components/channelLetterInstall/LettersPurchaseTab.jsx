import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Plus, Type, Truck, Receipt, Info, Settings, Sparkles, ChevronDown, ArrowUp } from "lucide-react";
import LetterPurchaseRow from "./LetterPurchaseRow";
import AIScopeWriterModal from "./AIScopeWriterModal";
import { emptyLetterPurchase, LETTER_TYPE_LABELS, groupPurchasesBySet, newSetId } from "./lettersCalculator";
import { Layers } from "lucide-react";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const QUICK_ADD = [
  { type: "channel_raceway_mounted", label: "+ Raceway Mounted Letters", color: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200" },
  { type: "channel_flush_mounted", label: "+ Flush Mounted Letters", color: "bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200" },
  { type: "channel_halo_lit", label: "+ Halo-Lit Letters", color: "bg-pink-50 hover:bg-pink-100 text-pink-700 border-pink-200" },
  { type: "capsule_logo_pillbox", label: "+ Capsule / Logo", color: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200" },
  { type: "dimensional_letters", label: "+ Dimensional Letters", color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200" },
];

export default function LettersPurchaseTab({ project, settings, onUpdateProject, incompleteDimensionalIds = [] }) {
  const purchases = project.letter_purchases || [];
  const [aiOpen, setAiOpen] = React.useState(false);
  const [feesOpen, setFeesOpen] = React.useState(false);
  const incompleteSet = React.useMemo(() => new Set(incompleteDimensionalIds || []), [incompleteDimensionalIds]);

  const addPurchase = (type) => {
    const p = emptyLetterPurchase(type);
    onUpdateProject({ letter_purchases: [...purchases, p] });
  };

  // True when at least one dimensional letters row is on this project
  const hasDimensional = purchases.some(p => p.letter_type === "dimensional_letters");

  // Delivery / Shipping does NOT apply to dimensional lettering (fabricated in-house).
  // Hide the fee + rollup row when every letter product on the project is dimensional.
  const onlyDimensional = purchases.length > 0 && purchases.every(p => p.letter_type === "dimensional_letters");

  // Enable a backer on the first dimensional row that doesn't already have one
  const addBackerToFirstDimensional = () => {
    const idx = purchases.findIndex(p => p.letter_type === "dimensional_letters" && !p.backer_enabled);
    if (idx === -1) return; // all dimensional rows already have a backer
    const arr = [...purchases];
    arr[idx] = { ...arr[idx], backer_enabled: true };
    onUpdateProject({ letter_purchases: arr });
  };
  const allDimensionalHaveBacker = hasDimensional && purchases
    .filter(p => p.letter_type === "dimensional_letters")
    .every(p => p.backer_enabled);

  const applyAIPurchases = (aiPurchases, mode = "append") => {
    const newOnes = aiPurchases.map((ai) => {
      const base = emptyLetterPurchase(ai.letter_type || "channel_flush_mounted");
      return {
        ...base,
        description: ai.description || base.description,
        qty: parseFloat(ai.qty) || 0,
        size_value: parseFloat(ai.size_value) || 0,
        install_height_feet: parseFloat(ai.install_height_feet) || base.install_height_feet || 12,
        wall_material: ai.wall_material || base.wall_material || "eifs",
      };
    });
    onUpdateProject({
      letter_purchases: mode === "replace" ? newOnes : [...purchases, ...newOnes],
    });
  };

  const updatePurchase = (idx, next) => {
    const arr = [...purchases];
    arr[idx] = next;
    onUpdateProject({ letter_purchases: arr });
  };

  const removePurchase = (idx) => {
    const arr = [...purchases];
    arr.splice(idx, 1);
    onUpdateProject({ letter_purchases: arr });
  };

  const duplicatePurchase = (idx) => {
    const arr = [...purchases];
    const copy = JSON.parse(JSON.stringify(arr[idx]));
    copy.id = `lp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // A duplicated row should NOT clone set membership — that would create orphan/duplicate children
    copy.set_id = undefined;
    copy.set_parent_id = undefined;
    arr.splice(idx + 1, 0, copy);
    onUpdateProject({ letter_purchases: arr });
  };

  // Add a CHILD purchase that inherits install_height_feet & wall_material from the parent.
  // If the parent doesn't yet have a set_id, give it one and insert the new child right after it.
  const addToSet = (parent, childType) => {
    const arr = [...purchases];
    const parentIdx = arr.findIndex(p => p.id === parent.id);
    if (parentIdx === -1) return;

    const sid = parent.set_id || newSetId();
    if (!parent.set_id) {
      arr[parentIdx] = { ...arr[parentIdx], set_id: sid };
    }

    const child = emptyLetterPurchase(childType);
    child.set_id = sid;
    child.set_parent_id = parent.id;
    // Inherit location-style fields from the parent
    child.install_height_feet = parent.install_height_feet;
    child.wall_material = parent.wall_material || "eifs";

    // Insert immediately after the parent (and after any existing children of that parent)
    let insertAt = parentIdx + 1;
    while (insertAt < arr.length && arr[insertAt].set_parent_id === parent.id) insertAt++;
    arr.splice(insertAt, 0, child);
    onUpdateProject({ letter_purchases: arr });
  };

  // When a parent in a set changes install_height_feet or wall_material, propagate to children.
  // This keeps "inherit from parent" semantics live in the UI.
  const updatePurchaseWithSetSync = (idx, next) => {
    const arr = [...purchases];
    const prev = arr[idx];
    arr[idx] = next;

    const heightChanged = (prev.install_height_feet || 0) !== (next.install_height_feet || 0);
    const wallChanged = (prev.wall_material || "") !== (next.wall_material || "");
    if (next.set_id && !next.set_parent_id && (heightChanged || wallChanged)) {
      // It's a parent — propagate to its children
      for (let i = 0; i < arr.length; i++) {
        if (arr[i].set_parent_id === next.id) {
          arr[i] = {
            ...arr[i],
            install_height_feet: next.install_height_feet,
            wall_material: next.wall_material || "eifs",
          };
        }
      }
    }
    onUpdateProject({ letter_purchases: arr });
  };

  // Removing a parent should remove its children too
  const removePurchaseWithSetCleanup = (idx) => {
    const target = purchases[idx];
    if (!target) return;
    const ids = new Set([target.id]);
    // If this is a parent, also remove all its children
    purchases.forEach(p => { if (p.set_parent_id === target.id) ids.add(p.id); });
    onUpdateProject({ letter_purchases: purchases.filter(p => !ids.has(p.id)) });
  };

  const purchasesTotal = purchases.reduce((s, p) => s + (parseFloat(p.total_cost) || 0), 0);

  // Aggregate dimensional-letter cost breakdown across all dimensional rows.
  // Pulls Material / Cutting (CNC or Laser) / Paint / Backer totals from each row's fab_config.
  const dimensionalBreakdown = React.useMemo(() => {
    const acc = { material: 0, cnc: 0, laser: 0, paint: 0, backer: 0 };
    let hasAny = false;
    for (const p of purchases) {
      if (p.letter_type !== "dimensional_letters") continue;
      const fc = p.fab_config;
      if (!fc) continue;
      const qty = parseFloat(p.qty) || 0;
      if (qty <= 0) continue;
      hasAny = true;
      acc.material += (parseFloat(fc.unit_material_cost) || 0) * qty;
      const cutCostTotal = (parseFloat(fc.unit_cut_cost) || 0) * qty;
      if (fc.cutting_method === "laser") acc.laser += cutCostTotal;
      else acc.cnc += cutCostTotal;
      acc.paint += (parseFloat(fc.unit_paint_cost) || 0) * qty;
      if (p.backer_enabled && p.backer_fab_config?.unit_total_cost) {
        acc.backer += (parseFloat(p.backer_fab_config.unit_total_cost) || 0) * qty;
      }
    }
    return { ...acc, hasAny };
  }, [purchases]);

  return (
    <div className="space-y-3">
      {/* Intro / quick-add */}
      <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0">
              <Type className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-slate-900">Letters & Logos — Fabricate or Purchase</h3>
              <p className="text-xs text-slate-600">
                Build up the cost of the signage itself — letters, logos, and dimensional pieces you either
                fabricate in-house or purchase from a vendor (separate from installation labor).
                Each line auto-creates a matching item on the Installation tab.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => setAiOpen(true)}
                size="sm"
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> AI Scope Writer
              </Button>
              <Link to={createPageUrl("ChannelLetterInstallationSettings")}>
                <Button variant="outline" size="sm" className="bg-white">
                  <Settings className="w-3.5 h-3.5 mr-1.5" /> Letter Pricing
                </Button>
              </Link>
            </div>
          </div>
          <div id="clp-add-letter-row" className="flex flex-wrap gap-2 pt-1">
            {QUICK_ADD.map(qa => (
              <button
                key={qa.type}
                onClick={() => addPurchase(qa.type)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${qa.color}`}
              >
                {qa.label}
              </button>
            ))}
            {/* Backer Panel — only visible when there's a Dimensional Letters row */}
            {hasDimensional && (
              <button
                onClick={addBackerToFirstDimensional}
                disabled={allDimensionalHaveBacker}
                title={allDimensionalHaveBacker ? "All Dimensional Letter rows already have a backer" : "Add a backer panel to the first Dimensional Letter row"}
                className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  allDimensionalHaveBacker
                    ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                    : "bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                }`}
              >
                + Backer Panel
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Purchase rows */}
      {purchases.length === 0 ? (
        <Card className="border-2 border-dashed border-slate-300 bg-white/50">
          <CardContent className="p-10 text-center text-slate-500">
            <div className="flex items-end justify-center gap-2 mb-3 h-12 text-purple-500">
              <ArrowUp className="w-6 h-6 animate-bounce" style={{ animationDelay: "0ms" }} />
              <ArrowUp className="w-7 h-7 animate-bounce" style={{ animationDelay: "120ms" }} />
              <ArrowUp className="w-8 h-8 animate-bounce" style={{ animationDelay: "240ms" }} />
              <ArrowUp className="w-7 h-7 animate-bounce" style={{ animationDelay: "120ms" }} />
              <ArrowUp className="w-6 h-6 animate-bounce" style={{ animationDelay: "0ms" }} />
            </div>
            <p className="mb-1 font-semibold text-slate-700">Add Product</p>
            <p className="text-xs">Use the quick-add buttons above to choose a letter type.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {groupPurchasesBySet(purchases).map((group, gi) => {
            if (group.kind === "solo") {
              const p = group.purchase;
              const idx = purchases.findIndex(x => x.id === p.id);
              return (
                <div key={p.id || gi} id={idx === 0 ? "clp-letter-purchase-row" : undefined}>
                  <LetterPurchaseRow
                    index={idx}
                    purchase={p}
                    settings={settings}
                    onUpdate={(next) => updatePurchaseWithSetSync(idx, next)}
                    onRemove={() => removePurchaseWithSetCleanup(idx)}
                    onDuplicate={() => duplicatePurchase(idx)}
                    onAddToSet={addToSet}
                    fabHighlight={incompleteSet.has(p.id)}
                  />
                </div>
              );
            }
            // Set group
            const { parent, children } = group;
            const parentIdx = purchases.findIndex(x => x.id === parent.id);
            const setSize = 1 + children.length;
            const setTotal = (parseFloat(parent.total_cost) || 0)
              + children.reduce((s, c) => s + (parseFloat(c.total_cost) || 0), 0);
            return (
              <div key={parent.id || gi} className="space-y-2 bg-purple-50/40 rounded-2xl p-2 border border-purple-100">
                <LetterPurchaseRow
                  index={parentIdx}
                  purchase={parent}
                  settings={settings}
                  onUpdate={(next) => updatePurchaseWithSetSync(parentIdx, next)}
                  onRemove={() => removePurchaseWithSetCleanup(parentIdx)}
                  onDuplicate={() => duplicatePurchase(parentIdx)}
                  onAddToSet={addToSet}
                  fabHighlight={incompleteSet.has(parent.id)}
                  setRole="parent"
                  setSize={setSize}
                />
                {children.map((c, ci) => {
                  const cidx = purchases.findIndex(x => x.id === c.id);
                  return (
                    <LetterPurchaseRow
                      key={c.id}
                      index={cidx}
                      purchase={c}
                      settings={settings}
                      onUpdate={(next) => updatePurchase(cidx, next)}
                      onRemove={() => removePurchase(cidx)}
                      onDuplicate={() => duplicatePurchase(cidx)}
                      fabHighlight={incompleteSet.has(c.id)}
                      setRole="child"
                      setSize={setSize}
                      setIndex={ci + 1}
                    />
                  );
                })}
                <div className="flex items-center justify-end gap-3 pr-2 pt-1">
                  <span className="text-[11px] text-purple-700 flex items-center gap-1">
                    <Layers className="w-3 h-3" /> Set total ({setSize} items)
                  </span>
                  <span className="text-base font-bold tabular-nums text-purple-900">
                    {fmt(setTotal)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Project-level fees — Advanced Settings */}
      <Card id="clp-letter-fees" className="bg-white border-0 shadow-sm overflow-hidden">
        <button
          type="button"
          onClick={() => setFeesOpen(o => !o)}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-slate-500" />
            <span className="text-base font-semibold text-slate-900">Advanced Settings — Project Fees</span>
          </div>
          <ChevronDown className={`w-4 h-4 text-slate-500 transition-transform ${feesOpen ? "rotate-180" : ""}`} />
        </button>
        {feesOpen && (
          <CardContent className="border-t border-slate-100 pt-4">
            <div className="mb-4 flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Info className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-900">
                These fees are prefilled based on the defaults configured by your admin in the
                {" "}<Link to={createPageUrl("ChannelLetterInstallationSettings")} className="font-semibold underline">Settings page</Link>.
                Override them here for this estimate only.
              </p>
            </div>
            {onlyDimensional && (
              <div className="mb-3 flex items-start gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-900">
                  Delivery / Shipping doesn't apply to dimensional lettering (fabricated in-house), so it's hidden for this estimate.
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {!onlyDimensional && (
                <FeeInput
                  icon={Truck}
                  label="Delivery / Shipping"
                  value={project.letters_delivery_fee}
                  onChange={(v) => onUpdateProject({ letters_delivery_fee: v })}
                />
              )}
              <FeeInput
                icon={Receipt}
                label="Other"
                value={project.letters_other_fee}
                onChange={(v) => onUpdateProject({ letters_other_fee: v })}
              />
            </div>
          </CardContent>
        )}
      </Card>

      {/* Rollup */}
      <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0">
        <CardContent className="p-4 space-y-2">
          {/* Dimensional letter cost breakdown — Material / CNC / Laser / Paint / Backer */}
          {dimensionalBreakdown.hasAny && (
            <div className="bg-white/5 rounded-lg p-3 mb-1 space-y-1 border border-white/10">
              <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                Dimensional Letter Breakdown
              </p>
              {dimensionalBreakdown.material > 0 && (
                <BreakdownRow label="Material (sheet)" value={dimensionalBreakdown.material} />
              )}
              {dimensionalBreakdown.cnc > 0 && (
                <BreakdownRow label="CNC Routing" value={dimensionalBreakdown.cnc} />
              )}
              {dimensionalBreakdown.laser > 0 && (
                <BreakdownRow label="Laser Cutting" value={dimensionalBreakdown.laser} />
              )}
              {dimensionalBreakdown.paint > 0 && (
                <BreakdownRow label="Paint" value={dimensionalBreakdown.paint} />
              )}
              {dimensionalBreakdown.backer > 0 && (
                <BreakdownRow label="Backer Panel" value={dimensionalBreakdown.backer} />
              )}
            </div>
          )}
          <div className="flex justify-between text-sm">
            <span className="text-slate-300">Letters Subtotal</span>
            <span className="tabular-nums font-medium">{fmt(purchasesTotal)}</span>
          </div>
          {!onlyDimensional && (parseFloat(project.letters_delivery_fee) || 0) > 0 && (
            <RollupRow label="Delivery / Shipping" value={project.letters_delivery_fee} />
          )}
          {(parseFloat(project.letters_other_fee) || 0) > 0 && (
            <RollupRow label="Other" value={project.letters_other_fee} />
          )}
          <div className="border-t border-white/20 pt-2 flex justify-between">
            <span className="text-slate-300 text-sm">Subtotal w/ Fees</span>
            <span className="tabular-nums font-medium">{fmt(project.letters_subtotal)}</span>
          </div>
          {(parseFloat(project.letters_markup_percent) || 0) > 0 && (
            <div className="flex justify-between text-xs text-slate-400">
              <span>Markup ({parseFloat(project.letters_markup_percent).toFixed(1)}%)</span>
              <span className="tabular-nums">
                {fmt((project.total_letters_cost || 0) - (project.letters_subtotal || 0))}
              </span>
            </div>
          )}
          <div className="border-t-2 border-white/30 pt-2 flex justify-between items-center">
            <span className="text-lg font-bold">Total Letters Cost</span>
            <span className="text-2xl font-bold tabular-nums">{fmt(project.total_letters_cost)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="text-[11px] text-slate-500 flex items-start gap-1.5 px-1">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        <span>
          Letter pricing pulls from your Channel Letter Settings page. Click "Letter Pricing" above to adjust.
          The total above is added to the project Grand Total on the Summary tab.
        </span>
      </div>

      <AIScopeWriterModal open={aiOpen} onClose={() => setAiOpen(false)} onApply={applyAIPurchases} />
    </div>
  );
}

const FeeInput = ({ icon: Icon, label, value, onChange }) => (
  <div>
    <Label className="text-xs flex items-center gap-1">
      <Icon className="w-3 h-3 text-slate-500" />
      {label}
    </Label>
    <div className="relative mt-1">
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={value ?? 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="h-9 pl-6"
      />
    </div>
  </div>
);

const RollupRow = ({ label, value }) => (
  <div className="flex justify-between text-xs text-slate-400">
    <span>{label}</span>
    <span className="tabular-nums">{`$${(parseFloat(value) || 0).toFixed(2)}`}</span>
  </div>
);

const BreakdownRow = ({ label, value }) => (
  <div className="flex justify-between text-xs">
    <span className="text-slate-300">{label}</span>
    <span className="tabular-nums text-slate-100 font-medium">{`$${(parseFloat(value) || 0).toFixed(2)}`}</span>
  </div>
);