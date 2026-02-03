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
    const newItems = [];
    
    // Helper to flatten hierarchical items
    const flattenItem = (item, productName, productType, subTemplateName = null) => {
      const baseId = subTemplateName 
        ? `${productName}_sub_${subTemplateName}_${item.id}`
        : `${productName}_${item.id}`;
      
      // Get dropdown_ids (support both old dropdown_id and new dropdown_ids array)
      const itemDropdownIds = item.dropdown_ids || (item.dropdown_id ? [item.dropdown_id] : []);
      
      // Add main checklist item
      newItems.push({
        id: baseId,
        product_name: productName,
        product_type: productType,
        sub_template_name: subTemplateName,
        text: item.text,
        type: 'checklist',
        approved_by: "",
        dropdown_ids: itemDropdownIds,
        dropdown_id: itemDropdownIds[0] || "",
        custom_dropdown_value: ""
      });
      
      // Add tasks under main item
      item.tasks?.forEach(task => {
        newItems.push({
          id: `${baseId}_task_${task.id}`,
          product_name: productName,
          product_type: productType,
          sub_template_name: subTemplateName,
          parent_id: baseId,
          text: task.text,
          type: 'task',
          approved_by: "",
          custom_dropdown_value: ""
        });
      });
      
      // Add detail items and their tasks
      item.details?.forEach(detail => {
        const detailId = `${baseId}_detail_${detail.id}`;
        const detailDropdownIds = detail.dropdown_ids || (detail.dropdown_id ? [detail.dropdown_id] : []);
        
        newItems.push({
          id: detailId,
          product_name: productName,
          product_type: productType,
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
        detail.tasks?.forEach(task => {
          newItems.push({
            id: `${detailId}_task_${task.id}`,
            product_name: productName,
            product_type: productType,
            sub_template_name: subTemplateName,
            parent_id: detailId,
            text: task.text,
            type: 'task',
            approved_by: "",
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
          flattenItem(item, section.parentProduct, null, section.subTemplateName);
        });
      }
    });

    // Append to existing checklist instead of replacing
    setChecklist([...checklist, ...newItems]);
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
      const productName = item.product_name || 'Ungrouped';
      if (!groups[productName]) {
        groups[productName] = {
          productType: item.product_type,
          mainItems: [],
          subTemplates: {}
        };
      }
      
      if (item.sub_template_name) {
        if (!groups[productName].subTemplates[item.sub_template_name]) {
          groups[productName].subTemplates[item.sub_template_name] = [];
        }
        groups[productName].subTemplates[item.sub_template_name].push(item);
      } else {
        groups[productName].mainItems.push(item);
      }
    });
    
    return groups;
  };
  
  // Build hierarchy for items
  const buildItemHierarchy = (items) => {
    const mainItems = items.filter(i => i.type === 'checklist' && !i.parent_id);
    
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
  
  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
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
                    Template Builder
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Products from Work Order (read-only display) */}
          <div className="clay-card p-3 bg-blue-50/50">
            <h3 className="font-bold text-sm mb-2">Products on this Job</h3>
            <p className="text-xs text-gray-500 mb-2">Products are managed in the Client Information section. Use Template Builder to apply checklists.</p>
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
                <p className="text-sm mt-1">Use Template Builder to create and apply templates</p>
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
                      {buildItemHierarchy(group.mainItems).map(item => (
                        <div key={item.id} className="clay-card p-3 bg-white">
                          {/* Main checklist item */}
                          <div className="flex items-center gap-2">
                            <button 
                              onClick={() => toggleExpanded(item.id)}
                              className="p-1 hover:bg-gray-100 rounded"
                            >
                              {(item.details?.length > 0 || item.tasks?.length > 0) ? (
                                expandedItems[item.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />
                              ) : <div className="w-4" />}
                            </button>
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                            <span className="font-medium text-sm flex-1">{item.text}</span>
                            
                            <Select
                              value={item.approved_by || ""}
                              onValueChange={(val) => updateChecklistItem(item.id, { approved_by: val })}
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
                              <SelectTrigger className="h-7 text-xs w-32">
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
                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(item.id)} className="h-7 w-7 p-0 text-red-500">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          {/* Expanded: Tasks and Details */}
                          {expandedItems[item.id] && (
                            <div className="ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-3">
                              {/* Tasks under main item */}
                              {item.tasks?.map(task => (
                                <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                                  <span className="text-sm flex-1">{task.text}</span>
                                  <Checkbox 
                                    checked={!!task.approved_by}
                                    onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                    disabled={!isRegistered}
                                  />
                                  {isRegistered && (
                                    <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-6 w-6 p-0 text-red-500">
                                      <Trash2 className="w-3 h-3" />
                                    </Button>
                                  )}
                                </div>
                              ))}

                              {/* Detail items */}
                              {item.details?.map(detail => (
                                <div key={detail.id} className="bg-gray-50 p-2 rounded border">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                    <span className="text-sm flex-1">{detail.text}</span>
                                    
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

                                  {/* Tasks under detail */}
                                  {detail.tasks?.length > 0 && (
                                    <div className="ml-4 mt-2 space-y-1 border-l-2 border-orange-200 pl-2">
                                      {detail.tasks.map(task => (
                                        <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-1.5 rounded">
                                          <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                                          <span className="text-xs flex-1">{task.text}</span>
                                          <Checkbox 
                                            checked={!!task.approved_by}
                                            onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                            disabled={!isRegistered}
                                          />
                                          {isRegistered && (
                                            <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-5 w-5 p-0 text-red-500">
                                              <Trash2 className="w-2.5 h-2.5" />
                                            </Button>
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
                      ))}
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