// Vinyl Estimator — tabbed estimator with multiple vinyl workflows + installation.
// Tabs: Project Info → Vinyl Workflows → Installation → Travel & Crew → Summary
// Each workflow has its own vinyl + machines + parts + roll layout, so different
// materials never get nested onto the same physical roll.

import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  VinylProject, VinylInventory, VinylMachine,
  Settings, ChannelLetterInstallEquipment, ChannelLetterInstallInventory,
} from "@/entities/all";
import { createPageUrl } from "@/utils";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Droplets, Loader2, FileText, Layers, HardHat, Calculator, Plus, MapPin, Settings as SettingsIcon, ChevronsUpDown, ChevronsDownUp, BookmarkPlus, ClipboardPaste, UploadCloud, AlertTriangle, TrendingUp } from "lucide-react";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeVinylProject } from "@/components/markup/projectCategorizer";

import ClientSearchInput from "@/components/ClientSearchInput";
import AddressAutocomplete from "@/components/channelLetterInstall/AddressAutocomplete";
import EquipmentSelector from "@/components/channelLetterInstall/EquipmentSelector";
import PersonnelSelector from "@/components/channelLetterInstall/PersonnelSelector";
import TravelCostCard from "@/components/channelLetterInstall/TravelCostCard";

import VinylWorkflowCard from "@/components/vinylEstimator/VinylWorkflowCard";
import VinylProjectSummaryCard from "@/components/vinylEstimator/VinylProjectSummaryCard";
import VinylBulkImportDialog from "@/components/vinylEstimator/VinylBulkImportDialog";
import VinylPartsLibraryDialog from "@/components/vinylEstimator/VinylPartsLibraryDialog";
import VinylArtworkUploadDialog from "@/components/vinylEstimator/VinylArtworkUploadDialog";
import VinylMoveToWorkflowMenu from "@/components/vinylEstimator/VinylMoveToWorkflowMenu";
import {
  blankVinylProject, blankWorkflow, migrateProject, rollupVinylProject,
} from "@/components/vinylEstimator/vinylProjectHelpers";

