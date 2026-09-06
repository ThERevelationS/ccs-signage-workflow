import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { MaintenanceProject, MaintenanceActionRate, Settings } from "@/entities/all";
import { useSearchParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Wrench, FileText, ListChecks, HardHat, Calculator, MapPin, Package, ClipboardCheck, TrendingUp } from "lucide-react";
import ServiceItemRow from "@/components/signMaintenance/ServiceItemRow";
import EquipmentSelector from "@/components/channelLetterInstall/EquipmentSelector";
import LadderSelector from "@/components/channelLetterInstall/LadderSelector";
import PersonnelSelector from "@/components/channelLetterInstall/PersonnelSelector";
import TravelCostCard from "@/components/channelLetterInstall/TravelCostCard";
import AddressAutocomplete from "@/components/channelLetterInstall/AddressAutocomplete";
import { calcServiceItem, calcProjectTotals, defaultMaterialsForItem, emptyServiceItem } from "@/components/signMaintenance/maintenanceCalculator";
import { loadMaintenanceMaterialRules } from "@/components/signMaintenance/maintenanceMaterialRules";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { preflightBuilderSourceMutation, updateBuilderSourceProject } from "@/components/estimator/builder/sourceProjectPersistence";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeMaintenanceProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const blankProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  install_environment: "exterior",
  items: [],
  selected_equipment: [],
  personnel: [],
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  supplies_percent_of_materials: 10,
  extra_supplies_cost: 0,
  markup_percent: 0,
  notes: "",
});

