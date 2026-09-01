import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Plus,
  Anchor as AnchorIcon,
  Wrench as WrenchIcon,
  LayoutGrid,
  Layers,
  ClipboardList,
  TrendingUp,
  Trees,
  Tag,
} from "lucide-react";
import FoundationItemCard from "@/components/estimator/foundation/FoundationItemCard";
import FoundationRatesPanel from "@/components/estimator/foundation/FoundationRatesPanel";
import FoundationEquipmentTab from "@/components/estimator/foundation/FoundationEquipmentTab";
import FoundationTotals from "@/components/estimator/foundation/FoundationTotals";
import ConcreteDeliveryPanel from "@/components/estimator/foundation/ConcreteDeliveryPanel";
import FoundationBOM from "@/components/estimator/foundation/FoundationBOM";
import FoundationWallsPanel from "@/components/estimator/foundation/FoundationWallsPanel";
import FoundationWallCapsPanel from "@/components/estimator/foundation/FoundationWallCapsPanel";
import FoundationPolesPanel from "@/components/estimator/foundation/FoundationPolesPanel";
import FoundationToolbar from "@/components/estimator/foundation/FoundationToolbar";
import FoundationSectionBanner from "@/components/estimator/foundation/FoundationSectionBanner";
import AiEngineeringAssistant from "@/components/estimator/foundation/AiEngineeringAssistant";
import Foundation3DPreview from "@/components/estimator/foundation/Foundation3DPreview";
import FoundationTemplateDialog from "@/components/estimator/foundation/FoundationTemplateDialog";
import FoundationLayoutCanvas from "@/components/estimator/foundation/FoundationLayoutCanvas";
import SignageCabinetsPanel from "@/components/estimator/foundation/SignageCabinetsPanel";
import LandscapeDesigner from "@/components/estimator/foundation/LandscapeDesigner";
import CustomerPricingPanel from "@/components/estimator/foundation/CustomerPricingPanel";
import { landscapeSummary } from "@/components/estimator/foundation/landscapeMaterials";
import { calcProject, money } from "@/components/estimator/foundation/foundationCalc";
import { normalizeConcreteSupplier } from "@/components/estimator/foundation/legacyFoundationCalc";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";

const blankItem = (type) => ({
  // Defaults mirror SignEstimate Pro `newItem()` exactly. CCS still lets the
  // user choose Spread Foot or Pillar at add-time; only the type is overridden.
  foundation_type: type || "spread_foot",
  description: "",
  quantity: 1,
  length_inches: 48,
  width_inches: 48,
  diameter: 24,
  depth_inches: 36,
  grade_offset_inches: 0,
  include_rebar: false,
  include_forming: false,
  include_finishing: false,
  rebar_size: "#4",
  rebar_spacing_length: 12,
  rebar_spacing_width: 12,
  rebar_layers: 1,
  rebar_layer_separation_inches: 12,
  pillar_rebar_size: "#4",
  pillar_rebar_hoop_diameter: 20,
  pillar_rebar_layer_separation_inches: 12,
  pillar_rebar_layers: 1,
  pillar_vertical_rebar_count: 4,
  selected_pole_id: "",
  pole_offset_from_bottom_inches: 0,
  pole_total_height_inches: 0,
  include_pole_painting: false,
  custom_concrete_cost_per_cy: null,
  custom_rebar_cost_per_ft: null,
  excavation_method: "hand_dig",
  selected_concrete_id: "",
  is_new_sign_location: false,
  mortar_gap_inches: 0.375,
  wall_width_inches: 8,
});

const TAB_CLASS =
  "gap-1.5 text-[12px] data-[state=active]:bg-red-600 data-[state=active]:text-white rounded-sm";

