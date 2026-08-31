import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import MetalItemCard from "@/components/estimator/metal/MetalItemCard";
import MetalTotals from "@/components/estimator/metal/MetalTotals";
import { calcMetalProject } from "@/components/estimator/metal/metalCalc";

const blankItem = () => ({
  description: "",
  item_type: "channel_letters",
  quantity: 1,
  material_length_ft: 0,
  fabrication_hours: 0,
  welding_hours: 0,
  finishing_hours: 0,
});

export default function MetalEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id");
  const estimateId = embeddedEstimateId || params.get("estimateId");

  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [p, inv] = await Promise.all([
        id ? base44.entities.MetalProject.get(id) : Promise.resolve(null),
        base44.entities.Inventory.list("material_type", 500),
      ]);
      setProject(p);
      setInventory(inv || []);
      setLoading(false);
    };
    load();
  }, [id]);

  const inventoryById = useMemo(
    () => Object.fromEntries(inventory.map((i) => [i.id, i])),
    [inventory]
  );
  const calc = useMemo(
    () => (project ? calcMetalProject(project, inventoryById) : null),
    [project, inventoryById]
  );

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Section not found.</div>;

  const patch = (changes) => setProject((prev) => ({ ...prev, ...changes }));
  const patchItem = (index, changes) =>
    setProject((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));
  const removeItem = (index) =>
    setProject((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const t = calc.totals;
      await base44.entities.MetalProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        items: calc.items.map(({ item_total_cost, ...rest }) => rest),
        fabrication_rate: project.fabrication_rate,
        welding_rate: project.welding_rate,
        finishing_rate: project.finishing_rate,
        supplies_percent_of_materials: project.supplies_percent_of_materials,
        extra_supplies_cost: project.extra_supplies_cost,
        markup_percent: project.markup_percent,
        total_material_cost: t.total_material_cost,
        total_supplies_cost: t.total_supplies_cost,
        total_fabrication_cost: t.total_fabrication_cost,
        total_welding_cost: t.total_welding_cost,
        total_finishing_cost: t.total_finishing_cost,
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
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          {embedded ? (
            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
            >
              <ArrowLeft className="w-4 h-4" /> Back to products
            </button>
          ) : (
            <Link
              to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"}
              className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
            >
              <ArrowLeft className="w-4 h-4" /> Back to estimate
            </Link>
          )}
          <Button onClick={handleSave} disabled={saving} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Section"}
          </Button>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Metal Fabrication</h1>
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

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Fabricated Items</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => patch({ items: [...(project.items || []), blankItem()] })}
              >
                <Plus className="w-4 h-4" /> Add Item
              </Button>
            </div>

            {calc.items.length === 0 ? (
              <div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                No fabricated items yet.
              </div>
            ) : (
              <div className="space-y-3">
                {calc.items.map((item, index) => (
                  <MetalItemCard
                    key={index}
                    item={item}
                    index={index}
                    inventory={inventory}
                    onChange={patchItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <MetalTotals project={project} totals={calc.totals} onChange={patch} />
          </div>
        </div>
      </div>
    </div>
  );
}