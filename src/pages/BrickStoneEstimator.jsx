import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Save } from "lucide-react";
import BrickGeometryPanel from "@/components/estimator/brick/BrickGeometryPanel";
import BrickTotals from "@/components/estimator/brick/BrickTotals";
import { calcBrickStoneProject } from "@/components/estimator/brick/brickCalc";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeBrickStoneProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";

export default function BrickStoneEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id");
  const estimateId = embeddedEstimateId || params.get("estimateId");

  const [project, setProject] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [p, legacyMats, foundationMats] = await Promise.all([
        id ? base44.entities.BrickStoneProject.get(id) : Promise.resolve(null),
        base44.entities.BrickStoneInventory.list("material_name", 500).catch(() => []),
        base44.entities.FoundationInventory.list("material_name", 500).catch(() => []),
      ]);

      // The committed SignEstimate Pro repo defined BrickStoneInventory but never
      // shipped a Brick estimator implementation or any BrickStoneInventory data.
      // Modern Master Inventory stores masonry units in FoundationInventory. Use
      // those rows as the primary catalog while keeping the legacy entity readable
      // for compatibility if an older record is ever encountered.
      const modernMats = (foundationMats || [])
        .filter((row) =>
          row.show_in_foundation !== false && (
            row.material_type === "brick_stone" ||
            (row.material_type === "wall_material" && ["brick", "stone", "cinderblock"].includes(row.wall_material_subtype))
          )
        )
        .map((row) => ({
          ...row,
          length: row.material_type === "brick_stone" ? row.brick_length_inches : row.wall_unit_length_inches,
          width: row.material_type === "brick_stone" ? row.brick_width_inches : row.wall_unit_width_inches,
          height: row.material_type === "brick_stone" ? row.brick_height_inches : row.wall_unit_height_inches,
          _inventory_entity: "FoundationInventory",
        }));
      const legacyNormalized = (legacyMats || []).map((row) => ({
        ...row,
        _inventory_entity: "BrickStoneInventory",
      }));

      setProject(p);
      setMaterials([...modernMats, ...legacyNormalized]);
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
      const pricingProject = {
        ...project,
        material_cost: totals.material_cost,
        mortar_cost: totals.mortar_cost,
        labor_cost: totals.labor_cost,
        subtotal: totals.subtotal,
      };
      const customerPricing = project.customer_pricing?.applied === true
        ? await calculateSavedCustomerPricing({
            project: pricingProject,
            categorize: categorizeBrickStoneProject,
            tierNumber: project.customer_pricing?.tier_number,
          })
        : project.customer_pricing;
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
        customer_pricing: customerPricing,
      });

      if (estimateId) {
        const savedProject = await base44.entities.BrickStoneProject.get(project.id);
        await recordBuilderSave({
          estimateId,
          line: { project_id: project.id, module_key: "brick_stone" },
          sourceProject: savedProject,
          liveTotal: totals.total_cost,
        });
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
            <BrickTotals
              project={project}
              totals={totals}
              onChange={(changes) => patch({
                ...changes,
                ...(Object.prototype.hasOwnProperty.call(changes, "markup_percent")
                  ? { customer_pricing: { ...(project.customer_pricing || {}), applied: false } }
                  : {}),
              })}
            />
          </div>
        </div>

        <div className="mt-5">
          <CustomerPricingTab
            project={{
              ...project,
              material_cost: totals.material_cost,
              mortar_cost: totals.mortar_cost,
              labor_cost: totals.labor_cost,
              subtotal: totals.subtotal,
            }}
            categorize={categorizeBrickStoneProject}
            accentColor="red"
            onApplyTier={(tier) => patch({
              customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },
            })}
          />
        </div>
      </div>
    </div>
  );
}