import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import LaserItemCard from "@/components/estimator/laser/LaserItemCard";
import LaserTotals from "@/components/estimator/laser/LaserTotals";
import { calcLaserProject } from "@/components/estimator/laser/laserCalc";

const blankItem = () => ({
  description: "",
  item_type: "panel",
  material_type: "Acrylic",
  quantity: 1,
  cut_speed_ipm: 20,
  engrave_speed_sqipm: 5,
});

export default function LaserEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    base44.entities.LaserProject.get(id).then((p) => {
      setProject(p);
      setLoading(false);
    });
  }, [id]);

  const calc = useMemo(() => (project ? calcLaserProject(project) : null), [project]);

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
      await base44.entities.LaserProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        items: calc.items.map(({ engrave_hours, cut_hours, item_total_cost, ...rest }) => rest),
        machine_rate_per_hour: project.machine_rate_per_hour,
        labor_rate: project.labor_rate,
        engraving_machine_rate_per_hour: project.engraving_machine_rate_per_hour,
        engraving_labor_rate: project.engraving_labor_rate,
        parameter_handling_time_percentage: project.parameter_handling_time_percentage,
        engraving_handling_time_percentage: project.engraving_handling_time_percentage,
        fixed_setup_hours: project.fixed_setup_hours,
        fixed_material_setup_cost: project.fixed_material_setup_cost,
        total_machine_cost: t.total_machine_cost,
        total_labor_cost: t.total_labor_cost,
        total_supplies_cost: t.total_supplies_cost,
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
          <h1 className="text-2xl font-bold text-gray-900">Laser</h1>
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
              <h2 className="font-semibold text-gray-900">Laser Items</h2>
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
                No laser items yet.
              </div>
            ) : (
              <div className="space-y-3">
                {calc.items.map((item, index) => (
                  <LaserItemCard
                    key={index}
                    item={item}
                    index={index}
                    onChange={patchItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}
          </div>

          <div>
            <LaserTotals project={project} totals={calc.totals} onChange={patch} />
          </div>
        </div>
      </div>
    </div>
  );
}