const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function NewVinylEstimate({ embeddedId = null, embedded = false }) {
  const [search] = useSearchParams();
  // Prop wins when embedded inside the All-In-One estimator.
  const projectId = embeddedId || search.get("id") || search.get("edit");
  const navigate = useNavigate();

  const [project, setProject] = useState(blankVinylProject());
  const [vinyls, setVinyls] = useState([]);
  const [machines, setMachines] = useState([]);
  const [settings, setSettings] = useState({});
  const [equipmentInventory, setEquipmentInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("project");

  // Workflow tab UI state
  const [allOpen, setAllOpen] = useState(true);
  const [targetWorkflowIdx, setTargetWorkflowIdx] = useState(null); // index whose toolbar opened the dialog
  const [bulkOpen, setBulkOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [artworkOpen, setArtworkOpen] = useState(false);
  // Move-part-to-workflow dialog
  const [moveContext, setMoveContext] = useState(null); // { workflowIdx, partIdx }

  // Load everything in parallel
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [vList, mList, sList, eList, p] = await Promise.all([
          VinylInventory.list("sort_order"),
          VinylMachine.list("sort_order"),
          Settings.list(),
          ChannelLetterInstallEquipment.list("sort_order"),
          projectId ? VinylProject.get(projectId) : Promise.resolve(null),
        ]);
        setVinyls(vList);
        setMachines(mList);
        setEquipmentInventory(eList);
        const settingsObj = {};
        sList.forEach(s => { settingsObj[s.setting_name] = s.setting_value; });
        setSettings(settingsObj);

        if (p) {
          setProject(migrateProject(p));
        } else {
          // Seed first workflow with sensible defaults
          const defaultPrinter   = mList.find(m => m.is_default_for_type && (m.machine_type === "printer" || m.machine_type === "print_and_cut")) || mList.find(m => m.machine_type === "printer" || m.machine_type === "print_and_cut");
          const defaultCutter    = mList.find(m => m.is_default_for_type && (m.machine_type === "cutter"  || m.machine_type === "print_and_cut")) || mList.find(m => m.machine_type === "cutter" || m.machine_type === "print_and_cut");
          const defaultLaminator = mList.find(m => m.is_default_for_type && m.machine_type === "laminator") || mList.find(m => m.machine_type === "laminator");
          const defaultVinyl     = vList.find(v => v.is_active !== false && !v.is_laminate && v.show_in_vinyl_estimator !== false);

          setProject(prev => ({
            ...prev,
            workflows: [{
              ...prev.workflows[0],
              vinyl_id: defaultVinyl?.id || "",
              laminate_id: defaultVinyl?.default_laminate_id || "",
              apply_laminate: !!defaultVinyl?.requires_lamination,
              printer_id:   defaultPrinter?.id   || "",
              cutter_id:    defaultCutter?.id    || "",
              laminator_id: defaultLaminator?.id || "",
            }],
          }));
        }
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
  }, [projectId]);

  const updateProject = useCallback((patch) => setProject(prev => ({ ...prev, ...patch })), []);

  const updateWorkflow = (idx, next) => {
    setProject(prev => {
      const wfs = [...prev.workflows];
      wfs[idx] = next;
      return { ...prev, workflows: wfs };
    });
  };
  const addWorkflow = () => {
    setProject(prev => ({
      ...prev,
      workflows: [...prev.workflows, blankWorkflow(prev.workflows.length)],
    }));
  };
  const removeWorkflow = (idx) => {
    if (project.workflows.length === 1) {
      alert("A project must have at least one vinyl workflow.");
      return;
    }
    if (!confirm("Delete this workflow and all its parts?")) return;
    setProject(prev => ({
      ...prev,
      workflows: prev.workflows.filter((_, i) => i !== idx),
    }));
  };
  const duplicateWorkflow = (idx) => {
    setProject(prev => {
      const copy = JSON.parse(JSON.stringify(prev.workflows[idx]));
      copy.id = `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      copy.name = `${copy.name || `Workflow ${idx + 1}`} (copy)`;
      copy._calc = undefined;
      const next = [...prev.workflows];
      next.splice(idx + 1, 0, copy);
      return { ...prev, workflows: next };
    });
  };

  // Project-wide rollup (re-derives when any workflow's _calc changes)
  const rollup = useMemo(() => rollupVinylProject(project), [project]);
  // Max install height for travel/equipment suggestion compatibility
  const totalLaborHours = rollup.laborHours;

  // Feature #33 — does any workflow have validation issues?
  const workflowsHaveIssues = useMemo(
    () => (project.workflows || []).some(wf => wf._hasIssues),
    [project.workflows]
  );

  // Helper: add a single part to a specific workflow (used by library + artwork dialogs)
  const addPartToWorkflow = (workflowIdx, part) => {
    if (workflowIdx == null || workflowIdx < 0 || workflowIdx >= project.workflows.length) return;
    const wf = project.workflows[workflowIdx];
    updateWorkflow(workflowIdx, { ...wf, items: [...(wf.items || []), part] });
  };
  // Helper: bulk import to a specific workflow
  const importPartsToWorkflow = (workflowIdx, parts) => {
    if (workflowIdx == null) return;
    const wf = project.workflows[workflowIdx];
    updateWorkflow(workflowIdx, { ...wf, items: [...(wf.items || []), ...parts] });
  };
  // Helper: move a part between workflows
  const movePart = (fromIdx, partIdx, toIdx) => {
    if (fromIdx === toIdx) return;
    const fromWf = project.workflows[fromIdx];
    const toWf = project.workflows[toIdx];
    const part = fromWf.items[partIdx];
    if (!part) return;
    setProject(prev => {
      const wfs = [...prev.workflows];
      wfs[fromIdx] = { ...fromWf, items: fromWf.items.filter((_, i) => i !== partIdx) };
      wfs[toIdx]   = { ...toWf,   items: [...(toWf.items || []), part] };
      return { ...prev, workflows: wfs };
    });
  };

  const save = async () => {
    if (!project.project_name || !project.client_name || !project.estimate_number || !project.hyperlink) {
      alert("Please fill in Project Name, Client Name, Estimate Number, and Project Link.");
      setActiveTab("project");
      return;
    }
    setSaving(true);
    try {
      // Strip transient _calc from each workflow before saving
      const cleanWorkflows = project.workflows.map(({ _calc, ...rest }) => rest);
      // Flatten parts for entity-level `items` (legacy/reporting), tagged with workflow id
      const flatItems = cleanWorkflows.flatMap(wf =>
        (wf.items || []).map(it => ({ ...it, workflow_id: wf.id, workflow_name: wf.name }))
      );

      const payload = {
        ...project,
        workflows: cleanWorkflows,
        items: flatItems,
        status: "calculated",
        // Snapshot first workflow's vinyl/machines into the top-level fields for backward compat
        default_vinyl_id:    cleanWorkflows[0]?.vinyl_id   || "",
        default_laminate_id: cleanWorkflows[0]?.laminate_id || "",
        printer_id:    cleanWorkflows[0]?.printer_id   || "",
        cutter_id:     cleanWorkflows[0]?.cutter_id    || "",
        laminator_id:  cleanWorkflows[0]?.laminator_id || "",
        // Roll up totals
        total_print_sqft: rollup.usedSqFt,
        total_vinyl_sqft: rollup.totalRollSqFt,
        total_laminate_sqft: rollup.laminateSqFt,
        total_vinyl_cost: rollup.vinylCost,
        total_laminate_cost: rollup.laminateCost,
        total_ink_cost: rollup.inkCost,
        total_blade_cost: rollup.bladeCost,
        total_machine_cost: rollup.machineCost,
        total_personnel_cost: rollup.personnelCost,
        total_supplies_cost: rollup.supplies,
        total_equipment_cost: rollup.equipmentCost,
        base_supplies_cost: rollup.baseSupplies,
        labor_hours: rollup.laborHours,
        labor_cost: rollup.laborCost,
        subtotal: rollup.subtotal,
        markup_amount: rollup.markupAmount,
        total_cost: rollup.totalCost,
      };

      let saved;
      if (projectId) {
        saved = await VinylProject.update(projectId, payload);
      } else {
        saved = await VinylProject.create(payload);
        if (!embedded) navigate(`${createPageUrl("NewVinylEstimate")}?id=${saved.id}`, { replace: true });
      }
      setProject(migrateProject(saved));
      if (!embedded) alert("Estimate saved.");
    } catch (e) {
      console.error(e); alert("Save failed: " + e.message);
    }
    setSaving(false);
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-500"><Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Loading…</div>;
  }

  const TabBtn = ({ value, icon: Icon, label, amount, warn }) => (
    <TabsTrigger value={value} className="flex items-center gap-1.5 text-xs md:text-sm py-2 data-[state=active]:bg-blue-600 data-[state=active]:text-white relative">
      <Icon className="w-4 h-4" /> <span className="truncate">{label}</span>
      {amount != null && (
        <span className="ml-1 text-[10px] tabular-nums opacity-80">{fmt(amount)}</span>
      )}
      {warn && (
        <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" title="Workflow has issues" />
      )}
    </TabsTrigger>
  );

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
          <div>
            <Link to={createPageUrl("VinylProjects")} className="text-sm text-slate-500 hover:text-slate-900 inline-flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Vinyl Projects
            </Link>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3 mt-1">
              <Droplets className="w-8 h-8 text-blue-600" />
              {projectId ? "Edit" : "New"} Vinyl Estimate
            </h1>
          </div>
          <div className="flex gap-2">
            <Link to={createPageUrl("VinylSettings")}>
              <Button variant="outline"><SettingsIcon className="w-4 h-4 mr-1" /> Settings</Button>
            </Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                <TabsList className="grid w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
                  <TabBtn value="project"   icon={FileText}   label="Project" />
                  <TabBtn value="workflows" icon={Layers}     label="Vinyl Workflows" amount={rollup.materialCost + rollup.machineCost + rollup.laborCost} warn={workflowsHaveIssues} />
                  <TabBtn value="install"   icon={HardHat}    label="Installation"    amount={rollup.equipmentCost + rollup.personnelCost} />
                  <TabBtn value="travel"    icon={MapPin}     label="Travel"          amount={rollup.travelCost} />
                  <TabBtn value="summary"   icon={Calculator} label="Summary"         amount={rollup.totalCost} />
                  <TabBtn value="pricing"   icon={TrendingUp} label="Customer Pricing" />
                </TabsList>
              </div>

              {/* PROJECT TAB */}
              <TabsContent value="project" className="mt-4 space-y-4">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg">Project Information</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Client Name *</Label>
                        <ClientSearchInput
                          value={project.client_name}
                          onChange={(val) => updateProject({ client_name: val })}
                          onSelectProject={(data) => updateProject({
                            client_name: data.client_name || project.client_name,
                            project_name: data.project_name || project.project_name,
                            estimate_number: data.estimate_number || project.estimate_number,
                            hyperlink: data.hyperlink || project.hyperlink,
                          })}
                          className="mt-1"
                          placeholder="Enter client name"
                        />
                      </div>
                      <div>
                        <Label>Project Name *</Label>
                        <Input value={project.project_name} onChange={(e) => updateProject({ project_name: e.target.value })} className="mt-1" />
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <Label>Estimate Number *</Label>
                        <Input value={project.estimate_number} onChange={(e) => updateProject({ estimate_number: e.target.value })} placeholder="e.g., VIN-2024-001" className="mt-1" />
                      </div>
                      <div>
                        <Label>Project Link *</Label>
                        <Input value={project.hyperlink} onChange={(e) => updateProject({ hyperlink: e.target.value })} placeholder="https://..." className="mt-1" />
                      </div>
                    </div>

                    {/* Interior / Exterior */}
                    <div>
                      <Label className="text-sm font-semibold text-slate-900">Installation Environment</Label>
                      <p className="text-xs text-slate-500 mt-1 mb-2">
                        Where is this vinyl going to live? Drives default site conditions for the install tab.
                      </p>
                      <div className="grid grid-cols-2 gap-2 max-w-md">
                        {[
                          { value: "exterior", label: "Exterior", desc: "Outdoor wall, vehicle, storefront", color: "blue" },
                          { value: "interior", label: "Interior", desc: "Lobby, indoor wall, office", color: "amber" },
                        ].map((opt) => {
                          const active = (project.install_environment || "exterior") === opt.value;
                          const ringClass = opt.color === "blue"
                            ? (active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")
                            : (active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300");
                          return (
                            <button key={opt.value} type="button"
                              onClick={() => updateProject({ install_environment: opt.value })}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${ringClass}`}>
                              <div className="text-sm font-semibold text-slate-800">{opt.label}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Site Address */}
                    <div>
                      <Label className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" />
                        Site Address
                        <span className="text-xs font-normal text-slate-500">(used for travel mileage)</span>
                      </Label>
                      <AddressAutocomplete
                        value={project.site_address || ""}
                        onChange={(val) => updateProject({ site_address: val })}
                        placeholder="e.g., 123 Main St, Cincinnati, OH 45202"
                        className="mt-1"
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg">Notes</CardTitle></CardHeader>
                  <CardContent>
                    <Textarea value={project.notes || ""} onChange={(e) => updateProject({ notes: e.target.value })} className="h-32" />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button onClick={() => setActiveTab("workflows")} className="bg-blue-600 hover:bg-blue-700 text-white">
                    Continue to Vinyl Workflows →
                  </Button>
                </div>
              </TabsContent>

              {/* WORKFLOWS TAB */}
              <TabsContent value="workflows" className="mt-4 space-y-4">
                <div className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm flex-wrap gap-2">
                  <div className="text-sm text-slate-600">
                    Add one workflow per vinyl type. Each workflow lays out on its own roll.
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {project.workflows.length > 1 && (
                      <Button size="sm" variant="outline" onClick={() => setAllOpen(o => !o)} className="h-8">
                        {allOpen
                          ? <><ChevronsDownUp className="w-3.5 h-3.5 mr-1" /> Collapse All</>
                          : <><ChevronsUpDown className="w-3.5 h-3.5 mr-1" /> Expand All</>}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { setTargetWorkflowIdx(0); setLibraryOpen(true); }} className="h-8">
                      <BookmarkPlus className="w-3.5 h-3.5 mr-1" /> Library
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setTargetWorkflowIdx(0); setBulkOpen(true); }} className="h-8">
                      <ClipboardPaste className="w-3.5 h-3.5 mr-1" /> Bulk Paste
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setTargetWorkflowIdx(0); setArtworkOpen(true); }} className="h-8">
                      <UploadCloud className="w-3.5 h-3.5 mr-1" /> Artwork
                    </Button>
                    <Button size="sm" onClick={addWorkflow} className="bg-blue-600 hover:bg-blue-700 text-white h-8">
                      <Plus className="w-4 h-4 mr-1" /> Workflow
                    </Button>
                  </div>
                </div>

                {workflowsHaveIssues && (
                  <div className="flex items-center gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    One or more workflows have unplaced parts or missing vinyl selections — see the red badges below.
                  </div>
                )}

                {project.workflows.map((wf, idx) => (
                  <VinylWorkflowCard
                    key={wf.id}
                    workflow={wf}
                    index={idx}
                    vinyls={vinyls}
                    machines={machines}
                    installEnvironment={project.install_environment}
                    onChange={(next) => updateWorkflow(idx, next)}
                    onRemove={() => removeWorkflow(idx)}
                    onDuplicate={() => duplicateWorkflow(idx)}
                    onMovePartToWorkflow={project.workflows.length > 1
                      ? (partIdx) => setMoveContext({ workflowIdx: idx, partIdx })
                      : null}
                    defaultOpen={allOpen}
                  />
                ))}
              </TabsContent>

              {/* INSTALLATION TAB */}
              <TabsContent value="install" className="mt-4 space-y-3">
                <EquipmentSelector
                  selectedEquipment={project.selected_equipment || []}
                  onChange={(next) => updateProject({ selected_equipment: next })}
                  equipmentInventory={equipmentInventory}
                  items={[]}
                  projectLaborHours={totalLaborHours}
                />
                <PersonnelSelector
                  personnel={project.personnel || []}
                  onChange={(next) => updateProject({ personnel: next })}
                  projectLaborHours={totalLaborHours}
                  roleRates={{
                    "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
                    "Installer": parseFloat(settings.install_installer_rate) || 65,
                    "Helper": parseFloat(settings.install_helper_rate) || 35,
                  }}
                  items={[]}
                />
                {equipmentInventory.length === 0 && (
                  <Card className="bg-amber-50 border-amber-200">
                    <CardContent className="p-3 text-xs text-amber-900">
                      Your equipment inventory is empty.{" "}
                      <Link to={createPageUrl("ChannelLetterInstallInventory")} className="underline font-medium">
                        Add equipment in Inventory
                      </Link>{" "}
                      to enable selection.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* TRAVEL TAB */}
              <TabsContent value="travel" className="mt-4 space-y-3">
                <TravelCostCard
                  shopAddress={settings.install_shop_address || ""}
                  siteAddress={project.site_address || ""}
                  selectedEquipment={project.selected_equipment || []}
                  equipmentInventory={equipmentInventory}
                  personnel={project.personnel || []}
                  settings={settings}
                  travelMiles={project.travel_miles_round_trip || 0}
                  onMilesChange={(miles) => updateProject({ travel_miles_round_trip: miles })}
                  onTotalChange={(total) => {
                    if ((project.total_travel_cost || 0) !== total) updateProject({ total_travel_cost: total });
                  }}
                  autoTriggerKey={activeTab === "travel" ? "travel" : null}
                />
                <Card className="bg-slate-50 border-slate-200">
                  <CardContent className="p-3 text-xs text-slate-600">
                    Travel rates (shop address, fuel prices, labor rate, overhead, minimum charge) are shared with the
                    Channel Letter Install module —{" "}
                    <Link to={createPageUrl("ChannelLetterInstallationSettings")} className="underline font-medium">
                      configure them in Install Settings
                    </Link>.
                  </CardContent>
                </Card>
              </TabsContent>

              {/* SUMMARY TAB */}
              <TabsContent value="summary" className="mt-4 space-y-3">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Cost Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm space-y-3">
                    <BreakdownTable rollup={rollup} project={project} />
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CUSTOMER PRICING TAB */}
              <TabsContent value="pricing" className="mt-4 space-y-3">
                <CustomerPricingTab
                  project={{
                    ...project,
                    // Feed live rollup totals so categorizer sees current numbers
                    total_vinyl_cost:    rollup.vinylCost,
                    total_laminate_cost: rollup.laminateCost,
                    total_ink_cost:      rollup.inkCost,
                    total_blade_cost:    rollup.bladeCost,
                    total_machine_cost:  rollup.machineCost,
                    total_supplies_cost: rollup.supplies,
                    labor_cost:          rollup.laborCost,
                    total_personnel_cost: rollup.personnelCost,
                    total_equipment_cost: rollup.equipmentCost,
                    total_travel_cost:    rollup.travelCost,
                  }}
                  categorize={categorizeVinylProject}
                  accentColor="blue"
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky summary */}
          <div className="space-y-3">
            <VinylProjectSummaryCard
              rollup={rollup}
              project={project}
              onUpdateProject={updateProject}
              onSave={save}
              isSaving={saving}
            />
          </div>
        </div>
      </div>

      {/* Workflow-tab dialogs — Features #15, #17, #31, #34 */}
      <VinylBulkImportDialog
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImport={(parts) => importPartsToWorkflow(targetWorkflowIdx, parts)}
      />
      <VinylPartsLibraryDialog
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        onPick={(part) => addPartToWorkflow(targetWorkflowIdx, part)}
      />
      <VinylArtworkUploadDialog
        open={artworkOpen}
        onClose={() => setArtworkOpen(false)}
        onAdd={(part) => addPartToWorkflow(targetWorkflowIdx, part)}
      />
      <VinylMoveToWorkflowMenu
        open={!!moveContext}
        onClose={() => setMoveContext(null)}
        workflows={project.workflows}
        currentWorkflowIdx={moveContext?.workflowIdx ?? -1}
        onMove={(toIdx) => {
          movePart(moveContext.workflowIdx, moveContext.partIdx, toIdx);
          setMoveContext(null);
        }}
      />
    </div>
  );
}

