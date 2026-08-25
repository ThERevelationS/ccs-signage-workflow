import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import BrickGeometryPanel from "@/components/estimator/brick/BrickGeometryPanel";
import BrickTotals from "@/components/estimator/brick/BrickTotals";
import { calcBrickStoneProject } from "@/components/estimator/brick/brickCalc";

export default function BrickStoneEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [p, mats] = await Promise.all([
        id ? base44.entities.BrickStoneProject.get(id) : Promise.resolve(null),
        base44.entities.BrickStoneInventory.list("material_name", 500),
      ]);
      setProject(p);
      setMaterials(mats || []);
      setLoading(false);
    };
    load();
  }, [id]);

  const material = useMemo(
    () => materials.find((m) => m.id === project?.selected_material_id),
    [materials, project]
  );
  const totals = useMemo(
    () => (project ? calcBrickStoneProject(project, material) : null),
    [project, material]
  );

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Section not found.</div>;

  const patch = (changes) => setProject((prev) => ({ ...prev, ...changes }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.BrickStoneProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        selected_material_id: project.selected_material_id,
        material_name: project.material_name,
        material_dimensions: project.material_dimensions,
        bricks_along_length: project.bricks_along_length,
        bricks_along_width: project.bricks_along_width,
        courses_high: project.courses_high,
        layers: project.layers,
        mortar_gap: project.mortar_gap,
        waste_factor: project.waste_factor,
        mortar_bag_cost: project.mortar_bag_cost,
        bricks_per_hour: project.bricks_per_hour,
        labor_rate_per_hour: project.labor_rate_per_hour,
        markup_percent: project.markup_percent,
        base_length: totals.derived_length,
        base_width: totals.derived_width,
        base_height: totals.derived_height,
        calculated_bricks: totals.calculated_bricks,
        calculated_surface_area: totals.calculated_surface_area,
        mortar_bags_needed: totals.mortar_bags_needed,
        material_cost: totals.material_cost,
        mortar_cost: totals.mortar_cost,
        labor_hours: totals.labor_hours,
        labor_cost: totals.labor_cost,
        subtotal: totals.subtotal,
        markup_amount: totals.markup_amount,
        total_cost: totals.total_cost,
      });

      if (estimateId) {
        const est = await base44.entities.AllInOneEstimate.get(estimateId);
        const line_items = (est.line_items || []).map((l) =>
          l.project_id === project.id
            ? {
                ...l,
                total_snapshot: totals.total_cost,
                updated_date_snapshot: new Date().toISOString(),
              }
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
          <h1 className="text-2xl font-bold text-gray-900">Brick &amp; Stone</h1>
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

            <BrickGeometryPanel
              project={project}
              materials={materials}
              derived={totals}
              onChange={patch}
            />
          </div>

          <div>
            <BrickTotals project={project} totals={totals} onChange={patch} />
          </div>
        </div>
      </div>
    </div>
  );
}