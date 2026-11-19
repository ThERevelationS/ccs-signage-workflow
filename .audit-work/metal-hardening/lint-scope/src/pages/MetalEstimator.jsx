import { useState, useEffect, useMemo, useRef } from "react";
import { MetalProject, Settings, Inventory as InventoryEntity } from "@/api/gatedEntities";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, ArrowLeft, Plus, Trash2, Save, Wrench, Edit, Download, Printer, FileText, ListChecks, Calculator, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { useSearchParams, useNavigate } from "react-router-dom";
import TabBadgeTrigger from "@/components/channelLetterInstall/TabBadgeTrigger";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeMetalProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { preflightBuilderSourceMutation, updateBuilderSourceProject } from "@/components/estimator/builder/sourceProjectPersistence";
import { newBuilderItemId, seedBuilderItemIds } from "@/components/estimator/builder/itemIdentity";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import ModuleActionBar from "@/components/estimator/moduleShared/ModuleActionBar";
import ModuleTemplateDialog from "@/components/estimator/moduleShared/ModuleTemplateDialog";
import { saveModuleProjectCopy } from "@/components/estimator/moduleShared/moduleProjectActions";
import { staffEntities } from "@/components/staff/staffEntities";
import {
  calcMetalProject,
  deriveMetalItemCosts,
  hasIssueFor,
  hasMetalCostSnapshot,
  metalDraftValue,
  metalQuantityDraft,
} from "@/components/estimator/metal/metalPricingAvailability";

const itemTypes = ["channel_letters", "cabinet_sign", "monument_sign", "pole_sign", "flat_cut_letters", "fabricated_letters", "frame_assembly", "custom_brackets"];
// materialTypes is not directly used in the current structure for display, but could be for filtering
// const materialTypes = ["Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel"];

const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Held-pricing display: a live value is either finite ($) or held ("—"); a
// non-finite live value falls back to the saved acknowledged snapshot shown
// plainly, or "Not saved" when no snapshot exists — never a fabricated $0.
const fmtCost = (v) => Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
const sumOrNull = (...xs) => xs.every((v) => Number.isFinite(v)) ? xs.reduce((s, v) => s + v, 0) : null;
const moneyCell = (v) => hasMetalCostSnapshot(v)
  ? `$${v.toFixed(2)}`
  : <span className="text-amber-700 font-medium">Not saved</span>;

