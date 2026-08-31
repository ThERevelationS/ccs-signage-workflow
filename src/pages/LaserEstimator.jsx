import React, { useState, useEffect, useCallback } from "react";
import { LaserProject, Settings, User } from "@/entities/all";
import { useSearchParams } from "react-router-dom"; // Removed useNavigate
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Save, Plus, Trash2, ArrowLeft, Zap, FileText, ListChecks, Calculator, Settings as SettingsIcon } from "lucide-react";
import { Tabs, TabsList, TabsContent } from "@/components/ui/tabs";
import { useUnsavedChanges } from "@/components/UnsavedChangesContext";
import ClientSearchInput from "@/components/ClientSearchInput";
import { upsertCustomerSummaryForEstimate } from "@/components/customerSummary/upsertCustomerSummary";
import TabBadgeTrigger from "@/components/channelLetterInstall/TabBadgeTrigger";
import CustomerPricingTab from "@/components/markup/CustomerPricingTab";
import { categorizeLaserProject } from "@/components/markup/projectCategorizer";
import { TrendingUp } from "lucide-react";

const imperialSizes = ["1/16", "1/8", "3/16", "1/4", "3/8", "1/2", "3/4"]; // Updated: Removed "1"
const materials = ["Acrylic", "Wood", "Leather"];

const parseImperialFraction = (fractionString) => {
  if (typeof fractionString !== 'string') return parseFloat(fractionString) || 0;
  let totalValue = 0;
  const wholeAndFraction = fractionString.split('-');
  if (wholeAndFraction.length === 2) {
    totalValue += parseFloat(wholeAndFraction[0]);
    fractionString = wholeAndFraction[1];
  } else {
    fractionString = wholeAndFraction[0];
  }
  const parts = fractionString.split('/');
  if (parts.length === 2) {
    const numerator = parseFloat(parts[0]);
    const denominator = parseFloat(parts[1]);
    if (!isNaN(numerator) && !isNaN(denominator) && denominator !== 0) {
      totalValue += numerator / denominator;
    }
  } else {
    totalValue += parseFloat(fractionString) || 0;
  }
  return totalValue;
};

