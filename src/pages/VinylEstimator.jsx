import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import VinylItemCard from "@/components/estimator/vinyl/VinylItemCard";
import VinylRatesPanel from "@/components/estimator/vinyl/VinylRatesPanel";
import VinylTotals from "@/components/estimator/vinyl/VinylTotals";
import { calcVinylProject } from "@/components/estimator/vinyl/vinylCalc";

const blankItem = () => ({
  description: "",
  width_inches: 24,
  height_inches: 12,
  quantity: 1,
  labor_hours_each: 0.5,
  apply_print: false,
});

export default function VinylEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      base44.entities.VinylProject.get(id),
      base44.entities.VinylInventory.filter({ is_active: true }),
    ]).then(([proj, inv]) => {
      setProject(proj);
      setInventory(inv || []);
      setLoading(false);
    });
  }, [id]);

  const calc = useMemo(() => (project ? calcVinylProject(project, inventory) : null), [project, inventory]);

  const vinyls = useMemo(() => inventory.filter((v) => !v.is_laminate), [inventory]);
  const laminates = useMemo(() => inventory.filter((v) => v.is_laminate), [inventory]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Vinyl section not found.</div>;

  const patch = (changes) => setProject((prev) => ({ ...prev, ...changes }));

  const patchItem = (index, changes) =>
    setProject((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));

  const removeItem = (index) =>
    setProject((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const addItem = () => setProject((prev) => ({ ...prev, items: [...(prev.items || []), blankItem()] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const t = calc.totals;
      await base44.entities.VinylProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        items: calc.items,
        labor_rate_per_hour: project.labor_rate_per_hour,
        print_cost_per_sqft: project.print_cost_per_sqft,
        supplies_percent_of_materials: project.supplies_percent_of_materials,
        extra_supplies_cost: project.extra_supplies_cost,
        markup_percent: project.markup_percent,
        total_vinyl_sqft: t.total_vinyl_sqft,
        total_laminate_sqft: t.total_laminate_sqft,
        total_print_sqft: t.total_print_sqft,
        total_vinyl_cost: t.total_vinyl_cost,
        total_laminate_cost: t.total_laminate_cost,
        total_ink_cost: t.total_ink_cost,
        total_supplies_cost: t.total_supplies_cost,
        labor_hours: t.labor_hours,
        labor_cost: t.labor_cost,
        subtotal: t.subtotal,
        markup_amount: t.markup_amount,
        total_cost: t.total_cost,
      });

      if (estimateId) {
        const est = await base44.entities.AllInOneEstimate.get(estimateId);
        const line_items = (est.line_items || []).map((l) =>
          l.project_id === project.id
            ? { ...l, total_snapshot: t.total_cost, updated_date_snapshot: new Date().toISOString() }
            : l
        );
        await base44.entities.AllInOneEstimate.update(estimateId, { line_items });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link
            to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
          >
            <ArrowLeft className="w-4 h-4" /> Back to estimate
          </Link>
          <Button onClick={handleSave} disabled={saving} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Section"}
          </Button>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Vinyl & Graphics</h1>
          <p className="text-sm text-gray-500">{project.client_name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <label className="text-xs text-gray-500">
                Section name
                <Input
                  value={project.project_name || ""}
                  onChange={(e) => patch({ project_name: e.target.value })}
                />
              </label>
            </div>

            <VinylRatesPanel project={project} onChange={patch} />

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Graphics</h2>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4" /> Add Graphic
              </Button>
            </div>

            {calc.items.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                No graphics yet — add one to start.
              </div>
            ) : (
              <div className="space-y-3">
                {calc.items.map((item, index) => (
                  <VinylItemCard
                    key={index}
                    item={item}
                    index={index}
                    vinyls={vinyls}
                    laminates={laminates}
                    onChange={patchItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <VinylTotals totals={calc.totals} />
          </div>
        </div>
      </div>
    </div>
  );
}