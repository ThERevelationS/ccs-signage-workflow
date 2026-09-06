import React, { useState, useEffect, useCallback, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { ChannelLetterInstallation, Settings, ChannelLetterInstallInventory, ChannelLetterInstallEquipment } from "@/entities/all";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { Plus, ArrowLeft, Wrench, Package, FileText, ListChecks, Boxes, Calculator, MapPin, Copy, DollarSign, Check, HardHat, Type, Camera, Sparkles, TrendingUp, HelpCircle } from "lucide-react";
import ChannelLetterHelpAssistant from "@/components/channelLetterInstall/ChannelLetterHelpAssistant";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";
import ClientSearchInput from "@/components/ClientSearchInput";
import InstallSummaryCard from "@/components/channelLetterInstall/InstallSummaryCard";
import ItemsList from "@/components/channelLetterInstall/ItemsList";
import CrewEquipmentHint from "@/components/channelLetterInstall/CrewEquipmentHint";
import ValidationWarnings from "@/components/channelLetterInstall/ValidationWarnings";
import EquipmentSelector from "@/components/channelLetterInstall/EquipmentSelector";
import LadderSelector from "@/components/channelLetterInstall/LadderSelector";
import PersonnelSelector from "@/components/channelLetterInstall/PersonnelSelector";
import LettersPurchaseTab from "@/components/channelLetterInstall/LettersPurchaseTab";
import TravelCostCard from "@/components/channelLetterInstall/TravelCostCard";
import SummaryDetailsCard from "@/components/channelLetterInstall/SummaryDetailsCard";
import TabBadgeTrigger from "@/components/channelLetterInstall/TabBadgeTrigger";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeChannelLetterProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import PhotoEstimateModal from "@/components/channelLetterInstall/PhotoEstimateModal";
import AIInstallScopeModal from "@/components/channelLetterInstall/AIInstallScopeModal";
import ConfirmModal from "@/components/channelLetterInstall/ConfirmModal";
import AddressAutocomplete from "@/components/channelLetterInstall/AddressAutocomplete";
import { suggestEquipmentForProject, selectedEquipmentFromInventory, suggestPersonnelForProject, suggestCrewSize } from "@/components/channelLetterInstall/equipmentSuggester";
import {
  calcLineItem,
  calcProjectTotals,
  defaultMaterialsForItem,
  emptyLineItem,
} from "@/components/channelLetterInstall/installCalculator";
import { calcLettersTotals, syncInstallItemsFromPurchases } from "@/components/channelLetterInstall/lettersCalculator";
import { buildSummaryText, downloadCSV } from "@/components/channelLetterInstall/installExport";
import { upsertCustomerSummaryForEstimate } from "@/components/customerSummary/upsertCustomerSummary";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { preflightBuilderSourceMutation, updateBuilderSourceProject } from "@/components/estimator/builder/sourceProjectPersistence";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";

const fmt = (v) => `$${(parseFloat(v) || 0).toFixed(2)}`;

const blankProject = () => ({
  project_name: "",
  client_name: "",
  estimate_number: "",
  hyperlink: "",
  site_address: "",
  project_scope: "full",
  install_environment: "exterior",
  items: [],
  letter_purchases: [],
  letters_delivery_fee: 0,
  letters_design_fee: 0,
  letters_install_supplies_fee: 0,
  letters_permitting_fee: 0,
  letters_other_fee: 0,
  letters_markup_percent: 0,
  selected_equipment: [],
  personnel: [],
  base_supplies_cost: 0,
  extra_supplies_cost: 0,
  markup_percent: 0,
  travel_miles_round_trip: 0,
  total_travel_cost: 0,
  notes: "",
});

export default function ChannelLetterEstimator({ embedded = false, embeddedProjectId, embeddedEstimateId, onClose, onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Prop wins when embedded inside the All-In-One estimator.
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const { setIsDirty } = useUnsavedChanges();

  const [project, setProject] = useState(blankProject());
  const [settings, setSettings] = useState({});
  const [inventory, setInventory] = useState([]);
  const [equipmentInventory, setEquipmentInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  const [photoModalOpen, setPhotoModalOpen] = useState(false);
  const [aiInstallOpen, setAiInstallOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState(null); // { title, description, ... }
  const [helpTrigger, setHelpTrigger] = useState(false);
  const persistedProjectIdRef = React.useRef(editId || "");
  const createAttemptRef = React.useRef({ signature: "", key: "" });

  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
  }, [editId]);

  useEffect(() => { if (!isLoading && !loadError) setHasLoaded(true); }, [isLoading, loadError]);
  useEffect(() => { if (hasLoaded) setIsDirty(true); }, [project, hasLoaded, setIsDirty]);

  // Load settings + inventory + (maybe) existing project
  const loadEverything = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [settingsList, inv, equipInv] = await Promise.all([
        loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
        loadAllEntityRows({ entity: ChannelLetterInstallInventory, sort: "sort_order", label: "Channel Letter installation inventory" }),
        loadAllEntityRows({ entity: ChannelLetterInstallEquipment, sort: "sort_order", label: "Channel Letter equipment" }),
      ]);
      const settingsObj = {};
      settingsList.forEach(s => { settingsObj[s.setting_name] = s.setting_value; });
      setSettings(settingsObj);
      setInventory(inv);
      setEquipmentInventory(equipInv);

      if (editId) {
        const existing = await ChannelLetterInstallation.get(editId);
        if (existing) {
          if ((!existing.items || existing.items.length === 0) && existing.installation_type) {
            existing.items = [{
              description: "",
              installation_type: existing.installation_type,
              qty_letters: existing.qty_letters || 0,
              letter_size: existing.letter_size || "medium",
              letter_height_inches: existing.letter_height_inches || 24,
              installation_height_feet: existing.installation_height_feet || 12,
              raceway_length_feet: existing.raceway_length_feet || 0,
              thick_hollow_walls: !!existing.thick_hollow_walls,
              parapet: !!existing.parapet,
              poor_electrical_access: !!existing.poor_electrical_access,
              materials: [],
            }];
          }
          setProject({ ...blankProject(), ...existing, items: existing.items || [] });
          setIsEditing(true);
        } else {
          navigate(createPageUrl("Estimator"));
        }
      } else {
        setProject(prev => ({
          ...prev,
          base_supplies_cost: parseFloat(settingsObj.install_base_supplies) || 0,
          // Pre-fill project-level fees from settings defaults
          letters_delivery_fee: parseFloat(settingsObj.letters_default_delivery_fee) || 0,
          letters_other_fee: parseFloat(settingsObj.letters_default_other_fee) || 0,
          items: [],
        }));
      }
    } catch (e) {
      console.error("Load error:", e);
      setLoadError(e?.message || "Channel / Dimensional Letter Builder prerequisites could not be verified.");
    }
    setIsLoading(false);
  }, [editId, navigate]);

  useEffect(() => { loadEverything(); }, [loadEverything]);

  // Recalc on every change
  const recalculated = useMemo(() => {
    if (!settings || Object.keys(settings).length === 0) return project;
    const scope = project.project_scope || "full";
    // Inject the project-level Interior/Exterior default so the calculator
    // can resolve env-qualified setting keys for line items that don't
    // override it themselves.
    const settingsWithEnv = { ...settings, _project_install_environment: project.install_environment || "exterior" };
    // 1) Letters tab math — totals each purchase row + project subtotal + markup
    //    Zero out when scope is install_only.
    const lettersTotals = scope === "install_only"
      ? { letters_subtotal: 0, total_letters_cost: 0, letter_purchases: project.letter_purchases || [] }
      : calcLettersTotals(project, settingsWithEnv);
    // 2) Installation items recompute. Zero out when scope is letters_only.
    const recalcItems = scope === "letters_only"
      ? []
      : (project.items || []).map(it => calcLineItem(it, settingsWithEnv, inventory));
    // 3) Project rollup (uses total_letters_cost from step 1).
    //    When letters_only, drop equipment + personnel from the rollup too.
    const projectForTotals = scope === "letters_only"
      ? { ...project, ...lettersTotals, items: recalcItems, selected_equipment: [], personnel: [] }
      : { ...project, ...lettersTotals, items: recalcItems };
    const totals = calcProjectTotals(projectForTotals);
    return { ...project, ...lettersTotals, items: recalcItems, ...totals };
  }, [project, settings, inventory]);

  // Dimensional letters MUST have a Build/Fab config — block tab navigation away from Letters until each is configured
  const incompleteDimensionalIds = useMemo(
    () => (recalculated.letter_purchases || [])
      .filter(p => p.letter_type === "dimensional_letters" && !p.fab_config?.unit_total_cost)
      .map(p => p.id),
    [recalculated.letter_purchases]
  );
  const hasIncompleteDimensional = incompleteDimensionalIds.length > 0;

  const handleTabChange = (next) => {
    if (activeTab === "letters" && next !== "letters" && hasIncompleteDimensional) {
      setConfirmModal({
        title: "Finish building your dimensional letters first",
        description: "Each Dimensional Letters row needs a completed 'Build Fab Cost from CNC + Paint' before you can move on. Click the highlighted row(s) on the Letters tab to configure them.",
        confirmLabel: "Got it",
        tone: "warning",
      });
      return;
    }
    setActiveTab(next);
  };

  // Project scope helpers — control which tabs / rollups are active
  const scope = project.project_scope || "full";
  const showLettersTab = scope !== "install_only";
  const showInstallTab = scope !== "letters_only";
  const showCrewTab = scope !== "letters_only";

  // If the active tab gets hidden by a scope change, fall back to Project
  useEffect(() => {
    if (activeTab === "letters" && !showLettersTab) setActiveTab("project");
    if ((activeTab === "items" || activeTab === "crew") && scope === "letters_only") setActiveTab("project");
  }, [scope]);

  // Aggregate materials across items for the Materials tab
  const aggregatedMaterials = useMemo(() => {
    const map = new Map();
    (recalculated.items || []).forEach(it => {
      (it.materials || []).forEach(m => {
        const key = m.inventory_item_id || `manual:${m.item_name}`;
        const existing = map.get(key);
        if (existing) {
          existing.quantity += parseFloat(m.quantity) || 0;
          existing.total_cost += parseFloat(m.total_cost) || 0;
        } else {
          map.set(key, {
            item_name: m.item_name,
            quantity: parseFloat(m.quantity) || 0,
            unit_cost: parseFloat(m.unit_cost) || 0,
            total_cost: parseFloat(m.total_cost) || 0,
          });
        }
      });
    });
    return Array.from(map.values());
  }, [recalculated]);

  // Mutators
  const updateProject = (patch) => {
    setProject(prev => {
      const next = { ...prev, ...patch };
      // When letter_purchases changes, keep matching install items in sync
      if ("letter_purchases" in patch) {
        next.items = syncInstallItemsFromPurchases(next.items, next.letter_purchases, emptyLineItem, inventory);
      }
      return next;
    });
  };

  const updateItem = (idx, updated) => {
    const next = [...project.items];
    next[idx] = updated;
    setProject(prev => ({ ...prev, items: next }));
  };

  const addItem = () => {
    const newItem = emptyLineItem();
    newItem.materials = defaultMaterialsForItem(newItem, inventory);
    setProject(prev => ({ ...prev, items: [...prev.items, newItem] }));
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

  const reorderItems = (from, to) => {
    const next = [...project.items];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setProject(prev => ({ ...prev, items: next }));
  };

  // Travel auto-calc trigger: fire as soon as we have a site address AND at least
  // one piece of equipment selected (e.g. the auto-suggested boom), regardless of
  // which tab is active. This way Travel & Fuel is already computed by the time the
  // user lands on the Crew tab — no waiting on the slow mileage lookup.
  // TravelCostCard de-dupes by shop|site address pair, so a stable key per address
  // is enough; we only want it to be non-null once prerequisites are met.
  const hasSiteAddress = !!(project.site_address && project.site_address.trim());
  const hasEquipment = (project.selected_equipment || []).length > 0;
  const travelAutoKey = (hasSiteAddress && hasEquipment && scope !== "letters_only")
    ? `auto:${project.site_address}`
    : null;

  // Background mileage prefetch — runs in the page (not the Crew tab) so the slow
  // shop→site lookup happens the moment equipment is auto-selected. By the time the
  // user opens the Crew tab the miles are already in, so Travel & Fuel is instant.
  const travelPrefetchKeyRef = React.useRef(null);
  useEffect(() => {
    const shop = (settings.install_shop_address || "").trim();
    const site = (project.site_address || "").trim();
    if (!hasLoaded) return;
    if (scope === "letters_only") return;
    if (!shop || !site || !hasEquipment) return;
    // Already have miles → nothing to fetch.
    if ((parseFloat(project.travel_miles_round_trip) || 0) > 0) return;
    const key = `${shop}|${site}`;
    if (travelPrefetchKeyRef.current === key) return; // already fetched this pair
    travelPrefetchKeyRef.current = key;
    let cancelled = false;
    (async () => {
      try {
        const res = await base44.functions.invoke("calculateTravelMiles", { shop_address: shop, site_address: site });
        const rt = parseFloat(res?.data?.round_trip_miles);
        if (!cancelled && isFinite(rt) && rt > 0) {
          updateProject({ travel_miles_round_trip: rt });
        }
      } catch (e) {
        // Silent — the Crew tab's manual "Auto" button is still available as a fallback.
        console.error("Travel prefetch failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [hasLoaded, hasEquipment, project.site_address, settings.install_shop_address, scope]);

  // Auto-suggest equipment when max install height changes (only if user hasn't picked any yet)
  const maxInstallHeight = useMemo(
    () => (project.items || []).reduce((m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0), 0),
    [project.items]
  );
  useEffect(() => {
    if (!hasLoaded) return;
    if ((project.selected_equipment || []).length > 0) return; // never auto-overwrite user choice
    if (maxInstallHeight <= 0 || equipmentInventory.length === 0) return;
    const projectLaborHours = recalculated.labor_hours || 0;
    const suggested = suggestEquipmentForProject(project.items, equipmentInventory);
    if (suggested.length === 0) return;
    const crewSize = (project.personnel || []).length || suggestCrewSize(project.items);
    const rows = suggested.map((inv) => selectedEquipmentFromInventory(inv, projectLaborHours, crewSize));
    setProject((prev) => ({ ...prev, selected_equipment: rows }));
  }, [maxInstallHeight, equipmentInventory, hasLoaded]);

  // Auto-fill personnel when the user enters the Crew & Equipment tab and the crew is empty.
  // Uses the same suggester as the "Auto-Suggest Crew" button, so the result is identical.
  useEffect(() => {
    if (!hasLoaded) return;
    if (activeTab !== "crew") return;
    if ((project.personnel || []).length > 0) return; // never overwrite user choice
    if (!project.items || project.items.length === 0) return;
    const projectLaborHours = recalculated.labor_hours || 0;
    if (projectLaborHours <= 0) return;
    const rateForRole = (role) => {
      const map = {
        "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
        "Installer": parseFloat(settings.install_installer_rate) || 65,
        "Helper": parseFloat(settings.install_helper_rate) || 35,
      };
      return map[role] ?? map.Installer;
    };
    const newCrew = suggestPersonnelForProject(project.items, projectLaborHours, rateForRole);
    if (newCrew.length === 0) return;
    setProject((prev) => ({ ...prev, personnel: newCrew }));
  }, [activeTab, hasLoaded]);

  // Apply AI-generated installation items
  const applyAIInstallItems = (aiItems, mode = "append") => {
    const newItems = aiItems.map((ai) => {
      const base = emptyLineItem();
      const merged = {
        ...base,
        ...ai,
        // ensure numeric fields are numbers
        qty_letters: parseFloat(ai.qty_letters) || 0,
        letter_height_inches: parseFloat(ai.letter_height_inches) || base.letter_height_inches,
        installation_height_feet: parseFloat(ai.installation_height_feet) || base.installation_height_feet,
        raceway_length_feet: parseFloat(ai.raceway_length_feet) || 0,
      };
      merged.materials = defaultMaterialsForItem(merged, inventory);
      return merged;
    });
    setProject((prev) => ({
      ...prev,
      items: mode === "replace" ? newItems : [...prev.items, ...newItems],
    }));
  };

  // Apply Photo→Estimate result as a new line item
  const applyPhotoEstimate = (result) => {
    const newItem = emptyLineItem();
    newItem.installation_height_feet = parseFloat(result.estimated_height_feet) || newItem.installation_height_feet;
    newItem.wall_material = result.wall_material || newItem.wall_material;
    newItem.installation_type = result.recommended_install_type || newItem.installation_type;
    newItem.parapet = !!result.site_conditions?.parapet;
    newItem.poor_electrical_access = !!result.site_conditions?.poor_electrical_access;
    newItem.thick_hollow_walls = !!result.site_conditions?.thick_hollow_walls;
    newItem.description = `From site photo — ${result.confidence || ""} confidence`.trim();
    newItem.materials = defaultMaterialsForItem(newItem, inventory);
    setProject((prev) => ({ ...prev, items: [...prev.items, newItem] }));
    setActiveTab("items");
  };

  // Keyboard shortcuts: Ctrl/Cmd+S = save, Ctrl/Cmd+N = new item
  useEffect(() => {
    const handler = (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "s") {
        e.preventDefault();
        saveProject();
      } else if (e.key === "i") {
        e.preventDefault();
        addItem();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [project, recalculated]);

  // Save / Export
  const saveProject = async () => {
    // In embedded (All-In-One) mode these fields are inherited from the parent
    // estimate and shown read-only, so don't block the save on them.
    if (!embedded && (!project.project_name || !project.client_name)) {
      alert("Please fill in Project Name and Client Name.");
      setActiveTab("project");
      return;
    }
    if (scope !== "letters_only" && (!project.selected_equipment || project.selected_equipment.length === 0)) {
      alert("Please select at least one piece of equipment before saving.");
      setActiveTab("crew");
      return;
    }
    setIsSaving(true);
    setIsDirty(false);
    try {
      const customerPricing = await calculateSavedCustomerPricing({
        project: recalculated,
        categorize: categorizeChannelLetterProject,
        tierNumber: project.customer_pricing?.tier_number,
      });
      const dataToSave = {
        ...recalculated,
        customer_pricing: customerPricing || project.customer_pricing,
        status: "calculated",
      };
      let savedId = persistedProjectIdRef.current || editId || "";
      let persistedSource = null;
      if (savedId) {
        persistedSource = await updateBuilderSourceProject({
          entity: ChannelLetterInstallation,
          sourceId: savedId,
          expectedUpdatedAt: project.updated_date,
          data: dataToSave,
          estimateId,
          label: "Channel Letter project",
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(dataToSave);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("channel_letter_project"),
          };
        }
        const created = await ensureIdempotentEntityCreate({
          entity: ChannelLetterInstallation,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: dataToSave,
          label: "Channel Letter project",
        });
        if (!created?.id) throw new Error("Channel Letter project create could not be verified.");
        savedId = created.id;
        persistedSource = created;
        persistedProjectIdRef.current = created.id;
        setIsEditing(true);
      }
      if (persistedSource?.updated_date) {
        setProject((prev) => ({ ...prev, updated_date: persistedSource.updated_date }));
      }
      await upsertCustomerSummaryForEstimate({
        module: "channel_letter_installation",
        client_name: project.client_name,
        project_id: savedId,
        project_name: project.project_name,
        estimate_number: project.estimate_number,
      });

      if (estimateId && savedId) {
        const savedProject = await ChannelLetterInstallation.get(savedId).catch(() => null);
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "channel_letters" },
          sourceProject: savedProject || { ...dataToSave, id: savedId },
          liveTotal: parseFloat(recalculated.total_cost) || 0,
        });
      }

      onSaved?.();
      if (!embedded) navigate(createPageUrl("Estimator"));
    } catch (e) {
      console.error(e);
      alert("Save failed: " + e.message);
    }
    setIsSaving(false);
  };

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildSummaryText(recalculated));
      alert("Summary copied to clipboard!");
    } catch (e) {
      alert("Copy failed: " + e.message);
    }
  };

  const exportCSV = () => downloadCSV(recalculated);

  // --- Copy materials list helpers ---
  const [materialsCopied, setMaterialsCopied] = useState(null); // "plain" | "priced" | null
  const flashCopied = (which) => {
    setMaterialsCopied(which);
    setTimeout(() => setMaterialsCopied(null), 1800);
  };

  const buildPlainMaterialsList = () => {
    if (aggregatedMaterials.length === 0) return "";
    const sorted = [...aggregatedMaterials].sort((a, b) => a.item_name.localeCompare(b.item_name));
    const qtyWidth = Math.max(3, ...sorted.map(m => m.quantity.toFixed(2).length));
    const lines = sorted.map(m => `${m.quantity.toFixed(2).padStart(qtyWidth)}  ${m.item_name}`);
    return [
      "MATERIALS LIST",
      `${project.project_name || "Untitled Project"}${project.estimate_number ? ` — ${project.estimate_number}` : ""}`,
      "─".repeat(40),
      ...lines,
    ].join("\n");
  };

  const buildPricedMaterialsList = () => {
    if (aggregatedMaterials.length === 0) return "";
    const sorted = [...aggregatedMaterials].sort((a, b) => a.item_name.localeCompare(b.item_name));
    const nameWidth = Math.max(4, ...sorted.map(m => m.item_name.length));
    const qtyWidth = Math.max(3, ...sorted.map(m => m.quantity.toFixed(2).length));
    const unitWidth = Math.max(6, ...sorted.map(m => `$${m.unit_cost.toFixed(2)}`.length));
    const totalWidth = Math.max(6, ...sorted.map(m => `$${m.total_cost.toFixed(2)}`.length));

    const header = `${"Item".padEnd(nameWidth)}  ${"Qty".padStart(qtyWidth)}  ${"Unit".padStart(unitWidth)}  ${"Total".padStart(totalWidth)}`;
    const divider = "─".repeat(header.length);
    const rows = sorted.map(m =>
      `${m.item_name.padEnd(nameWidth)}  ${m.quantity.toFixed(2).padStart(qtyWidth)}  ${`$${m.unit_cost.toFixed(2)}`.padStart(unitWidth)}  ${`$${m.total_cost.toFixed(2)}`.padStart(totalWidth)}`
    );
    const totalLine = `${"MATERIALS TOTAL".padEnd(nameWidth + qtyWidth + unitWidth + 4)}  ${fmt(recalculated.total_materials_cost).padStart(totalWidth)}`;

    return [
      "MATERIALS LIST (WITH PRICING)",
      `${project.project_name || "Untitled Project"}${project.estimate_number ? ` — ${project.estimate_number}` : ""}`,
      divider,
      header,
      divider,
      ...rows,
      divider,
      totalLine,
    ].join("\n");
  };

  const copyMaterialsPlain = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainMaterialsList());
      flashCopied("plain");
    } catch (e) { alert("Copy failed: " + e.message); }
  };

  const copyMaterialsPriced = async () => {
    try {
      await navigator.clipboard.writeText(buildPricedMaterialsList());
      flashCopied("priced");
    } catch (e) { alert("Copy failed: " + e.message); }
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
        <div className="max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800">
          <div className="font-bold">Channel / Dimensional Letter Builder unavailable</div>
          <div className="mt-1 text-sm">Required Settings, installation inventory, equipment, or project data could not be verified. Fallback configuration was not used.</div>
          <div className="mt-2 text-xs break-words">{loadError}</div>
          <Button variant="outline" className="mt-4" onClick={() => embedded ? onClose?.() : navigate(estimateId ? `/EstimateDetail?id=${estimateId}` : createPageUrl("Estimator"))}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-3">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Wrench className="w-8 h-8 text-purple-600" />
              {isEditing ? "Edit" : "New"} Channel / Dimensional Letter / Lobby Sign Estimate
            </h1>
            <p className="text-slate-600">Multi-item estimate — letters, install, crew</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setHelpTrigger(true)}
              className="bg-purple-50 border-purple-200 text-purple-800 hover:bg-purple-100"
              title="Walk me through this page"
            >
              <HelpCircle className="w-4 h-4 mr-2" /> Help
            </Button>
            <Button
              variant="outline"
              onClick={() => setPhotoModalOpen(true)}
              className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200 text-purple-800 hover:from-purple-100 hover:to-pink-100"
            >
              <Camera className="w-4 h-4 mr-2" /> Photo → Estimate
            </Button>
            <Link to={createPageUrl("MasterInventory")}>
              <Button variant="outline" className="bg-white">
                <Package className="w-4 h-4 mr-2" /> Inventory
              </Button>
            </Link>
            <Button variant="outline" onClick={() => embedded ? onClose?.() : navigate(createPageUrl("Estimator"))}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                {(() => {
                  const visibleTabsCount = 3 + (showLettersTab ? 1 : 0) + (showInstallTab ? 1 : 0) + (showCrewTab ? 1 : 0);
                  return (
                <TabsList className={`grid w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1`} style={{ gridTemplateColumns: `repeat(${visibleTabsCount}, minmax(0, 1fr))` }}>
                  <TabBadgeTrigger value="project" icon={FileText} label="Project" />
                  {showLettersTab && (
                    <TabBadgeTrigger value="letters" icon={Type} label="Letters" amount={recalculated.total_letters_cost} warn={hasIncompleteDimensional} />
                  )}
                  {showInstallTab && (
                    <TabBadgeTrigger
                      value="items"
                      icon={ListChecks}
                      label="Install"
                      amount={(recalculated.labor_cost_in_subtotal ?? recalculated.labor_cost ?? 0) + (recalculated.total_materials_cost || 0)}
                      count={recalculated.items.length}
                    />
                  )}
                  {showCrewTab && (
                    <TabBadgeTrigger
                      value="crew"
                      icon={HardHat}
                      label="Crew & Equipment"
                      amount={(recalculated.total_equipment_cost || 0) + (recalculated.total_personnel_cost || 0) + (recalculated.total_travel_cost || 0)}
                      warn={(recalculated.selected_equipment?.length || 0) === 0}
                    />
                  )}
                  <TabBadgeTrigger value="summary" icon={Calculator} label="Summary" amount={recalculated.total_cost} />
                  <TabBadgeTrigger value="pricing" icon={TrendingUp} label="Customer Pricing" accent />
                </TabsList>
                  );
                })()}
              </div>

              {/* PROJECT TAB */}
              <TabsContent value="project" className="mt-4 space-y-4">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Project Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {embedded ? (
                      /* Inside All-In-One: client / estimate # / link come from the
                         parent estimate. Show them read-only so they aren't re-entered. */
                      <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-4 py-3">
                        <p className="text-xs font-medium text-indigo-700 mb-2">
                          Inherited from the All-In-One estimate
                        </p>
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-500">Client</span>
                            <span className="sm:block font-medium text-slate-900">{project.client_name || "—"}</span>
                          </div>
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-500">Section Name</span>
                            <span className="sm:block font-medium text-slate-900">{project.project_name || "—"}</span>
                          </div>
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-500">Estimate #</span>
                            <span className="sm:block font-medium text-slate-900">{project.estimate_number || "—"}</span>
                          </div>
                          <div className="flex justify-between sm:block">
                            <span className="text-slate-500">Project Link</span>
                            <span className="sm:block font-medium text-slate-900 truncate">{project.hyperlink || "—"}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div id="clp-client-name">
                            <Label htmlFor="client_name">Client Name *</Label>
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
                          <div id="clp-project-name">
                            <Label htmlFor="project_name">Project Name *</Label>
                            <Input
                              id="project_name"
                              value={project.project_name}
                              onChange={(e) => updateProject({ project_name: e.target.value })}
                              placeholder="Enter project name"
                              className="mt-1"
                            />
                          </div>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div id="clp-estimate-number">
                            <Label htmlFor="estimate_number">Estimate Number <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                            <Input
                              id="estimate_number"
                              value={project.estimate_number}
                              onChange={(e) => updateProject({ estimate_number: e.target.value })}
                              placeholder="e.g., INST-2024-001"
                              className="mt-1"
                            />
                          </div>
                          <div id="clp-hyperlink">
                            <Label htmlFor="hyperlink">Project Link <span className="text-xs font-normal text-slate-400">(optional)</span></Label>
                            <Input
                              id="hyperlink"
                              value={project.hyperlink}
                              onChange={(e) => updateProject({ hyperlink: e.target.value })}
                              placeholder="https://..."
                              className="mt-1"
                            />
                          </div>
                        </div>
                      </>
                    )}
                    {/* Interior / Exterior — project-level default (each line item can override) */}
                    <div id="clp-install-env">
                      <Label className="text-sm font-semibold text-slate-900">Installation Environment</Label>
                      <p className="text-xs text-slate-500 mt-1 mb-2">
                        Default for every line item — interior installs typically have different drill/prep times than exterior. You can override this on any line item.
                      </p>
                      <div className="grid grid-cols-2 gap-2 max-w-md">
                        {[
                          { value: "exterior", label: "Exterior", desc: "Outdoor wall, parapet, storefront", color: "blue" },
                          { value: "interior", label: "Interior", desc: "Lobby, indoor wall, office signage", color: "amber" },
                        ].map((opt) => {
                          const active = (project.install_environment || "exterior") === opt.value;
                          const ringClass = opt.color === "blue"
                            ? (active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300")
                            : (active ? "border-amber-500 bg-amber-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300");
                          const titleClass = opt.color === "blue"
                            ? (active ? "text-blue-900" : "text-slate-800")
                            : (active ? "text-amber-900" : "text-slate-800");
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateProject({ install_environment: opt.value })}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${ringClass}`}
                            >
                              <div className={`text-sm font-semibold ${titleClass}`}>{opt.label}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div id="clp-project-scope">
                      <Label className="text-sm font-semibold text-slate-900">Project Scope</Label>
                      <p className="text-xs text-slate-500 mt-1 mb-2">
                        Choose what this estimate covers. Hidden tabs are excluded from totals.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {[
                          { value: "full", label: "Letters + Install", desc: "Both letter purchases and installation labor" },
                          { value: "install_only", label: "Installation Only", desc: "Install labor only — no letter purchases" },
                          { value: "letters_only", label: "Lettering / Logo Only", desc: "Letter purchases only — no install or crew" },
                        ].map((opt) => {
                          const active = (project.project_scope || "full") === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateProject({ project_scope: opt.value })}
                              className={`text-left p-3 rounded-lg border-2 transition-all ${
                                active
                                  ? "border-purple-500 bg-purple-50 shadow-sm"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <div className={`text-sm font-semibold ${active ? "text-purple-900" : "text-slate-800"}`}>
                                {opt.label}
                              </div>
                              <div className="text-[11px] text-slate-500 mt-0.5 leading-tight">{opt.desc}</div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div id="clp-site-address">
                      <Label htmlFor="site_address" className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-purple-600" />
                        Site Address
                        <span className="text-xs font-normal text-slate-500">(used for travel mileage)</span>
                      </Label>
                      <AddressAutocomplete
                        id="site_address"
                        value={project.site_address || ""}
                        onChange={(val) => updateProject({ site_address: val })}
                        placeholder="e.g., 123 Main St, Cincinnati, OH 45202"
                        className="mt-1"
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Travel cost will be calculated from your shop (
                        <Link to={createPageUrl("InstallationSettings")} className="underline hover:text-purple-700">
                          Travel settings
                        </Link>
                        ) to this address.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card id="clp-notes" className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={project.notes}
                      onChange={(e) => updateProject({ notes: e.target.value })}
                      placeholder="Add any additional notes or special considerations..."
                      className="h-32"
                    />
                  </CardContent>
                </Card>

                <div className="flex justify-end">
                  <Button
                    onClick={() => setActiveTab(showLettersTab ? "letters" : (showInstallTab ? "items" : "summary"))}
                    className="bg-purple-600 hover:bg-purple-700 text-white"
                  >
                    Continue to {showLettersTab ? "Letters" : (showInstallTab ? "Install" : "Summary")} →
                  </Button>
                </div>
              </TabsContent>

              {/* LETTERS TAB */}
              <TabsContent value="letters" className="mt-4 space-y-3">
                <LettersPurchaseTab
                  project={recalculated}
                  settings={settings}
                  onUpdateProject={updateProject}
                  incompleteDimensionalIds={incompleteDimensionalIds}
                />
              </TabsContent>

              {/* INSTALLATION TAB (formerly Items) */}
              <TabsContent value="items" className="mt-4 space-y-3">
                <div id="clp-install-ai" className="flex items-center justify-end gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2 shadow-sm">
                  <Button
                    onClick={() => setAiInstallOpen(true)}
                    size="sm"
                    className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white shadow-sm"
                  >
                    <Sparkles className="w-4 h-4 mr-1" /> AI Scope
                  </Button>
                  <Button onClick={addItem} size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add Item
                  </Button>
                </div>

                {recalculated.items.length === 0 ? (
                  <Card className="border-2 border-dashed border-slate-300 bg-white/50">
                    <CardContent className="p-12 text-center text-slate-500">
                      <ListChecks className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="mb-3 font-medium">No line items yet</p>
                      <p className="text-xs mb-4">Add your first installation item to get started</p>
                      <Button onClick={addItem} className="bg-purple-600 hover:bg-purple-700 text-white">
                        <Plus className="w-4 h-4 mr-2" /> Add Line Item
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div id="clp-install-row">
                    <ItemsList
                      items={recalculated.items}
                      inventory={inventory}
                      settings={settings}
                      compact={false}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onDuplicate={duplicateItem}
                      onReorder={reorderItems}
                    />
                  </div>
                )}
              </TabsContent>

              {/* CREW & EQUIPMENT TAB */}
              <TabsContent value="crew" className="mt-4 space-y-3">
                <div id="clp-equipment">
                  <EquipmentSelector
                    selectedEquipment={recalculated.selected_equipment || []}
                    onChange={(next) => updateProject({ selected_equipment: next })}
                    equipmentInventory={equipmentInventory}
                    items={recalculated.items}
                    projectLaborHours={recalculated.labor_hours || 0}
                    crewSize={(recalculated.personnel || []).length}
                  />
                </div>
                <div id="clp-ladder">
                  <LadderSelector
                    selectedEquipment={recalculated.selected_equipment || []}
                    onChange={(next) => updateProject({ selected_equipment: next })}
                    equipmentInventory={equipmentInventory}
                    projectLaborHours={recalculated.labor_hours || 0}
                    crewSize={(recalculated.personnel || []).length}
                  />
                </div>
                <div id="clp-personnel">
                <PersonnelSelector
                  personnel={recalculated.personnel || []}
                  onChange={(next) => updateProject({ personnel: next })}
                  projectLaborHours={recalculated.labor_hours || 0}
                  roleRates={{
                    "Crew Lead": parseFloat(settings.install_crew_lead_rate) || 75,
                    "Installer": parseFloat(settings.install_installer_rate) || 65,
                    "Helper": parseFloat(settings.install_helper_rate) || 35,
                  }}
                  items={recalculated.items}
                />
                </div>
                <div id="clp-travel">
                  <TravelCostCard
                    shopAddress={settings.install_shop_address || ""}
                    siteAddress={project.site_address || ""}
                    selectedEquipment={recalculated.selected_equipment || []}
                    equipmentInventory={equipmentInventory}
                    personnel={recalculated.personnel || []}
                    settings={settings}
                    travelMiles={project.travel_miles_round_trip || 0}
                    onMilesChange={(miles) => updateProject({ travel_miles_round_trip: miles })}
                    onTotalChange={(total) => {
                      if ((project.total_travel_cost || 0) !== total) {
                        updateProject({ total_travel_cost: total });
                      }
                    }}
                    autoTriggerKey={travelAutoKey}
                  />
                </div>
                {equipmentInventory.length === 0 && (
                  <Card className="bg-amber-50 border-amber-200">
                    <CardContent className="p-3 text-xs text-amber-900">
                      Your equipment inventory is empty.{" "}
                      <Link to={createPageUrl("MasterInventory")} className="underline font-medium">
                        Add equipment in Inventory
                      </Link>{" "}
                      to enable selection.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* SUMMARY TAB */}
              <TabsContent value="summary" className="mt-4 space-y-3">
                <div id="clp-summary-breakdown">
                  <SummaryDetailsCard project={recalculated} />
                </div>

                <Card id="clp-summary-materials" className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Boxes className="w-5 h-5 text-purple-600" />
                        Materials (Pick List)
                      </CardTitle>
                      <p className="text-xs text-slate-500 mt-1">Combined materials across all line items — your shopping list.</p>
                    </div>
                    {aggregatedMaterials.length > 0 && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyMaterialsPlain}
                          className="h-8 text-xs"
                          title="Copy materials list without pricing"
                        >
                          {materialsCopied === "plain"
                            ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied!</>
                            : <><Copy className="w-3.5 h-3.5 mr-1" /> Copy List</>}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={copyMaterialsPriced}
                          className="h-8 text-xs"
                          title="Copy materials list with pricing"
                        >
                          {materialsCopied === "priced"
                            ? <><Check className="w-3.5 h-3.5 mr-1 text-green-600" /> Copied!</>
                            : <><DollarSign className="w-3.5 h-3.5 mr-1" /> Copy with Pricing</>}
                        </Button>
                      </div>
                    )}
                  </CardHeader>
                  <CardContent className="p-0">
                    {aggregatedMaterials.length === 0 ? (
                      <div className="p-8 text-center text-slate-400 text-sm">
                        No materials yet. Add line items to populate this list.
                      </div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600 text-xs">
                          <tr>
                            <th className="text-left px-4 py-2 font-medium">Item</th>
                            <th className="text-right px-4 py-2 font-medium">Qty</th>
                            <th className="text-right px-4 py-2 font-medium">Unit $</th>
                            <th className="text-right px-4 py-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {aggregatedMaterials.map((m, i) => (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-4 py-2">{m.item_name}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{m.quantity.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right tabular-nums text-slate-500">{fmt(m.unit_cost)}</td>
                              <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(m.total_cost)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                          <tr>
                            <td colSpan="3" className="px-4 py-2 text-right font-semibold">Materials Total</td>
                            <td className="px-4 py-2 text-right font-bold tabular-nums">{fmt(recalculated.total_materials_cost)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* CUSTOMER PRICING TAB */}
              <TabsContent value="pricing" className="mt-4 space-y-3">
                <CustomerPricingTab
                  project={recalculated}
                  categorize={categorizeChannelLetterProject}
                  accentColor="purple"
                  onTierChange={(tier) => setProject((prev) => ({
                    ...prev,
                    customer_pricing: { ...(prev.customer_pricing || {}), tier_number: tier },
                  }))}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Sticky summary card on right */}
          <div className="space-y-3">
            <InstallSummaryCard
              project={recalculated}
              onUpdate={updateProject}
              onSave={saveProject}
              isSaving={isSaving}
              isEditing={isEditing}
              onCopySummary={copySummary}
              onExportCSV={exportCSV}
            />
            <CrewEquipmentHint items={recalculated.items} />
            <ValidationWarnings project={recalculated} />
            <div className="text-[10px] text-slate-400 text-center px-2">
              Shortcuts: <kbd className="px-1 bg-slate-100 rounded">⌘S</kbd> Save · <kbd className="px-1 bg-slate-100 rounded">⌘I</kbd> Add Item
            </div>
          </div>
        </div>
      </div>

      <ChannelLetterHelpAssistant
        activeTab={activeTab}
        manualTrigger={helpTrigger}
        onManualTriggerClose={() => setHelpTrigger(false)}
      />

      <PhotoEstimateModal
        open={photoModalOpen}
        onClose={() => setPhotoModalOpen(false)}
        onApply={applyPhotoEstimate}
      />

      <AIInstallScopeModal
        open={aiInstallOpen}
        onClose={() => setAiInstallOpen(false)}
        onApply={applyAIInstallItems}
      />

      <ConfirmModal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        title={confirmModal?.title}
        description={confirmModal?.description}
        confirmLabel={confirmModal?.confirmLabel}
        tone={confirmModal?.tone}
      />
    </div>
  );
}