export default function MaintenanceEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [searchParams] = useSearchParams();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);

  const [project, setProject] = useState(blankProject());
  const [settings, setSettings] = useState({});
  const [inventory, setInventory] = useState([]);
  const [equipmentInventory, setEquipmentInventory] = useState([]);
  const [rates, setRates] = useState([]);
  const [estimateContext, setEstimateContext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState(embedded ? "items" : "project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });

  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
  }, [editId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [s, inv, equipInv, r, existing, estimate] = await Promise.all([
        Settings.list(),
        loadMaintenanceMaterialRules({ includeInactive: true }).then((data) => data.rules),
        base44.entities.ChannelLetterInstallEquipment.list("sort_order", 500),
        MaintenanceActionRate.list(),
        editId ? MaintenanceProject.get(editId) : Promise.resolve(null),
        estimateId ? base44.entities.AllInOneEstimate.get(estimateId) : Promise.resolve(null),
      ]);
      const sObj = {};
      (s || []).forEach(x => { sObj[x.setting_name] = x.setting_value; });
      setSettings(sObj);
      setInventory(inv || []);
      setEquipmentInventory((equipInv || [])
        .filter((row) => row.is_active !== false && row.show_in_sign_maintenance !== false)
        .map((row) => ({ ...row, _inventory_entity: "ChannelLetterInstallEquipment" })));

      setRates(r || []);
      setEstimateContext(estimate || null);

      if (existing) {
        setProject({
          ...blankProject(),
          ...existing,
          client_name: estimate?.client_name || existing.client_name,
          customer_id: estimate?.customer_id || existing.customer_id,
          estimate_number: estimate?.estimate_number || existing.estimate_number,
          site_address: existing.site_address || estimate?.site_address || "",
          items: existing.items || [],
        });
        setIsEditing(true);
      } else {
        setProject(prev => ({
          ...prev,
          client_name: estimate?.client_name || prev.client_name,
          customer_id: estimate?.customer_id,
          estimate_number: estimate?.estimate_number || prev.estimate_number,
          site_address: estimate?.site_address || prev.site_address,
        }));
        setIsEditing(false);
      }
    } catch (e) {
      console.error("Load error:", e);
      setLoadError(e?.message || "Maintenance Builder prerequisites could not be verified.");
    } finally {
      setLoading(false);
    }
  }, [editId, estimateId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Recalc everything on change
  const recalculated = useMemo(() => {
    if (!settings || Object.keys(settings).length === 0) return project;
    const items = (project.items || []).map(it => calcServiceItem(it, settings, rates, inventory));
    const totals = calcProjectTotals({ ...project, items });
    return { ...project, items, ...totals };
  }, [project, settings, rates, inventory]);

  const updateProject = (patch) => setProject(prev => ({ ...prev, ...patch }));

  const updateItem = (idx, updated) => {
    const next = [...project.items];
    next[idx] = updated;
    // When sign_type or actions change, re-pull defaults
    if (updated.sign_type !== project.items[idx]?.sign_type || JSON.stringify(updated.actions) !== JSON.stringify(project.items[idx]?.actions) || updated.size !== project.items[idx]?.size) {
      updated.materials = defaultMaterialsForItem(updated, inventory);
      next[idx] = updated;
    }
    setProject(prev => ({ ...prev, items: next }));
  };

  const addItem = () => {
    const it = emptyServiceItem();
    it.materials = defaultMaterialsForItem(it, inventory);
    setProject(prev => ({ ...prev, items: [...prev.items, it] }));
    setActiveTab("items");
  };

  const removeItem = (idx) => {
    const next = [...project.items];
    next.splice(idx, 1);
    setProject(prev => ({ ...prev, items: next }));
  };

  const duplicateItem = (idx) => {
    const copy = JSON.parse(JSON.stringify(project.items[idx]));
    const next = [...project.items];
    next.splice(idx + 1, 0, copy);
    setProject(prev => ({ ...prev, items: next }));
  };

  const saveProject = async () => {
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in Project Name and Client Name.");
      setActiveTab("project");
      return;
    }
    setSaving(true);
    try {
      const pricingProject = {
        ...recalculated,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        site_address: project.site_address || estimateContext?.site_address || "",
      };
      const customerPricing = project.customer_pricing?.applied === true
        ? await calculateSavedCustomerPricing({
            project: pricingProject,
            categorize: categorizeMaintenanceProject,
            tierNumber: project.customer_pricing?.tier_number,
          })
        : project.customer_pricing;
      const dataToSave = {
        ...pricingProject,
        customer_pricing: customerPricing,
        status: "calculated",
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: MaintenanceProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: dataToSave,
          estimateId,
          label: "Maintenance project",
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(dataToSave);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("maintenance_project"),
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: MaintenanceProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: dataToSave,
          label: "Maintenance project",
        });
        if (!saved?.id) throw new Error("Maintenance project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;

      if (estimateId && savedId) {
        const refreshed = await MaintenanceProject.get(savedId).catch(() => ({ ...dataToSave, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "maintenance" },
          sourceProject: refreshed,
          liveTotal: recalculated.total_cost || 0,
        });
      }

      setProject((prev) => ({ ...prev, ...dataToSave, id: savedId || prev.id }));
      onSaved?.();
      if (!embedded) alert(isEditing ? "Estimate updated." : "Estimate saved.");
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading…</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
        <div className="max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800">
          <div className="font-bold">Maintenance Builder unavailable</div>
          <div className="mt-1 text-sm">Required Settings, maintenance material rules, equipment, labor rates, project data, or estimate context could not be verified. Fallback configuration was not used.</div>
          <div className="mt-2 text-xs break-words">{loadError}</div>
          <Button variant="outline" className="mt-4" onClick={() => embedded ? onClose?.() : (window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : '/Estimator')}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Wrench className="w-8 h-8 text-cyan-600" />
              {isEditing ? "Edit" : "New"} Sign Maintenance Estimate
            </h1>
            <p className="text-slate-600">Cleaning, repaints, LED retrofits, electrical, and more.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Link to="/MasterInventory">
              <Button variant="outline" className="bg-white"><Package className="w-4 h-4 mr-2" /> Master Inventory</Button>
            </Link>
            <Button variant="outline" onClick={() => embedded ? onClose?.() : (window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : '/Estimator')}>
              <ArrowLeft className="w-4 h-4 mr-2" /> {embedded ? 'Back to Products' : 'Back to Estimator'}
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                <TabsList className="grid w-full grid-cols-5 bg-white shadow-md border border-slate-200 h-auto p-1 gap-1">
                  <TabsTrigger value="project" className="py-2 text-xs"><FileText className="w-3.5 h-3.5 mr-1" />{embedded ? "Options" : "Project"}</TabsTrigger>
                  <TabsTrigger value="items" className="py-2 text-xs">
                    <ListChecks className="w-3.5 h-3.5 mr-1" />Service Items
                    {recalculated.items?.length > 0 && <span className="ml-1 text-[10px] bg-slate-100 px-1.5 rounded-full">{recalculated.items.length}</span>}
                  </TabsTrigger>
                  <TabsTrigger value="labor" className="py-2 text-xs"><HardHat className="w-3.5 h-3.5 mr-1" />Labor</TabsTrigger>
                  <TabsTrigger value="summary" className="py-2 text-xs"><Calculator className="w-3.5 h-3.5 mr-1" />Summary</TabsTrigger>
                  <TabsTrigger value="pricing" className="py-2 text-xs"><TrendingUp className="w-3.5 h-3.5 mr-1" />Pricing</TabsTrigger>
                </TabsList>
              </div>

              {/* PROJECT TAB */}
              <TabsContent value="project" className="mt-4 space-y-4">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg">{embedded ? "Section Options" : "Project Information"}</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    {!embedded && (
                      <>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <Label>Client Name *</Label>
                            <Input
                              value={project.client_name || ''}
                              onChange={(e) => updateProject({ client_name: e.target.value })}
                              className="mt-1"
                              placeholder="Enter client name"
                            />
                          </div>
                          <div>
                            <Label>Project Name *</Label>
                            <Input value={project.project_name} onChange={(e) => updateProject({ project_name: e.target.value })} placeholder="e.g. Main St Sign — Annual Service" className="mt-1" />
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <Label>Estimate Number *</Label>
                            <Input value={project.estimate_number} onChange={(e) => updateProject({ estimate_number: e.target.value })} placeholder="e.g. SVC-2026-001" className="mt-1" />
                          </div>
                          <div>
                            <Label>Project Link <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                            <Input value={project.hyperlink} onChange={(e) => updateProject({ hyperlink: e.target.value })} placeholder="https://…" className="mt-1" />
                          </div>
                        </div>
                      </>
                    )}

                    <div>
                      <Label className="text-sm font-semibold text-slate-900">Service Environment</Label>
                      <p className="text-xs text-slate-500 mt-1 mb-2">Interior or exterior service call — drives some labor multipliers.</p>
                      <div className="grid grid-cols-2 gap-2 max-w-md">
                        {[
                          { value: "exterior", label: "Exterior", desc: "Outdoor signs, monuments, pylons", color: "blue" },
                          { value: "interior", label: "Interior", desc: "Lobby signs, indoor wall signs", color: "amber" },
                        ].map(opt => {
                          const active = (project.install_environment || "exterior") === opt.value;
                          const ring = opt.color === "blue"
                            ? (active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")
                            : (active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300");
                          return (
                            <button key={opt.value} type="button" onClick={() => updateProject({ install_environment: opt.value })}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${ring}`}>
                              <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <Label className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-cyan-600" />
                        Site Address
                        <span className="text-xs font-normal text-slate-500">(used for travel mileage)</span>
                      </Label>
                      <AddressAutocomplete value={project.site_address || ""} onChange={(v) => updateProject({ site_address: v })} placeholder="e.g., 123 Main St, Cincinnati, OH 45202" className="mt-1" />
                    </div>
                  </CardContent>
                </Card>

                {!embedded && (
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
                  <CardContent>
                    <Textarea value={project.notes} onChange={(e) => updateProject({ notes: e.target.value })} placeholder="Service notes, customer history, special considerations…" className="h-32" />
                  </CardContent>
                </Card>
                )}

                <div className="flex justify-end">
                  <Button onClick={() => setActiveTab("items")} className="bg-cyan-600 hover:bg-cyan-700 text-white">Continue to Service Items →</Button>
                </div>
              </TabsContent>

              {/* SERVICE ITEMS TAB */}
              <TabsContent value="items" className="mt-4 space-y-3">
                <div className="flex items-center justify-end gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
                  <Button onClick={addItem} size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add Service Item
                  </Button>
                </div>

                {recalculated.items.length === 0 ? (
                  <Card className="border-2 border-dashed border-slate-300 bg-white/50">
                    <CardContent className="p-12 text-center text-slate-500">
                      <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="mb-3 font-medium">No service items yet</p>
                      <p className="text-xs mb-4">Add a sign that needs maintenance to get started.</p>
                      <Button onClick={addItem} className="bg-cyan-600 hover:bg-cyan-700 text-white">
                        <Plus className="w-4 h-4 mr-2" /> Add Service Item
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {recalculated.items.map((it, idx) => (
                      <ServiceItemRow
                        key={idx}
                        item={it}
                        index={idx}
                        settings={settings}
                        rates={rates}
                        materialRules={inventory}
                        onUpdate={updateItem}
                        onRemove={removeItem}
                        onDuplicate={duplicateItem}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* LABOR TAB */}
              <TabsContent value="labor" className="mt-4 space-y-3">
                <EquipmentSelector
                  selectedEquipment={recalculated.selected_equipment || []}
                  onChange={(next) => updateProject({ selected_equipment: next })}
                  equipmentInventory={equipmentInventory}
                  items={recalculated.items}
                  projectLaborHours={recalculated.labor_hours || 0}
                />
                <LadderSelector
                  selectedEquipment={recalculated.selected_equipment || []}
                  onChange={(next) => updateProject({ selected_equipment: next })}
                  equipmentInventory={equipmentInventory}
                  projectLaborHours={recalculated.labor_hours || 0}
                  crewSize={(recalculated.personnel || []).length}
                />
                <PersonnelSelector
                  personnel={recalculated.personnel || []}
                  onChange={(next) => updateProject({ personnel: next })}
                  projectLaborHours={recalculated.labor_hours || 0}
                  roleRates={{
                    "Crew Lead": parseFloat(settings.maintenance_crew_lead_rate) || 75,
                    "Installer": parseFloat(settings.maintenance_tech_rate) || 65,
                    "Helper":    parseFloat(settings.maintenance_helper_rate) || 35,
                  }}
                  items={recalculated.items}
                />
                <TravelCostCard
                  shopAddress={settings.maintenance_shop_address || settings.install_shop_address || ""}
                  siteAddress={project.site_address || ""}
                  selectedEquipment={recalculated.selected_equipment || []}
                  equipmentInventory={equipmentInventory}
                  personnel={recalculated.personnel || []}
                  settings={{
                    ...settings,
                    install_gasoline_price_per_gallon: settings.maintenance_gasoline_price_per_gallon ?? settings.install_gasoline_price_per_gallon,
                    install_diesel_price_per_gallon: settings.maintenance_diesel_price_per_gallon ?? settings.install_diesel_price_per_gallon,
                    install_travel_labor_rate: settings.maintenance_travel_labor_rate ?? settings.install_travel_labor_rate,
                    install_travel_avg_speed_mph: settings.maintenance_travel_avg_speed_mph ?? settings.install_travel_avg_speed_mph,
                    install_travel_overhead_per_mile: settings.maintenance_travel_overhead_per_mile ?? settings.install_travel_overhead_per_mile,
                    install_min_travel_charge: settings.maintenance_min_travel_charge ?? settings.install_min_travel_charge,
                  }}
                  travelMiles={project.travel_miles_round_trip || 0}
                  onMilesChange={(m) => updateProject({ travel_miles_round_trip: m })}
                  onTotalChange={(t) => {
                    if ((project.total_travel_cost || 0) !== t) updateProject({ total_travel_cost: t });
                  }}
                  autoTriggerKey={activeTab === "labor" ? "labor" : null}
                />
              </TabsContent>

              {/* SUMMARY TAB */}
              <TabsContent value="summary" className="mt-4 space-y-3">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg">Cost Breakdown</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <Row label="Labor"             value={recalculated.labor_cost} />
                      <Row label="Materials"         value={recalculated.total_materials_cost} />
                      <Row label="Supplies"          value={recalculated.total_supplies_cost} />
                      <Row label="Equipment"         value={recalculated.total_equipment_cost} />
                      <Row label="Personnel"         value={recalculated.total_personnel_cost} />
                      <Row label="Travel"            value={recalculated.total_travel_cost} />
                      <div className="border-t border-slate-200 pt-2 mt-2 flex justify-between font-semibold">
                        <span>Subtotal</span><span className="tabular-nums">{fmt(recalculated.subtotal)}</span>
                      </div>
                      <Row label={`Markup (${recalculated.markup_percent || 0}%)`} value={recalculated.markup_amount} />
                      <div className="border-t-2 border-slate-300 pt-2 mt-2 flex justify-between text-base font-bold text-cyan-700">
                        <span>Total</span><span className="tabular-nums">{fmt(recalculated.total_cost)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CUSTOMER PRICING TAB */}
              <TabsContent value="pricing" className="mt-4 space-y-3">
                <CustomerPricingTab
                  project={recalculated}
                  categorize={categorizeMaintenanceProject}
                  accentColor="cyan"
                  onApplyTier={(tier) => updateProject({
                    customer_pricing: { ...(project.customer_pricing || {}), applied: true, tier_number: tier },
                  })}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky summary card */}
          <div className="space-y-3">
            <Card className="bg-white border-0 shadow-md sticky top-24">
              <CardHeader className="pb-3"><CardTitle className="text-base">Estimate Summary</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Items" value={recalculated.items?.length || 0} isMoney={false} />
                <Row label="Labor hours" value={(recalculated.labor_hours || 0).toFixed(1)} isMoney={false} />
                <Row label="Labor" value={recalculated.labor_cost} />
                <Row label="Materials" value={recalculated.total_materials_cost} />
                <Row label="Equipment" value={recalculated.total_equipment_cost} />
                <Row label="Travel" value={recalculated.total_travel_cost} />
                <div className="border-t pt-2 mt-2">
                  <Label className="text-xs">Markup %</Label>
                  <Input
                    type="number"
                    step="1"
                    value={project.markup_percent || 0}
                    onChange={(e) => updateProject({
                      markup_percent: parseFloat(e.target.value) || 0,
                      customer_pricing: { ...(project.customer_pricing || {}), applied: false },
                    })}
                    className="h-8 text-sm tabular-nums"
                  />
                </div>
                <div className="border-t-2 border-cyan-200 pt-2 mt-2 flex justify-between text-lg font-bold text-cyan-700">
                  <span>Total</span><span className="tabular-nums">{fmt(recalculated.total_cost)}</span>
                </div>
                <Button onClick={saveProject} disabled={saving} className="w-full bg-cyan-600 hover:bg-cyan-700 text-white mt-2">
                  {saving ? "Saving…" : (isEditing ? "Save Changes" : "Save Estimate")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, isMoney = true }) {
  const display = isMoney ? `$${(parseFloat(value) || 0).toFixed(2)}` : String(value ?? 0);
  return (
    <div className="flex justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums">{display}</span>
    </div>
  );
}