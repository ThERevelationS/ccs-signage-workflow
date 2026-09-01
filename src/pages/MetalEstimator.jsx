import React, { useState, useEffect, useCallback } from "react";
import { MetalProject, Settings, Inventory as InventoryEntity } from "@/entities/all";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Save, Wrench, Edit, Download, Printer, FileText, ListChecks, Calculator, TrendingUp } from "lucide-react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";
import ClientSearchInput from "@/components/ClientSearchInput";
import { upsertCustomerSummaryForEstimate } from "@/components/customerSummary/upsertCustomerSummary";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { createPageUrl } from "@/utils";
import TabBadgeTrigger from "@/components/channelLetterInstall/TabBadgeTrigger";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeMetalProject } from "@/components/markup/projectCategorizer";

const itemTypes = ["channel_letters", "cabinet_sign", "monument_sign", "pole_sign", "flat_cut_letters", "fabricated_letters", "frame_assembly", "custom_brackets"];
// materialTypes is not directly used in the current structure for display, but could be for filtering
// const materialTypes = ["Aluminum", "Steel", "Stainless_Steel", "Galvanized_Steel"];

export default function NewMetalEstimate({ embeddedId = null, embedded = false }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Prop wins when embedded inside the All-In-One estimator.
  const editId = embeddedId || searchParams.get('edit');
  const [isEditing, setIsEditing] = useState(false);
  const { setIsDirty } = useUnsavedChanges();

  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    items: [],
    fabrication_rate: 65,
    welding_rate: 75,
    finishing_rate: 55,
    notes: ""
  });
  const [globalSettings, setGlobalSettings] = useState({});
  const [inventory, setInventory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  useEffect(() => {
    if (!isLoading) setHasLoaded(true);
  }, [isLoading]);
  useEffect(() => {
    if (hasLoaded) setIsDirty(true);
  }, [project]);

  const loadPrerequisites = useCallback(async () => {
    try {
      const [settingsData, inventoryData] = await Promise.all([
          Settings.list(),
          InventoryEntity.list()
      ]);
      const settingsObj = {};
      settingsData.forEach(s => { settingsObj[s.setting_name] = s.setting_value; });
      setGlobalSettings(settingsObj);
      setInventory(inventoryData);
      
      if (!editId) {
        setProject(prev => ({
          ...prev,
          fabrication_rate: parseFloat(settingsObj.fabrication_rate) || 65,
          welding_rate: parseFloat(settingsObj.welding_rate) || 75,
          finishing_rate: parseFloat(settingsObj.finishing_rate) || 55,
          notes: settingsObj.default_notes_template || ""
        }));
      }
    } catch (error) {
      console.error('Error loading prerequisites:', error);
    }
  }, [editId]);

  const loadProjectForEdit = useCallback(async (projectId) => {
    try {
      const projectToEdit = await MetalProject.get(projectId);
      if (projectToEdit) {
        setProject(projectToEdit);
        setIsEditing(true);
      } else {
        navigate(createPageUrl("MetalProjects"));
      }
    } catch (error) {
      console.error('Error loading project for edit:', error);
    }
  }, [navigate]);

  useEffect(() => {
    const loadAll = async () => {
        setIsLoading(true);
        await loadPrerequisites();
        if (editId) {
            await loadProjectForEdit(editId);
        }
        setIsLoading(false);
    };
    loadAll();
  }, [editId, loadPrerequisites, loadProjectForEdit]);

  const addItem = () => {
    setProject(prev => ({
      ...prev,
      items: [...prev.items, {
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
    setProject(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  };

  const updateItem = (index, field, value) => {
    setProject(prev => {
      const newItems = [...prev.items];
      let item = { ...newItems[index], [field]: value };

      // --- Recalculate ---
      // Material cost for one unit of the item (based on material_length_ft and inventory item cost)
      const inventoryItem = inventory.find(i => i.id === item.inventory_item_id);
      if (inventoryItem) {
          item.material_cost = (item.material_length_ft || 0) * (inventoryItem.cost_per_unit || 0);
      }

      // Labor costs for one unit of the item
      item.fabrication_cost = (item.fabrication_hours || 0) * prev.fabrication_rate;
      item.welding_cost = (item.welding_hours || 0) * prev.welding_rate;
      item.finishing_cost = (item.finishing_hours || 0) * prev.finishing_rate;
      
      newItems[index] = { ...item };
      return { ...prev, items: newItems };
    });
  };

  const calculateTotals = useCallback(() => {
    const totals = {
      material: 0, // Total for all items including quantity
      supplies: 0, // Total for all items including quantity
      fabrication: 0, // Total for all items including quantity
      welding: 0, // Total for all items including quantity
      finishing: 0 // Total for all items including quantity
    };
    project.items.forEach(item => {
      totals.material += (item.material_cost || 0) * (item.quantity || 1);
      totals.supplies += (item.supplies_cost || 0) * (item.quantity || 1);
      totals.fabrication += (item.fabrication_cost || 0) * (item.quantity || 1);
      totals.welding += (item.welding_cost || 0) * (item.quantity || 1);
      totals.finishing += (item.finishing_cost || 0) * (item.quantity || 1);
    });
    return totals;
  }, [project.items]);

  const getProjectCalculations = useCallback(() => {
    const currentTotals = calculateTotals(); // This returns material, supplies, fabrication, welding, finishing

    const totalMaterialsCost = currentTotals.material;
    const totalSuppliesCost = currentTotals.supplies;
    const totalFabricationCost = currentTotals.fabrication;
    const totalWeldingCost = currentTotals.welding;
    const totalFinishingCost = currentTotals.finishing;
    const totalLaborCost = totalFabricationCost + totalWeldingCost + totalFinishingCost;

    const enrichedItems = project.items.map(item => {
        const inventoryItem = inventory.find(i => i.id === item.inventory_item_id);
        const materialType = inventoryItem ? inventoryItem.material_type : 'N/A';
        const itemTypeDisplay = item.item_type ? item.item_type.replace(/_/g, ' ') : 'N/A';

        let length = 'N/A', width = 'N/A', thickness = 'N/A';
        let dimensionsDisplay = 'N/A';
        if (inventoryItem && inventoryItem.size) {
            dimensionsDisplay = inventoryItem.size;
            const sizeString = inventoryItem.size.toLowerCase().replace(/['"inchesftt]/g, '').trim();
            const parts = sizeString.split(/[x×]/).map(p => p.trim());
            if (parts.length >= 1) length = parts[0];
            if (parts.length >= 2) width = parts[1];
            if (parts.length >= 3) thickness = parts[2];
        }

        const laborHoursPerUnit = (item.fabrication_hours || 0) + (item.welding_hours || 0) + (item.finishing_hours || 0);
        const materialsCostTotal = (item.material_cost || 0) * (item.quantity || 1); // Total material cost for all quantities of this item
        const suppliesCostTotal = (item.supplies_cost || 0) * (item.quantity || 1); // Total supplies cost for all quantities of this item
        const laborCostTotal = ((item.fabrication_cost || 0) + (item.welding_cost || 0) + (item.finishing_cost || 0)) * (item.quantity || 1); // Total labor cost for all quantities of this item

        return {
            ...item,
            item_type_display: itemTypeDisplay,
            material_type: materialType,
            dimensions_display: dimensionsDisplay,
            length: length,
            width: width,
            thickness: thickness,
            labor_hours: laborHoursPerUnit, // Labor hours per *unit*
            materials_cost: materialsCostTotal,
            supplies_cost: suppliesCostTotal,
            labor_cost: laborCostTotal,
        };
    });

    return {
        totalMaterialsCost,
        totalSuppliesCost,
        totalFabricationCost,
        totalWeldingCost,
        totalFinishingCost,
        totalLaborCost,
        grandTotal: totalMaterialsCost + totalSuppliesCost + totalLaborCost,
        enrichedItems,
    };
  }, [project.items, inventory, calculateTotals]);


  const saveProject = async () => {
    if (!project.project_name || !project.client_name) {
      alert('Please fill in project name and client name');
      return;
    }
    
    setIsSaving(true);
    setIsDirty(false);
    try {
      const { 
          totalMaterialsCost, totalSuppliesCost, 
          totalFabricationCost, totalWeldingCost, totalFinishingCost,
          totalLaborCost, enrichedItems // Use enriched items if you want to store computed fields, but usually only raw input is stored
      } = getProjectCalculations();

      const finalProject = { 
          ...project, 
          total_material_cost: totalMaterialsCost,
          total_supplies_cost: totalSuppliesCost,
          total_fabrication_cost: totalFabricationCost,
          total_welding_cost: totalWeldingCost,
          total_finishing_cost: totalFinishingCost,
          total_labor_cost: totalLaborCost, // Store this aggregate for easier retrieval
          status: 'calculated' 
      };
      
      let savedId = editId;
      if (isEditing) {
        await MetalProject.update(editId, finalProject);
      } else {
        const created = await MetalProject.create(finalProject);
        savedId = created?.id;
      }
      await upsertCustomerSummaryForEstimate({
        module: "metal_fabrication",
        client_name: project.client_name,
        project_id: savedId,
        project_name: project.project_name,
        estimate_number: project.estimate_number,
      });
      if (!embedded) navigate(createPageUrl("MetalProjects"));
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error saving project. Please try again.');
    }
    setIsSaving(false);
  };

  const downloadEstimate = () => {
    const { 
      totalMaterialsCost, totalSuppliesCost, totalLaborCost, grandTotal, enrichedItems 
    } = getProjectCalculations();
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Metal Estimate - ${project.project_name}</title>
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
      <h1>🔨 Metal Fabrication Estimate</h1>
      <div class="subtitle">Custom Metal Work & Fabrication</div>
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
      
      ${enrichedItems.map((item, i) => `
        <div class="item">
          <div class="item-header">
            Item ${i + 1}: ${item.description || `Metal fabrication item`}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Type:</span>
              <span class="detail-value">${item.item_type_display}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${item.material_type}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${item.dimensions_display}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${item.quantity}</span>
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
    a.download = `${project.project_name.replace(/\s+/g, '_')}_Metal_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printEstimate = () => {
    const { 
      totalMaterialsCost, totalSuppliesCost, totalLaborCost, grandTotal, enrichedItems 
    } = getProjectCalculations();
    
    const printContent = `
      <html>
        <head>
          <title>Metal Estimate - ${project.project_name}</title>
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
              <h1>🔨 Metal Fabrication Estimate</h1>
              <div class="subtitle">Custom Metal Work & Fabrication</div>
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
              
              ${enrichedItems.map((item, i) => `
                <div class="item">
                  <div class="item-header">
                    Item ${i + 1}: ${item.description || `Metal fabrication item`}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value">${item.item_type_display}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${item.material_type}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${item.dimensions_display}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${item.quantity}</span>
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

  const { totalMaterialsCost, totalSuppliesCost, totalFabricationCost, totalWeldingCost, totalFinishingCost, grandTotal } = getProjectCalculations();

  if (isLoading) return <div className="p-8">Loading...</div>;

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Link to={createPageUrl("MetalProjects")}><Button variant="outline" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
              {isEditing ? <Edit className="w-6 h-6"/> : <Wrench className="w-6 h-6" />}
              {isEditing ? 'Edit Metal Fabrication Estimate' : 'New Metal Fabrication Estimate'}
            </h1>
            <p className="text-slate-600">Estimate costs for fabricated metal signs and components</p>
          </div>
        </div>
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
            <Card className="bg-white border-0 shadow-sm"><CardHeader><CardTitle>Project Information</CardTitle></CardHeader><CardContent className="space-y-4"><div className="grid md:grid-cols-2 gap-4"><div><Label>Project Name *</Label><Input value={project.project_name} onChange={(e) => setProject(p => ({ ...p, project_name: e.target.value }))} /></div><div><Label>Client Name *</Label><ClientSearchInput value={project.client_name} onChange={(val) => setProject(p => ({ ...p, client_name: val }))} onSelectProject={(data) => { setProject(prev => ({...prev, client_name: data.client_name || prev.client_name, project_name: data.project_name || prev.project_name, estimate_number: data.estimate_number || prev.estimate_number, hyperlink: data.hyperlink || prev.hyperlink })); }} /></div></div><div><Label>Notes</Label><Textarea value={project.notes} onChange={(e) => setProject(p => ({ ...p, notes: e.target.value }))} /></div></CardContent></Card>
              </TabsContent>

              <TabsContent value="items" className="mt-4 space-y-6">
            <Card className="bg-white border-0 shadow-sm">
                <CardHeader><div className="flex justify-between items-center"><CardTitle>Project Items</CardTitle><Button onClick={addItem} size="sm"><Plus className="w-4 h-4 mr-2" />Add Item</Button></div></CardHeader>
                <CardContent className="space-y-6">
                    {project.items.map((item, index) => (
                      <div key={index} className="p-6 border rounded-xl bg-slate-25">
                        <div className="flex justify-between items-start mb-4"><h4 className="font-medium">Item {index + 1}</h4><Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500"><Trash2 className="w-4 h-4" /></Button></div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="md:col-span-3"><Label>Description</Label><Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} /></div>
                          <div><Label>Item Type</Label><Select value={item.item_type} onValueChange={(v) => updateItem(index, 'item_type', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{itemTypes.map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, ' ')}</SelectItem>)}</SelectContent></Select></div>
                          <div className="md:col-span-2"><Label>Material</Label><Select value={item.inventory_item_id} onValueChange={(v) => updateItem(index, 'inventory_item_id', v)}><SelectTrigger><SelectValue placeholder="Select from inventory" /></SelectTrigger><SelectContent>{inventory.map(i => <SelectItem key={i.id} value={i.id}>{i.material_type} {i.product_type} {i.size} - ${i.cost_per_unit}/{i.unit_type}</SelectItem>)}</SelectContent></Select></div>
                          <div><Label>Material Length (ft)</Label><Input type="number" min="0" value={item.material_length_ft || ""} onChange={e => updateItem(index, 'material_length_ft', parseFloat(e.target.value) || 0)} /></div>
                          <div><Label>Supplies Cost (per unit)</Label><Input type="number" min="0" value={item.supplies_cost || ""} onChange={e => updateItem(index, 'supplies_cost', parseFloat(e.target.value) || 0)} /></div>
                          <div><Label>Quantity</Label><Input type="number" min="1" value={item.quantity || ""} onChange={(e) => updateItem(index, 'quantity', parseInt(e.target.value) || 1)} /></div>
                          
                          <div className="md:col-span-3 pt-4 border-t"><h5 className="font-medium text-sm text-slate-700">Labor Hours (per unit)</h5></div>
                          <div><Label>Fabrication</Label><Input type="number" min="0" value={item.fabrication_hours || ""} onChange={e => updateItem(index, 'fabrication_hours', parseFloat(e.target.value) || 0)} /></div>
                          <div><Label>Welding</Label><Input type="number" min="0" value={item.welding_hours || ""} onChange={e => updateItem(index, 'welding_hours', parseFloat(e.target.value) || 0)} /></div>
                          <div><Label>Finishing</Label><Input type="number" min="0" value={item.finishing_hours || ""} onChange={e => updateItem(index, 'finishing_hours', parseFloat(e.target.value) || 0)} /></div>
                        </div>
                        <div className="mt-4 p-4 bg-white rounded-lg border text-xs">
                          <div className="flex justify-between"><span className="text-slate-500">Material Cost (per unit):</span><p className="font-medium">${(item.material_cost || 0).toFixed(2)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Fabrication Cost (per unit):</span><p className="font-medium">${(item.fabrication_cost || 0).toFixed(2)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Welding Cost (per unit):</span><p className="font-medium">${(item.welding_cost || 0).toFixed(2)}</p></div>
                          <div className="flex justify-between"><span className="text-slate-500">Finishing Cost (per unit):</span><p className="font-medium">${(item.finishing_cost || 0).toFixed(2)}</p></div>
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
                          <th className="text-left px-4 py-2 font-medium">Type</th>
                          <th className="text-right px-4 py-2 font-medium">Materials</th>
                          <th className="text-right px-4 py-2 font-medium">Labor</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {project.items.map((it, i) => {
                          const qty = it.quantity || 1;
                          const matCost = (it.material_cost || 0) * qty;
                          const suppliesCost = (it.supplies_cost || 0) * qty;
                          const laborCost = ((it.fabrication_cost || 0) + (it.welding_cost || 0) + (it.finishing_cost || 0)) * qty;
                          return (
                            <tr key={i} className="border-t border-slate-100">
                              <td className="px-4 py-2 text-slate-500">{i + 1}</td>
                              <td className="px-4 py-2 font-medium">{it.description || `Item ${i + 1}`}</td>
                              <td className="px-4 py-2 capitalize text-xs text-slate-600">{(it.item_type || '').replace(/_/g, ' ')}</td>
                              <td className="px-4 py-2 text-right tabular-nums">${(matCost + suppliesCost).toFixed(2)}</td>
                              <td className="px-4 py-2 text-right tabular-nums">${laborCost.toFixed(2)}</td>
                              <td className="px-4 py-2 text-right tabular-nums font-semibold">${(matCost + suppliesCost + laborCost).toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-sm">
                        <tr>
                          <td colSpan="3" className="px-4 py-2 text-right font-medium">Totals</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${(totalMaterialsCost + totalSuppliesCost).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${(totalFabricationCost + totalWeldingCost + totalFinishingCost).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">${grandTotal.toFixed(2)}</td>
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
                    total_material_cost: totalMaterialsCost,
                    total_supplies_cost: totalSuppliesCost,
                    total_fabrication_cost: totalFabricationCost,
                    total_welding_cost: totalWeldingCost,
                    total_finishing_cost: totalFinishingCost,
                  }}
                  categorize={categorizeMetalProject}
                  accentColor="orange"
                />
              </TabsContent>
            </Tabs>
          </div>
          <div className="space-y-6">
            <Card className="bg-white border-0 shadow-sm sticky top-8"><CardHeader><CardTitle>Cost Summary</CardTitle></CardHeader><CardContent className="space-y-2 text-sm"><div className="flex justify-between"><span className="text-slate-600">Total Material Cost:</span><span className="font-medium text-slate-900">${totalMaterialsCost.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Supplies Cost:</span><span className="font-medium text-slate-900">${totalSuppliesCost.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Fabrication Cost:</span><span className="font-medium text-slate-900">${totalFabricationCost.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Welding Cost:</span><span className="font-medium text-slate-900">${totalWeldingCost.toFixed(2)}</span></div><div className="flex justify-between"><span className="text-slate-600">Total Finishing Cost:</span><span className="font-medium text-slate-900">${totalFinishingCost.toFixed(2)}</span></div><div className="mt-4 pt-4 border-t"><div className="flex justify-between items-center"><span className="font-bold text-lg text-slate-900">Grand Total:</span><span className="font-bold text-2xl text-blue-600">${grandTotal.toFixed(2)}</span></div></div></CardContent></Card>
            <Button onClick={saveProject} disabled={isSaving} className="w-full bg-green-600 hover:bg-green-700">{isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" />{isEditing ? 'Update Estimate' : 'Save Estimate'}</>}</Button>
            <div className="grid grid-cols-2 gap-4">
              <Button onClick={downloadEstimate} variant="outline" className="w-full"><Download className="w-4 h-4 mr-2" /> Download</Button>
              <Button onClick={printEstimate} variant="outline" className="w-full"><Printer className="w-4 h-4 mr-2" /> Print</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}