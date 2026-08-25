import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Plus, Save } from "lucide-react";
import ChannelItemCard from "@/components/estimator/channel/ChannelItemCard";
import LetterPurchasesPanel from "@/components/estimator/channel/LetterPurchasesPanel";
import ChannelEquipmentPanel from "@/components/estimator/channel/ChannelEquipmentPanel";
import ChannelTotals from "@/components/estimator/channel/ChannelTotals";
import { calcChannelProject } from "@/components/estimator/channel/channelCalc";

const blankItem = () => ({
  description: "",
  install_type: "flush_mount",
  letter_size: "medium",
  qty_letters: 1,
  install_height_feet: 12,
  raceway_length_feet: 0,
  materials: [],
});

const SCOPES = [
  { value: "full", label: "Letters + Install" },
  { value: "install_only", label: "Install only" },
  { value: "letters_only", label: "Letters only" },
];

export default function ChannelLetterEstimator() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const estimateId = params.get("estimateId");

  const [project, setProject] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    Promise.all([
      base44.entities.ChannelLetterInstallation.get(id),
      base44.entities.ChannelLetterInstallInventory.filter({ show_in_install_materials: true }, "sort_order", 500),
      base44.entities.ChannelLetterInstallEquipment.filter({ show_in_channel_letters: true, is_active: true }, "sort_order", 200),
    ]).then(([proj, inv, eq]) => {
      setProject(proj);
      setMaterials(inv || []);
      setEquipment(eq || []);
      setLoading(false);
    });
  }, [id]);

  const calc = useMemo(
    () => (project ? calcChannelProject(project, materials, equipment) : null),
    [project, materials, equipment]
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
      await base44.entities.ChannelLetterInstallation.update(project.id, {
        project_name: project.project_name,
        notes: project.notes,
        status: "calculated",
        project_scope: project.project_scope || "full",
        items: calc.items,
        letter_purchases: calc.letter_purchases,
        selected_equipment: calc.selected_equipment,
        labor_rate_per_hour: project.labor_rate_per_hour,
        raceway_minutes_per_foot: project.raceway_minutes_per_foot,
        travel_miles_round_trip: project.travel_miles_round_trip,
        travel_cost_per_mile: project.travel_cost_per_mile,
        supplies_percent_of_materials: project.supplies_percent_of_materials,
        extra_supplies_cost: project.extra_supplies_cost,
        markup_percent: project.markup_percent,
        letters_delivery_fee: project.letters_delivery_fee,
        letters_design_fee: project.letters_design_fee,
        letters_install_supplies_fee: project.letters_install_supplies_fee,
        letters_permitting_fee: project.letters_permitting_fee,
        letters_other_fee: project.letters_other_fee,
        letters_markup_percent: project.letters_markup_percent,
        letters_subtotal: t.letters_subtotal,
        total_letters_cost: t.total_letters_cost,
        labor_hours: t.labor_hours,
        labor_cost: t.labor_cost,
        total_materials_cost: t.total_materials_cost,
        total_supplies_cost: t.total_supplies_cost,
        total_equipment_cost: t.total_equipment_cost,
        total_personnel_cost: t.total_personnel_cost,
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
          <h1 className="text-2xl font-bold text-gray-900">Channel &amp; Dimensional Letters</h1>
          <p className="text-sm text-gray-500">{project.client_name}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-gray-500">
                Section name
                <Input
                  value={project.project_name || ""}
                  onChange={(e) => patch({ project_name: e.target.value })}
                />
              </label>
              <label className="text-xs text-gray-500">
                Scope
                <select
                  value={project.project_scope || "full"}
                  onChange={(e) => patch({ project_scope: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  {SCOPES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {project.project_scope !== "letters_only" && (
              <>
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">Install Items</h2>
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
                    No install items yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {calc.items.map((item, index) => (
                      <ChannelItemCard
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
              </>
            )}

            {project.project_scope !== "install_only" && (
              <LetterPurchasesPanel
                project={project}
                purchases={calc.letter_purchases}
                totals={calc.totals}
                onChange={patch}
              />
            )}

            <ChannelEquipmentPanel
              project={project}
              selections={calc.selected_equipment}
              catalog={equipment}
              onChange={patch}
            />
          </div>

          <div>
            <ChannelTotals project={project} totals={calc.totals} onChange={patch} />
          </div>
        </div>
      </div>
    </div>
  );
}