export default function NewLaserEstimate({ embeddedId = null, embedded = false }) {
  // (embedded prop powers All-In-One inline embedding)
  const [searchParams] = useSearchParams();
  // Prop wins when embedded inside the All-In-One estimator.
  const editId = embeddedId || searchParams.get('edit');
  const [isEditing, setIsEditing] = useState(false);
  const { setIsDirty } = useUnsavedChanges();

  const [project, setProject] = useState({
    project_name: "",
    client_name: "",
    estimate_number: "",
    hyperlink: "",
    items: [],
    machine_rate_per_hour: 100,
    labor_rate: 75,
    engraving_machine_rate_per_hour: 80,
    engraving_labor_rate: 40,
    parameter_handling_time_percentage: 15,
    engraving_handling_time_percentage: 20,
    fixed_setup_hours: 0.5,
    fixed_material_setup_cost: 0,
    notes: "",
    total_supplies_cost: 0
  });

  const [globalSettings, setGlobalSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("project");
  const [hasLoaded, setHasLoaded] = useState(false);
  useEffect(() => {
    if (!isLoading) setHasLoaded(true);
  }, [isLoading]);
  useEffect(() => {
    if (hasLoaded) setIsDirty(true);
  }, [project]);

  const loadProjectForEdit = useCallback(async (projectId) => {
    try {
      const projectToEdit = await LaserProject.get(projectId);
      if (projectToEdit) {
        setProject(projectToEdit);
        setIsEditing(true);
      } else {
        console.warn(`Project with ID ${projectId} not found.`);
        window.location.href = createPageUrl("LaserProjects"); // Changed navigate to window.location.href
      }
    } catch (error) {
      console.error('Error loading project for edit:', error);
      alert('Error loading project for edit. Please try again.');
    }
  }, []); // Removed navigate from dependency array

  const loadPrerequisites = useCallback(async () => {
    try {
      const settingsData = await Settings.list();
      const settingsObj = {};
      settingsData.forEach((setting) => {
        settingsObj[setting.setting_name] = setting.setting_value;
      });
      setGlobalSettings(settingsObj);

      if (!editId) {
        const newDefaults = {
          machine_rate_per_hour: parseFloat(settingsObj.parameter_laser_machine_rate) || 100,
          labor_rate: parseFloat(settingsObj.parameter_laser_labor_rate) || 75,
          engraving_machine_rate_per_hour: parseFloat(settingsObj.engraving_laser_machine_rate) || 80,
          engraving_labor_rate: parseFloat(settingsObj.engraving_laser_labor_rate) || 40,
          parameter_handling_time_percentage: parseFloat(settingsObj.parameter_handling_time_percentage) || 15,
          engraving_handling_time_percentage: parseFloat(settingsObj.engraving_handling_time_percentage) || 20,
          fixed_setup_hours: parseFloat(settingsObj.min_parameter_laser_setup_hours) || 0.5,
          fixed_material_setup_cost: parseFloat(settingsObj.parameter_laser_fixed_material_setup_cost) || 0,
          notes: settingsObj.default_notes_template || "",
          total_supplies_cost: 0
        };
        setProject((prev) => ({ ...prev, ...newDefaults }));
      }
    } catch (error) {
      console.error('Error loading prerequisites:', error);
    }
    setIsLoading(false);
  }, [editId]);

  useEffect(() => {
    loadPrerequisites();
    if (editId) {
      loadProjectForEdit(editId);
    }
  }, [editId, loadPrerequisites, loadProjectForEdit]);

  const addItem = () => {
    const newItem = {
      item_type: "panel",
      description: "",
      material_type: "Acrylic",
      material_thickness: "1/4",
      quantity: 1,
      length: 24,
      width: 12,
      letter_height: 12,
      num_letters: 10,
      engrave_area_sqin: 0,
      total_cut_length_inches: 0,
      cut_speed_ipm: 20,
      engrave_speed_sqipm: 5,
      machine_time_hours: 0,
      handling_time_hours: 0,
      machine_cost: 0,
      labor_cost: 0
    };
    setProject((prev) => ({ ...prev, items: [...prev.items, newItem] }));
  };

  const removeItem = (index) => {
    setProject((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  const updateItem = (index, field, value) => {
    setProject((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };

        // Auto-calculate based on item type
        if (field === 'item_type' || field === 'material_type' || field === 'material_thickness' ||
        field === 'length' || field === 'width' || field === 'letter_height' ||
        field === 'num_letters' || field === 'quantity' || field === 'engrave_area_sqin') {

          const perimFactor = parseFloat(globalSettings.laser_letter_perimeter_factor) || 3.5;

          // Reset total_cut_length_inches first to ensure correct recalculation
          updated.total_cut_length_inches = 0;

          if (updated.item_type === 'panel' || updated.item_type === 'engrave_and_cut') {
            const perimeterInches = 2 * (updated.length + updated.width);
            updated.total_cut_length_inches = perimeterInches * updated.quantity;
          } 
          
          if ((updated.item_type === 'engraving' || updated.item_type === 'engrave_and_cut') && (field === 'length' || field === 'width' || field === 'item_type')) {
            updated.engrave_area_sqin = updated.length * updated.width;
          }

          if (updated.item_type === 'lettering') {
            const perimeterPerLetter = updated.letter_height * perimFactor;
            updated.total_cut_length_inches = perimeterPerLetter * updated.num_letters * updated.quantity;
          }
          // For 'engraving', total_cut_length_inches remains 0.

          // Get cut speed from settings based on thickness
          const thicknessKey = `cut_speed_${updated.material_thickness.replace('/', '_')}`;
          const baseSpeed = parseFloat(globalSettings[thicknessKey]) || 20;

          // Apply material multiplier
          const materialMultiplier = parseFloat(globalSettings[`${updated.material_type.toLowerCase()}_cut_multiplier`]) || 1.0;
          updated.cut_speed_ipm = baseSpeed * materialMultiplier;

          // Get engraving speed from settings
          const engraveBaseSpeed = parseFloat(globalSettings.laser_engrave_speed_sqipm) || 5;
          const engraveMultiplier = parseFloat(globalSettings[`${updated.material_type.toLowerCase()}_engrave_multiplier`]) || 1.0;
          updated.engrave_speed_sqipm = engraveBaseSpeed * engraveMultiplier;
        }

        return updated;
      })
    }));
  };

  const calculateTotals = useCallback(() => {
    let totalMachineCost = 0;
    let totalLaborCost = 0;
    let totalSuppliesCost = 0;

    // Cut/engrave speeds are stored as mm/sec and mm²/sec.
    // Convert lengths/areas from inches to mm (1 in = 25.4 mm) before dividing.
    const MM_PER_IN = 25.4;
    const SQMM_PER_SQIN = 25.4 * 25.4;

    const updatedItems = project.items.map((item) => {
      const cutLengthMm = item.total_cut_length_inches * MM_PER_IN;
      const engraveAreaSqMm = item.engrave_area_sqin * item.quantity * SQMM_PER_SQIN;

      const cutTimeSeconds = cutLengthMm / (item.cut_speed_ipm || 20);
      const engraveTimeSeconds = engraveAreaSqMm / (item.engrave_speed_sqipm || 5);

      const cutTimeHours = cutTimeSeconds / 3600;
      const engraveTimeHours = engraveTimeSeconds / 3600;
      const machineTimeHours = cutTimeHours + engraveTimeHours;

      // Rates
      const paramMachineRate = project.machine_rate_per_hour || 100;
      const paramLaborRate = project.labor_rate || 75;
      const paramHandlingPct = (project.parameter_handling_time_percentage || 15) / 100;

      const engraveMachineRate = project.engraving_machine_rate_per_hour || 80;
      const engraveLaborRate = project.engraving_labor_rate || 40;
      const engraveHandlingPct = (project.engraving_handling_time_percentage || 20) / 100;

      let itemMachineCost = 0;
      let itemLaborCost = 0;
      let itemHandlingHours = 0;

      if (item.item_type === 'panel' || item.item_type === 'lettering') {
        // Parameter Only
        itemHandlingHours = machineTimeHours * paramHandlingPct;
        itemMachineCost = machineTimeHours * paramMachineRate;
        itemLaborCost = itemHandlingHours * paramLaborRate;
      } else if (item.item_type === 'engraving') {
        // Engraving Only
        itemHandlingHours = machineTimeHours * engraveHandlingPct;
        itemMachineCost = machineTimeHours * engraveMachineRate;
        itemLaborCost = itemHandlingHours * engraveLaborRate;
      } else if (item.item_type === 'engrave_and_cut') {
        // Mixed - Split costs
        const cutHandling = cutTimeHours * paramHandlingPct;
        const engraveHandling = engraveTimeHours * engraveHandlingPct;
        itemHandlingHours = cutHandling + engraveHandling;

        itemMachineCost = (cutTimeHours * paramMachineRate) + (engraveTimeHours * engraveMachineRate);
        itemLaborCost = (cutHandling * paramLaborRate) + (engraveHandling * engraveLaborRate);
      }

      totalMachineCost += itemMachineCost;
      totalLaborCost += itemLaborCost;

      return {
        ...item,
        machine_time_hours: machineTimeHours,
        handling_time_hours: itemHandlingHours,
        machine_cost: itemMachineCost,
        labor_cost: itemLaborCost
      };
    });

    // Add fixed setup time labor cost
    const fixedSetupLaborCost = project.fixed_setup_hours * project.labor_rate;
    totalLaborCost += fixedSetupLaborCost;

    // Add fixed material setup cost to supplies cost
    const fixedMaterialSetupCost = project.fixed_material_setup_cost || 0;
    totalSuppliesCost += fixedMaterialSetupCost; // Now goes to supplies cost

    return {
      items: updatedItems,
      total_machine_cost: totalMachineCost,
      total_labor_cost: totalLaborCost,
      total_supplies_cost: totalSuppliesCost // Return total supplies cost
    };
  }, [
    project.items, 
    project.machine_rate_per_hour, 
    project.labor_rate, 
    project.engraving_machine_rate_per_hour, 
    project.engraving_labor_rate,
    project.parameter_handling_time_percentage,
    project.engraving_handling_time_percentage,
    project.fixed_setup_hours, 
    project.fixed_material_setup_cost, 
    globalSettings
  ]);

  useEffect(() => {
    if (!isLoading && project.items.length > 0) {
      const calculated = calculateTotals();
      setProject((prev) => ({
        ...prev,
        items: calculated.items,
        total_machine_cost: calculated.total_machine_cost,
        total_labor_cost: calculated.total_labor_cost,
        total_supplies_cost: calculated.total_supplies_cost // Update project state with supplies cost
      }));
    }
  }, [calculateTotals, isLoading, project.items.length]); // Added project.items.length to dependency array to trigger recalculation when items are added/removed

  const saveProject = async () => {
    if (!project.project_name || !project.client_name || !project.estimate_number || !project.hyperlink) {
      alert('Please fill in all required project information fields');
      return;
    }

    if (project.items.length === 0) {
      alert('Please add at least one item to the project');
      return;
    }

    setIsSaving(true);
    setIsDirty(false);
    try {
      const calculated = calculateTotals();
      const dataToSave = {
        ...project,
        items: calculated.items,
        total_machine_cost: calculated.total_machine_cost,
        total_supplies_cost: calculated.total_supplies_cost,
        total_labor_cost: calculated.total_labor_cost,
        status: 'calculated'
      };

      let savedId = editId;
      if (isEditing && editId) {
        await LaserProject.update(editId, dataToSave);
        alert('Project updated successfully!');
      } else {
        const created = await LaserProject.create(dataToSave);
        savedId = created?.id;
        alert('Project saved successfully!');
      }
      await upsertCustomerSummaryForEstimate({
        module: "laser",
        client_name: project.client_name,
        project_id: savedId,
        project_name: project.project_name,
        estimate_number: project.estimate_number,
      });
      window.location.href = createPageUrl("LaserProjects"); // Changed navigate to window.location.href
    } catch (error) {
      console.error('Error saving project:', error);
      alert('Error saving project. Please try again.');
    }
    setIsSaving(false);
  };

  const downloadEstimate = () => {
    const totalCost = (project.total_machine_cost || 0) + (project.total_supplies_cost || 0) + (project.total_labor_cost || 0);
    
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <title>Laser Estimate - ${project.project_name}</title>
  <meta charset="UTF-8">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
    
    * { margin: 0; padding: 0; box-sizing: border-box; }
    
    body { 
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      margin: 0;
      padding: 40px;
      color: #1e293b;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      border-bottom: 3px solid #667eea;
      display: inline-block;
    }
    
    .item {
      background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
      border: 2px solid #e2e8f0;
      border-radius: 12px;
      padding: 25px;
      margin-bottom: 20px;
      transition: transform 0.2s;
    }
    
    .item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    }
    
    .item-header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      border-color: #3b82f6;
      background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    }
    
    .cost-box.labor {
      border-color: #10b981;
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
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
    
    .summary-row.machine .summary-value { color: #3b82f6; }
    .summary-row.supplies .summary-value { color: #8b5cf6; }
    .summary-row.labor .summary-value { color: #10b981; }
    
    .total-row {
      margin-top: 20px;
      padding-top: 20px;
      border-top: 3px solid #667eea;
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
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
      <h1>⚡ Laser Estimate</h1>
      <div class="subtitle">Precision Cutting & Engraving Services</div>
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
          <span class="info-label">Estimate #:</span>
          <span class="info-value">${project.estimate_number}</span>
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
            Item ${i + 1}: ${item.description || `${item.item_type} item`}
          </div>
          
          <div class="item-details">
            <div class="detail-row">
              <span class="detail-label">Type:</span>
              <span class="detail-value">${item.item_type}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Material:</span>
              <span class="detail-value">${item.material_type} - ${item.material_thickness}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Quantity:</span>
              <span class="detail-value">${item.quantity}</span>
            </div>
            ${item.item_type === 'panel' || item.item_type === 'engrave_and_cut' ? `
            <div class="detail-row">
              <span class="detail-label">Dimensions:</span>
              <span class="detail-value">${item.length}" × ${item.width}"</span>
            </div>
            ` : ''}
            ${item.item_type === 'lettering' ? `
            <div class="detail-row">
              <span class="detail-label">Letter Height:</span>
              <span class="detail-value">${item.letter_height}"</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Letter Count:</span>
              <span class="detail-value">${item.num_letters}</span>
            </div>
            ` : ''}
            ${(item.item_type === 'engraving' || item.item_type === 'engrave_and_cut') && item.engrave_area_sqin > 0 ? `
            <div class="detail-row">
              <span class="detail-label">Engrave Area:</span>
              <span class="detail-value">${item.engrave_area_sqin} sq in</span>
            </div>
            ` : ''}
            <div class="detail-row">
              <span class="detail-label">Machine Time:</span>
              <span class="detail-value">${item.machine_time_hours.toFixed(3)} hrs</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Handling Time:</span>
              <span class="detail-value">${item.handling_time_hours.toFixed(3)} hrs</span>
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
        
        <div class="summary-row">
          <span class="summary-label">Setup Hours:</span>
          <span class="summary-value">${project.fixed_setup_hours} hrs</span>
        </div>
        <div class="summary-row">
          <span class="summary-label">Material Setup Cost:</span>
          <span class="summary-value">$${project.fixed_material_setup_cost.toFixed(2)}</span>
        </div>
        
        <div class="summary-row machine">
          <span class="summary-label">Total Machine Cost:</span>
          <span class="summary-value">$${(project.total_machine_cost || 0).toFixed(2)}</span>
        </div>
        <div class="summary-row supplies">
          <span class="summary-label">Total Supplies Cost:</span>
          <span class="summary-value">$${(project.total_supplies_cost || 0).toFixed(2)}</span>
        </div>
        <div class="summary-row labor">
          <span class="summary-label">Total Labor Cost:</span>
          <span class="summary-value">$${(project.total_labor_cost || 0).toFixed(2)}</span>
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
    a.download = `${project.project_name.replace(/\s+/g, '_')}_Laser_Estimate.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const printEstimate = () => {
    const totalCost = (project.total_machine_cost || 0) + (project.total_supplies_cost || 0) + (project.total_labor_cost || 0);
    
    const printContent = `
      <html>
        <head>
          <title>Laser Estimate - ${project.project_name}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body { 
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
              margin: 0;
              padding: 40px;
              color: #1e293b;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              border-bottom: 3px solid #667eea;
              display: inline-block;
            }
            
            .item {
              background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
              border: 2px solid #e2e8f0;
              border-radius: 12px;
              padding: 25px;
              margin-bottom: 20px;
              transition: transform 0.2s;
            }
            
            .item:hover {
              transform: translateY(-2px);
              box-shadow: 0 4px 12px rgba(0,0,0,0.1);
            }
            
            .item-header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              border-color: #3b82f6;
              background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
            }
            
            .cost-box.labor {
              border-color: #10b981;
              background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
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
            
            .summary-row.machine .summary-value { color: #3b82f6; }
            .summary-row.supplies .summary-value { color: #8b5cf6; }
            .summary-row.labor .summary-value { color: #10b981; }
            
            .total-row {
              margin-top: 20px;
              padding-top: 20px;
              border-top: 3px solid #667eea;
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
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
              <h1>⚡ Laser Estimate</h1>
              <div class="subtitle">Precision Cutting & Engraving Services</div>
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
                  <span class="info-label">Estimate #:</span>
                  <span class="info-value">${project.estimate_number}</span>
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
                    Item ${i + 1}: ${item.description || `${item.item_type} item`}
                  </div>
                  
                  <div class="item-details">
                    <div class="detail-row">
                      <span class="detail-label">Type:</span>
                      <span class="detail-value">${item.item_type}</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Material:</span>
                      <span class="detail-value">${item.material_type} - ${item.material_thickness}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Quantity:</span>
                      <span class="detail-value">${item.quantity}</span>
                    </div>
                    ${item.item_type === 'panel' || item.item_type === 'engrave_and_cut' ? `
                    <div class="detail-row">
                      <span class="detail-label">Dimensions:</span>
                      <span class="detail-value">${item.length}" × ${item.width}"</span>
                    </div>
                    ` : ''}
                    ${item.item_type === 'lettering' ? `
                    <div class="detail-row">
                      <span class="detail-label">Letter Height:</span>
                      <span class="detail-value">${item.letter_height}"</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Letter Count:</span>
                      <span class="detail-value">${item.num_letters}</span>
                    </div>
                    ` : ''}
                    ${(item.item_type === 'engraving' || item.item_type === 'engrave_and_cut') && item.engrave_area_sqin > 0 ? `
                    <div class="detail-row">
                      <span class="detail-label">Engrave Area:</span>
                      <span class="detail-value">${item.engrave_area_sqin} sq in</span>
                    </div>
                    ` : ''}
                    <div class="detail-row">
                      <span class="detail-label">Machine Time:</span>
                      <span class="detail-value">${item.machine_time_hours.toFixed(3)} hrs</span>
                    </div>
                    <div class="detail-row">
                      <span class="detail-label">Handling Time:</span>
                      <span class="detail-value">${item.handling_time_hours.toFixed(3)} hrs</span>
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
                
                <div class="summary-row">
                  <span class="summary-label">Setup Hours:</span>
                  <span class="summary-value">${project.fixed_setup_hours} hrs</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">Material Setup Cost:</span>
                  <span class="summary-value">$${project.fixed_material_setup_cost.toFixed(2)}</span>
                </div>
                
                <div class="summary-row machine">
                  <span class="summary-label">Total Machine Cost:</span>
                  <span class="summary-value">$${(project.total_machine_cost || 0).toFixed(2)}</span>
                </div>
                <div class="summary-row supplies">
                  <span class="summary-label">Total Supplies Cost:</span>
                  <span class="summary-value">$${(project.total_supplies_cost || 0).toFixed(2)}</span>
                </div>
                <div class="summary-row labor">
                  <span class="summary-label">Total Labor Cost:</span>
                  <span class="summary-value">$${(project.total_labor_cost || 0).toFixed(2)}</span>
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

  const emailEstimate = () => {
    const totalCost = (project.total_machine_cost || 0) + (project.total_supplies_cost || 0) + (project.total_labor_cost || 0); // Include supplies cost
    
    const emailBody = `Hello,

Please find the laser cutting estimate for ${project.project_name}:

Estimate Number: ${project.estimate_number}
Reference Link: ${project.hyperlink}

ESTIMATE SUMMARY:
Total Machine Cost: $${(project.total_machine_cost || 0).toFixed(2)}
Total Supplies Cost: $${(project.total_supplies_cost || 0).toFixed(2)}
Total Labor Cost: $${(project.total_labor_cost || 0).toFixed(2)}
TOTAL ESTIMATE: $${totalCost.toFixed(2)}

ITEMS BREAKDOWN:
${project.items.map((item, i) => `
Item ${i + 1}: ${item.description || `${item.item_type} item`}
- Type: ${item.item_type}
- Material: ${item.material_type} - ${item.material_thickness}"
- Quantity: ${item.quantity}
${item.item_type === 'panel' || item.item_type === 'engrave_and_cut' ? `- Dimensions: ${item.length}" × ${item.width}"` : ''}
${item.item_type === 'lettering' ? `- Letter Height: ${item.letter_height}", Count: ${item.num_letters}` : ''}
${(item.item_type === 'engraving' || item.item_type === 'engrave_and_cut') && item.engrave_area_sqin > 0 ? `- Engrave Area: ${item.engrave_area_sqin} sq in` : ''}
- Item Total: $${(item.machine_cost + item.labor_cost).toFixed(2)}
`).join('\n')}

${project.notes ? `\nAdditional Notes:\n${project.notes}` : ''}

Best regards`;
    
    const mailtoUrl = `mailto:?subject=${encodeURIComponent(`Laser Estimate - ${project.project_name}`)}&body=${encodeURIComponent(emailBody)}`;
    window.location.href = mailtoUrl;
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Loading...</p>
      </div>);

  }

  return (
    <div className="p-6 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Zap className="w-8 h-8" />
              {isEditing ? 'Edit' : 'New'} Laser Estimate
            </h1>
            <p className="text-slate-600">Create detailed laser cutting and engraving estimates</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => { window.location.href = createPageUrl("LaserProjects"); }}> {/* Changed navigate to window.location.href */}
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Projects
            </Button>
            {/* Removed save button from header, moved to sidebar */}
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="sticky top-[64px] z-30 -mx-2 px-2 py-2 bg-slate-50/95 backdrop-blur-md border-b border-slate-200/60">
                <TabsList className="grid grid-cols-5 w-full bg-white shadow-md border border-slate-200 h-auto p-1 gap-1">
                  <TabBadgeTrigger value="project" icon={FileText} label="Project" color="red" />
                  <TabBadgeTrigger value="items" icon={ListChecks} label="Items" amount={(project.total_machine_cost || 0) + (project.total_labor_cost || 0)} count={project.items.length} color="red" />
                  <TabBadgeTrigger value="advanced" icon={SettingsIcon} label="Advanced" color="red" />
                  <TabBadgeTrigger value="summary" icon={Calculator} label="Summary" amount={(project.total_machine_cost || 0) + (project.total_supplies_cost || 0) + (project.total_labor_cost || 0)} color="red" />
                  <TabBadgeTrigger value="pricing" icon={TrendingUp} label="Customer Pricing" accent color="red" />
                </TabsList>
              </div>

              <TabsContent value="project" className="mt-4 space-y-4">
            {/* Project Info */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3"><CardTitle className="text-lg font-semibold text-slate-900">Project Information</CardTitle></CardHeader>
              <CardContent className="px-2 space-y-3">
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="client_name">Client Name *</Label>
                    <ClientSearchInput
                      value={project.client_name}
                      onChange={(val) => setProject((prev) => ({ ...prev, client_name: val }))}
                      onSelectProject={(data) => {
                        setProject((prev) => ({
                          ...prev,
                          client_name: data.client_name || prev.client_name,
                          project_name: data.project_name || prev.project_name,
                          estimate_number: data.estimate_number || prev.estimate_number,
                          hyperlink: data.hyperlink || prev.hyperlink
                        }));
                      }}
                      className="mt-1"
                      placeholder="Enter client name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="project_name">Project Name *</Label>
                    <Input
                      id="project_name"
                      value={project.project_name}
                      onChange={(e) => setProject((prev) => ({ ...prev, project_name: e.target.value }))}
                      placeholder="Enter project name"
                      className="mt-1" />

                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="estimate_number">Estimate Number *</Label>
                    <Input
                      id="estimate_number"
                      value={project.estimate_number}
                      onChange={(e) => setProject((prev) => ({ ...prev, estimate_number: e.target.value }))}
                      placeholder="e.g., LASER-2024-001"
                      className="mt-1" />

                  </div>
                  <div>
                    <Label htmlFor="hyperlink">Project Link *</Label>
                    <Input
                      id="hyperlink"
                      value={project.hyperlink}
                      onChange={(e) => setProject((prev) => ({ ...prev, hyperlink: e.target.value }))}
                      placeholder="https://..."
                      className="mt-1" />

                  </div>
                </div>
                <div>
                  <Label htmlFor="notes">Project Notes</Label>
                  <Textarea
                    id="notes"
                    value={project.notes}
                    onChange={(e) => setProject((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any additional notes..." className="bg-transparent px-2 py-2 text-base rounded-md flex min-h-[60px] w-full border border-input shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm h-12" />


                </div>
              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="items" className="mt-4 space-y-4">
            {/* Items */}
            <Card className="bg-white border-0 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-lg font-semibold text-slate-900">Items</CardTitle>
                  <Button onClick={addItem} size="sm" className="bg-red-600 hover:bg-red-700">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {project.items.length === 0 ?
                <div className="text-center py-8 text-slate-500">
                    <p>No items added yet. Click "Add Item" to get started.</p>
                  </div> :

                project.items.map((item, index) =>
                <div key={index} className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                      <div className="flex justify-between items-start">
                        <h4 className="font-semibold text-slate-900">Item #{index + 1}</h4>
                        <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700 hover:bg-red-50">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>

                      <div className="grid md:grid-cols-2 gap-3">
                        <div className="md:col-span-2">
                          <Label>Description</Label>
                          <Input
                        value={item.description}
                        onChange={(e) => updateItem(index, 'description', e.target.value)}
                        placeholder="Brief description"
                        className="mt-1" />

                        </div>

                        <div>
                          <Label>Item Type</Label>
                          <Select value={item.item_type} onValueChange={(value) => updateItem(index, 'item_type', value)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="panel">Panel (Cut Perimeter)</SelectItem>
                              <SelectItem value="lettering">Lettering (Cut Letters)</SelectItem>
                              <SelectItem value="engraving">Engraving Only</SelectItem>
                              <SelectItem value="engrave_and_cut">Engrave and Cut</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Material Type</Label>
                          <Select value={item.material_type} onValueChange={(value) => updateItem(index, 'material_type', value)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {materials.map((mat) =>
                          <SelectItem key={mat} value={mat}>{mat}</SelectItem>
                          )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Material Thickness</Label>
                          <Select value={item.material_thickness} onValueChange={(value) => updateItem(index, 'material_thickness', value)}>
                            <SelectTrigger className="mt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {imperialSizes.map((size) =>
                          <SelectItem key={size} value={size}>{size}"</SelectItem>
                          )}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label>Quantity</Label>
                          <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 1)}
                        className="mt-1" />

                        </div>

                        {(item.item_type === 'panel' || item.item_type === 'engrave_and_cut' || item.item_type === 'engraving') &&
                    <>
                            <div>
                              <Label>Length (inches)</Label>
                              <Input
                          type="number"
                          step="0.125"
                          value={item.length}
                          onChange={(e) => updateItem(index, 'length', parseFloat(e.target.value) || 0)}
                          className="mt-1" />

                            </div>
                            <div>
                              <Label>Width (inches)</Label>
                              <Input
                          type="number"
                          step="0.125"
                          value={item.width}
                          onChange={(e) => updateItem(index, 'width', parseFloat(e.target.value) || 0)}
                          className="mt-1" />

                            </div>
                          </>
                    }

                        {item.item_type === 'lettering' &&
                    <>
                            <div>
                              <Label>Letter Height (inches)</Label>
                              <Input
                          type="number"
                          step="0.125"
                          value={item.letter_height}
                          onChange={(e) => updateItem(index, 'letter_height', parseFloat(e.target.value) || 0)}
                          className="mt-1" />

                            </div>
                            <div>
                              <Label>Number of Letters</Label>
                              <Input
                          type="number"
                          min="1"
                          value={item.num_letters}
                          onChange={(e) => updateItem(index, 'num_letters', parseFloat(e.target.value) || 0)}
                          className="mt-1" />

                            </div>
                          </>
                    }

                        {(item.item_type === 'panel' || item.item_type === 'lettering' || item.item_type === 'engrave_and_cut') &&
                    <div className="md:col-span-2 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800">
                              <strong>Total Cut Length:</strong> {item.total_cut_length_inches.toFixed(2)}" 
                              <span className="mx-2">•</span>
                              <strong>Cut Speed:</strong> {item.cut_speed_ipm.toFixed(1)} mm/sec
                            </p>
                          </div>
                    }

                        {/* Engraving Section - Only for engraving and engrave_and_cut types */}
                        {(item.item_type === 'engraving' || item.item_type === 'engrave_and_cut') &&
                    <div className="md:col-span-2 border-t pt-4">
                            <Label>Engraving Area (sq inches)</Label>
                            <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={item.engrave_area_sqin}
                        onChange={(e) => updateItem(index, 'engrave_area_sqin', Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="Enter engraving area"
                        className="mt-1" />

                            {item.engrave_area_sqin > 0 &&
                      <p className="text-xs text-slate-500 mt-1">
                                Engrave Speed: {item.engrave_speed_sqipm.toFixed(1)} mm²/sec
                              </p>
                      }
                          </div>
                    }

                        <div className="md:col-span-2 p-3 bg-green-50 rounded-lg border border-green-200">
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <p className="text-slate-600">Machine Time</p>
                              <p className="font-semibold text-slate-900">{item.machine_time_hours.toFixed(3)} hrs</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Handling Time</p>
                              <p className="font-semibold text-slate-900">{item.handling_time_hours.toFixed(3)} hrs</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Machine Cost</p>
                              <p className="font-semibold text-green-700">${item.machine_cost.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-slate-600">Labor Cost</p>
                              <p className="font-semibold text-green-700">${item.labor_cost.toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                )
                }

              </CardContent>
            </Card>
              </TabsContent>

              <TabsContent value="advanced" className="mt-4 space-y-4">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg font-semibold text-slate-900">Advanced Settings</CardTitle></CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label>Fixed Setup Time (hours)</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={project.fixed_setup_hours}
                        onChange={(e) => setProject((prev) => ({ ...prev, fixed_setup_hours: parseFloat(e.target.value) || 0 }))}
                        className="mt-1" />
                      <p className="text-xs text-slate-500 mt-1">One-time setup labor cost applied to the entire project</p>
                    </div>
                    <div>
                      <Label>Fixed Material Setup Cost ($)</Label>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        value={project.fixed_material_setup_cost}
                        onChange={(e) => setProject((prev) => ({ ...prev, fixed_material_setup_cost: parseFloat(e.target.value) || 0 }))}
                        className="mt-1" />
                      <p className="text-xs text-slate-500 mt-1">One-time material/setup cost applied to the entire project, added to supplies cost.</p>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="summary" className="mt-4 space-y-4">
                <Card className="bg-white border-0 shadow-sm">
                  <CardHeader className="pb-3"><CardTitle className="text-lg font-semibold text-slate-900">Estimate Breakdown</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600 text-xs">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium w-8">#</th>
                          <th className="text-left px-4 py-2 font-medium">Description</th>
                          <th className="text-left px-4 py-2 font-medium">Type</th>
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
                            <td className="px-4 py-2 capitalize text-xs text-slate-600">{(it.item_type || '').replace(/_/g, ' ')}</td>
                            <td className="px-4 py-2 text-right tabular-nums">${(it.machine_cost || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums">${(it.labor_cost || 0).toFixed(2)}</td>
                            <td className="px-4 py-2 text-right tabular-nums font-semibold">${((it.machine_cost || 0) + (it.labor_cost || 0)).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-200 text-sm">
                        <tr>
                          <td colSpan="3" className="px-4 py-2 text-right font-medium">Totals</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${(project.total_machine_cost || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-medium">${(project.total_labor_cost || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right tabular-nums font-bold">${((project.total_machine_cost || 0) + (project.total_supplies_cost || 0) + (project.total_labor_cost || 0)).toFixed(2)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="pricing" className="mt-4 space-y-4">
                <CustomerPricingTab
                  project={project}
                  categorize={categorizeLaserProject}
                  accentColor="red"
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Summary Sidebar */}
          <div>
            <Card className="bg-white border-0 shadow-sm sticky top-8">
              <CardHeader className="pb-3"><CardTitle>Project Summary</CardTitle></CardHeader>
              <CardContent className="space-y-4 pt-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-blue-800">Machine Cost:</span>
                    <span className="text-lg font-bold text-blue-900">${(project.total_machine_cost || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-blue-600">Laser machine operating time costs</p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-purple-800">Supplies Cost:</span>
                    <span className="text-lg font-bold text-purple-900">${(project.total_supplies_cost || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-purple-600">Materials and setup supplies</p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium text-green-800">Labor Cost:</span>
                    <span className="text-lg font-bold text-green-900">${(project.total_labor_cost || 0).toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-green-600">Handling, setup, and labor time</p>
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between text-sm text-slate-600">
                    <span>Total Quantity:</span>
                    <span className="font-medium">{project.items.reduce((sum, item) => {
                      const qty = parseFloat(item.quantity) || 0;
                      if (item.item_type === 'lettering') {
                        return sum + (qty * (parseFloat(item.num_letters) || 0));
                      }
                      return sum + qty;
                    }, 0)}</span>
                  </div>
                </div>

                <div className="space-y-2 pt-4 border-t">
                  <Button onClick={downloadEstimate} variant="outline" className="w-full">
                    Download Estimate
                  </Button>
                  <Button onClick={printEstimate} variant="outline" className="w-full">
                    Print Estimate
                  </Button>
                  <Button onClick={emailEstimate} variant="outline" className="w-full">
                    Email Estimate
                  </Button>
                </div>

                <Button onClick={saveProject} disabled={isSaving} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 mt-4">
                  {isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> {isEditing ? 'Update Estimate' : 'Save Estimate'}</>}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>);

}