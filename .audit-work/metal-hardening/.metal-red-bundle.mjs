// frozen:/app/src/pages/MetalEstimator.jsx
import { useState, useEffect, useCallback, useRef } from "react";

// s:s://@/api/gatedEntities
var MetalProject = {
  get: async (id) => {
    globalThis.__spies.push(["projectGet", id]);
    return globalThis.__project ?? null;
  }
};
var Settings = globalThis.__entSettings ||= { __ent: "settings" };
var Inventory = globalThis.__entInventory ||= { __ent: "inventory" };

// s:s://@/components/ui/button
import { jsx } from "react/jsx-runtime";
var Button = (p) => /* @__PURE__ */ jsx("button", { type: "button", ...p, children: p.children });

// s:s://@/components/ui/card
import { jsx as jsx2 } from "react/jsx-runtime";
var Card = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardContent = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardHeader = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });
var CardTitle = (p) => /* @__PURE__ */ jsx2("div", { ...p, children: p.children });

// s:s://@/components/ui/input
import { jsx as jsx3 } from "react/jsx-runtime";
var Input = (p) => /* @__PURE__ */ jsx3("input", { ...p });

// s:s://@/components/ui/label
import { jsx as jsx4 } from "react/jsx-runtime";
var Label = (p) => /* @__PURE__ */ jsx4("label", { ...p, children: p.children });

// s:s://@/components/ui/textarea
import { jsx as jsx5 } from "react/jsx-runtime";
var Textarea = (p) => /* @__PURE__ */ jsx5("textarea", { ...p });

// s:s://@/components/ui/select
import { jsx as jsx6 } from "react/jsx-runtime";
var Select = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectTrigger = (p) => /* @__PURE__ */ jsx6("div", { "data-trigger": true, ...p, children: p.children });
var SelectValue = () => /* @__PURE__ */ jsx6("span", {});
var SelectContent = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });
var SelectItem = (p) => /* @__PURE__ */ jsx6("div", { children: p.children });

// s:s://lucide-react
var ArrowLeft = () => null;
var Plus = () => null;
var Trash2 = () => null;
var Save = () => null;
var Wrench = () => null;
var Edit = () => null;
var Download = () => null;
var Printer = () => null;
var FileText = () => null;
var ListChecks = () => null;
var Calculator = () => null;
var TrendingUp = () => null;

// s:s://@/components/ui/tabs
import { jsx as jsx7 } from "react/jsx-runtime";
var Tabs = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsList = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsContent = (p) => /* @__PURE__ */ jsx7("div", { children: p.children });
var TabsTrigger = (p) => /* @__PURE__ */ jsx7("button", { type: "button", ...p, children: p.children });

// frozen:/app/src/pages/MetalEstimator.jsx
import { useSearchParams, useNavigate } from "react-router-dom";

// frozen:/app/src/components/channelLetterInstall/TabBadgeTrigger.jsx
import React from "react";
import { jsx as jsx8, jsxs } from "react/jsx-runtime";
var compact = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
};
var COLOR_STYLES = {
  purple: {
    active: "data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-purple-50 data-[state=inactive]:text-purple-900"
  },
  blue: {
    active: "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-blue-50 data-[state=inactive]:text-blue-900"
  },
  red: {
    active: "data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-red-50 data-[state=inactive]:text-red-900"
  },
  green: {
    active: "data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-green-50 data-[state=inactive]:text-green-900"
  },
  orange: {
    active: "data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-orange-50 data-[state=inactive]:text-orange-900"
  }
};
function TabBadgeTrigger({ value, icon: Icon, label, amount, count, warn, accent, color = "purple" }) {
  const hasAmount = parseFloat(amount) > 0;
  const styles = COLOR_STYLES[color] || COLOR_STYLES.purple;
  return /* @__PURE__ */ jsxs(
    TabsTrigger,
    {
      value,
      className: `
        flex flex-row items-center justify-center gap-1.5 h-7 px-2 rounded-lg
        text-slate-700
        ${styles.active}
        ${accent ? styles.accent : ""}
        relative transition-all
      `,
      children: [
        /* @__PURE__ */ jsx8(Icon, { className: "w-3.5 h-3.5" }),
        /* @__PURE__ */ jsx8("span", { className: "text-xs font-medium", children: label }),
        count != null && /* @__PURE__ */ jsx8("span", { className: "text-[10px] bg-slate-200 text-slate-700 data-[state=active]:bg-white/20 data-[state=active]:text-white rounded-full px-1.5 py-0 leading-tight", children: count }),
        hasAmount && /* @__PURE__ */ jsx8("span", { className: "text-[10px] tabular-nums font-semibold opacity-80 leading-tight", children: compact(amount) }),
        warn && /* @__PURE__ */ jsx8("span", { className: "w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse", title: "Action required" })
      ]
    }
  );
}

// s:s://@/components/markup/CustomerPricingTab
import { jsx as jsx9 } from "react/jsx-runtime";
var CustomerPricingTab_default = () => /* @__PURE__ */ jsx9("div", { "data-stub": "CustomerPricingTab" });

// frozen:/app/src/components/markup/projectCategorizer.jsx
var num = (v) => Number(v) || 0;
var _catCache = /* @__PURE__ */ new WeakMap();
var _catMemo = (p, compute) => {
  if (!p || typeof p !== "object") return compute(p);
  let byFn = _catCache.get(p);
  if (byFn && byFn.has(compute)) return byFn.get(compute);
  const out = compute(p);
  if (!byFn) {
    byFn = /* @__PURE__ */ new Map();
    _catCache.set(p, byFn);
  }
  byFn.set(compute, out);
  return out;
};
function _impl_categorizeMetalProject(p) {
  if (!p) return [];
  const lines = [];
  const mat = num(p.total_material_cost) + num(p.total_supplies_cost);
  if (mat > 0) lines.push({ module: "metal", label: "Metal Fab Material", cost: mat, category_key: "substrates" });
  const labor = num(p.total_fabrication_cost) + num(p.total_welding_cost) + num(p.total_finishing_cost);
  if (labor > 0) lines.push({ module: "metal", label: "Metal Fab Labor", cost: labor, category_key: "inhouse_labor" });
  return lines;
}
var categorizeMetalProject = (p) => _catMemo(p, _impl_categorizeMetalProject);

// s:s://@/components/markup/savedCustomerPricing
async function calculateSavedCustomerPricing(a) {
  globalThis.__spies.push(["pricing", a]);
  return null;
}

// s:s://@/components/estimator/builder/builderService
var recordBuilderSave = async (a) => {
  globalThis.__spies.push(["recordBuilderSave", a]);
  return { ok: true };
};

// s:s://@/components/estimator/loadAllEntityRows
async function loadAllEntityRows(a) {
  globalThis.__catalogReads.push(a.label);
  if (a.entity === globalThis.__entSettings) return globalThis.__settingRows || [];
  if (a.entity === globalThis.__entInventory) return globalThis.__inventoryRows || [];
  return [];
}

