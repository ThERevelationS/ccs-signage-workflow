import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2, Trash2, List, MoreHorizontal, ChevronDown, ChevronRight } from "lucide-react";
import { Dialog as OtherDialog, DialogContent as OtherDialogContent, DialogHeader as OtherDialogHeader, DialogTitle as OtherDialogTitle, DialogFooter as OtherDialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateBuilder from "./TemplateBuilder";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;
const GlobalSettings = base44.entities.GlobalSettings;

export default function ProductChecklistDialog({ 
  isOpen, 
  onClose, 
  workOrder, 
  onUpdate,
  isRegistered,
  isAdmin
}) {
  const [checklist, setChecklist] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);
  const [productTypes, setProductTypes] = useState([]);
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, settings] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        AuthorizedEmail.list(),
        GlobalSettings.list()
      ]);

      const currentWO = freshWO[0];
      if (!currentWO) return;

      setUsers(usersData);

      // Load products from new structure or migrate old
      if (currentWO.products && Array.isArray(currentWO.products)) {
        setProducts(currentWO.products);
      } else {
        // Migrate old product_1...product_6 to new structure
        const migratedProducts = [];
        for (let i = 1; i <= 6; i++) {
          const desc = currentWO[`product_${i}`];
          if (desc && desc.trim()) {
            migratedProducts.push({
              id: `prod_${i}`,
              description: desc,
              product_type: ""
            });
          }
        }
        setProducts(migratedProducts);
      }

      setChecklist(currentWO.sip_checklist || []);

      // Load dropdown conditions
      const dropdownsSetting = settings.find(s => s.setting_key === 'dropdownConditions');
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      const loadedProductTypes = productTypesSetting?.setting_value?.items || 
        ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(loadedProductTypes);
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    const dd = dropdownConditions.find(d => d.id === dropdownId);
    return dd?.name || null;
  };

  const handleOtherDropdownSelect = (itemId, selectedDropdownId) => {
    updateChecklistItem(itemId, { dropdown_id: selectedDropdownId, custom_dropdown_value: "" });
    setShowOtherPopup(null);
  };

  const handleCreateCustomValue = (itemId) => {
    if (!customDropdownValue.trim()) return;
    updateChecklistItem(itemId, { custom_dropdown_value: customDropdownValue.trim() });
    setCustomDropdownValue("");
    setShowOtherPopup(null);
  };

  // Handle template application from TemplateBuilder - APPENDS to existing checklist
  const handleApplyTemplate = (templateData) => {
    console.log("handleApplyTemplate called with:", templateData);
    const newItems = [];
    
    // Helper to flatten hierarchical items
    const flattenItem = (item, productName, productType, subTemplateName = null) => {
      // Generate unique ID with timestamp to avoid conflicts
      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substr(2, 9);
      const baseId = subTemplateName 
        ? `${productName}_sub_${subTemplateName}_${item.id}_${timestamp}_${randomSuffix}`
        : `${productName}_${item.id}_${timestamp}_${randomSuffix}`;
      
      // Get dropdown_ids (support both old dropdown_id and new dropdown_ids array)
      const itemDropdownIds = item.dropdown_ids || (item.dropdown_id ? [item.dropdown_id] : []);
      
      // Add main checklist item - ensure product_name is always set
      newItems.push({
        id: baseId,
        product_name: productName || 'Unnamed Product',
        product_type: productType || '',
        sub_template_name: subTemplateName,
        text: item.text,
        type: 'checklist',
        approved_by: "",
        dropdown_ids: itemDropdownIds,
        dropdown_id: itemDropdownIds[0] || "",
        custom_dropdown_value: ""
      });
      
      // Add tasks under main item
      item.tasks?.forEach((task, tIdx) => {
        newItems.push({
          id: `${baseId}_task_${task.id}_${tIdx}`,
          product_name: productName || 'Unnamed Product',
          product_type: productType || '',
          sub_template_name: subTemplateName,
          parent_id: baseId,
          text: task.text,
          type: 'task',
          approved_by: "",
          assigned_to: "",
          custom_dropdown_value: ""
        });
      });
      
      // Add detail items and their tasks
      item.details?.forEach((detail, dIdx) => {
        const detailId = `${baseId}_detail_${detail.id}_${dIdx}`;
        const detailDropdownIds = detail.dropdown_ids || (detail.dropdown_id ? [detail.dropdown_id] : []);
        
        newItems.push({
          id: detailId,
          product_name: productName || 'Unnamed Product',
          product_type: productType || '',
          sub_template_name: subTemplateName,
          parent_id: baseId,
          text: detail.text,
          type: 'detail',
          approved_by: "",
          dropdown_ids: detailDropdownIds,
          dropdown_id: detailDropdownIds[0] || "",
          custom_dropdown_value: ""
        });
        
        // Add tasks under detail
        detail.tasks?.forEach((task, dtIdx) => {
          newItems.push({
            id: `${detailId}_task_${task.id}_${dtIdx}`,
            product_name: productName || 'Unnamed Product',
            product_type: productType || '',
            sub_template_name: subTemplateName,
            parent_id: detailId,
            text: task.text,
            type: 'task',
            approved_by: "",
            assigned_to: "",
            custom_dropdown_value: ""
          });
        });
      });
    };
    
    templateData.forEach(section => {
      if (section.type === 'product_header') {
        section.items.forEach(item => {
          flattenItem(item, section.productName, section.productType);
        });
      } else if (section.type === 'sub_template') {
        section.items.forEach(item => {
          // Use parentProduct as the product_name for sub-template items
          flattenItem(item, section.parentProduct, null, section.subTemplateName);
        });
      }
    });

    // Append to existing checklist instead of replacing
    console.log("Setting checklist with", newItems.length, "new items, total:", checklist.length + newItems.length);
    setChecklist(prev => [...prev, ...newItems]);
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(checklist.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const deleteChecklistItem = (itemId) => {
    setChecklist(checklist.filter(item => item.id !== itemId));
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) {
      return { complete: false, hasChecklist: false };
    }
    
    // Check if all checklist items (not tasks) have both approved_by and custom_dropdown_value
    const checklistItems = checklist.filter(item => item.type !== 'task');
    const allApproved = checklistItems.every(item => 
      item.approved_by && item.custom_dropdown_value
    );

    return { 
      complete: allApproved, 
      hasChecklist: true 
    };
  };

  const handleCheckOff = async () => {
    const status = checkIfComplete();
    
    if (!status.hasChecklist) {
      setNoChecklistWarning(true);
      return;
    }
    
    if (!status.complete) {
      setIncompleteWarning(true);
      return;
    }

    // Mark as completed
    await WorkOrder.update(workOrder.id, { sip_completed: true });
    if (onUpdate) onUpdate();
    onClose();
  };

  const proceedWithCheckOff = async () => {
    await WorkOrder.update(workOrder.id, { sip_completed: true });
    if (onUpdate) onUpdate();
    setNoChecklistWarning(false);
    onClose();
  };

  const saveChecklist = async () => {
    setIsSaving(true);
    try {
      await WorkOrder.update(workOrder.id, { 
        sip_checklist: checklist,
        products: products
      });
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
    }
    setIsSaving(false);
  };

  // Group checklist items by product_name, sub_template, and hierarchy
  const getGroupedChecklist = () => {
    const groups = {};
    
    // First pass: organize by product and sub-template
    checklist.forEach(item => {
      // Extract product name from ID if not in product_name field (legacy format)
      // IDs look like: "Channel Letters_1770148172754_zddfxi03n" or "Channel Letters_sub_Permitting_..."
      let productName = item.product_name;
      
      if (!productName || productName === 'undefined' || productName === 'Ungrouped') {
        // Try to extract from ID
        if (item.id) {
          const idParts = item.id.split('_');
          if (idParts.length >= 2) {
            // Check if it's a sub-template item
            const subIndex = idParts.indexOf('sub');
            if (subIndex > 0) {
              productName = idParts.slice(0, subIndex).join(' ');
            } else {
              // Regular item - first part before timestamp
              productName = idParts[0];
            }
          }
        }
      }
      
      // Final fallback
      if (!productName || productName === 'undefined' || productName === 'Ungrouped') {
        productName = 'General Items';
      }
      
      if (!groups[productName]) {
        groups[productName] = {
          productType: item.product_type || '',
          mainItems: [],
          subTemplates: {}
        };
      }
      
      // Check for sub_template_name or extract from ID
      let subTemplateName = item.sub_template_name;
      if (!subTemplateName && item.id && item.id.includes('_sub_')) {
        const parts = item.id.split('_sub_');
        if (parts.length > 1) {
          const afterSub = parts[1].split('_');
          subTemplateName = afterSub[0];
        }
      }
      
      if (subTemplateName) {
        if (!groups[productName].subTemplates[subTemplateName]) {
          groups[productName].subTemplates[subTemplateName] = [];
        }
        groups[productName].subTemplates[subTemplateName].push(item);
      } else {
        groups[productName].mainItems.push(item);
      }
    });
    
    return groups;
  };
  
  // Build hierarchy for items
  const buildItemHierarchy = (items) => {
    // Get main items: either type='checklist', no type (legacy), or items without parent_id that aren't tasks/details/subtasks
    const mainItems = items.filter(i => {
      // If it has no type, it's a legacy main item
      if (!i.type) return !i.parent_id;
      // Otherwise, it's a checklist item without a parent
      return i.type === 'checklist' && !i.parent_id;
    });
    
    return mainItems.map(main => {
      const details = items.filter(i => i.type === 'detail' && i.parent_id === main.id);
      const mainTasks = items.filter(i => i.type === 'task' && i.parent_id === main.id);
      
      return {
        ...main,
        tasks: mainTasks,
        details: details.map(detail => ({
          ...detail,
          tasks: items.filter(i => i.type === 'task' && i.parent_id === detail.id)
        }))
      };
    });
  };
  
  const [expandedItems, setExpandedItems] = useState({});
  const [hoveredItem, setHoveredItem] = useState(null);
  const [newItemInput, setNewItemInput] = useState({ show: false, parentId: null, type: null, productName: null });
  const [newItemText, setNewItemText] = useState("");
  
  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const addNewItem = (type, parentId = null, productName = null) => {
    if (!newItemText.trim()) return;
    
    const newId = `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newItem = {
      id: newId,
      text: newItemText.trim(),
      type: type,
      approved_by: "",
      custom_dropdown_value: "",
      product_name: productName || 'Manual Items',
      parent_id: parentId
    };
    
    setChecklist(prev => [...prev, newItem]);
    setNewItemText("");
    setNewItemInput({ show: false, parentId: null, type: null, productName: null });
  };

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const groupedChecklist = getGroupedChecklist();

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder} onOpenChange={onClose}>
        <DialogContent className="clay-card border-none max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="text-xl font-bold">
                SIP Checklist - {workOrder?.client_name}
              </DialogTitle>
              <div className="flex gap-2">
                {isAdmin && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowTemplateBuilder(true)}
                  >
                    <Pencil className="w-4 h-4 mr-1" />
                    Checklist Builder
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Products from Work Order (read-only display) */}
          <div className="clay-card p-3 bg-blue-50/50">
            <h3 className="font-bold text-sm mb-2">Products on this Job</h3>
            <p className="text-xs text-gray-500 mb-2">Products are managed in the Client Information section. Use Checklist Builder to apply checklists.</p>
            <div className="space-y-1">
              {products.length > 0 ? products.map((product, index) => (
                <div key={product.id} className="flex gap-2 items-center p-2 bg-white rounded border">
                  <span className="text-sm font-medium w-6">{index + 1}.</span>
                  <span className="text-sm font-medium text-purple-700">{product.product_type || 'No type'}</span>
                  <span className="text-gray-400">-</span>
                  <span className="text-sm text-gray-600 flex-1">{product.description || 'No description'}</span>
                </div>
              )) : (
                <p className="text-sm text-gray-400 text-center py-2">No products defined. Add products in the Client Information section first.</p>
              )}
            </div>
          </div>

          {/* Checklist Items */}
          <div className="flex-1 overflow-y-auto space-y-3">
            {checklist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No checklist items yet</p>
                <p className="text-sm mt-1">Use Checklist Builder to create and apply checklists</p>
              </div>
            ) : (
              Object.entries(groupedChecklist).map(([productName, group]) => (
                <div key={productName} className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/20">
                  <h3 className="font-bold text-purple-800 mb-3 flex items-center gap-2">
                    📦 {productName}
                    {group.productType && (
                      <span className="text-xs font-normal bg-purple-200 px-2 py-0.5 rounded">
                        {group.productType}
                      </span>
                    )}
                  </h3>

                  {/* Main Items with hierarchy */}
                  {group.mainItems.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {/* Build hierarchy - treat all items as main items if no type field */}
                      {group.mainItems.map(rawItem => {
                        // Treat items without type as checklist items
                        const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                        // Find associated tasks/details
                        const itemTasks = group.mainItems.filter(i => i.type === 'task' && i.parent_id === item.id);
                        const itemDetails = group.mainItems.filter(i => i.type === 'detail' && i.parent_id === item.id).map(detail => ({
                          ...detail,
                          tasks: group.mainItems.filter(i => i.type === 'task' && i.parent_id === detail.id)
                        }));
                        // Skip if this is a child item (task/detail with parent)
                        if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                        
                        const displayItem = { ...item, tasks: itemTasks, details: itemDetails };
                        return (
                        <div key={displayItem.id} className="clay-card p-3 bg-white">
                          {/* Main checklist item */}
                          <div 
                            className="flex items-center gap-2 group"
                            onMouseEnter={() => setHoveredItem(displayItem.id)}
                            onMouseLeave={() => setHoveredItem(null)}
                          >
                            <button 
                              onClick={() => toggleExpanded(displayItem.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              {(displayItem.details?.length > 0 || displayItem.tasks?.length > 0) ? (
                                expandedItems[displayItem.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              ) : <div className="w-4" />}
                            </button>
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                            <span className="font-medium text-sm flex-1">{displayItem.text}</span>
                            
                            {/* Quick add buttons on hover */}
                            {isRegistered && hoveredItem === displayItem.id && (
                              <div className="flex gap-1">
                                <button
                                  onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: displayItem.id, type: 'task', productName: displayItem.product_name || productName }); }}
                                  className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200"
                                  title="Add Task"
                                >
                                  +Task
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: displayItem.id, type: 'detail', productName: displayItem.product_name || productName }); }}
                                  className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                                  title="Add Detail"
                                >
                                  +Detail
                                </button>
                              </div>
                            )}
                            
                            <Select
                              value={displayItem.approved_by || ""}
                              onValueChange={(val) => updateChecklistItem(displayItem.id, { approved_by: val })}
                              disabled={!isRegistered}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue placeholder="Approved by..." />
                              </SelectTrigger>
                              <SelectContent>
                                {users.map(u => (
                                  <SelectItem key={u.email} value={u.full_name || u.email}>
                                    {u.full_name || u.email}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            {/* Dropdown with Other option */}
                            <Select
                              value={displayItem.custom_dropdown_value || "select_value"}
                              onValueChange={(val) => {
                                if (val === "other") {
                                  setShowOtherPopup({ itemId: displayItem.id });
                                } else if (val !== "select_value") {
                                  updateChecklistItem(displayItem.id, { custom_dropdown_value: val });
                                }
                              }}
                              disabled={!isRegistered}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue placeholder={getDropdownName(displayItem.dropdown_id) || "Status..."} />
                              </SelectTrigger>
                              <SelectContent>
                                {dropdownConditions.filter(dd => dd.id === displayItem.dropdown_id || !displayItem.dropdown_id).slice(0, 5).map(dd => (
                                  <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                ))}
                                <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                              </SelectContent>
                            </Select>

                            {isRegistered && (
                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(displayItem.id)} className="h-7 w-7 p-0 text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          {/* Expanded: Tasks and Details */}
                          {expandedItems[displayItem.id] && (
                            <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
                              {/* Tasks under main item */}
                              {displayItem.tasks?.map(task => (
                              <div key={task.id} className="bg-orange-50 p-1 rounded border-l-2 border-orange-300 group">
                                <div className="flex items-center gap-1.5">
                                  <Checkbox 
                                    checked={!!task.approved_by}
                                    onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                    disabled={!isRegistered}
                                    className="h-3 w-3"
                                  />
                                  <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">T</span>
                                  <span className="text-xs flex-1">{task.text}</span>
                                  <Select
                                    value={task.assigned_to || ""}
                                    onValueChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                    disabled={!isRegistered}
                                  >
                                    <SelectTrigger className="h-5 text-xs w-24 px-1">
                                      <SelectValue placeholder="Assign..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {users.map(u => (
                                        <SelectItem key={u.email} value={u.full_name || u.email}>
                                          {u.full_name || u.email}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  {isRegistered && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                      className="px-1 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 opacity-0 group-hover:opacity-100"
                                      title="Add Subtask"
                                    >
                                      +Sub
                                    </button>
                                  )}
                                  {isRegistered && (
                                    <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-4 w-4 p-0 text-red-500 opacity-0 group-hover:opacity-100">
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </Button>
                                  )}
                                </div>
                                {/* Subtasks */}
                                {checklist.filter(st => st.type === 'subtask' && st.parent_id === task.id).map(subtask => (
                                  <div key={subtask.id} className="ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask">
                                    <Checkbox 
                                      checked={!!subtask.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                      disabled={!isRegistered}
                                      className="h-2.5 w-2.5"
                                    />
                                    <span className="px-0.5 py-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                    <span className="flex-1">{subtask.text}</span>
                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/subtask:opacity-100">
                                        <Trash2 className="w-2 h-2" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                {/* Inline add subtask */}
                                {newItemInput.show && newItemInput.parentId === task.id && newItemInput.type === 'subtask' && (
                                  <div className="ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New subtask..."
                                      className="h-4 text-xs flex-1"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                      }}
                                    />
                                    <Button size="sm" className="h-4 px-1 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-4 px-0.5 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                  </div>
                                )}
                              </div>
                              ))}

                              {/* Inline add task input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'task' && (
                              <div className="flex items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                                <Input
                                  value={newItemText}
                                  onChange={(e) => setNewItemText(e.target.value)}
                                  placeholder="New task..."
                                  className="h-6 text-xs flex-1"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addNewItem('task', displayItem.id, displayItem.product_name || productName);
                                    if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                  }}
                                />
                                <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('task', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
                              </div>
                              )}

                              {/* Inline add detail input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'detail' && (
                                <div className="bg-gray-50 p-2 rounded border">
                                  <div className="flex items-center gap-2">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New detail..."
                                      className="h-6 text-xs flex-1"
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('detail', displayItem.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                      }}
                                    />
                                    <Button size="sm" className="h-6 px-2 text-xs" onClick={() => addNewItem('detail', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>Cancel</Button>
                                  </div>
                                </div>
                              )}

                              {/* Detail items */}
                              {displayItem.details?.map(detail => (
                                <div key={detail.id} className="bg-gray-50 p-2 rounded border group/detail">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                    <span className="text-sm flex-1">{detail.text}</span>
                                    
                                    {/* Quick add task button for detail */}
                                    {isRegistered && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: displayItem.product_name || productName }); }}
                                        className="px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 opacity-0 group-hover/detail:opacity-100"
                                        title="Add Task"
                                      >
                                        +Task
                                      </button>
                                    )}
                                    
                                    <Select
                                      value={detail.approved_by || ""}
                                      onValueChange={(val) => updateChecklistItem(detail.id, { approved_by: val })}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-6 text-xs w-28">
                                        <SelectValue placeholder="Approved..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {users.map(u => (
                                          <SelectItem key={u.email} value={u.full_name || u.email}>
                                            {u.full_name || u.email}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>

                                    <Select
                                      value={detail.custom_dropdown_value || "select_value"}
                                      onValueChange={(val) => {
                                        if (val === "other") {
                                          setShowOtherPopup({ itemId: detail.id });
                                        } else if (val !== "select_value") {
                                          updateChecklistItem(detail.id, { custom_dropdown_value: val });
                                        }
                                      }}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-6 text-xs w-28">
                                        <SelectValue placeholder={getDropdownName(detail.dropdown_id) || "Status..."} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {dropdownConditions.filter(dd => dd.id === detail.dropdown_id || !detail.dropdown_id).slice(0, 5).map(dd => (
                                          <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                        ))}
                                        <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-6 w-6 p-0 text-red-500">
                                        <Trash2 className="w-3 h-3" />
                                      </Button>
                                    )}
                                  </div>

                                  {/* Inline add task for detail */}
                                  {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                    <div className="ml-4 mt-2 flex items-center gap-2 bg-orange-50 p-1.5 rounded">
                                      <Input
                                        value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New task..."
                                        className="h-5 text-xs flex-1"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addNewItem('task', detail.id, displayItem.product_name || productName);
                                          if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                        }}
                                      />
                                      <Button size="sm" className="h-5 px-2 text-xs" onClick={() => addNewItem('task', detail.id, displayItem.product_name || productName)}>Add</Button>
                                      <Button size="sm" variant="ghost" className="h-5 px-1 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                    </div>
                                  )}

                                  {/* Tasks under detail */}
                                  {detail.tasks?.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-0.5 border-l border-orange-200 pl-1.5">
                                      {detail.tasks.map(task => (
                                        <div key={task.id} className="bg-orange-50 p-0.5 rounded group/dtask">
                                          <div className="flex items-center gap-1">
                                            <Checkbox 
                                              checked={!!task.approved_by}
                                              onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                              disabled={!isRegistered}
                                              className="h-2.5 w-2.5"
                                            />
                                            <span className="text-xs px-0.5 py-0.5 rounded bg-orange-100 text-orange-600">T</span>
                                            <span className="text-xs flex-1">{task.text}</span>
                                            <Select
                                              value={task.assigned_to || ""}
                                              onValueChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                              disabled={!isRegistered}
                                            >
                                              <SelectTrigger className="h-4 text-xs w-20 px-0.5">
                                                <SelectValue placeholder="Assign" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                {users.map(u => (
                                                  <SelectItem key={u.email} value={u.full_name || u.email}>
                                                    {u.full_name || u.email}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                            {isRegistered && (
                                              <button
                                                onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                                className="px-0.5 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 opacity-0 group-hover/dtask:opacity-100"
                                                title="Add Subtask"
                                              >
                                                +S
                                              </button>
                                            )}
                                            {isRegistered && (
                                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/dtask:opacity-100">
                                                <Trash2 className="w-2 h-2" />
                                              </Button>
                                            )}
                                          </div>
                                          {/* Subtasks under detail task */}
                                          {checklist.filter(st => st.type === 'subtask' && st.parent_id === task.id).map(subtask => (
                                            <div key={subtask.id} className="ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsub">
                                              <Checkbox 
                                                checked={!!subtask.approved_by}
                                                onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                                disabled={!isRegistered}
                                                className="h-2 w-2"
                                              />
                                              <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                              <span className="flex-1">{subtask.text}</span>
                                              {isRegistered && (
                                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-3 w-3 p-0 text-red-500 opacity-0 group-hover/dsub:opacity-100">
                                                  <Trash2 className="w-2 h-2" />
                                                </Button>
                                              )}
                                            </div>
                                          ))}
                                          {/* Inline add subtask for detail task */}
                                          {newItemInput.show && newItemInput.parentId === task.id && newItemInput.type === 'subtask' && (
                                            <div className="ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded">
                                              <Input
                                                value={newItemText}
                                                onChange={(e) => setNewItemText(e.target.value)}
                                                placeholder="New subtask..."
                                                className="h-4 text-xs flex-1"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                                  if (e.key === 'Escape') setNewItemInput({ show: false, parentId: null, type: null, productName: null });
                                                }}
                                              />
                                              <Button size="sm" className="h-4 px-1 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                              <Button size="sm" variant="ghost" className="h-4 px-0.5 text-xs" onClick={() => setNewItemInput({ show: false, parentId: null, type: null, productName: null })}>×</Button>
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                      })}
                    </div>
                  )}

                  {/* Sub-templates with hierarchy */}
                  {Object.entries(group.subTemplates).map(([stName, stItems]) => (
                    <div key={stName} className="ml-4 mt-2 border-l-2 border-blue-300 pl-3">
                      <h4 className="text-sm font-semibold text-blue-700 mb-2">🔗 {stName}</h4>
                      <div className="space-y-2">
                        {buildItemHierarchy(stItems).map(item => (
                          <div key={item.id} className="clay-card p-2 bg-white">
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => toggleExpanded(item.id)}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                {(item.details?.length > 0 || item.tasks?.length > 0) ? (
                                  expandedItems[item.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />
                                ) : <div className="w-3" />}
                              </button>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                              <span className="text-sm flex-1">{item.text}</span>
                              
                              <Select
                                value={item.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-6 text-xs w-28">
                                  <SelectValue placeholder="Approved..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {users.map(u => (
                                    <SelectItem key={u.email} value={u.full_name || u.email}>
                                      {u.full_name || u.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>

                              <Select
                                value={item.custom_dropdown_value || "select_value"}
                                onValueChange={(val) => {
                                  if (val === "other") {
                                    setShowOtherPopup({ itemId: item.id });
                                  } else if (val !== "select_value") {
                                    updateChecklistItem(item.id, { custom_dropdown_value: val });
                                  }
                                }}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-6 text-xs w-28">
                                  <SelectValue placeholder={getDropdownName(item.dropdown_id) || "Status..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {dropdownConditions.filter(dd => dd.id === item.dropdown_id || !item.dropdown_id).slice(0, 5).map(dd => (
                                    <SelectItem key={dd.id} value={dd.name}>{dd.name}</SelectItem>
                                  ))}
                                  <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                </SelectContent>
                              </Select>

                              {isRegistered && (
                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(item.id)} className="h-6 w-6 p-0 text-red-500">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>

                            {/* Expanded content for sub-template items */}
                            {expandedItems[item.id] && (
                              <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-2">
                                {item.tasks?.map(task => (
                                  <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400">
                                    <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                                    <span className="text-xs flex-1">{task.text}</span>
                                    <Checkbox 
                                      checked={!!task.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                      disabled={!isRegistered}
                                    />
                                  </div>
                                ))}
                                {item.details?.map(detail => (
                                  <div key={detail.id} className="bg-gray-50 p-1.5 rounded text-xs">
                                    <div className="flex items-center gap-1">
                                      <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                      <span className="flex-1">{detail.text}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            {isRegistered && !workOrder.sip_completed && (
              <Button
                onClick={handleCheckOff}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Mark Job Complete
              </Button>
            )}
            <Button 
              onClick={saveChecklist}
              disabled={isSaving || !isRegistered}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save Checklist
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Template Builder - rendered via portal to escape dialog context */}
      {showTemplateBuilder && ReactDOM.createPortal(
        <TemplateBuilder
          isOpen={showTemplateBuilder}
          onClose={() => {
            setShowTemplateBuilder(false);
          }}
          onApplyTemplate={(templateData) => {
            console.log("Received template data:", templateData.length, "sections");
            handleApplyTemplate(templateData);
            setShowTemplateBuilder(false);
          }}
          existingChecklist={checklist}
          isAdmin={isAdmin}
        />,
        document.body
      )}



      {/* Incomplete Warning */}
      <AlertDialog open={!!incompleteWarning} onOpenChange={() => setIncompleteWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              Incomplete Checklist
            </AlertDialogTitle>
            <AlertDialogDescription>
              This job cannot be checked off because the checklist has incomplete items.
              Please complete all checklist items (approval and status) before marking this job as done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>OK</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No Checklist Warning */}
      <AlertDialog open={!!noChecklistWarning} onOpenChange={() => setNoChecklistWarning(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              No Checklist Created
            </AlertDialogTitle>
            <AlertDialogDescription>
              This job does not have a checklist created yet. Are you sure you want to mark it as complete?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithCheckOff} className="bg-green-600 hover:bg-green-700">
              Yes, Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Other Dropdown Popup */}
      <OtherDialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <OtherDialogContent className="max-w-md clay-card border-none">
          <OtherDialogHeader>
            <OtherDialogTitle className="flex items-center gap-2">
              <List className="w-5 h-5 text-purple-500" />
              Select or Create Value
            </OtherDialogTitle>
          </OtherDialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">All Available Conditions</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg bg-gray-50">
                {dropdownConditions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No dropdown conditions created yet.
                  </div>
                ) : (
                  dropdownConditions.map(dd => (
                    <div
                      key={dd.id}
                      onClick={() => {
                        if (showOtherPopup?.itemId) {
                          updateChecklistItem(showOtherPopup.itemId, { custom_dropdown_value: dd.name });
                          setShowOtherPopup(null);
                        }
                      }}
                      className="p-3 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                        <List className="w-4 h-4 text-purple-500" />
                      </div>
                      <span className="font-medium">{dd.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Or Enter Custom Value</Label>
              <div className="flex gap-2">
                <Input
                  value={customDropdownValue}
                  onChange={(e) => setCustomDropdownValue(e.target.value)}
                  placeholder="Type custom value..."
                  className="flex-1"
                  onKeyDown={(e) => e.key === 'Enter' && showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)}
                />
                <Button 
                  onClick={() => showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)} 
                  disabled={!customDropdownValue.trim()}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Use
                </Button>
              </div>
            </div>
          </div>

          <OtherDialogFooter>
            <Button variant="outline" onClick={() => setShowOtherPopup(null)}>
              Cancel
            </Button>
          </OtherDialogFooter>
        </OtherDialogContent>
      </OtherDialog>
    </>
  );
}