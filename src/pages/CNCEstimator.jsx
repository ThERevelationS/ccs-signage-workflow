import { useState, useEffect, useRef } from "react";
import { CNCProject, Settings } from "@/entities/all";
import { base44 } from "@/api/base44Client";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, Router, FileText, ListChecks, Calculator, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { Link, useNavigate } from "react-router-dom";
import TabBadgeTrigger from "@/components/channelLetterInstall/TabBadgeTrigger";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeCNCProject } from "@/components/markup/projectCategorizer";
import { calculateSavedCustomerPricing } from "@/components/markup/savedCustomerPricing";
import HoldDownAdvisor from "@/components/cnc/HoldDownAdvisor";
import { recordBuilderSave } from "@/components/estimator/builder/builderService";
import { preflightBuilderSourceMutation, updateBuilderSourceProject } from "@/components/estimator/builder/sourceProjectPersistence";
import { newBuilderItemId, seedBuilderItemIds } from "@/components/estimator/builder/itemIdentity";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";

const imperialSizes = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "5/8", "3/4", "7/8", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4"];
const materials = ["Acrylic", "Wood", "MDF", "Plywood", "PVC", "HDPE", "Aluminum", "Corian"];

export default function CNCEstimator({ embedded = false, embeddedProjectId = null, embeddedEstimateId = null, onClose, onSaved }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Embedded All-In-One context wins over standalone query parameters.
  const editId = embeddedProjectId || searchParams.get("edit") || searchParams.get("id");
  const estimateId = embeddedEstimateId || searchParams.get("estimateId");
  const [isEditing, setIsEditing] = useState(false);
  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    items: [],
    machine_rate_per_hour: 75,
    labor_rate: 45,
    setup_time_percentage: 20, // New field
    fixed_setup_hours: 0, // New field
    notes: ""
  });
  const [globalSettings, setGlobalSettings] = useState({});
  const [estimateContext, setEstimateContext] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  const persistedProjectIdRef = useRef(editId || "");
  const createAttemptRef = useRef({ signature: "", key: "" });

  useEffect(() => {
    persistedProjectIdRef.current = editId || "";
    createAttemptRef.current = { signature: "", key: "" };
    loadPrerequisites();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, estimateId]);

  const loadPrerequisites = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const [settingsData, existing, estimate] = await Promise.all([
        Settings.list(),
        editId ? CNCProject.get(editId) : Promise.resolve(null),
        estimateId ? base44.entities.AllInOneEstimate.get(estimateId) : Promise.resolve(null),
      ]);
      const settingsObj = {};
      (settingsData || []).forEach(s => { settingsObj[s.setting_name] = s.setting_value; });
      setGlobalSettings(settingsObj);
      setEstimateContext(estimate || null);

      const sourceDefaults = {
        machine_rate_per_hour: parseFloat(settingsObj.cnc_machine_rate) || 75,
        labor_rate: parseFloat(settingsObj.cnc_labor_rate) || 45,
        setup_time_percentage: parseFloat(settingsObj.cnc_setup_time_percentage) || 20,
        fixed_setup_hours: parseFloat(settingsObj.min_cnc_setup_hours) || 0,
        notes: settingsObj.default_notes_template || "",
      };

      if (existing) {
        // CCS creates the section record before the embedded editor opens. Missing
        // CNC-specific values get the same Settings defaults as a source "new" estimate.
        setProject(prev => ({
          ...prev,
          ...sourceDefaults,
          ...existing,
          client_name: estimate?.client_name || existing.client_name || prev.client_name,
          customer_id: estimate?.customer_id || existing.customer_id,
          estimate_number: estimate?.estimate_number || existing.estimate_number,
          items: seedBuilderItemIds(existing.items || []),
          machine_rate_per_hour: existing.machine_rate_per_hour ?? sourceDefaults.machine_rate_per_hour,
          labor_rate: existing.labor_rate ?? sourceDefaults.labor_rate,
          setup_time_percentage: existing.setup_time_percentage ?? sourceDefaults.setup_time_percentage,
          fixed_setup_hours: existing.fixed_setup_hours ?? sourceDefaults.fixed_setup_hours,
        }));
        setIsEditing(true);
      } else {
        setProject(prev => ({
          ...prev,
          ...sourceDefaults,
          client_name: estimate?.client_name || prev.client_name,
          customer_id: estimate?.customer_id,
          estimate_number: estimate?.estimate_number,
        }));
      }
    } catch (error) {
      console.error('Error loading prerequisites:', error);
      setLoadError(error?.message || "CNC Builder prerequisites could not be verified.");
    }
    setIsLoading(false);
  };

  const addItem = () => {
    setProject(prev => ({
      ...prev,
      items: [...prev.items, {
        builder_item_id: newBuilderItemId("cnc-item"),
        item_type: "panel",
        description: "",
        material_type: "Wood",
        material_thickness: "3/4",
        quantity: 1,
        length: 0,
        width: 0,
        letter_height: 0,
        num_letters: 0,
        carve_area_sqin: 0,
        carve_depth: 0.125,
        cut_speed_ipm: 50,
        carve_speed_sqipm: 10,
        machine_time_hours: 0,
        setup_time_hours: 0,
        machine_cost: 0,
        labor_cost: 0,
        force_enhanced: false,
        cutter_diameter_in: 0,
        smallest_detail_in: 0,
        workholding_method: "",
        creates_loose_pieces: false,
      }]
    }));
  };

  const removeItem = (index) => {
    setProject(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index, field, value) => {
    setProject(prev => {
      const newItems = [...prev.items];
      let item = { ...newItems[index], [field]: value };

      // For lettering items, "Number of Letters" IS the quantity — keep qty=1
      // so the per-item math (which multiplies by quantity) doesn't double-count.
      if (field === 'item_type' && value === 'lettering') {
        item.quantity = 1;
      }
      if (item.item_type === 'lettering') {
        item.quantity = 1;
      }

      // Auto-set cut speed based on thickness for CNC
      if (field === 'material_thickness') {
        const speedSettingKey = `cnc_cut_speed_${value.replace('/', '_').replace('-', '_')}`;
        item.cut_speed_ipm = parseFloat(globalSettings[speedSettingKey]) || 50;
      }
      
      // Calculate cut length based on item type
      const letterPerimFactor = parseFloat(globalSettings.cnc_letter_perimeter_factor) || 3.5;
      
      let cutLength = 0;
      if (item.item_type === 'panel') {
        cutLength = (item.length + item.width) * 2;
      } else if (item.item_type === 'lettering') {
        cutLength = item.letter_height * letterPerimFactor * item.num_letters;
      }
      
      // Machine Time calculation
      const materialCutMultiplierKey = `${item.material_type.toLowerCase()}_cnc_cut_multiplier`;
      const cutMultiplier = parseFloat(globalSettings[materialCutMultiplierKey]) || 1.0;
      const cutTimeMinutes = cutLength > 0 && item.cut_speed_ipm > 0 
        ? (cutLength / item.cut_speed_ipm) * cutMultiplier : 0;
      
      const carveTimeMinutes = item.carve_area_sqin > 0 && item.carve_speed_sqipm > 0 
        ? item.carve_area_sqin / item.carve_speed_sqipm : 0;
      
      const machineTimeHours = ((cutTimeMinutes + carveTimeMinutes) * item.quantity) / 60;
      item.machine_time_hours = machineTimeHours;

      // Setup time calculation - use project's setup_time_percentage
      const setupTimePercentage = prev.setup_time_percentage; 
      const setupTimeHours = machineTimeHours * (setupTimePercentage / 100);
      item.setup_time_hours = setupTimeHours;

      // Costs
      item.machine_cost = machineTimeHours * prev.machine_rate_per_hour;
      item.labor_cost = setupTimeHours * prev.labor_rate;
      
      newItems[index] = { ...item };
      return { ...prev, items: newItems };
    });
  };

  const calculateTotals = () => {
    const totalMachineCost = project.items.reduce((sum, item) => sum + (item.machine_cost || 0), 0);
    const dynamicLaborFromItems = project.items.reduce((sum, item) => sum + (item.labor_cost || 0), 0);
    const totalSetupHours = project.items.reduce((sum, item) => sum + (item.setup_time_hours || 0), 0);
    const fixedSetupCost = (project.fixed_setup_hours || 0) * project.labor_rate;
    const minLaborHours = parseFloat(globalSettings.min_cnc_labor_hours) || 0;

    // Source behavior: minimum applies only to the dynamic item setup portion,
    // while fixed setup remains additive.
    const effectiveDynamicLabor = totalSetupHours > 0 && totalSetupHours < minLaborHours
      ? minLaborHours * project.labor_rate
      : dynamicLaborFromItems;
    const minimumDynamicLaborAdjustment = effectiveDynamicLabor - dynamicLaborFromItems;
    const totalLaborCost = fixedSetupCost + effectiveDynamicLabor;

    return {
      totalMachine: totalMachineCost,
      totalLabor: totalLaborCost,
      totalSetupHours,
      dynamicLaborFromItems,
      fixedSetupCost,
      minLaborHours,
      minimumDynamicLaborAdjustment,
    };
  };

  const saveProject = async () => {
    if (!project.project_name || !(estimateContext?.client_name || project.client_name)) {
      alert('Please fill in project name and client name');
      return;
    }

    setIsSaving(true);
    try {
      const totals = calculateTotals();
      const totalCost = totals.totalMachine + totals.totalLabor;
      const pricingProject = {
        ...project,
        client_name: estimateContext?.client_name || project.client_name,
        customer_id: estimateContext?.customer_id || project.customer_id,
        estimate_number: estimateContext?.estimate_number || project.estimate_number,
        total_machine_cost: totals.totalMachine,
        total_labor_cost: totals.totalLabor,
      };
      const customerPricing = await calculateSavedCustomerPricing({
        project: pricingProject,
        categorize: categorizeCNCProject,
        tierNumber: project.customer_pricing?.tier_number,
      });
      const finalProject = {
        ...pricingProject,
        customer_pricing: customerPricing || project.customer_pricing,
        total_cost: totalCost,
        status: 'calculated',
      };

      let saved;
      const activeProjectId = persistedProjectIdRef.current || editId || "";
      if (activeProjectId) {
        saved = await updateBuilderSourceProject({
          entity: CNCProject,
          sourceId: activeProjectId,
          expectedUpdatedAt: project.updated_date,
          data: finalProject,
          estimateId,
          label: "CNC project",
        });
      } else {
        await preflightBuilderSourceMutation({ estimateId });
        const signature = JSON.stringify(finalProject);
        if (createAttemptRef.current.signature !== signature) {
          createAttemptRef.current = {
            signature,
            key: newCreationRequestKey("cnc_project"),
          };
        }
        saved = await ensureIdempotentEntityCreate({
          entity: CNCProject,
          keyField: "creation_request_key",
          key: createAttemptRef.current.key,
          data: finalProject,
          label: "CNC project",
        });
        if (!saved?.id) throw new Error("CNC project create could not be verified.");
        persistedProjectIdRef.current = saved.id;
        setIsEditing(true);
      }
      const savedId = saved?.id || activeProjectId;

      if (estimateId && savedId) {
        const refreshed = await CNCProject.get(savedId).catch(() => ({ ...finalProject, id: savedId }));
        await recordBuilderSave({
          estimateId,
          line: { project_id: savedId, module_key: "cnc" },
          sourceProject: {
            ...refreshed,
            builder_calculation: {
              totals: {
                total_machine_cost: totals.totalMachine,
                total_labor_cost: totals.totalLabor,
                total_setup_hours: totals.totalSetupHours,
                dynamic_labor_from_items: totals.dynamicLaborFromItems,
                fixed_setup_cost: totals.fixedSetupCost,
                min_labor_hours: totals.minLaborHours,
                minimum_dynamic_labor_adjustment: totals.minimumDynamicLaborAdjustment,
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
      if (!embedded) navigate('/Estimator');
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error saving project. Please try again.');
    }
    setIsSaving(false);
  };

  const downloadEstimate = () => {
    const { totalMachine, totalLabor } = calculateTotals();
    const totalCost = totalMachine + totalLabor;
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>CNC Estimate - ${project.project_name}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px;
      color: #1e293b;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      border-bottom: 3px solid #10b981;
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      grid-template-columns: repeat(2, 1fr);
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
    
    .cost-box.machine {
      border-color: #10b981;
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
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
    
    .summary-row.machine .summary-value { color: #10b981; }
    .summary-row.labor .summary-value { color: #3b82f6; }
    
    .total-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 3px solid #10b981;
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
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
      <h1>🔧 CNC Routing Estimate</h1>
      <div class="subtitle">Precision Machining Services</div>
    </div>
    
    <div class="project-info">
      <h2>Project Details</h2>
      <div class="info-grid">
        <div class="info-item">
          <span class="info-label">Project:</span>
          <span class="info-value">${project.project_name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Client:</span>
          <span class="info-value">${project.client_name}</span>
        </div>
        <div class="info-item">
          <span class="info-label">Date:</span>
          <span class="info-value">${new Date().toLocaleDateString()}</span>
        </div>
      </div>
    </div>
    
    <div class="content">
      <div class="section-title">Items Breakdown</div>
      
      ${project.items.map((item, i) => `
        <div class="item">
          <div class="item-header">
            Item ${i + 1}: ${item.description || `CNC item`}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${item.material_type}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${item.length}" × ${item.width}" × ${item.material_thickness}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Job Type:</span>
              <span class="detail-value">${item.item_type}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${item.quantity}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Machine Time:</span>
              <span class="detail-value">${item.machine_time_hours.toFixed(2)} hrs</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Labor Time:</span>
              <span class="detail-value">${item.setup_time_hours.toFixed(2)} hrs</span>
            </div>
          </div>
          
          <div class="item-costs">
            <div class="cost-box machine">
              <div class="cost-label">Machine Cost</div>
              <div class="cost-value">$${item.machine_cost.toFixed(2)}</div>
            </div>
            <div class="cost-box labor">
              <div class="cost-label">Labor Cost</div>
              <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
            </div>
          </div>
        </div>
      `).join('')}
      
      <div class="summary">
        <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
        
        <div class="summary-row machine">
          <span class="summary-label">Total Machine Cost:</span>
          <span class="summary-value">$${totalMachine.toFixed(2)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">$${totalLabor.toFixed(2)}</span>
        </div>
        
        <div class="total-row">
          <span class="total-label">Total Estimate</span>
          <span class="total-value">$${totalCost.toFixed(2)}</span>
        </div>
      </div>
      
      ${project.notes ? `
        <div class="notes">
          <h3>📝 Additional Notes</h3>
          <p>${project.notes}</p>
        </div>
      ` : ''}
    </div>
    
    <div class="footer">
      Generated by SignEstimate Pro - Professional Estimating Suite<br>
      © ${new Date().getFullYear()} All Rights Reserved
    </div>
  </div>
</body>
</html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.project_name.replace(/\s+/g, '_')}_CNC_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printEstimate = () => {
    const { totalMachine, totalLabor } = calculateTotals();
    const totalCost = totalMachine + totalLabor;
    
    const printContent = `
      <html>
        <head>
          <title>CNC Estimate - ${project.project_name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 40px;
              color: #1e293b;
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              border-bottom: 3px solid #10b981;
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
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              grid-template-columns: repeat(2, 1fr);
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
            
            .cost-box.machine {
              border-color: #10b981;
              background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
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
            
            .summary-row.machine .summary-value { color: #10b981; }
            .summary-row.labor .summary-value { color: #3b82f6; }
            
            .total-row {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 3px solid #10b981;
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
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
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
              <h1>🔧 CNC Routing Estimate</h1>
              <div class="subtitle">Precision Machining Services</div>
            </div>
            
            <div class="project-info">
              <h2>Project Details</h2>
              <div class="info-grid">
                <div class="info-item">
                  <span class="info-label">Project:</span>
                  <span class="info-value">${project.project_name}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Client:</span>
                  <span class="info-value">${project.client_name}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">Date:</span>
                  <span class="info-value">${new Date().toLocaleDateString()}</span>
                </div>
              </div>
            </div>
            
            <div class="content">
              <div class="section-title">Items Breakdown</div>
              
              ${project.items.map((item, i) => `
                <div class="item">
                  <div class="item-header">
                    Item ${i + 1}: ${item.description || `CNC item`}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${item.material_type}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${item.length}" × ${item.width}" × ${item.material_thickness}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Job Type:</span>
                      <span class="detail-value">${item.item_type}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${item.quantity}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Machine Time:</span>
                      <span class="detail-value">${item.machine_time_hours.toFixed(2)} hrs</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Labor Time:</span>
                      <span class="detail-value">${item.setup_time_hours.toFixed(2)} hrs</span>
                    </div>
                  </div>
                  
                  <div class="item-costs">
                    <div class="cost-box machine">
                      <div class="cost-label">Machine Cost</div>
                      <div class="cost-value">$${item.machine_cost.toFixed(2)}</div>
                    </div>
                    <div class="cost-box labor">
                      <div class="cost-label">Labor Cost</div>
                      <div class="cost-value">$${item.labor_cost.toFixed(2)}</div>
                    </div>
                  </div>
                </div>
              `).join('')}
              
              <div class="summary">
                <div class="section-title" style="border-color: #10b981;">Cost Summary</div>
                
                <div class="summary-row machine">
                  <span class="summary-label">Total Machine Cost:</span>
                  <span class="summary-value">$${totalMachine.toFixed(2)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">$${totalLabor.toFixed(2)}</span>
                </div>
                
                <div class="total-row">
                  <span class="total-label">Total Estimate</span>
                  <span class="total-value">$${totalCost.toFixed(2)}</span>
                </div>
              </div>
              
              ${project.notes ? `
                <div class="notes">
                  <h3>📝 Additional Notes</h3>
                  <p>${project.notes}</p>
                </div>
              ` : ''}
            </div>
            
            <div class="footer">
              Generated by SignEstimate Pro - Professional Estimating Suite<br>
              © ${new Date().getFullYear()} All Rights Reserved
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


  const { totalMachine, totalLabor } = calculateTotals();

  if (isLoading) return <div className="p-8">Loading...</div>;
  if (loadError) return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-2xl mx-auto rounded border border-red-200 bg-red-50 p-5 text-red-800">
        <div className="font-bold">CNC Builder unavailable</div>
        <div className="mt-1 text-sm">Required Settings, project data, or estimate context could not be verified. Hard-coded fallback rates were not used.</div>
        <div className="mt-2 text-xs break-words">{loadError}</div>
        <Button variant="outline" className="mt-4" onClick={() => embedded ? onClose?.() : navigate(estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator")}><ArrowLeft className="w-4 h-4 mr-2" /> Back</Button>
      </div>
    </div>
  );

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          {embedded ? (
            <Button variant="outline" size="icon" onClick={onClose} title="Back to products"><ArrowLeft className="w-4 h-4" /></Button>
          ) : (
            <Link to={estimateId ? `/EstimateDetail?id=${estimateId}` : "/Estimator"}><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          )}
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              <Router className="w-6 h-6" />
              {isEditing ? "Edit" : "New"} CNC Estimate
            </h1>
            <p className="text-slate-600">Estimate costs for CNC routing and carving jobs</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                <TabsList className="grid grid-cols-4 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1">
                  <TabBadgeTrigger value="project" icon={FileText} label="Project" color="green" />
                  <TabBadgeTrigger value="items" icon={ListChecks} label="Items" amount={totalMachine + totalLabor} count={project.items.length} color="green" />
                  <TabBadgeTrigger value="summary" icon={Calculator} label="Summary" amount={totalMachine + totalLabor} color="green" />
                  <TabBadgeTrigger value="pricing" icon={TrendingUp} label="Customer Pricing" accent color="green" />
                </TabsList>
              </div>

              <TabsContent value="project" className="mt-4 space-y-6">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader><CardTitle>Project Information</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div><Label>Project Name *</Label><Input value={project.project_name} onChange={(e) => setProject(p => ({ ...p, project_name: e.target.value }))} /></div>
                  <div>
                    <Label>Client Name *</Label>
                    <Input
                      value={estimateContext?.client_name || project.client_name || ""}
                      readOnly={embedded}
                      onChange={(e) => !embedded && setProject(p => ({ ...p, client_name: e.target.value }))}
                    />
                    {embedded && <p className="text-[10px] text-slate-400 mt-1">Inherited from the All-In-One estimate.</p>}
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label>Fixed Setup Time (hours)</Label>
                    <Input type="number" min="0" value={project.fixed_setup_hours} onFocus={(e) => e.target.select()} onChange={(e) => setProject(p => ({...p, fixed_setup_hours: parseFloat(e.target.value) || 0}))} />
                  </div>
                  <div>
                    <Label>Setup Time Percentage (%)</Label>
                    <Input type="number" min="0" max="100" value={project.setup_time_percentage} onFocus={(e) => e.target.select()} onChange={(e) => setProject(p => ({...p, setup_time_percentage: parseFloat(e.target.value) || 0}))} />
                    <p className="text-xs text-slate-500 mt-1">Percentage of machine time added as labor setup time per item.</p>
                  </div>
                </div>
                <div><Label>Notes</Label><Textarea value={project.notes} onChange={(e) => setProject(p => ({ ...p, notes: e.target.value }))} /></div>
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="items" className="mt-4 space-y-6">
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Project Items</CardTitle>
                  <Button onClick={addItem} size="sm"><Plus className="w-4 h-4 mr-2" />Add Item</Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {project.items.map((item, index) => (
                  <div key={index} className="p-6 border rounded-xl bg-slate-25">
                    <div className="flex justify-between items-start mb-4"><h4 className="font-medium">Item {index + 1}</h4><Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button></div>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <div className="md:col-span-3"><Label>Description</Label><Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></div>
                      <div><Label>Job Type</Label><Select value={item.item_type} onValueChange={(v) => updateItem(index, 'item_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="panel">Panel Cut</SelectItem><SelectItem value="lettering">Lettering Cut</SelectItem><SelectItem value="3d_carving">3D Carving</SelectItem></SelectContent></Select></div>
                      <div><Label>Material Type</Label><Select value={item.material_type} onValueChange={(v) => updateItem(index, 'material_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{materials.map(mat => <SelectItem key={mat} value={mat}>{mat}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label>Material Thickness</Label><Select value={item.material_thickness} onValueChange={(v) => updateItem(index, 'material_thickness', v)}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{imperialSizes.map(size => <SelectItem key={size} value={size}>{size}"</SelectItem>)}</SelectContent></Select></div>
                      {/* Quantity field — only shown for panels & carvings. For lettering, "Number of Letters" IS the quantity. */}
                      {item.item_type !== 'lettering' && (
                        <div><Label>Quantity</Label><Input type="number" min="1" value={item.quantity || ""} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} /></div>
                      )}
                      
                      {item.item_type === 'panel' && (<><div><Label>Length (in)</Label><Input type="number" min="0" value={item.length || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'length', parseFloat(e.target.value) || 0)} /></div><div><Label>Height (in)</Label><Input type="number" min="0" value={item.width || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'width', parseFloat(e.target.value) || 0)} /></div></>)}
                      
                      {item.item_type === 'lettering' && (<><div><Label>Letter Height (in)</Label><Input type="number" min="0" value={item.letter_height || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'letter_height', parseFloat(e.target.value) || 0)} /></div><div><Label>Number of Letters</Label><Input type="number" min="0" value={item.num_letters || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'num_letters', parseInt(e.target.value) || 0)} /></div></>)}
                      
                      {item.item_type === '3d_carving' && (<><div><Label>Carve Area (in²)</Label><Input type="number" min="0" value={item.carve_area_sqin || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'carve_area_sqin', parseFloat(e.target.value) || 0)} /></div><div><Label>Carve Depth (in)</Label><Input type="number" min="0" step="0.125" value={item.carve_depth || ""} onFocus={(e) => e.target.select()} onChange={e => updateItem(index, 'carve_depth', parseFloat(e.target.value) || 0)} /></div></>)}
                    </div>
                    
                    <div className="mt-4 pt-4 border-t grid md:grid-cols-2 gap-4">
                      {item.item_type !== '3d_carving' && (<div><Label>Cut Speed (in/min)</Label><Input type="number" min="0" value={item.cut_speed_ipm || ""} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(index, 'cut_speed_ipm', parseFloat(e.target.value) || 0)} placeholder="Auto-calculated" /><p className="text-xs text-slate-500 mt-1">Auto-set by thickness, can be overridden.</p></div>)}
                      {item.item_type === '3d_carving' && (<div><Label>Carve Speed (in²/min)</Label><Input type="number" min="0" value={item.carve_speed_sqipm || ""} onFocus={(e) => e.target.select()} onChange={(e) => updateItem(index, 'carve_speed_sqipm', parseFloat(e.target.value) || 0)} /></div>)}
                    </div>
                    
                    <HoldDownAdvisor
                      item={item}
                      onUpdate={(field, value) => updateItem(index, field, value)}
                      letterPerimFactor={parseFloat(globalSettings.cnc_letter_perimeter_factor) || 3.5}
                    />

                    <div className="mt-4 p-4 bg-white rounded-lg border">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><span className="text-slate-500">Machine Time:</span><p className="font-medium">{(item.machine_time_hours || 0).toFixed(1)} hrs</p></div>
                        <div><span className="text-slate-500">Machine Cost:</span><p className="font-medium">${(item.machine_cost || 0).toFixed(2)}</p></div>
                        <div><span className="text-slate-500">Setup Time:</span><p className="font-medium">{(item.setup_time_hours || 0).toFixed(1)} hrs</p></div>
                        <div><span className="text-slate-500">Labor Cost:</span><p className="font-semibold">${(item.labor_cost || 0).toFixed(2)}</p></div>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-4 space-y-6">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader><CardTitle>Estimate Breakdown</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium w-8">#</th>
                          <th className="text-left px-4 py-2 font-medium">Description</th>
                          <th className="text-left px-4 py-2 font-medium">Material</th>
                          <th className="text-right px-4 py-2 font-medium">Machine</th>
                          <th className="text-right px-4 py-2 font-medium">Labor</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.items.map((it, i) => (
                          <tr key={i} className="border-t border-slate-100">
                            <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                            <td className="px-4 py-2 font-medium">{it.description || `Item ${i + 1}`}</td>
                            <td className="px-4 py-2 text-xs text-slate-600">{it.material_type}</td>
                            <td className="px-4 py-2 text-right tabular-nums">${(it.machine_cost || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">${(it.labor_cost || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold">${((it.machine_cost || 0) + (it.labor_cost || 0)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-sm">
                        <tr>
                          <td colSpan="3" className="px-4 py-2 text-right font-medium">Totals</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${totalMachine.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${totalLabor.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">${(totalMachine + totalLabor).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pricing" className="mt-4 space-y-6">
                <CustomerPricingTab
                  project={{ ...project, total_machine_cost: totalMachine, total_labor_cost: totalLabor }}
                  categorize={categorizeCNCProject}
                  accentColor="green"
                  onTierChange={(tier) => setProject((prev) => ({
                    ...prev,
                    customer_pricing: { ...(prev.customer_pricing || {}), tier_number: tier },
                  }))}
                />
              </TabsContent>
            </Tabs>
          </div>
          <div className="space-y-6">
            <Card className="bg-white border-0 shadow-sm sticky top-8">
              <CardHeader><CardTitle>Cost Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-green-800">Total Machine Cost:</span>
                    <span className="font-bold text-lg text-green-900">${totalMachine.toFixed(2)}</span>
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-blue-800">Total Labor Cost:</span>
                    <span className="font-bold text-lg text-blue-900">${totalLabor.toFixed(2)}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-slate-500 text-center">Using the migrated SignEstimate Pro CNC rates and calculation settings.</p>
                </div>
              </CardContent>
            </Card>
            <Button onClick={saveProject} disabled={isSaving} className="w-full bg-green-600 hover:bg-green-700">{isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />Save Estimate</>}</Button>
            <Button onClick={downloadEstimate} variant="outline" className="w-full">Download Estimate (HTML)</Button>
            <Button onClick={printEstimate} variant="outline" className="w-full">Print Estimate</Button>
          </div>
        </div>
      </div>
    </div>
  );
}