// s:s://@/components/estimator/builder/sourceProjectPersistence
var updateBuilderSourceProject = async (a) => {
  globalThis.__spies.push(["saveSource", a]);
  return { ...a.data, id: a.sourceId, updated_date: "v2" };
};
var preflightBuilderSourceMutation = async (a) => {
  globalThis.__spies.push(["preflight", a]);
};

// frozen:/app/src/components/estimator/builder/itemIdentity.js
function newBuilderItemId(prefix = "item") {
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${uuid}`;
}
function seedBuilderItemIds(items = []) {
  return (items || []).map((item, index) => ({
    ...item || {},
    builder_item_id: String(item?.builder_item_id ?? index)
  }));
}

// s:s://@/components/estimator/idempotentEntityCreate
var ensureIdempotentEntityCreate = async (a) => {
  globalThis.__spies.push(["ensureIdempotent", a]);
  return { ...a.data, id: "new-1", updated_date: "v1" };
};
var newCreationRequestKey = (k) => "key-" + k + "-" + (globalThis.__kseq = (globalThis.__kseq || 0) + 1);

// s:s://@/components/estimator/moduleShared/ModuleActionBar
import { jsx as jsx10 } from "react/jsx-runtime";
var ModuleActionBar_default = (p) => /* @__PURE__ */ jsx10("button", { type: "button", "data-stub": "copy", onClick: p.onSaveAsCopy, children: "copy" });

// s:s://@/components/estimator/moduleShared/ModuleTemplateDialog
var ModuleTemplateDialog_default = () => null;

// s:s://@/components/estimator/moduleShared/moduleProjectActions
var saveModuleProjectCopy = async (a) => {
  globalThis.__spies.push(["saveCopy", a]);
  return { id: "copy-1" };
};

// s:s://@/components/staff/staffEntities
var staffEntities = {
  AllInOneEstimate: { get: async (id) => globalThis.__estimate ?? null }
};

// frozen:/app/src/pages/MetalEstimator.jsx
import { Fragment, jsx as jsx11, jsxs as jsxs2 } from "react/jsx-runtime";
var itemTypes = ["channel_letters", "cabinet_sign", "monument_sign", "pole_sign", "flat_cut_letters", "fabricated_letters", "frame_assembly", "custom_brackets"];
var escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
function MetalEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    items: [],
    fabrication_rate: 65,
    welding_rate: 75,
    finishing_rate: 55,
    notes: ""
  });
  const [_globalSettings, setGlobalSettings] = useState({});
  const [inventory, setInventory] = useState([]);
  const [estimateContext, setEstimateContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });
  const copyAttemptRef = useRef({ signature: "", key: "" });
  const [templateMode, setTemplateMode] = useState(null);
  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    copyAttemptRef.current = { signature: "", key: "" };
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setLoadError("");
      try {
        const [settingsData, inventoryData, existing, estimate] = await Promise.all([
          loadAllEntityRows({ entity: Settings, sort: "created_date", label: "Estimator Settings" }),
          loadAllEntityRows({ entity: Inventory, sort: "created_date", label: "Metal inventory" }),
          editId ? MetalProject.get(editId) : Promise.resolve(null),
          estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null)
        ]);
        if (cancelled) return;
        const settingsObj = {};
        (settingsData || []).forEach((s) => {
          settingsObj[s.setting_name] = s.setting_value;
        });
        setGlobalSettings(settingsObj);
        setInventory(inventoryData || []);
        setEstimateContext(estimate || null);
        const sourceDefaults = {
          // Migrated SignEstimate Pro Settings use the metal_* names. Keep the
          // older generic aliases as a fallback only so historical environments
          // are not broken if they still contain them.
          fabrication_rate: parseFloat(settingsObj.metal_fabrication_rate ?? settingsObj.fabrication_rate) || 65,
          welding_rate: parseFloat(settingsObj.metal_welding_rate ?? settingsObj.welding_rate) || 75,
          finishing_rate: parseFloat(settingsObj.metal_finishing_rate ?? settingsObj.finishing_rate) || 55,
          notes: settingsObj.default_notes_template || ""
        };
        if (existing) {
          setProject((prev) => ({
            ...prev,
            ...existing,
            client_name: estimate?.client_name || existing.client_name || prev.client_name,
            customer_id: estimate?.customer_id || existing.customer_id,
            estimate_number: estimate?.estimate_number || existing.estimate_number,
            items: seedBuilderItemIds(existing.items || [])
          }));
          setIsEditing(true);
        } else {
          setProject((prev) => ({
            ...prev,
            ...sourceDefaults,
            client_name: estimate?.client_name || prev.client_name,
            customer_id: estimate?.customer_id,
            estimate_number: estimate?.estimate_number || prev.estimate_number
          }));
          setIsEditing(false);
        }
      } catch (error) {
        console.error("Error loading metal estimator:", error);
        if (!cancelled) setLoadError(error?.message || "Metal Builder prerequisites could not be verified.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [editId, estimateId]);
  const addItem = () => {
    setTimeout(() => document.querySelector(`input[data-item-desc="${(project.items || []).length}"]`)?.focus(), 60);
    setProject((prev) => ({
      ...prev,
      items: [...prev.items, {
        builder_item_id: newBuilderItemId("metal-item"),
        item_type: "fabricated_letters",
        description: "",
        inventory_item_id: null,
        material_length_ft: 0,
        quantity: 1,
        fabrication_hours: 0,
        welding_hours: 0,
        finishing_hours: 0,
        material_cost: 0,
        // cost per unit of material_length_ft * cost_per_unit
        supplies_cost: 0,
        // cost per item
        fabrication_cost: 0,
        // cost per unit
        welding_cost: 0,
        // cost per unit
        finishing_cost: 0
        // cost per unit
      }]
    }));
  };
  const removeItem = (index) => {
    if (!window.confirm("Remove this item?")) return;
    setProject((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };
  const updateItem = (index, field, value) => {
    setProject((prev) => {
      const newItems = [...prev.items];
      let item = { ...newItems[index], [field]: value };
      const inventoryItem = inventory.find((i) => i.id === item.inventory_item_id);
      if (inventoryItem) {
        item.material_cost = (item.material_length_ft || 0) * (inventoryItem.cost_per_unit || 0);
      }
      item.fabrication_cost = (item.fabrication_hours || 0) * prev.fabrication_rate;
      item.welding_cost = (item.welding_hours || 0) * prev.welding_rate;
      item.finishing_cost = (item.finishing_hours || 0) * prev.finishing_rate;
      newItems[index] = { ...item };
      return { ...prev, items: newItems };
    });
  };
  const calculateTotals = useCallback(() => {
    const totals = {
      material: 0,
      // Total for all items including quantity
      supplies: 0,
      // Total for all items including quantity
      fabrication: 0,
      // Total for all items including quantity
      welding: 0,
      // Total for all items including quantity
      finishing: 0
      // Total for all items including quantity
    };
    project.items.forEach((item) => {
      totals.material += (item.material_cost || 0) * (item.quantity || 1);
      totals.supplies += (item.supplies_cost || 0) * (item.quantity || 1);
      totals.fabrication += (item.fabrication_cost || 0) * (item.quantity || 1);
      totals.welding += (item.welding_cost || 0) * (item.quantity || 1);
      totals.finishing += (item.finishing_cost || 0) * (item.quantity || 1);
    });
    return totals;
  }, [project.items]);
  const getProjectCalculations = useCallback(() => {
    const currentTotals = calculateTotals();
    const totalMaterialsCost2 = currentTotals.material;
    const totalSuppliesCost2 = currentTotals.supplies;
    const totalFabricationCost2 = currentTotals.fabrication;
    const totalWeldingCost2 = currentTotals.welding;
    const totalFinishingCost2 = currentTotals.finishing;
    const totalLaborCost = totalFabricationCost2 + totalWeldingCost2 + totalFinishingCost2;
    const enrichedItems = project.items.map((item) => {
      const inventoryItem = inventory.find((i) => i.id === item.inventory_item_id);
      const materialType = inventoryItem ? inventoryItem.material_type : "N/A";
      const itemTypeDisplay = item.item_type ? item.item_type.replace(/_/g, " ") : "N/A";
      let length = "N/A", width = "N/A", thickness = "N/A";
      let dimensionsDisplay = "N/A";
      if (inventoryItem && inventoryItem.size) {
        dimensionsDisplay = inventoryItem.size;
        const sizeString = inventoryItem.size.toLowerCase().replace(/['"inchesftt]/g, "").trim();
        const parts = sizeString.split(/[xÃ—]/).map((p) => p.trim());
        if (parts.length >= 1) length = parts[0];
        if (parts.length >= 2) width = parts[1];
        if (parts.length >= 3) thickness = parts[2];
      }
      const laborHoursPerUnit = (item.fabrication_hours || 0) + (item.welding_hours || 0) + (item.finishing_hours || 0);
      const materialsCostTotal = (item.material_cost || 0) * (item.quantity || 1);
      const suppliesCostTotal = (item.supplies_cost || 0) * (item.quantity || 1);
      const laborCostTotal = ((item.fabrication_cost || 0) + (item.welding_cost || 0) + (item.finishing_cost || 0)) * (item.quantity || 1);
      return {
        ...item,
        item_type_display: itemTypeDisplay,
        material_type: materialType,
        dimensions_display: dimensionsDisplay,
        length,
        width,
        thickness,
        labor_hours: laborHoursPerUnit,
        // Labor hours per *unit*
        materials_cost: materialsCostTotal,
        supplies_cost: suppliesCostTotal,
        labor_cost: laborCostTotal
      };
    });
    return {
      totalMaterialsCost: totalMaterialsCost2,
      totalSuppliesCost: totalSuppliesCost2,
      totalFabricationCost: totalFabricationCost2,
      totalWeldingCost: totalWeldingCost2,
      totalFinishingCost: totalFinishingCost2,
      totalLaborCost,
      grandTotal: totalMaterialsCost2 + totalSuppliesCost2 + totalLaborCost,
      enrichedItems
    };
  }, [project.items, inventory, calculateTotals]);
  useEffect(() => {
    if (!isSaving) return void 0;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSaving]);
  const saveProject = async () => {
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert("Please fill in project name and client name");
      return;
    }
    setIsSaving(true);
    try {
      const {
        totalMaterialsCost: totalMaterialsCost2,
        totalSuppliesCost: totalSuppliesCost2,
        totalFabricationCost: totalFabricationCost2,
        totalWeldingCost: totalWeldingCost2,
        totalFinishingCost: totalFinishingCost2,
        totalLaborCost
      } = getProjectCalculations();
      const totalCost = totalMaterialsCost2 + totalSuppliesCost2 + totalLaborCost;
      const pricingProject = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        total_material_cost: totalMaterialsCost2,
        total_supplies_cost: totalSuppliesCost2,
        total_fabrication_cost: totalFabricationCost2,
        total_welding_cost: totalWeldingCost2,
        total_finishing_cost: totalFinishingCost2
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeMetalProject,
        tierNumber: project.customer_pricing?.tier_number
      });
      const finalProject = {
        ...pricingProject,
        customer_pricing: customerPricing || project.customer_pricing,
        total_cost: totalCost,
        // CCS-only simplified pricing fields remain in the schema for compatibility,
        // but Git-authoritative Metal pricing does not use them.
        subtotal: totalCost,
        markup_amount: 0,
        markup_percent: 0,
        status: "calculated"
      };
      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: MetalProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: finalProject,
          estimateId,
          label: "Metal project"
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(finalProject);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("metal_project")
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: MetalProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: finalProject,
          label: "Metal project"
        });
        if (!saved?.id) throw new Error("Metal project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;
      if (estimateId && savedId) {
        const refreshed = await MetalProject.get(savedId).catch(() => ({ ...finalProject, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "metal" },
          sourceProject: {
            ...refreshed,
            builder_calculation: {
              totals: {
                total_material_cost: totalMaterialsCost2,
                total_supplies_cost: totalSuppliesCost2,
                total_fabrication_cost: totalFabricationCost2,
                total_welding_cost: totalWeldingCost2,
                total_finishing_cost: totalFinishingCost2,
                total_labor_cost: totalLaborCost,
                total_cost: totalCost
              }
            }
          },
          liveTotal: totalCost
        });
      }
      setProject((prev) => ({
        ...prev,
        ...finalProject,
        id: savedId || prev.id,
        updated_date: saved?.updated_date || prev.updated_date
      }));
      onSaved?.();
      if (!embedded) alert(isEditing ? "Project updated successfully!" : "Project saved successfully!");
    } catch (error) {
      console.error("Error saving project:", error);
      alert("Error saving project. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };
  const handleSaveAsCopy = async () => {
    setIsSaving(true);
    try {
      const {
        totalMaterialsCost: totalMaterialsCost2,
        totalSuppliesCost: totalSuppliesCost2,
        totalFabricationCost: totalFabricationCost2,
        totalWeldingCost: totalWeldingCost2,
        totalFinishingCost: totalFinishingCost2,
        totalLaborCost
      } = getProjectCalculations();
      const copy = await saveModuleProjectCopy({
        entity: MetalProject,
        payload: {
          ...project,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          total_material_cost: totalMaterialsCost2,
          total_supplies_cost: totalSuppliesCost2,
          total_fabrication_cost: totalFabricationCost2,
          total_welding_cost: totalWeldingCost2,
          total_finishing_cost: totalFinishingCost2,
          total_cost: totalMaterialsCost2 + totalSuppliesCost2 + totalLaborCost,
          subtotal: totalMaterialsCost2 + totalSuppliesCost2 + totalLaborCost,
          markup_amount: 0,
          markup_percent: 0,
          status: "calculated"
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "metal_project_copy",
        baseName: project.project_name || "Metal",
        label: "Metal project copy"
      });
      if (embedded) onSaved?.();
      else navigate(`/MetalEstimator?edit=${copy.id}`);
    } catch (e) {
      console.error(e);
      alert("Save copy failed: " + e.message);
    } finally {
      setIsSaving(false);
    }
  };
  const buildMetalTemplateData = (p) => ({
    items: p.items || [],
    fabrication_rate: p.fabrication_rate,
    welding_rate: p.welding_rate,
    finishing_rate: p.finishing_rate,
    notes: p.notes
  });
  const downloadEstimate = () => {
    const {
      totalMaterialsCost: totalMaterialsCost2,
      totalSuppliesCost: totalSuppliesCost2,
      totalLaborCost,
      grandTotal: grandTotal2,
      enrichedItems
    } = getProjectCalculations();
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Metal Estimate - ${escHtml(project.project_name)}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px;
      color: #1e293b;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      min-height: 100vh;
    }
    
    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      overflow: hidden;
    }
    
    .header {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }
    
    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    .header .subtitle {
      font-size: 16px;
      opacity: 0.95;
      font-weight: 500;
    }
    
    .project-info {
      padding: 30px 40px;
      background: #f8fafc;
      border-bottom: 3px solid #e2e8f0;
    }
    
    .project-info h2 {
      color: #475569;
      font-size: 14px;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 15px;
      font-weight: 600;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
    }
    
    .info-item {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .info-label {
      font-weight: 600;
      color: #64748b;
      font-size: 13px;
    }
    
    .info-value {
      color: #1e293b;
      font-size: 13px;
    }
    
    .content {
      padding: 40px;
    }
    
    .section-title {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 25px;
      padding-bottom: 10px;
      border-bottom: 3px solid #f97316;
      display: inline-block;
    }
    
    .item {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
    }
    
    .item-header {
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin: -25px -25px 20px -25px;
      font-weight: 600;
      font-size: 16px;
    }
    
    .item-details {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 15px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    
    .detail-label {
      font-weight: 600;
      color: #64748b;
      font-size: 13px;
    }
    
    .detail-value {
      color: #1e293b;
      font-weight: 500;
      font-size: 13px;
    }
    
    .item-costs {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 15px;
      margin-top: 20px;
      padding-top: 20px;
      border-top: 2px dashed #cbd5e1;
    }
    
    .cost-box {
      background: white;
      padding: 15px;
      border-radius: 8px;
      border: 2px solid #e2e8f0;
    }
    
    .cost-box.materials {
      border-color: #f97316;
      background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
    }
    
    .cost-box.supplies {
      border-color: #8b5cf6;
      background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
    }
    
    .cost-box.labor {
      border-color: #3b82f6;
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    }
    
    .cost-label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #64748b;
      font-weight: 600;
      margin-bottom: 5px;
    }
    
    .cost-value {
      font-size: 20px;
      font-weight: 700;
      color: #1e293b;
    }
    
    .summary {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 3px solid #e2e8f0;
      border-radius: 16px;
      padding: 30px;
      margin-top: 40px;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    
    .summary-row:last-child {
      border-bottom: none;
    }
    
    .summary-label {
      font-weight: 600;
      color: #475569;
      font-size: 15px;
    }
    
    .summary-value {
      font-weight: 700;
      color: #1e293b;
      font-size: 15px;
    }
    
    .summary-row.materials .summary-value { color: #f97316; }
    .summary-row.supplies .summary-value { color: #8b5cf6; }
    .summary-row.labor .summary-value { color: #3b82f6; }
    
    .total-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 3px solid #f97316;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .total-label {
      font-size: 24px;
      font-weight: 700;
      color: #1e293b;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .total-value {
      font-size: 36px;
      font-weight: 800;
      background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    
    .notes {
      background: #fef3c7;
      border: 2px solid #fbbf24;
      border-radius: 12px;
      padding: 25px;
      margin-top: 30px;
    }
    
    .notes h3 {
      color: #92400e;
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    
    .notes p {
      color: #78350f;
      line-height: 1.6;
      font-size: 14px;
    }
    
    .footer {
      background: #1e293b;
      color: white;
      padding: 20px;
      text-align: center;
      font-size: 12px;
    }
    
    @media print {
      body { 
        background: white;
        padding: 0;
      }
      .container {
        box-shadow: none;
        border-radius: 0;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>\xF0\u0178\u201D\xA8 Metal Fabrication Estimate</h1>
      <div class="subtitle">Custom Metal Work & Fabrication</div>
    </div>
    
    <div class="project-info">
      <h2>Project Details</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Project:</span>
          <span class="info-value">${escHtml(project.project_name)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Client:</span>
          <span class="info-value">${escHtml(project.client_name)}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Date:</span>
          <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">Items Breakdown</div>
      
      ${enrichedItems.map((item, i) => `
        <div class="item">
          <div class="item-header">
            Item ${i + 1}: ${escHtml(item.description || "Metal fabrication item")}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Type:</span>
              <span class="detail-value">${escHtml(item.item_type_display)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${escHtml(item.material_type)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${escHtml(item.dimensions_display)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${escHtml(item.quantity)}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Labor Hours:</span>
              <span class="detail-value">${item.labor_hours.toFixed(2)} hrs (per unit)</span>
            </div>
          </div>
          
          <div class="item-costs">
            <div class="cost-box materials">
              <div class="cost-label">Materials</div>
              <div class="cost-value">$${item.materials_cost.toFixed(2)}</div>
            </div>
            <div class="cost-box supplies">
              <div class="cost-label">Supplies</div>
              <div class="cost-value">$${item.supplies_cost.toFixed(2)}</div>
            </div>
            <div class="cost-box labor">
              <div class="cost-label">Labor</div>
              <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `).join("")}
      
      <div class="summary">
        <div class="section-title" style="border-color: #f97316;">Cost Summary</div>
        
        <div class="summary-row materials">
          <span class="summary-label">Total Materials Cost:</span>
          <span class="summary-value">$${totalMaterialsCost2.toFixed(2)}</span>
        </div>
        <div class="summary-row supplies">
          <span class="summary-label">Total Supplies Cost:</span>
          <span class="summary-value">$${totalSuppliesCost2.toFixed(2)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">$${totalLaborCost.toFixed(2)}</span>
        </div>
        
        <div class="total-row">
          <span class="total-label">Total Estimate</span>
          <span class="total-value">$${grandTotal2.toFixed(2)}</span>
        </div>
      </div>
      
      ${project.notes ? `
        <div class="notes">
          <h3>\xF0\u0178\u201C\uFFFD Additional Notes</h3>
          <p>${escHtml(project.notes)}</p>
        </div>
      ` : ""}
    </div>
    
    <div class="footer">
      Generated by SignEstimate Pro - Professional Estimating Suite<br>
      \xC2\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
    </div>
  </div>
</body>
</html>
    `;
    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.project_name.replace(/\s+/g, "_")}_Metal_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  const printEstimate = () => {
    const {
      totalMaterialsCost: totalMaterialsCost2,
      totalSuppliesCost: totalSuppliesCost2,
      totalLaborCost,
      grandTotal: grandTotal2,
      enrichedItems
    } = getProjectCalculations();
    const printContent = `
      <html>
        <head>
          <title>Metal Estimate - ${escHtml(project.project_name)}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 40px;
              color: #1e293b;
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              min-height: 100vh;
            }
            
            .container {
              max-width: 900px;
              margin: 0 auto;
              background: white;
              border-radius: 20px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              overflow: hidden;
            }
            
            .header {
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              color: white;
              padding: 40px;
              text-align: center;
            }
            
            .header h1 {
              font-size: 32px;
              font-weight: 700;
              margin-bottom: 10px;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            
            .header .subtitle {
              font-size: 16px;
              opacity: 0.95;
              font-weight: 500;
            }
            
            .project-info {
              padding: 30px 40px;
              background: #f8fafc;
              border-bottom: 3px solid #e2e8f0;
            }
            
            .project-info h2 {
              color: #475569;
              font-size: 14px;
              text-transform: uppercase;
              letter-spacing: 1px;
              margin-bottom: 15px;
              font-weight: 600;
            }
            
            .info-grid {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
            }
            
            .info-item {
              display: flex;
              align-items: center;
              gap: 8px;
            }
            
            .info-label {
              font-weight: 600;
              color: #64748b;
              font-size: 13px;
            }
            
            .info-value {
              color: #1e293b;
              font-size: 13px;
            }
            
            .content {
              padding: 40px;
            }
            
            .section-title {
              font-size: 20px;
              font-weight: 700;
              color: #1e293b;
              margin-bottom: 25px;
              padding-bottom: 10px;
              border-bottom: 3px solid #f97316;
              display: inline-block;
            }
            
            .item {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px;
              margin-bottom: 20px;
            }
            
            .item-header {
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              color: white;
              padding: 12px 20px;
              border-radius: 8px;
              margin: -25px -25px 20px -25px;
              font-weight: 600;
              font-size: 16px;
            }
            
            .item-details {
              display: grid;
              grid-template-columns: repeat(2, 1fr);
              gap: 12px;
              margin-bottom: 15px;
            }
            
            .detail-row {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
            }
            
            .detail-label {
              font-weight: 600;
              color: #64748b;
              font-size: 13px;
            }
            
            .detail-value {
              color: #1e293b;
              font-weight: 500;
              font-size: 13px;
            }
            
            .item-costs {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 15px;
              margin-top: 20px;
              padding-top: 20px;
              border-top: 2px dashed #cbd5e1;
            }
            
            .cost-box {
              background: white;
              padding: 15px;
              border-radius: 8px;
              border: 2px solid #e2e8f0;
            }
            
            .cost-box.materials {
              border-color: #f97316;
              background: linear-gradient(135deg, #fed7aa 0%, #fdba74 100%);
            }
            
            .cost-box.supplies {
              border-color: #8b5cf6;
              background: linear-gradient(135deg, #e9d5ff 0%, #d8b4fe 100%);
            }
            
            .cost-box.labor {
              border-color: #3b82f6;
              background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            }
            
            .cost-label {
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.5px;
              color: #64748b;
              font-weight: 600;
              margin-bottom: 5px;
            }
            
            .cost-value {
              font-size: 20px;
              font-weight: 700;
              color: #1e293b;
            }
            
            .summary {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 3px solid #e2e8f0;
              border-radius: 16px;
              padding: 30px;
              margin-top: 40px;
            }
            
            .summary-row {
              display: flex;
              justify-content: space-between;
              padding: 12px 0;
              border-bottom: 1px solid #e2e8f0;
            }
            
            .summary-row:last-child {
              border-bottom: none;
            }
            
            .summary-label {
              font-weight: 600;
              color: #475569;
              font-size: 15px;
            }
            
            .summary-value {
              font-weight: 700;
              color: #1e293b;
              font-size: 15px;
            }
            
            .summary-row.materials .summary-value { color: #f97316; }
            .summary-row.supplies .summary-value { color: #8b5cf6; }
            .summary-row.labor .summary-value { color: #3b82f6; }
            
            .total-row {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 3px solid #f97316;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            
            .total-label {
              font-size: 24px;
              font-weight: 700;
              color: #1e293b;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .total-value {
              font-size: 36px;
              font-weight: 800;
              background: linear-gradient(135deg, #f97316 0%, #ea580c 100%);
              -webkit-background-clip: text;
              -webkit-text-fill-color: transparent;
              background-clip: text;
            }
            
            .notes {
              background: #fef3c7;
              border: 2px solid #fbbf24;
              border-radius: 12px;
              padding: 25px;
              margin-top: 30px;
            }
            
            .notes h3 {
              color: #92400e;
              font-size: 16px;
              font-weight: 700;
              margin-bottom: 15px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            
            .notes p {
              color: #78350f;
              line-height: 1.6;
              font-size: 14px;
            }
            
            .footer {
              background: #1e293b;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 12px;
            }
            
            @media print {
              body { 
                background: white;
                padding: 0;
              }
              .container {
                box-shadow: none;
                border-radius: 0;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>\xF0\u0178\u201D\xA8 Metal Fabrication Estimate</h1>
              <div class="subtitle">Custom Metal Work & Fabrication</div>
            </div>
            
            <div class="project-info">
              <h2>Project Details</h2>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Project:</span>
                  <span class="info-value">${escHtml(project.project_name)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Client:</span>
                  <span class="info-value">${escHtml(project.client_name)}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Date:</span>
                  <span class="info-value">${(/* @__PURE__ */ new Date()).toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div class="content">
              <div class="section-title">Items Breakdown</div>
              
              ${enrichedItems.map((item, i) => `
                <div class="item">
                  <div class="item-header">
                    Item ${i + 1}: ${escHtml(item.description || "Metal fabrication item")}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value">${escHtml(item.item_type_display)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${escHtml(item.material_type)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${escHtml(item.dimensions_display)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${escHtml(item.quantity)}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Labor Hours:</span>
                      <span class="detail-value">${item.labor_hours.toFixed(2)} hrs (per unit)</span>
                    </div>
                  </div>
                  
                  <div class="item-costs">
                    <div class="cost-box materials">
                      <div class="cost-label">Materials</div>
                      <div class="cost-value">$${item.materials_cost.toFixed(2)}</div>
                    </div>
                    <div class="cost-box supplies">
                      <div class="cost-label">Supplies</div>
                      <div class="cost-value">$${item.supplies_cost.toFixed(2)}</div>
                    </div>
                    <div class="cost-box labor">
                      <div class="cost-label">Labor</div>
                      <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              `).join("")}
              
              <div class="summary">
                <div class="section-title" style="border-color: #f97316;">Cost Summary</div>
                
                <div class="summary-row materials">
                  <span class="summary-label">Total Materials Cost:</span>
                  <span class="summary-value">$${totalMaterialsCost2.toFixed(2)}</span>
                </div>
                <div class="summary-row supplies">
                  <span class="summary-label">Total Supplies Cost:</span>
                  <span class="summary-value">$${totalSuppliesCost2.toFixed(2)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">$${totalLaborCost.toFixed(2)}</span>
                </div>
                
                <div class="total-row">
                  <span class="total-label">Total Estimate</span>
                  <span class="total-value">$${grandTotal2.toFixed(2)}</span>
                </div>
              </div>
              
              ${project.notes ? `
                <div class="notes">
                  <h3>\xF0\u0178\u201C\uFFFD Additional Notes</h3>
                  <p>${escHtml(project.notes)}</p>
                </div>
              ` : ""}
            </div>
            
            <div class="footer">
              Generated by SignEstimate Pro - Professional Estimating Suite<br>
              \xC2\xA9 ${(/* @__PURE__ */ new Date()).getFullYear()} All Rights Reserved
            </div>
          </div>
        </body>
      </html>
    `;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };
  const { totalMaterialsCost, totalSuppliesCost, totalFabricationCost, totalWeldingCost, totalFinishingCost, grandTotal } = getProjectCalculations();
  const stockFt = Math.max(1, Number(project.stock_length_ft) || 20);
  const cutPlan = (() => {
    const pieces = [];
    (project.items || []).forEach((it) => {
      const len = Number(it.material_length_ft) || 0;
      const qty = Math.max(1, Number(it.quantity) || 1);
      for (let i = 0; i < qty && len > 0; i += 1) pieces.push(len);
    });
    if (!pieces.length) return null;
    const bins = [];
    pieces.sort((a, b) => b - a).forEach((p) => {
      const bin = bins.find((b) => b.remain >= p - 1e-3);
      if (bin) {
        bin.remain -= p;
        bin.cuts.push(p);
      } else bins.push({ remain: Math.max(0, stockFt - p), cuts: [p], oversize: p > stockFt + 1e-3 });
    });
    return { sticks: bins.length, wasteFt: bins.reduce((s, b) => s + b.remain, 0), oversize: bins.filter((b) => b.oversize).length };
  })();
  if (isLoading) return /* @__PURE__ */ jsx11("div", { className: "p-8", children: "Loading..." });
  if (loadError) return /* @__PURE__ */ jsx11("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: /* @__PURE__ */ jsxs2("div", { className: "max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800", children: [
    /* @__PURE__ */ jsx11("div", { className: "font-bold", children: "Metal Builder unavailable" }),
    /* @__PURE__ */ jsx11("div", { className: "mt-1 text-sm", children: "Required Settings, inventory, project data, or estimate context could not be verified. Hard-coded fallback rates were not used." }),
    /* @__PURE__ */ jsx11("div", { className: "mt-2 text-xs break-words", children: loadError }),
    /* @__PURE__ */ jsxs2(Button, { variant: "outline", className: "mt-4", onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: [
      /* @__PURE__ */ jsx11(ArrowLeft, { className: "w-4 h-4 mr-2" }),
      " Back"
    ] })
  ] }) });
  return /* @__PURE__ */ jsxs2("div", { className: "p-6 md:p-8 bg-slate-50 min-h-screen", children: [
    /* @__PURE__ */ jsxs2("div", { className: "max-w-5xl mx-auto", children: [
      /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-4 mb-8", children: [
        /* @__PURE__ */ jsx11(Button, { variant: "outline", size: "icon", onClick: () => embedded ? onClose?.() : window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator", children: /* @__PURE__ */ jsx11(ArrowLeft, { className: "w-4 h-4" }) }),
        /* @__PURE__ */ jsxs2("div", { children: [
          /* @__PURE__ */ jsxs2("h1", { className: "text-3xl font-bold text-slate-900 flex items-center gap-2", children: [
            isEditing ? /* @__PURE__ */ jsx11(Edit, { className: "w-6 h-6" }) : /* @__PURE__ */ jsx11(Wrench, { className: "w-6 h-6" }),
            isEditing ? "Edit Metal Fabrication Estimate" : "New Metal Fabrication Estimate"
          ] }),
          /* @__PURE__ */ jsx11("p", { className: "text-slate-600", children: "Estimate costs for fabricated metal signs and components" })
        ] })
      ] }),
      /* @__PURE__ */ jsxs2("div", { className: "grid lg:grid-cols-3 gap-8", children: [
        /* @__PURE__ */ jsx11("div", { className: "lg:col-span-2", children: /* @__PURE__ */ jsxs2(Tabs, { value: activeTab, onValueChange: setActiveTab, className: "w-full", children: [
          /* @__PURE__ */ jsx11("div", { className: "sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60", children: /* @__PURE__ */ jsxs2(TabsList, { className: "grid grid-cols-4 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1", children: [
            /* @__PURE__ */ jsx11(TabBadgeTrigger, { value: "project", icon: FileText, label: "Project", color: "orange" }),
            /* @__PURE__ */ jsx11(TabBadgeTrigger, { value: "items", icon: ListChecks, label: "Items", amount: grandTotal, count: project.items.length, color: "orange" }),
            /* @__PURE__ */ jsx11(TabBadgeTrigger, { value: "summary", icon: Calculator, label: "Summary", amount: grandTotal, color: "orange" }),
            /* @__PURE__ */ jsx11(TabBadgeTrigger, { value: "pricing", icon: TrendingUp, label: "Customer Pricing", accent: true, color: "orange" })
          ] }) }),
          /* @__PURE__ */ jsx11(TabsContent, { value: "project", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx11(CardHeader, { children: /* @__PURE__ */ jsx11(CardTitle, { children: "Project Information" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-4", children: [
              /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 gap-4", children: [
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx11(Label, { children: "Project Name *" }),
                  /* @__PURE__ */ jsx11(Input, { value: project.project_name, onChange: (e) => setProject((p) => ({ ...p, project_name: e.target.value })) })
                ] }),
                /* @__PURE__ */ jsxs2("div", { children: [
                  /* @__PURE__ */ jsx11(Label, { children: "Client Name *" }),
                  /* @__PURE__ */ jsx11(Input, { value: estimateContext?.client_name || project.client_name || "", readOnly: embedded, onChange: (e) => !embedded && setProject((p) => ({ ...p, client_name: e.target.value })) }),
                  embedded && /* @__PURE__ */ jsx11("p", { className: "text-[10px] text-slate-400 mt-1", children: "Inherited from the All-In-One estimate." })
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { children: [
                /* @__PURE__ */ jsx11(Label, { children: "Notes" }),
                /* @__PURE__ */ jsx11(Textarea, { value: project.notes, onChange: (e) => setProject((p) => ({ ...p, notes: e.target.value })) })
              ] })
            ] })
          ] }) }),
          /* @__PURE__ */ jsx11(TabsContent, { value: "items", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx11(CardHeader, { children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
              /* @__PURE__ */ jsx11(CardTitle, { children: "Project Items" }),
              /* @__PURE__ */ jsxs2(Button, { onClick: addItem, size: "sm", children: [
                /* @__PURE__ */ jsx11(Plus, { className: "w-4 h-4 mr-2" }),
                "Add Item"
              ] })
            ] }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-6", children: [
              project.items.length === 0 && /* @__PURE__ */ jsx11("div", { className: "text-center py-8 text-slate-500", children: /* @__PURE__ */ jsx11("p", { children: 'No items added yet. Click "Add Item" to get started.' }) }),
              project.items.map((item, index) => /* @__PURE__ */ jsxs2("div", { className: "p-6 border rounded-xl bg-slate-25", children: [
                /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-start mb-4", children: [
                  /* @__PURE__ */ jsxs2("h4", { className: "font-medium", children: [
                    "Item ",
                    index + 1
                  ] }),
                  /* @__PURE__ */ jsx11(Button, { variant: "ghost", size: "icon", onClick: () => removeItem(index), className: "text-red-500", children: /* @__PURE__ */ jsx11(Trash2, { className: "w-4 h-4" }) })
                ] }),
                /* @__PURE__ */ jsxs2("div", { className: "grid md:grid-cols-2 lg:grid-cols-3 gap-4", children: [
                  /* @__PURE__ */ jsxs2("div", { className: "md:col-span-3", children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Description" }),
                    /* @__PURE__ */ jsx11(Input, { "data-item-desc": index, value: item.description, onChange: (e) => updateItem(index, "description", e.target.value) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Item Type" }),
                    /* @__PURE__ */ jsxs2(Select, { value: item.item_type, onValueChange: (v) => updateItem(index, "item_type", v), children: [
                      /* @__PURE__ */ jsx11(SelectTrigger, { children: /* @__PURE__ */ jsx11(SelectValue, {}) }),
                      /* @__PURE__ */ jsx11(SelectContent, { children: itemTypes.map((t) => /* @__PURE__ */ jsx11(SelectItem, { value: t, children: t.replace(/_/g, " ") }, t)) })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "md:col-span-2", children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Material" }),
                    /* @__PURE__ */ jsxs2(Select, { value: item.inventory_item_id, onValueChange: (v) => updateItem(index, "inventory_item_id", v), children: [
                      /* @__PURE__ */ jsx11(SelectTrigger, { children: /* @__PURE__ */ jsx11(SelectValue, { placeholder: "Select from inventory" }) }),
                      /* @__PURE__ */ jsx11(SelectContent, { children: inventory.map((i) => /* @__PURE__ */ jsxs2(SelectItem, { value: i.id, children: [
                        i.material_type,
                        " ",
                        i.product_type,
                        " ",
                        i.size,
                        " - $",
                        i.cost_per_unit,
                        "/",
                        i.unit_type
                      ] }, i.id)) })
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Material Length (ft)" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "0", value: item.material_length_ft || "", onChange: (e) => updateItem(index, "material_length_ft", parseFloat(e.target.value) || 0) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Supplies Cost (per unit)" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "0", value: item.supplies_cost || "", onChange: (e) => updateItem(index, "supplies_cost", parseFloat(e.target.value) || 0) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Quantity" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "1", value: item.quantity || "", onChange: (e) => updateItem(index, "quantity", parseInt(e.target.value) || 1) })
                  ] }),
                  /* @__PURE__ */ jsx11("div", { className: "md:col-span-3 pt-4 border-t", children: /* @__PURE__ */ jsx11("h5", { className: "font-medium text-sm text-slate-700", children: "Labor Hours (per unit)" }) }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Fabrication" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "0", value: item.fabrication_hours || "", onChange: (e) => updateItem(index, "fabrication_hours", parseFloat(e.target.value) || 0) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Welding" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "0", value: item.welding_hours || "", onChange: (e) => updateItem(index, "welding_hours", parseFloat(e.target.value) || 0) })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { children: [
                    /* @__PURE__ */ jsx11(Label, { children: "Finishing" }),
                    /* @__PURE__ */ jsx11(Input, { type: "number", min: "0", value: item.finishing_hours || "", onChange: (e) => updateItem(index, "finishing_hours", parseFloat(e.target.value) || 0) })
                  ] })
                ] }),
                /* @__PURE__ */ jsxs2("div", { className: "mt-4 p-4 bg-white rounded-lg border text-xs", children: [
                  /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx11("span", { className: "text-slate-500", children: "Material Cost (per unit):" }),
                    /* @__PURE__ */ jsxs2("p", { className: "font-medium", children: [
                      "$",
                      (item.material_cost || 0).toFixed(2)
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx11("span", { className: "text-slate-500", children: "Fabrication Cost (per unit):" }),
                    /* @__PURE__ */ jsxs2("p", { className: "font-medium", children: [
                      "$",
                      (item.fabrication_cost || 0).toFixed(2)
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx11("span", { className: "text-slate-500", children: "Welding Cost (per unit):" }),
                    /* @__PURE__ */ jsxs2("p", { className: "font-medium", children: [
                      "$",
                      (item.welding_cost || 0).toFixed(2)
                    ] })
                  ] }),
                  /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                    /* @__PURE__ */ jsx11("span", { className: "text-slate-500", children: "Finishing Cost (per unit):" }),
                    /* @__PURE__ */ jsxs2("p", { className: "font-medium", children: [
                      "$",
                      (item.finishing_cost || 0).toFixed(2)
                    ] })
                  ] })
                ] })
              ] }, index))
            ] })
          ] }) }),
          /* @__PURE__ */ jsx11(TabsContent, { value: "summary", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx11(CardHeader, { children: /* @__PURE__ */ jsx11(CardTitle, { children: "Estimate Breakdown" }) }),
            /* @__PURE__ */ jsx11(CardContent, { className: "p-0", children: /* @__PURE__ */ jsxs2("table", { className: "w-full text-sm", children: [
              /* @__PURE__ */ jsx11("thead", { className: "bg-slate-50 text-slate-600 text-xs", children: /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx11("th", { className: "text-left px-4 py-2 font-medium w-8", children: "#" }),
                /* @__PURE__ */ jsx11("th", { className: "text-left px-4 py-2 font-medium", children: "Description" }),
                /* @__PURE__ */ jsx11("th", { className: "text-left px-4 py-2 font-medium", children: "Type" }),
                /* @__PURE__ */ jsx11("th", { className: "text-right px-4 py-2 font-medium", children: "Materials" }),
                /* @__PURE__ */ jsx11("th", { className: "text-right px-4 py-2 font-medium", children: "Labor" }),
                /* @__PURE__ */ jsx11("th", { className: "text-right px-4 py-2 font-medium", children: "Total" })
              ] }) }),
              /* @__PURE__ */ jsx11("tbody", { children: project.items.map((it, i) => {
                const qty = it.quantity || 1;
                const matCost = (it.material_cost || 0) * qty;
                const suppliesCost = (it.supplies_cost || 0) * qty;
                const laborCost = ((it.fabrication_cost || 0) + (it.welding_cost || 0) + (it.finishing_cost || 0)) * qty;
                return /* @__PURE__ */ jsxs2("tr", { className: "border-t border-slate-100", children: [
                  /* @__PURE__ */ jsx11("td", { className: "px-4 py-2 text-slate-500", children: i + 1 }),
                  /* @__PURE__ */ jsx11("td", { className: "px-4 py-2 font-medium", children: it.description || `Item ${i + 1}` }),
                  /* @__PURE__ */ jsx11("td", { className: "px-4 py-2 capitalize text-xs text-slate-600", children: (it.item_type || "").replace(/_/g, " ") }),
                  /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums", children: [
                    "$",
                    (matCost + suppliesCost).toFixed(2)
                  ] }),
                  /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums", children: [
                    "$",
                    laborCost.toFixed(2)
                  ] }),
                  /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums font-semibold", children: [
                    "$",
                    (matCost + suppliesCost + laborCost).toFixed(2)
                  ] })
                ] }, i);
              }) }),
              /* @__PURE__ */ jsx11("tfoot", { className: "bg-slate-50 border-t-2 border-slate-200 text-sm", children: /* @__PURE__ */ jsxs2("tr", { children: [
                /* @__PURE__ */ jsx11("td", { colSpan: "3", className: "px-4 py-2 text-right font-medium", children: "Totals" }),
                /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: [
                  "$",
                  (totalMaterialsCost + totalSuppliesCost).toFixed(2)
                ] }),
                /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums font-medium", children: [
                  "$",
                  (totalFabricationCost + totalWeldingCost + totalFinishingCost).toFixed(2)
                ] }),
                /* @__PURE__ */ jsxs2("td", { className: "px-4 py-2 text-right tabular-nums font-bold", children: [
                  "$",
                  grandTotal.toFixed(2)
                ] })
              ] }) })
            ] }) })
          ] }) }),
          /* @__PURE__ */ jsx11(TabsContent, { value: "pricing", className: "mt-4 space-y-6", children: /* @__PURE__ */ jsx11(
            CustomerPricingTab_default,
            {
              project: {
                ...project,
                total_material_cost: totalMaterialsCost,
                total_supplies_cost: totalSuppliesCost,
                total_fabrication_cost: totalFabricationCost,
                total_welding_cost: totalWeldingCost,
                total_finishing_cost: totalFinishingCost
              },
              categorize: categorizeMetalProject,
              accentColor: "orange",
              onTierChange: (tier) => setProject((prev) => ({
                ...prev,
                customer_pricing: { ...prev.customer_pricing || {}, tier_number: tier }
              }))
            }
          ) })
        ] }) }),
        /* @__PURE__ */ jsxs2("div", { className: "space-y-6", children: [
          /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm sticky top-8", children: [
            /* @__PURE__ */ jsx11(CardHeader, { children: /* @__PURE__ */ jsx11(CardTitle, { children: "Cost Summary" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-2 text-sm", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "text-slate-600", children: "Total Material Cost:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
                  "$",
                  totalMaterialsCost.toFixed(2)
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "text-slate-600", children: "Total Supplies Cost:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
                  "$",
                  totalSuppliesCost.toFixed(2)
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "text-slate-600", children: "Total Fabrication Cost:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
                  "$",
                  totalFabricationCost.toFixed(2)
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "text-slate-600", children: "Total Welding Cost:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
                  "$",
                  totalWeldingCost.toFixed(2)
                ] })
              ] }),
              /* @__PURE__ */ jsxs2("div", { className: "flex justify-between", children: [
                /* @__PURE__ */ jsx11("span", { className: "text-slate-600", children: "Total Finishing Cost:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-medium text-slate-900", children: [
                  "$",
                  totalFinishingCost.toFixed(2)
                ] })
              ] }),
              /* @__PURE__ */ jsx11("div", { className: "mt-4 pt-4 border-t", children: /* @__PURE__ */ jsxs2("div", { className: "flex justify-between items-center", children: [
                /* @__PURE__ */ jsx11("span", { className: "font-bold text-lg text-slate-900", children: "Grand Total:" }),
                /* @__PURE__ */ jsxs2("span", { className: "font-bold text-2xl text-blue-600", children: [
                  "$",
                  grandTotal.toFixed(2)
                ] })
              ] }) })
            ] })
          ] }),
          /* @__PURE__ */ jsxs2(Card, { className: "bg-white border-0 shadow-sm", children: [
            /* @__PURE__ */ jsx11(CardHeader, { children: /* @__PURE__ */ jsx11(CardTitle, { children: "Stock Cut Plan" }) }),
            /* @__PURE__ */ jsxs2(CardContent, { className: "space-y-2 text-sm", children: [
              /* @__PURE__ */ jsxs2("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx11(Label, { children: "Stock length (ft)" }),
                /* @__PURE__ */ jsx11(Input, { type: "number", min: "1", step: "any", value: project.stock_length_ft ?? 20, onChange: (e) => setProject((p) => ({ ...p, stock_length_ft: Math.max(1, Number(e.target.value) || 20) })), className: "w-20 h-8" })
              ] }),
              cutPlan ? /* @__PURE__ */ jsxs2("div", { className: "text-xs text-slate-600", children: [
                "\u2248",
                cutPlan.sticks,
                " stock stick",
                cutPlan.sticks === 1 ? "" : "s",
                " needed \xB7 \u2248",
                cutPlan.wasteFt.toFixed(1),
                " ft waste",
                cutPlan.oversize ? ` \xB7 ${cutPlan.oversize} cut${cutPlan.oversize === 1 ? "" : "s"} exceed stock length` : ""
              ] }) : /* @__PURE__ */ jsx11("div", { className: "text-xs text-slate-400", children: "Add items with material lengths to see a suggested cut plan." })
            ] })
          ] }),
          project?.updated_date && /* @__PURE__ */ jsxs2("div", { className: "mt-1 text-[10px] text-gray-400", children: [
            "Last saved ",
            new Date(project.updated_date).toLocaleString()
          ] }),
          /* @__PURE__ */ jsx11(Button, { onClick: saveProject, disabled: isSaving || !project.project_name || !(estimateContext?.client_name || project.client_name), className: "w-full bg-green-600 hover:bg-green-700", children: isSaving ? "Saving..." : /* @__PURE__ */ jsxs2(Fragment, { children: [
            /* @__PURE__ */ jsx11(Save, { className: "w-4 h-4 mr-2" }),
            isEditing ? "Update Estimate" : "Save Estimate"
          ] }) }),
          /* @__PURE__ */ jsx11("div", { className: "flex flex-wrap gap-2", children: /* @__PURE__ */ jsx11(
            ModuleActionBar_default,
            {
              onTemplates: () => setTemplateMode("load"),
              onSaveAsTemplate: () => setTemplateMode("save"),
              onSaveAsCopy: handleSaveAsCopy,
              estimateId,
              saving: isSaving
            }
          ) }),
          /* @__PURE__ */ jsxs2("div", { className: "grid grid-cols-2 gap-4", children: [
            /* @__PURE__ */ jsxs2(Button, { onClick: downloadEstimate, variant: "outline", className: "w-full", children: [
              /* @__PURE__ */ jsx11(Download, { className: "w-4 h-4 mr-2" }),
              " Download"
            ] }),
            /* @__PURE__ */ jsxs2(Button, { onClick: printEstimate, variant: "outline", className: "w-full", children: [
              /* @__PURE__ */ jsx11(Printer, { className: "w-4 h-4 mr-2" }),
              " Print"
            ] })
          ] })
        ] })
      ] })
    ] }),
    /* @__PURE__ */ jsx11(
      ModuleTemplateDialog_default,
      {
        open: !!templateMode,
        mode: templateMode,
        onClose: () => setTemplateMode(null),
        project,
        onApply: (data) => setProject((prev) => ({ ...prev, ...data })),
        moduleKey: "metal",
        title: "Metal",
        buildTemplateData: buildMetalTemplateData,
        describeTemplate: (t) => `${(t.project_data?.items || []).length} items`
      }
    )
  ] });
}
export {
  MetalEstimator as Page
};
