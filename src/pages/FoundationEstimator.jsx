import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import FoundationItemCard from "@/components/estimator/foundation/FoundationItemCard";
import FoundationRatesPanel from "@/components/estimator/foundation/FoundationRatesPanel";
import FoundationEquipmentPanel from "@/components/estimator/foundation/FoundationEquipmentPanel";
import FoundationTotals from "@/components/estimator/foundation/FoundationTotals";
import ConcreteDeliveryPanel from "@/components/estimator/foundation/ConcreteDeliveryPanel";
import FoundationBOM from "@/components/estimator/foundation/FoundationBOM";
import FoundationWallsPanel from "@/components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "@/components/estimator/foundation/FoundationWallCapsPanel";
import { calcProject } from "@/components/estimator/foundation/foundationCalc";
import { normalizeConcreteSupplier } from "@/components/estimator/foundation/legacyFoundationCalc";

const blankItem = (type) => ({
  foundation_type: type,
  description: "",
  quantity: 1,
  length_inches: type === "spread_foot" ? 36 : 0,
  width_inches: type === "spread_foot" ? 36 : 0,
  diameter: type === "pillar" ? 24 : 0,
  depth_inches: 42,
  grade_offset_inches: 0,
  include_rebar: true,
  include_forming: true,
  include_finishing: true,
  rebar_size: "#4",
  rebar_spacing_length: 12,
  rebar_spacing_width: 12,
  rebar_layers: 1,
  pillar_rebar_size: "#4",
  pillar_rebar_layers: 1,
  pillar_vertical_rebar_count: 4,
  excavation_method: "hand_dig",
  is_new_sign_location: false,
  mortar_gap_inches: 0.375,
  wall_width_inches: 8,
});

export default function FoundationEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      base44.entities.FoundationProject.get(id),
      base44.entities.FoundationInventory.filter({ show_in_foundation: true }),
      base44.entities.LaborServiceInventory.filter({ service_category: "concrete_service", is_active: true }),
      base44.entities.Settings.list(),
    ]).then(([proj, inv, concreteServices, settingRows]) => {
      setProject(proj);
      setInventory([...(inv || []), ...(concreteServices || []).map(normalizeConcreteSupplier)]);
      setSettings(
        Object.fromEntries((settingRows || []).map((s) => [s.setting_name, s.setting_value]))
      );
      setLoading(false);
    });
  }, [id]);

  const calc = useMemo(
    () => (project ? calcProject(project, inventory, settings) : null),
    [project, inventory, settings]
  );

  const catalog = useMemo(
    () => ({
      concrete: inventory.filter((i) => ["concrete_service", "bagged_concrete"].includes(i.material_type)),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment"),
    }),
    [inventory]
  );

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Foundation section not found.</div>;

  const patch = (changes) => setProject((prev) => ({ ...prev, ...changes }));

  const patchItem = (index, changes) =>
    setProject((prev) => ({
      ...prev,
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));

  const removeItem = (index) =>
    setProject((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));

  const addItem = (type) =>
    setProject((prev) => ({ ...prev, items: [...(prev.items || []), blankItem(type)] }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.FoundationProject.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        items: calc.items,
        selected_equipment: calc.equipment,
        walls: calc.walls,
        wall_caps: project.wall_caps || [],
        excavation_method: project.excavation_method,
        concrete_cost_per_cy: project.concrete_cost_per_cy,
        rebar_cost_per_ft: project.rebar_cost_per_ft,
        forming_materials_cost_spread_foot: project.forming_materials_cost_spread_foot,
        forming_materials_cost_pillar: project.forming_materials_cost_pillar,
        min_excavation_time_hours: project.min_excavation_time_hours,
        hand_dig_excavation_cost_per_cy: project.hand_dig_excavation_cost_per_cy,
        equipment_excavation_cost_per_cy: project.equipment_excavation_cost_per_cy,
        forming_labor_rate: project.forming_labor_rate,
        pouring_labor_rate: project.pouring_labor_rate,
        finishing_labor_rate: project.finishing_labor_rate,
        hand_dig_labor_rate: project.hand_dig_labor_rate,
        equipment_excavation_labor_rate: project.equipment_excavation_labor_rate,
        total_concrete_cost: calc.totals.total_concrete_cost,
        total_rebar_cost: calc.totals.total_rebar_cost,
        total_excavation_cost: calc.totals.total_excavation_cost,
        total_labor_cost: calc.totals.total_labor_cost,
        total_equipment_cost: calc.totals.total_equipment_cost,
        total_forming_materials_cost: calc.totals.total_forming_materials_cost,
        total_pole_cost: calc.totals.total_pole_cost,
        total_pole_painting_cost: calc.totals.total_pole_painting_cost,
        total_brick_cost: calc.totals.total_brick_cost,
        total_fill_cost: calc.totals.total_fill_cost,
        total_wall_cost: calc.totals.total_wall_cost,
        total_wall_cap_cost: calc.totals.total_wall_cap_cost,
      });

      // Push the new total back to the parent estimate's section line.
      if (estimateId) {
        const est = await base44.entities.AllInOneEstimate.get(estimateId);
        const line_items = (est.line_items || []).map((l) =>
          l.project_id === project.id
            ? { ...l, total_snapshot: calc.totals.grand_total, updated_date_snapshot: new Date().toISOString() }
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
      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <Link
            to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"}
            className="flex items-center gap-1 text-sm text-gray-600 hover:text-red-600"
          >
            <ArrowLeft className="w-4 h-4" /> Back to estimate
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/FoundationCatalog" className="text-sm text-gray-600 hover:text-red-600">
              Catalog
            </Link>
            <Button onClick={handleSave} disabled={saving} className="clay-button border-2 border-red-300 bg-red-50 hover:bg-red-100 text-red-700 font-bold">
              <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save Section"}
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Concrete | Masonry | Poles</h1>
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

            <ConcreteDeliveryPanel project={project} delivery={calc.delivery} onChange={patch} />

            <FoundationRatesPanel project={project} onChange={patch} />

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Foundations</h2>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => addItem("spread_foot")}>
                  <Plus className="w-4 h-4" /> Spread Footing
                </Button>
                <Button variant="outline" size="sm" onClick={() => addItem("pillar")}>
                  <Plus className="w-4 h-4" /> Pillar
                </Button>
              </div>
            </div>

            {calc.items.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-gray-500">
                No foundations yet — add a spread footing or pillar to start.
              </div>
            ) : (
              <div className="space-y-3">
                {calc.items.map((item, index) => (
                  <FoundationItemCard
                    key={index}
                    item={item}
                    index={index}
                    catalog={catalog}
                    onChange={patchItem}
                    onRemove={removeItem}
                  />
                ))}
              </div>
            )}

            <FoundationWallsPanel
              walls={calc.walls}
              options={catalog.walls}
              onChange={(walls) => patch({ walls })}
            />

            <FoundationWallCapsPanel
              caps={calc.wallCaps}
              walls={calc.walls}
              options={catalog.caps}
              onChange={(wall_caps) => patch({ wall_caps })}
            />

            <FoundationBOM
              items={calc.items}
              delivery={calc.delivery}
              totals={calc.totals}
              inventory={inventory}
            />

            <FoundationEquipmentPanel
              equipment={calc.equipment}
              options={catalog.equipment}
              onChange={(rows) => patch({ selected_equipment: rows })}
            />
          </div>

          <div>
            <FoundationTotals totals={calc.totals} />
          </div>
        </div>
      </div>
    </div>
  );
}