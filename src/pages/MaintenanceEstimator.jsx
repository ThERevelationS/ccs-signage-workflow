import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import MaintenanceItemCard from "@/components/estimator/maintenance/MaintenanceItemCard";
import MaintenanceTotals from "@/components/estimator/maintenance/MaintenanceTotals";
import { calcMaintenanceProject } from "@/components/estimator/maintenance/maintenanceCalc";

const blankItem = () => ({
  description: "",
  sign_type: "flush_channel",
  size: "medium",
  qty_letters: 1,
  face_sqft: 0,
  quantity: 1,
  actions: [],
});

export default function MaintenanceEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [rates, setRates] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      base44.entities.MaintenanceProject.get(id),
      base44.entities.MaintenanceActionRate.filter({ is_enabled: true }),
      base44.entities.MaintenanceInventory.list("sort_order", 500),
    ]).then(([proj, r, inv]) => {
      setProject(proj);
      setRates(r || []);
      setMaterials(inv || []);
      setLoading(false);
    });
  }, [id]);

  const calc = useMemo(
    () => (project ? calcMaintenanceProject(project, rates, materials) : null),
    [project, rates, materials]
  );

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Maintenance section not found.</div>;

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
      await base44.entities.MaintenanceProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        items: calc.items,
        labor_rate_per_hour: project.labor_rate_per_hour,
        travel_miles_round_trip: project.travel_miles_round_trip,
        travel_cost_per_mile: project.travel_cost_per_mile,
        supplies_percent_of_materials: project.supplies_percent_of_materials,
        extra_supplies_cost: project.extra_supplies_cost,
        markup_percent: project.markup_percent,
        labor_hours: t.labor_hours,
        labor_cost: t.labor_cost,
        total_materials_cost: t.total_materials_cost,
        total_supplies_cost: t.total_supplies_cost,
        total_equipment_cost: t.total_equipment_cost,
        total_travel_cost: t.total_travel_cost,
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
    <div className="min-h-full bg-slate-50">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link
            to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
          >
            <ArrowLeft className="w-4 h-4" /> Back to estimate
          </Link>
          <Button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Section"}
          </Button>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Sign Maintenance</h1>
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
              <h2 className="font-semibold text-gray-900">Service Items</h2>
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="w-4 h-4" /> Add Sign
              </Button>
            </div>

            {calc.items.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                No service items yet — add a sign to start.
              </div>
            ) : (
              <div className="space-y-3">
                {calc.items.map((item, index) => (
                  <MaintenanceItemCard
                    key={index}
                    item={item}
                    index={index}
                    materials={materials}
                    onChange={patchItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <MaintenanceTotals project={project} totals={calc.totals} onChange={patch} />
          </div>
        </div>
      </div>
    </div>
  );
}