export default function FoundationEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const params = new URLSearchParams(window.location.search);
  const id = embeddedProjectId || params.get("id");
  const estimateId = embeddedEstimateId || params.get("estimateId");
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [inventory, setInventory] = useState([]);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [autoSave, setAutoSave] = useState(false);
  const [history, setHistory] = useState({ past: [], future: [] });
  const [templateMode, setTemplateMode] = useState(null);
  const [showHelp, setShowHelp] = useState(false);
  const saveRef = useRef(null);

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
      setProject({
        ...proj,
        excavation_method: proj.excavation_method || "hand_dig",
        project_concrete_type: proj.project_concrete_type || "4000_ae",
        project_concrete_admixtures: proj.project_concrete_admixtures || [],
        items: proj.items || [],
        walls: proj.walls || [],
        poles: proj.poles || [],
        wall_caps: proj.wall_caps || [],
        signage_cabinets: proj.signage_cabinets || [],
        landscape: proj.landscape || { cell_size_inches: 12, cells: {} },
        selected_equipment: proj.selected_equipment || [],
      });
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
      concrete: inventory.filter((i) =>
        ["concrete_service", "bagged_concrete"].includes(i.material_type) &&
        i.show_in_foundation !== false
      ),
      poles: inventory.filter((i) => i.material_type === "pole"),
      walls: inventory.filter((i) => ["brick_stone", "wall_material"].includes(i.material_type)),
      fill: inventory.filter((i) => i.material_type === "fill_material"),
      forming: inventory.filter((i) => ["forming", "forming_material"].includes(i.material_type)),
      caps: inventory.filter((i) => i.material_type === "wall_cap"),
      equipment: inventory.filter((i) => i.material_type === "excavation_equipment"),
    }),
    [inventory]
  );

  // Auto-save (debounced)
  useEffect(() => {
    if (!autoSave || !dirty) return;
    const t = setTimeout(() => saveRef.current?.(), 2000);
    return () => clearTimeout(t);
  }, [autoSave, dirty, project]);

  if (loading) return <div className="p-10 text-center text-gray-400">Loading section…</div>;
  if (!project) return <div className="p-10 text-center text-gray-500">Foundation section not found.</div>;

  const commit = (updater) => {
    setHistory((h) => ({ past: [...h.past.slice(-40), project], future: [] }));
    setProject((prev) => ({ ...prev, ...updater(prev) }));
    setDirty(true);
  };

  const patch = (changes) => commit(() => changes);

  const patchItem = (index, changes) =>
    commit((prev) => ({
      items: prev.items.map((it, i) => (i === index ? { ...it, ...changes } : it)),
    }));

  const removeItem = (index) =>
    commit((prev) => ({ items: prev.items.filter((_, i) => i !== index) }));

  const duplicateItem = (index) =>
    commit((prev) => {
      const items = [...prev.items];
      items.splice(index + 1, 0, { ...items[index] });
      return { items };
    });

  const addItem = (type) => commit((prev) => ({ items: [...(prev.items || []), blankItem(type)] }));

  const cabinetCost = (project.signage_cabinets || []).reduce(
    (s, c) => s + (c.unit_cost || 0) * (c.quantity || 1),
    0
  );
  const landscapeCost = landscapeSummary(project.landscape).total;
  const sectionTotal = calc.totals.grand_total + cabinetCost + landscapeCost;

  const undo = () => {
    if (!history.past.length) return;
    const prevState = history.past[history.past.length - 1];
    setHistory((h) => ({ past: h.past.slice(0, -1), future: [project, ...h.future] }));
    setProject(prevState);
    setDirty(true);
  };

  const redo = () => {
    if (!history.future.length) return;
    const nextState = history.future[0];
    setHistory((h) => ({ past: [...h.past, project], future: h.future.slice(1) }));
    setProject(nextState);
    setDirty(true);
  };

  const payload = () => ({
    project_name: project.project_name,
    notes: project.notes,
    status: "calculated",
    items: calc.items,
    selected_equipment: calc.equipment,
    walls: calc.walls,
    // Persist the calculated snapshots too. SignEstimate Pro stored raw pole/cap
    // placement; CCS keeps those original fields plus their calculated values so
    // a later Builder/BOM sync can preserve the exact accepted cost without
    // requiring a live catalog recalc.
    wall_caps: calc.wallCaps,
    poles: calc.poles,
    signage_cabinets: project.signage_cabinets || [],
    landscape: project.landscape || { cell_size_inches: 12, cells: {} },
    total_signage_cabinet_cost: cabinetCost,
    total_landscape_cost: landscapeCost,
    customer_markup_percent: project.customer_markup_percent || 0,
    customer_price_override: project.customer_price_override,
    excavation_method: project.excavation_method,
    selected_concrete_id: project.selected_concrete_id,
    project_concrete_type: project.project_concrete_type,
    project_concrete_admixtures: project.project_concrete_admixtures || [],
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
    ai_engineering_recommendation: project.ai_engineering_recommendation,
    ai_engineering_data: project.ai_engineering_data,
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

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.entities.FoundationProject.update(project.id, payload());

      if (estimateId) {
        const savedProject = await base44.entities.FoundationProject.get(project.id);
        await recordBuilderSave({
          estimateId,
          line: { project_id: project.id, module_key: "foundation" },
          sourceProject: {
            ...savedProject,
            items: calc.items,
            selected_equipment: calc.equipment,
            walls: calc.walls,
            poles: calc.poles,
            wall_caps: calc.wallCaps,
            builder_calculation: {
              totals: calc.totals,
              delivery: calc.delivery,
              cabinet_cost: cabinetCost,
              landscape_cost: landscapeCost,
              section_total: sectionTotal,
            },
          },
          liveTotal: sectionTotal,
        });
      }
      setDirty(false);
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };
  saveRef.current = handleSave;

  const backTo = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator";

  const handleSaveAndExit = async () => {
    await handleSave();
    if (embedded) onClose?.();
    else navigate(backTo);
  };

  const handleSaveAsCopy = async () => {
    setSaving(true);
    try {
      const copy = await base44.entities.FoundationProject.create({
        ...payload(),
        project_name: `${project.project_name || "Foundation"} (Copy)`,
        client_name: project.client_name,
        customer_id: project.customer_id,
      });
      navigate(`/FoundationEstimator?id=${copy.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="clay-scope min-h-full bg-gray-50">
      <div className="max-w-[1500px] mx-auto p-4">
        <FoundationSectionBanner sectionName={project.project_name} />

        <FoundationToolbar
          title="Edit Concrete | Masonry | Poles Estimate"
          subtitle="Engineering, foundation, excavation, wall & pole estimating"
          backTo={backTo}
          total={sectionTotal}
          saving={saving}
          dirty={dirty}
          autoSave={autoSave}
          onToggleAutoSave={() => setAutoSave((v) => !v)}
          canUndo={history.past.length > 0}
          canRedo={history.future.length > 0}
          onUndo={undo}
          onRedo={redo}
          onSave={handleSave}
          onSaveAndExit={handleSaveAndExit}
          onSaveAsCopy={handleSaveAsCopy}
          onSaveAsTemplate={() => setTemplateMode("save")}
          onTemplates={() => setTemplateMode("load")}
          onHelp={() => setShowHelp((v) => !v)}
          onBack={embedded ? onClose : undefined}
        />

        {showHelp && (
          <div className="bg-blue-50 border border-blue-200 rounded-sm p-3 mb-3 text-[12px] text-blue-900">
            Add each footing or pillar under <b>Foundation</b>, then place poles, masonry walls and caps
            in the other tabs. Concrete, rebar, excavation and labor rates come from your settings and
            supplier inventory. The 3D preview on the right updates as you type — left drag orbits,
            right drag pans, scroll zooms. Save & Exit pushes the total back to the combined estimate.
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_560px] gap-4 items-start">
          <div>
            <Tabs defaultValue="foundations">
              <TabsList className="flex flex-wrap h-auto bg-white border border-gray-200 p-1 mb-3 rounded-sm justify-start">
                <TabsTrigger value="foundations" className={TAB_CLASS}>
                  <AnchorIcon className="w-3.5 h-3.5" /> Foundation ({calc.items.length})
                </TabsTrigger>
                <TabsTrigger value="landscape" className={TAB_CLASS}>
                  <LayoutGrid className="w-3.5 h-3.5" /> Walls &amp; Poles (
                  {(calc.walls?.length || 0) + (calc.poles?.length || 0)})
                </TabsTrigger>
                <TabsTrigger value="caps" className={TAB_CLASS}>
                  <Layers className="w-3.5 h-3.5" /> Wall Caps
                </TabsTrigger>
                <TabsTrigger value="signage" className={TAB_CLASS}>
                  <Trees className="w-3.5 h-3.5" /> Signage &amp; Landscape
                </TabsTrigger>
                <TabsTrigger value="equipment" className={TAB_CLASS}>
                  <WrenchIcon className="w-3.5 h-3.5" /> Equipment
                </TabsTrigger>
                <TabsTrigger value="summary" className={TAB_CLASS}>
                  <TrendingUp className="w-3.5 h-3.5" /> Cost Summary
                </TabsTrigger>
                <TabsTrigger value="bom" className={TAB_CLASS}>
                  <ClipboardList className="w-3.5 h-3.5" /> Bill of Materials
                </TabsTrigger>
                <TabsTrigger value="pricing" className={TAB_CLASS}>
                  <Tag className="w-3.5 h-3.5" /> Customer Pricing
                </TabsTrigger>
              </TabsList>

              <TabsContent value="foundations" className="space-y-3">
                <AiEngineeringAssistant project={project} onResult={patch} />

                {calc.items.length === 0 ? (
                  <div className="text-center py-12 bg-white rounded-sm border border-dashed border-gray-300 text-[12px] text-gray-500">
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
                        onDuplicate={duplicateItem}
                      />
                    ))}
                  </div>
                )}

                <button
                  onClick={() => addItem("spread_foot")}
                  className="h-[30px] px-3 flex items-center gap-1.5 rounded-sm border border-gray-300 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Foundation Item
                </button>
              </TabsContent>

              <TabsContent value="landscape" className="space-y-4">
                <FoundationWallsPanel
                  walls={calc.walls}
                  options={catalog.walls}
                  onChange={(walls) => patch({ walls })}
                />
                <FoundationPolesPanel
                  poles={calc.poles}
                  options={catalog.poles}
                  items={calc.items}
                  onChange={(poles) => patch({ poles })}
                />
                <FoundationLayoutCanvas
                  items={project.items || []}
                  poles={project.poles || []}
                  onMoveItem={patchItem}
                />
              </TabsContent>

              <TabsContent value="signage" className="space-y-4">
                <SignageCabinetsPanel
                  cabinets={project.signage_cabinets || []}
                  items={project.items || []}
                  poles={project.poles || []}
                  onChange={(signage_cabinets) => patch({ signage_cabinets })}
                />
                <LandscapeDesigner
                  landscape={project.landscape}
                  onChange={(landscape) => patch({ landscape })}
                />
              </TabsContent>

              <TabsContent value="caps">
                <FoundationWallCapsPanel
                  caps={calc.wallCaps}
                  walls={calc.walls}
                  options={catalog.caps}
                  onChange={(wall_caps) => patch({ wall_caps })}
                />
              </TabsContent>

              <TabsContent value="equipment">
                <FoundationEquipmentTab
                  foundationItems={project.items || []}
                  inventory={inventory}
                  selectedEquipmentList={project.selected_equipment || []}
                  onUpdate={(rows) => patch({ selected_equipment: rows })}
                  markDirty={() => setDirty(true)}
                />
              </TabsContent>

              <TabsContent value="summary" className="space-y-3">
                <label className="block bg-white rounded-sm border border-gray-200 p-3 text-[11px] text-gray-500">
                  Section name
                  <Input
                    value={project.project_name || ""}
                    onChange={(e) => patch({ project_name: e.target.value })}
                  />
                </label>
                <ConcreteDeliveryPanel project={project} delivery={calc.delivery} onChange={patch} />
                <FoundationRatesPanel settings={settings} project={project} onChange={patch} />
                <div className="max-w-xl">
                  <FoundationTotals totals={calc.totals} />
                  <div className="mt-3 space-y-1 text-[12px] text-gray-600">
                    <div className="flex justify-between">
                      <span>Signage cabinets</span>
                      <span>{money(cabinetCost)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Site landscaping</span>
                      <span>{money(landscapeCost)}</span>
                    </div>
                  </div>
                  <div className="mt-2 text-right text-[12px] text-gray-500">
                    Section total flowing to estimate: <b className="text-red-700">{money(sectionTotal)}</b>
                  </div>
                  <Link
                    to="/FoundationCatalog"
                    className="inline-block mt-3 text-[12px] text-gray-600 hover:text-red-600"
                  >
                    Manage foundation catalog →
                  </Link>
                </div>
              </TabsContent>

              <TabsContent value="bom">
                <FoundationBOM
                  items={calc.items}
                  poles={calc.poles}
                  walls={calc.walls}
                  delivery={calc.delivery}
                  totals={calc.totals}
                  inventory={inventory}
                />
              </TabsContent>

              <TabsContent value="pricing">
                <CustomerPricingPanel cost={sectionTotal} project={project} onChange={patch} />
              </TabsContent>
            </Tabs>
          </div>

          <div className="xl:sticky xl:top-4">
            <Foundation3DPreview project={project} />
          </div>
        </div>
      </div>

      <FoundationTemplateDialog
        open={!!templateMode}
        mode={templateMode}
        onClose={() => setTemplateMode(null)}
        project={project}
        onApply={(data) => patch(data)}
      />
    </div>
  );
}