function BreakdownTable({ rollup, project }) {
  const rows = [
    ["Vinyl", rollup.vinylCost],
    ["Laminate", rollup.laminateCost],
    ["Ink", rollup.inkCost],
    ["Blade Wear", rollup.bladeCost],
    ["Machine Time", rollup.machineCost],
    ["Labor", rollup.laborCost],
    ["Equipment", rollup.equipmentCost],
    ["Personnel", rollup.personnelCost],
    ["Travel", rollup.travelCost],
    ["Supplies", rollup.supplies],
  ];
  return (
    <table className="w-full">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-t border-slate-100">
            <td className="py-1.5 text-slate-600">{label}</td>
            <td className="py-1.5 text-right tabular-nums">{fmt(value)}</td>
          </tr>
        ))}
        <tr className="border-t border-slate-200">
          <td className="py-1.5 font-semibold">Subtotal</td>
          <td className="py-1.5 text-right tabular-nums font-semibold">{fmt(rollup.subtotal)}</td>
        </tr>
        <tr>
          <td className="py-1.5 text-slate-600">Markup ({project.markup_percent || 0}%)</td>
          <td className="py-1.5 text-right tabular-nums">{fmt(rollup.markupAmount)}</td>
        </tr>
        <tr className="border-t-2 border-slate-300">
          <td className="py-2 font-bold text-base">Total</td>
          <td className="py-2 text-right tabular-nums font-bold text-base">{fmt(rollup.totalCost)}</td>
        </tr>
      </tbody>
    </table>
  );
}