export default function MetalEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const editId = embeddedProjectId || searchParams.get('edit') || searchParams.get('id');
  const estimateId = embeddedEstimateId || searchParams.get('estimateId');
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
  const [saveError, setSaveError] = useState("");
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
          loadAllEntityRows({ entity: InventoryEntity, sort: "created_date", label: "Metal inventory" }),
          editId ? MetalProject.get(editId) : Promise.resolve(null),
          estimateId ? staffEntities.AllInOneEstimate.get(estimateId) : Promise.resolve(null),
        ]);
        if (cancelled) return;

        const settingsObj = {};
        (settingsData || []).forEach(s => { settingsObj[s.setting_name] = s.setting_value; });
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
          notes: settingsObj.default_notes_template || "",
        };

        if (existing) {
          setProject(prev => ({
            ...prev,
            ...existing,
            client_name: estimate?.client_name || existing.client_name || prev.client_name,
            customer_id: estimate?.customer_id || existing.customer_id,
            estimate_number: estimate?.estimate_number || existing.estimate_number,
            items: seedBuilderItemIds(existing.items || []),
          }));
          setIsEditing(true);
        } else {
          setProject(prev => ({
            ...prev,
            ...sourceDefaults,
            client_name: estimate?.client_name || prev.client_name,
            customer_id: estimate?.customer_id,
            estimate_number: estimate?.estimate_number || prev.estimate_number,
          }));
          setIsEditing(false);
        }
      } catch (error) {
        console.error('Error loading metal estimator:', error);
        if (!cancelled) setLoadError(error?.message || "Metal Builder prerequisites could not be verified.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [editId, estimateId]);

  const addItem = () => {
    setTimeout(() => document.querySelector(`input[data-item-desc="${(project.items || []).length}"]`)?.focus(), 60);
    setProject(prev => ({
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
        material_cost: 0, // cost per unit of material_length_ft * cost_per_unit
        supplies_cost: 0, // cost per item
        fabrication_cost: 0, // cost per unit
        welding_cost: 0, // cost per unit
        finishing_cost: 0, // cost per unit
      }]
    }));
  };

  const removeItem = (index) => {
    if (!window.confirm("Remove this item?")) return;
    setProject(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index, field, value) => {
    setProject(prev => {
      const newItems = [...prev.items];
      // Derive the per-unit costs with the same formulas as before — the
      // strict availability layer flags malformed values; the derive itself
      // stays verbatim (rate/hours/length objects are read, never mutated).
      newItems[index] = deriveMetalItemCosts({ ...newItems[index], [field]: value }, prev, inventory);
      return { ...prev, items: newItems };
    });
  };

  // Pricing-availability: one strict calc pass shared by the banner, the
  // totals panels, the per-field diagnostics, and the save guard. On a NEW
  // project the Metal Settings rows seeded the rates, so catalog scan runs
  // while the seeded values are in play (seeded = !isEditing).
  const priced = useMemo(
    () => calcMetalProject(project, { inventory, settings: _globalSettings, seeded: !isEditing }),
    [project, inventory, _globalSettings, isEditing],
  );
  const calculated = priced.calc;
  const allIssues = priced.issues;
  // Any catalog-side unavailability → stronger save message; any issue at all
  // blocks the save — unavailable pricing is never written as $0.
  const catalogBlocked = allIssues.some((i) => i.kind === "metal_catalog");
  const pricingBlocked = allIssues.length > 0;
  const pricingUnavailable = !!calculated.pricingUnavailable;
  const itemIssues = (index) => allIssues.filter((i) => i.itemIndex === index);

  const {
    totalMaterialsCost,
    totalSuppliesCost,
    totalFabricationCost,
    totalWeldingCost,
    totalFinishingCost,
    totalLaborCost,
    grandTotal,
  } = calculated;


  // Block accidental navigation while a save is in flight.
  useEffect(() => {
    if (!isSaving) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isSaving]);
  const saveProject = async () => {
    // Pricing-availability guard: a malformed or unavailable pricing input
    // must never be persisted as $0, an inferred default, or a NaN total.
    // Block the write and point the user at the flagged values.
    if (pricingBlocked) {
      setSaveError(catalogBlocked
        ? "Save paused: a Metal Settings or Master Inventory value is missing or unusable — update it, then save."
        : "Save paused: fix the flagged pricing values before saving — unavailable pricing is never written as $0.");
      return;
    }
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert('Please fill in project name and client name');
      return;
    }

    setIsSaving(true);
    setSaveError("");
    try {
      const totalCost = totalMaterialsCost + totalSuppliesCost + totalLaborCost;

      const pricingProject = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        total_material_cost: totalMaterialsCost,
        total_supplies_cost: totalSuppliesCost,
        total_fabrication_cost: totalFabricationCost,
        total_welding_cost: totalWeldingCost,
        total_finishing_cost: totalFinishingCost,
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeMetalProject,
        tierNumber: project.customer_pricing?.tier_number,
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
        status: 'calculated',
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
          label: "Metal project",
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(finalProject);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("metal_project"),
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: MetalProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: finalProject,
          label: "Metal project",
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
                total_material_cost: totalMaterialsCost,
                total_supplies_cost: totalSuppliesCost,
                total_fabrication_cost: totalFabricationCost,
                total_welding_cost: totalWeldingCost,
                total_finishing_cost: totalFinishingCost,
                total_labor_cost: totalLaborCost,
                total_cost: totalCost,
              },
            },
          },
          liveTotal: totalCost,
        });
      }

      setProject((prev) => ({
        ...prev,
        ...finalProject,
        id: savedId || prev.id,
        updated_date: saved?.updated_date || prev.updated_date,
      }));
      onSaved?.();
      if (!embedded) alert(isEditing ? 'Project updated successfully!' : 'Project saved successfully!');
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error saving project. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // #78 — clone the current save payload into a brand-new Metal project.
  const handleSaveAsCopy = async () => {
    if (pricingBlocked) {
      setSaveError(catalogBlocked
        ? "Save paused: a Metal Settings or Master Inventory value is missing or unusable — update it, then save."
        : "Save paused: fix the flagged pricing values before saving a copy — unavailable pricing is never written as $0.");
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      const copy = await saveModuleProjectCopy({
        entity: MetalProject,
        payload: {
          ...project,
          client_name: estimateContext?.client_name || project.client_name,
          customer_id: estimateContext?.customer_id || project.customer_id,
          estimate_number: estimateContext?.estimate_number || project.estimate_number,
          total_material_cost: totalMaterialsCost,
          total_supplies_cost: totalSuppliesCost,
          total_fabrication_cost: totalFabricationCost,
          total_welding_cost: totalWeldingCost,
          total_finishing_cost: totalFinishingCost,
          total_cost: totalMaterialsCost + totalSuppliesCost + totalLaborCost,
          subtotal: totalMaterialsCost + totalSuppliesCost + totalLaborCost,
          markup_amount: 0,
          markup_percent: 0,
          status: 'calculated',
        },
        attemptRef: copyAttemptRef,
        keyPrefix: "metal_project_copy",
        baseName: project.project_name || "Metal",
        label: "Metal project copy",
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

  // #79 — template payload = the editable setup a user would reuse.
  const buildMetalTemplateData = (p) => ({
    items: p.items || [],
    fabrication_rate: p.fabrication_rate,
    welding_rate: p.welding_rate,
    finishing_rate: p.finishing_rate,
    notes: p.notes,
  });

  const downloadEstimate = () => {
    if (pricingUnavailable) {
      setSaveError("Export paused: fix the flagged pricing values before exporting — unavailable pricing is never printed as $0.");
      return;
    }
    const {
      totalMaterialsCost, totalSuppliesCost, totalLaborCost, grandTotal, enrichedItems
    } = calculated;
    
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
      <h1>ðŸ”¨ Metal Fabrication Estimate</h1>
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
          <span class="info-value">${new Date().toLocaleDateString()}</span>
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
      `).join('')}
      
      <div class="summary">
        <div class="section-title" style="border-color: #f97316;">Cost Summary</div>
        
        <div class="summary-row materials">
          <span class="summary-label">Total Materials Cost:</span>
          <span class="summary-value">$${totalMaterialsCost.toFixed(2)}</span>
        </div>
        <div class="summary-row supplies">
          <span class="summary-label">Total Supplies Cost:</span>
          <span class="summary-value">$${totalSuppliesCost.toFixed(2)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">$${totalLaborCost.toFixed(2)}</span>
        </div>
        
        <div class="total-row">
          <span class="total-label">Total Estimate</span>
          <span class="total-value">$${grandTotal.toFixed(2)}</span>
        </div>
      </div>
      
      ${project.notes ? `
        <div class="notes">
          <h3>ðŸ“� Additional Notes</h3>
          <p>${escHtml(project.notes)}</p>
        </div>
      ` : ''}
    </div>
    
    <div class="footer">
      Generated by SignEstimate Pro - Professional Estimating Suite<br>
      Â© ${new Date().getFullYear()} All Rights Reserved
    </div>
  </div>
</body>
</html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.project_name.replace(/\s+/g, '_')}_Metal_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printEstimate = () => {
    if (pricingUnavailable) {
      setSaveError("Export paused: fix the flagged pricing values before printing — unavailable pricing is never printed as $0.");
      return;
    }
    const {
      totalMaterialsCost, totalSuppliesCost, totalLaborCost, grandTotal, enrichedItems
    } = calculated;
    
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
              <h1>ðŸ”¨ Metal Fabrication Estimate</h1>
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
                  <span class="info-value">${new Date().toLocaleDateString()}</span>
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
              `).join('')}
              
              <div class="summary">
                <div class="section-title" style="border-color: #f97316;">Cost Summary</div>
                
                <div class="summary-row materials">
                  <span class="summary-label">Total Materials Cost:</span>
                  <span class="summary-value">$${totalMaterialsCost.toFixed(2)}</span>
                </div>
                <div class="summary-row supplies">
                  <span class="summary-label">Total Supplies Cost:</span>
                  <span class="summary-value">$${totalSuppliesCost.toFixed(2)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">$${totalLaborCost.toFixed(2)}</span>
                </div>
                
                <div class="total-row">
                  <span class="total-label">Total Estimate</span>
                  <span class="total-value">$${grandTotal.toFixed(2)}</span>
                </div>
              </div>
              
              ${project.notes ? `
                <div class="notes">
                  <h3>ðŸ“� Additional Notes</h3>
                  <p>${escHtml(project.notes)}</p>
                </div>
              ` : ''}
            </div>
            
            <div class="footer">
              Generated by SignEstimate Pro - Professional Estimating Suite<br>
              Â© ${new Date().getFullYear()} All Rights Reserved
            </div>
          </div>
        </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.print();
  };

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
      const bin = bins.find((b) => b.remain >= p - 0.001);
      if (bin) { bin.remain -= p; bin.cuts.push(p); }
      else bins.push({ remain: Math.max(0, stockFt - p), cuts: [p], oversize: p > stockFt + 0.001 });
    });
    return { sticks: bins.length, wasteFt: bins.reduce((s, b) => s + b.remain, 0), oversize: bins.filter((b) => b.oversize).length };
  })();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (loadError) return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800">
        <div className="font-bold">Metal Builder unavailable</div>
        <div className="mt-1 text-sm">Required Settings, inventory, project data, or estimate context could not be verified. Hard-coded fallback rates were not used.</div>
        <div className="mt-2 text-xs break-words">{loadError}</div>
        <Button variant="outline" className="mt-4" onClick={() => embedded ? onClose?.() : (window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : '/Estimator')}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="outline" size="icon" onClick={() => embedded ? onClose?.() : (window.location.href = estimateId ? `/EstimateDetail?id=${estimateId}` : '/Estimator')}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              {isEditing ? <Edit className="w-6 h-6"/> : <Wrench className="w-6 h-6" />}
              {isEditing ? 'Edit Metal Fabrication Estimate' : 'New Metal Fabrication Estimate'}
            </h1>
            <p className="text-slate-600">Estimate costs for fabricated metal signs and components</p>
          </div>
        </div>

        {pricingUnavailable && (
          <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4" role="alert" aria-live="polite">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-amber-900">Pricing unavailable — totals are on hold</h2>
                <p className="mt-1 text-xs text-amber-800">
                  {catalogBlocked
                    ? "A Metal Settings or Master Inventory value is missing or unusable, so totals are shown from the saved amounts — never $0 — until the flagged record is updated."
                    : "A pricing input on this estimate is missing or unusable, so totals are held — never $0 — until the flagged value is fixed."}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-amber-800">
                  {allIssues.map((iss, i) => (
                    <li key={`${iss.code}-${iss.field}-${iss.index ?? i}`}>{iss.message}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
        {saveError && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{saveError}</div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                <TabsList className="grid grid-cols-4 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1">
                  <TabBadgeTrigger value="project" icon={FileText} label="Project" color="orange" />
                  <TabBadgeTrigger value="items" icon={ListChecks} label="Items" amount={grandTotal} count={project.items.length} color="orange" />
                  <TabBadgeTrigger value="summary" icon={Calculator} label="Summary" amount={grandTotal} color="orange" />
                  <TabBadgeTrigger value="pricing" icon={TrendingUp} label="Customer Pricing" accent color="orange" />
                </TabsList>
              </div>

              <TabsContent value="project" className="mt-4 space-y-6">
            <Card className="bg-white border-0 shadow-sm"><CardHeader><CardTitle>Project Information</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid md:grid-cols-2 gap-4"><div><Label>Project Name *</Label><Input value={project.project_name} onChange={(e) => setProject(p => ({ ...p, project_name: e.target.value }))} /></div><div><Label>Client Name *</Label><Input value={estimateContext?.client_name || project.client_name || ''} readOnly={embedded} onChange={(e) => !embedded && setProject(p => ({ ...p, client_name: e.target.value }))} />{embedded && <p className="text-[10px] text-slate-400 mt-1">Inherited from the All-In-One estimate.</p>}</div></div><div><Label>Notes</Label><Textarea value={project.notes} onChange={(e) => setProject(p => ({ ...p, notes: e.target.value }))} /></div></CardContent></Card>
              </TabsContent>

              <TabsContent value="items" className="mt-4 space-y-6">
            <Card className="bg-white border-0 shadow-sm">
                <CardHeader><div className="flex justify-between items-center"><CardTitle>Project Items</CardTitle><Button onClick={addItem} size="sm"><Plus className="w-4 h-4 mr-2" />Add Item</Button></div></CardHeader>
                <CardContent className="space-y-6">
                    {project.items.length === 0 && (
                      <div className="text-center py-8 text-slate-500">
                        <p>No items added yet. Click "Add Item" to get started.</p>
                      </div>
                    )}
                    {project.items.map((item, index) => (
                      <div key={index} className="p-6 border rounded-xl bg-slate-25">
                        <div className="flex justify-between items-start mb-4"><h4 className="font-medium">Item {index + 1}</h4><Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button></div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="md:col-span-3"><Label>Description</Label><Input data-item-desc={index} value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></div>
                          <div><Label>Item Type</Label><Select value={item.item_type} onValueChange={(v) => updateItem(index, 'item_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{itemTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
                          <div className="md:col-span-2"><Label>Material</Label><Select value={item.inventory_item_id} onValueChange={(v) => updateItem(index, 'inventory_item_id', v)}><SelectTrigger aria-invalid={hasIssueFor(allIssues, 'inventory_item_id', index)} aria-describedby={`metal-item-${index}-issues`}><SelectValue placeholder="Select from inventory" /></SelectTrigger><SelectContent>{inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.material_type} {i.product_type} {i.size} - ${i.cost_per_unit}/{i.unit_type}</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Material Length (ft)</Label><Input type="number" min="0" value={item.material_length_ft ?? ""} aria-invalid={hasIssueFor(allIssues, 'material_length_ft', index)} aria-describedby={`metal-item-${index}-issues`} onChange={e => updateItem(index, 'material_length_ft', metalDraftValue(e.target.value))} /></div>
                          <div><Label>Supplies Cost (per unit)</Label><Input type="number" min="0" value={item.supplies_cost ?? ""} aria-invalid={hasIssueFor(allIssues, 'supplies_cost', index)} aria-describedby={`metal-item-${index}-issues`} onChange={e => updateItem(index, 'supplies_cost', metalDraftValue(e.target.value))} /></div>
                          <div><Label>Quantity</Label><Input type="number" min="1" value={item.quantity ?? ""} aria-invalid={hasIssueFor(allIssues, 'quantity', index)} aria-describedby={`metal-item-${index}-issues`} onChange={(e) => updateItem(index, 'quantity', metalQuantityDraft(e.target.value))} /></div>

                          <div className="md:col-span-3 pt-4 border-t"><h5 className="font-medium text-sm text-slate-700">Labor Hours (per unit)</h5></div>
                          <div><Label>Fabrication</Label><Input type="number" min="0" value={item.fabrication_hours ?? ""} aria-invalid={hasIssueFor(allIssues, 'fabrication_hours', index)} aria-describedby={`metal-item-${index}-issues`} onChange={e => updateItem(index, 'fabrication_hours', metalDraftValue(e.target.value))} /></div>
                          <div><Label>Welding</Label><Input type="number" min="0" value={item.welding_hours ?? ""} aria-invalid={hasIssueFor(allIssues, 'welding_hours', index)} aria-describedby={`metal-item-${index}-issues`} onChange={e => updateItem(index, 'welding_hours', metalDraftValue(e.target.value))} /></div>
                          <div><Label>Finishing</Label><Input type="number" min="0" value={item.finishing_hours ?? ""} aria-invalid={hasIssueFor(allIssues, 'finishing_hours', index)} aria-describedby={`metal-item-${index}-issues`} onChange={e => updateItem(index, 'finishing_hours', metalDraftValue(e.target.value))} /></div>
                        </div>
                        <div className="mt-4 p-4 bg-white rounded-lg border text-xs">
                          <div className="flex justify-between"><span className="text-slate-500">Material Cost (per unit):</span><p className="font-medium">{fmtCost(calculated.enrichedItems[index]?.material_cost)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Fabrication Cost (per unit):</span><p className="font-medium">{fmtCost(calculated.enrichedItems[index]?.fabrication_cost)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Welding Cost (per unit):</span><p className="font-medium">{fmtCost(calculated.enrichedItems[index]?.welding_cost)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Finishing Cost (per unit):</span><p className="font-medium">{fmtCost(calculated.enrichedItems[index]?.finishing_cost)}</p></div>
                        </div>
                        {itemIssues(index).length > 0 && (
                          <ul id={`metal-item-${index}-issues`} className="mt-2 space-y-1 text-xs text-red-700" role="status">
                            {itemIssues(index).map((iss, i) => <li key={`${iss.field}-${i}`}>{iss.message}</li>)}
                          </ul>
                        )}
                      </div>
                    ))}
                </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-4 space-y-6">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader><CardTitle>Estimate Breakdown</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    {pricingUnavailable && (
                      <p className="px-4 pt-3 text-[11px] font-medium text-amber-700">Saved amounts (not current pricing) — fix the flagged values to reprice.</p>
                    )}
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium w-8">#</th>
                          <th className="text-left px-4 py-2 font-medium">Description</th>
                          <th className="text-left px-4 py-2 font-medium">Type</th>
                          <th className="text-right px-4 py-2 font-medium">Materials</th>
                          <th className="text-right px-4 py-2 font-medium">Labor</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {calculated.enrichedItems.map((it, i) => {
                          const matSupplies = sumOrNull(it.materials_cost, it.supplies_cost);
                          const total = sumOrNull(it.materials_cost, it.supplies_cost, it.labor_cost);
                          return (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                              <td className="px-4 py-2 font-medium">{it.description || `Item ${i + 1}`}</td>
                              <td className="px-4 py-2 capitalize text-xs text-slate-600">{(it.item_type || '').replace(/_/g, ' ')}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{fmtCost(matSupplies)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">{fmtCost(it.labor_cost)}</td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold">{fmtCost(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-sm">
                        <tr>
                          <td colSpan="3" className="px-4 py-2 text-right font-medium">Totals</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{Number.isFinite(sumOrNull(totalMaterialsCost, totalSuppliesCost)) ? fmtCost(totalMaterialsCost + totalSuppliesCost) : moneyCell(sumOrNull(project.total_material_cost, project.total_supplies_cost))}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">{Number.isFinite(totalLaborCost) ? fmtCost(totalLaborCost) : moneyCell(sumOrNull(project.total_fabrication_cost, project.total_welding_cost, project.total_finishing_cost))}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">{Number.isFinite(grandTotal) ? fmtCost(grandTotal) : moneyCell(project.total_cost)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pricing" className="mt-4 space-y-6">
                <CustomerPricingTab
                  project={{
                    ...project,
                    // Held totals feed the categorizer as 0 (it only emits
                    // lines for amounts > 0) — the whole calc is flagged
                    // unavailable in this state and saves are blocked, so a
                    // 0 categorization can never be persisted silently.
                    total_material_cost: totalMaterialsCost ?? 0,
                    total_supplies_cost: totalSuppliesCost ?? 0,
                    total_fabrication_cost: totalFabricationCost ?? 0,
                    total_welding_cost: totalWeldingCost ?? 0,
                    total_finishing_cost: totalFinishingCost ?? 0,
                  }}
                  categorize={categorizeMetalProject}
                  accentColor="orange"
                  onTierChange={(tier) => setProject((prev) => ({
                    ...prev,
                    customer_pricing: { ...(prev.customer_pricing || {}), tier_number: tier },
                  }))}
                />
              </TabsContent>
            </Tabs>
          </div>
          <div className="space-y-6">
            <Card className="bg-white border-0 shadow-sm sticky top-8"><CardHeader><CardTitle>Cost Summary</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">{pricingUnavailable && (<p className="text-[11px] font-medium text-amber-700">Saved amounts (not current pricing)</p>)}<div className="flex justify-between"><span className="text-slate-600">Total Material Cost:</span><span className="font-medium text-slate-900">{Number.isFinite(totalMaterialsCost) ? fmtCost(totalMaterialsCost) : moneyCell(project.total_material_cost)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Supplies Cost:</span><span className="font-medium text-slate-900">{Number.isFinite(totalSuppliesCost) ? fmtCost(totalSuppliesCost) : moneyCell(project.total_supplies_cost)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Fabrication Cost:</span><span className="font-medium text-slate-900">{Number.isFinite(totalFabricationCost) ? fmtCost(totalFabricationCost) : moneyCell(project.total_fabrication_cost)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Welding Cost:</span><span className="font-medium text-slate-900">{Number.isFinite(totalWeldingCost) ? fmtCost(totalWeldingCost) : moneyCell(project.total_welding_cost)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Finishing Cost:</span><span className="font-medium text-slate-900">{Number.isFinite(totalFinishingCost) ? fmtCost(totalFinishingCost) : moneyCell(project.total_finishing_cost)}</span></div><div className="mt-4 pt-4 border-t"><div className="flex justify-between items-center"><span className="font-bold text-lg text-slate-900">Grand Total:</span><span className="font-bold text-2xl text-blue-600">{Number.isFinite(grandTotal) ? fmtCost(grandTotal) : moneyCell(project.total_cost)}</span></div></div></CardContent></Card>
            <Card className="bg-white border-0 shadow-sm"><CardHeader><CardTitle>Stock Cut Plan</CardTitle></CardHeader><CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2"><Label>Stock length (ft)</Label><Input type="number" min="1" step="any" value={project.stock_length_ft ?? 20} onChange={(e) => setProject((p) => ({ ...p, stock_length_ft: Math.max(1, Number(e.target.value) || 20) }))} className="w-20 h-8" /></div>
              {cutPlan ? (
                <div className="text-xs text-slate-600">≈{cutPlan.sticks} stock stick{cutPlan.sticks === 1 ? "" : "s"} needed · ≈{cutPlan.wasteFt.toFixed(1)} ft waste{cutPlan.oversize ? ` · ${cutPlan.oversize} cut${cutPlan.oversize === 1 ? "" : "s"} exceed stock length` : ""}</div>
              ) : (<div className="text-xs text-slate-400">Add items with material lengths to see a suggested cut plan.</div>)}
            </CardContent></Card>
            {project?.updated_date && (<div className="mt-1 text-[10px] text-gray-400">Last saved {new Date(project.updated_date).toLocaleString()}</div>)}
            <Button onClick={saveProject} disabled={isSaving || pricingBlocked || !project.project_name || !(estimateContext?.client_name || project.client_name)} className="w-full bg-green-600 hover:bg-green-700">{isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />{isEditing ? 'Update Estimate' : 'Save Estimate'}</>}</Button>
            <div className="flex flex-wrap gap-2">
              <ModuleActionBar
                onTemplates={() => setTemplateMode("load")}
                onSaveAsTemplate={() => setTemplateMode("save")}
                onSaveAsCopy={handleSaveAsCopy}
                estimateId={estimateId}
                saving={isSaving}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={downloadEstimate} variant="outline" disabled={isSaving || pricingUnavailable} className="w-full"><Download className="w-4 h-4 mr-2" /> Download</Button>
              <Button onClick={printEstimate} variant="outline" disabled={isSaving || pricingUnavailable} className="w-full"><Printer className="w-4 h-4 mr-2" /> Print</Button>
            </div>
          </div>
        </div>
      </div>

      <ModuleTemplateDialog
        open={!!templateMode}
        mode={templateMode}
        onClose={() => setTemplateMode(null)}
        project={project}
        onApply={(data) => setProject((prev) => ({ ...prev, ...data }))}
        moduleKey="metal"
        title="Metal"
        buildTemplateData={buildMetalTemplateData}
        describeTemplate={(t) => `${(t.project_data?.items || []).length} items`}
      />
    </div>
  );
}