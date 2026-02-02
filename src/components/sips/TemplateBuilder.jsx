import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Save, ArrowUp, ArrowDown, X, ChevronDown, ChevronRight, CheckSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CustomDropdownManager from "./CustomDropdownManager";

const ChecklistTemplate = base44.entities.ChecklistTemplate;
const ChecklistSubItem = base44.entities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

export default function TemplateBuilder({ isOpen, onClose, onApplyTemplate }) {
  const [activeTab, setActiveTab] = useState("selectors");
  const [templates, setTemplates] = useState([]);
  const [subTemplates, setSubTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  
  // Template Selector state
  const [selectedTemplates, setSelectedTemplates] = useState([]);
  
  // Sub-template Editor
  const [newSubTemplateName, setNewSubTemplateName] = useState("");
  const [editingSubTemplate, setEditingSubTemplate] = useState(null);
  
  // Product Type Editor
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [productTypeItems, setProductTypeItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [showDropdownManager, setShowDropdownManager] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [templatesData, subTemplatesData, settings] = await Promise.all([
        ChecklistTemplate.list(),
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);
      
      setTemplates(templatesData);
      setSubTemplates(subTemplatesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      const types = productTypesSetting?.setting_value?.items || ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(types);
      
      // Load product type templates
      const ptTemplates = settings.find(s => s.setting_key === 'productTypeTemplates');
      setProductTypeTemplates(ptTemplates?.setting_value || {});
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const saveProductTypes = async (types) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'productTypes' });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: { items: types } });
      } else {
        await GlobalSettings.create({ setting_key: 'productTypes', setting_value: { items: types } });
      }
      setProductTypes(types);
    } catch (error) {
      console.error("Error saving product types:", error);
    }
  };

  const saveProductTypeTemplates = async (templates) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'productTypeTemplates' });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: templates });
      } else {
        await GlobalSettings.create({ setting_key: 'productTypeTemplates', setting_value: templates });
      }
      setProductTypeTemplates(templates);
    } catch (error) {
      console.error("Error saving product type templates:", error);
    }
  };

  // Template Selection for combining
  const toggleTemplateSelection = (templateId) => {
    setSelectedTemplates(prev => 
      prev.includes(templateId) 
        ? prev.filter(id => id !== templateId)
        : [...prev, templateId]
    );
  };

  const handleApplyTemplate = () => {
    // Combine selected product type templates into one
    const combinedItems = [];
    selectedTemplates.forEach(typeKey => {
      const template = productTypeTemplates[typeKey];
      if (template?.items) {
        combinedItems.push(...template.items.map(item => ({
          ...item,
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          product_type: typeKey
        })));
      }
    });
    
    if (onApplyTemplate) {
      onApplyTemplate(combinedItems);
    }
    onClose();
  };

  // Sub-template Management
  const createSubTemplate = async () => {
    if (!newSubTemplateName.trim()) return;
    try {
      await ChecklistSubItem.create({
        name: newSubTemplateName.trim(),
        applies_to_product_types: [],
        order: subTemplates.length
      });
      await loadData();
      setNewSubTemplateName("");
    } catch (error) {
      console.error("Error creating sub-template:", error);
    }
  };

  const updateSubTemplate = async (id, updates) => {
    try {
      await ChecklistSubItem.update(id, updates);
      await loadData();
      setEditingSubTemplate(null);
    } catch (error) {
      console.error("Error updating sub-template:", error);
    }
  };

  const deleteSubTemplate = async () => {
    if (!deleteConfirm) return;
    try {
      await ChecklistSubItem.delete(deleteConfirm.id);
      await loadData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting sub-template:", error);
    }
  };

  const moveSubTemplate = async (index, direction) => {
    const newItems = [...subTemplates];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    
    try {
      await Promise.all(newItems.map((item, idx) => 
        ChecklistSubItem.update(item.id, { order: idx })
      ));
      await loadData();
    } catch (error) {
      console.error("Error reordering sub-templates:", error);
    }
  };

  // Product Type Template Editor
  const selectProductType = (type) => {
    setSelectedProductType(type);
    setProductTypeItems(productTypeTemplates[type]?.items || []);
    setExpandedItems({});
  };

  const saveProductTypeTemplate = () => {
    const updated = {
      ...productTypeTemplates,
      [selectedProductType]: {
        items: productTypeItems
      }
    };
    saveProductTypeTemplates(updated);
  };

  const addChecklistItem = () => {
    if (!newItemText.trim()) return;
    setProductTypeItems([...productTypeItems, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      type: 'checklist',
      custom_dropdown_key: "",
      sub_items: []
    }]);
    setNewItemText("");
  };

  const addTaskItem = () => {
    if (!newItemText.trim()) return;
    setProductTypeItems([...productTypeItems, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      type: 'task'
    }]);
    setNewItemText("");
  };

  const updateItem = (id, updates) => {
    setProductTypeItems(productTypeItems.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const deleteItem = (id) => {
    setProductTypeItems(productTypeItems.filter(item => item.id !== id));
  };

  const moveItem = (index, direction) => {
    const newItems = [...productTypeItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setProductTypeItems(newItems);
  };

  const addSubItemToItem = (itemId, subTemplateId) => {
    const subTemplate = subTemplates.find(st => st.id === subTemplateId);
    if (!subTemplate) return;
    
    setProductTypeItems(productTypeItems.map(item => {
      if (item.id === itemId) {
        const existing = item.sub_items || [];
        if (existing.find(si => si.id === subTemplateId)) return item;
        return {
          ...item,
          sub_items: [...existing, { id: subTemplateId, text: subTemplate.name }]
        };
      }
      return item;
    }));
  };

  const removeSubItemFromItem = (itemId, subTemplateId) => {
    setProductTypeItems(productTypeItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          sub_items: (item.sub_items || []).filter(si => si.id !== subTemplateId)
        };
      }
      return item;
    }));
  };

  const toggleItemExpanded = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };

  if (!isOpen) return null;

  // Get product types that have templates configured
  const productTypesWithTemplates = productTypes.filter(type => 
    productTypeTemplates[type]?.items?.length > 0
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col bg-white rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Template Builder</h2>
              <p className="text-xs text-gray-500">Build and combine templates for projects</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b bg-white">
              <TabsList className="grid w-full grid-cols-3 bg-gray-200 p-1">
                <TabsTrigger value="selectors" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Template Selectors</TabsTrigger>
                <TabsTrigger value="subtemplates" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Sub-Templates</TabsTrigger>
                <TabsTrigger value="producttypes" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Product Types</TabsTrigger>
              </TabsList>
            </div>

            {/* Template Selectors Tab */}
            <TabsContent value="selectors" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">Select product type templates to combine into a project checklist. Each product type you select will add its checklist items to the project.</p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm">Available Templates ({productTypesWithTemplates.length})</h3>
                  {productTypesWithTemplates.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <p>No product type templates configured yet.</p>
                      <p className="text-sm mt-1">Go to the Product Types tab to create templates.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {productTypesWithTemplates.map(type => {
                        const template = productTypeTemplates[type];
                        const isSelected = selectedTemplates.includes(type);
                        return (
                          <div
                            key={type}
                            onClick={() => toggleTemplateSelection(type)}
                            className={`p-3 rounded-lg border cursor-pointer transition-all ${
                              isSelected 
                                ? 'bg-purple-100 border-purple-400 ring-2 ring-purple-300' 
                                : 'bg-white hover:bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => {}}
                                className="w-4 h-4"
                              />
                              <div className="flex-1">
                                <div className="font-medium">{type}</div>
                                <div className="text-xs text-gray-500">
                                  {template?.items?.length || 0} items
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {selectedTemplates.length > 0 && (
                  <div className="sticky bottom-0 bg-white border-t pt-4">
                    <Button 
                      onClick={handleApplyTemplate}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Apply {selectedTemplates.length} Template{selectedTemplates.length > 1 ? 's' : ''} to Project
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Sub-Templates Tab */}
            <TabsContent value="subtemplates" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="bg-gray-50 border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-sm">Create New Sub-Template</h3>
                  <p className="text-xs text-gray-500 mb-3">Sub-templates are reusable checklist detail items (e.g., Permitting, Installation, Assembly)</p>
                  <div className="flex gap-2">
                    <Input
                      value={newSubTemplateName}
                      onChange={(e) => setNewSubTemplateName(e.target.value)}
                      placeholder="Sub-template name..."
                      onKeyDown={(e) => e.key === 'Enter' && createSubTemplate()}
                    />
                    <Button onClick={createSubTemplate}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm">Sub-Templates ({subTemplates.length})</h3>
                  {subTemplates.map((subTemplate, index) => (
                    <div key={subTemplate.id} className="bg-white border rounded-lg p-3 flex items-center gap-2">
                      <div className="flex flex-col">
                        <button onClick={() => moveSubTemplate(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveSubTemplate(index, 'down')} disabled={index === subTemplates.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      {editingSubTemplate === subTemplate.id ? (
                        <Input
                          value={subTemplate.name}
                          onChange={(e) => updateSubTemplate(subTemplate.id, { name: e.target.value })}
                          onBlur={() => setEditingSubTemplate(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingSubTemplate(null)}
                          className="flex-1 h-8"
                          autoFocus
                        />
                      ) : (
                        <div className="flex-1 font-medium">{subTemplate.name}</div>
                      )}

                      <div className="flex gap-1">
                        <button onClick={() => setEditingSubTemplate(editingSubTemplate === subTemplate.id ? null : subTemplate.id)} className="p-1">
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ id: subTemplate.id, type: 'subtemplate', name: subTemplate.name })} className="p-1">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Product Types Tab */}
            <TabsContent value="producttypes" className="flex-1 overflow-hidden p-4 grid grid-cols-3 gap-4">
              {/* Product Type List */}
              <div className="space-y-2 overflow-y-auto">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm">Product Types</h3>
                </div>
                
                <div className="bg-gray-50 border rounded-lg p-2 mb-3">
                  <div className="flex gap-2">
                    <Input
                      id="newProductTypeInput"
                      placeholder="Add type..."
                      className="h-8 text-sm"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          saveProductTypes([...productTypes, e.target.value.trim()]);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button size="sm" className="h-8" onClick={() => {
                      const input = document.getElementById('newProductTypeInput');
                      if (input && input.value.trim()) {
                        saveProductTypes([...productTypes, input.value.trim()]);
                        input.value = "";
                      }
                    }}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                
                {productTypes.map((type, index) => {
                  const hasTemplate = productTypeTemplates[type]?.items?.length > 0;
                  return (
                    <div
                      key={type}
                      onClick={() => selectProductType(type)}
                      className={`p-2 rounded-lg border cursor-pointer transition-colors flex items-center gap-2 ${
                        selectedProductType === type 
                          ? 'bg-blue-100 border-blue-300' 
                          : 'bg-white hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex flex-col">
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const newTypes = [...productTypes];
                          if (index > 0) {
                            [newTypes[index], newTypes[index - 1]] = [newTypes[index - 1], newTypes[index]];
                            saveProductTypes(newTypes);
                          }
                        }} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const newTypes = [...productTypes];
                          if (index < productTypes.length - 1) {
                            [newTypes[index], newTypes[index + 1]] = [newTypes[index + 1], newTypes[index]];
                            saveProductTypes(newTypes);
                          }
                        }} disabled={index === productTypes.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="flex-1">
                        <div className="font-medium text-sm">{type}</div>
                        <div className="text-xs text-gray-500">
                          {hasTemplate ? `${productTypeTemplates[type].items.length} items` : 'No template'}
                        </div>
                      </div>
                      <button onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${type}"?`)) {
                          saveProductTypes(productTypes.filter((_, i) => i !== index));
                          if (selectedProductType === type) {
                            setSelectedProductType(null);
                            setProductTypeItems([]);
                          }
                        }
                      }} className="p-1">
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Product Type Template Editor */}
              <div className="col-span-2 overflow-y-auto bg-gray-50 border rounded-lg p-4">
                {selectedProductType ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">{selectedProductType} Template</h3>
                      <Button onClick={saveProductTypeTemplate} size="sm">
                        <Save className="w-4 h-4 mr-1" />
                        Save
                      </Button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Add Item</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={newItemText}
                            onChange={(e) => setNewItemText(e.target.value)}
                            placeholder="Item text..."
                            className="flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && addChecklistItem()}
                          />
                          <Button onClick={addChecklistItem} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Checklist
                          </Button>
                          <Button onClick={addTaskItem} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Task
                          </Button>
                        </div>
                      </div>

                      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                        {productTypeItems.map((item, index) => (
                          <div key={item.id} className={`border rounded-lg p-3 bg-white ${item.type === 'task' ? 'border-l-4 border-l-orange-400' : ''}`}>
                            <div className="flex items-start gap-2">
                              <div className="flex flex-col">
                                <button onClick={() => moveItem(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                  <ArrowUp className="w-3 h-3" />
                                </button>
                                <button onClick={() => moveItem(index, 'down')} disabled={index === productTypeItems.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                                  <ArrowDown className="w-3 h-3" />
                                </button>
                              </div>

                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs px-2 py-0.5 rounded ${item.type === 'task' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                    {item.type === 'task' ? 'Task' : 'Checklist'}
                                  </span>
                                  {editingItem === item.id ? (
                                    <Input
                                      value={item.text}
                                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                                      onBlur={() => setEditingItem(null)}
                                      onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                                      autoFocus
                                      className="h-7 text-sm flex-1"
                                    />
                                  ) : (
                                    <>
                                      <span className="flex-1 font-medium text-sm">{item.text}</span>
                                      <button onClick={() => setEditingItem(item.id)} className="p-1">
                                        <Pencil className="w-3 h-3 text-gray-400" />
                                      </button>
                                    </>
                                  )}
                                </div>

                                {item.type === 'checklist' && (
                                  <>
                                    <button 
                                      onClick={() => toggleItemExpanded(item.id)}
                                      className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
                                    >
                                      {expandedItems[item.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                      Details ({(item.sub_items?.length || 0)} sub-items, dropdown: {item.custom_dropdown_key || 'none'})
                                    </button>

                                    {expandedItems[item.id] && (
                                      <div className="ml-4 space-y-2 pt-2 border-t">
                                        <div className="flex items-center gap-2">
                                          <Label className="text-xs">Dropdown Key:</Label>
                                          <Input
                                            value={item.custom_dropdown_key || ""}
                                            onChange={(e) => updateItem(item.id, { custom_dropdown_key: e.target.value })}
                                            placeholder="e.g., fabrication_status"
                                            className="h-6 text-xs flex-1"
                                          />
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setShowDropdownManager(item.custom_dropdown_key || '')}
                                            className="h-6 px-2"
                                          >
                                            <Pencil className="w-3 h-3" />
                                          </Button>
                                        </div>

                                        <div>
                                          <Label className="text-xs">Sub-items (from Sub-Templates):</Label>
                                          <div className="flex flex-wrap gap-2 mt-1 p-2 bg-gray-50 rounded border max-h-24 overflow-y-auto">
                                            {subTemplates.map(st => {
                                              const isSelected = (item.sub_items || []).some(s => s.id === st.id);
                                              return (
                                                <label key={st.id} className="flex items-center gap-1 text-xs cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => {
                                                      if (e.target.checked) {
                                                        addSubItemToItem(item.id, st.id);
                                                      } else {
                                                        removeSubItemFromItem(item.id, st.id);
                                                      }
                                                    }}
                                                    className="w-3 h-3"
                                                  />
                                                  <span className={isSelected ? "text-blue-700 font-medium" : "text-gray-600"}>{st.name}</span>
                                                </label>
                                              );
                                            })}
                                            {subTemplates.length === 0 && (
                                              <span className="text-xs text-gray-400">No sub-templates. Create them in Sub-Templates tab.</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>

                              <button onClick={() => deleteItem(item.id)} className="p-1">
                                <Trash2 className="w-4 h-4 text-red-500" />
                              </button>
                            </div>
                          </div>
                        ))}

                        {productTypeItems.length === 0 && (
                          <div className="text-center py-8 text-gray-500">
                            <p>No items yet. Add checklist items or tasks above.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select a product type to edit its template</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="px-4 py-3 border-t bg-gray-50 flex justify-end">
            <Button onClick={onClose} variant="outline" size="sm">
              Close
            </Button>
          </div>
        </div>
      </div>

      {/* Dropdown Manager */}
      {showDropdownManager !== null && (
        <CustomDropdownManager
          isOpen={true}
          onClose={() => setShowDropdownManager(null)}
          dropdownKey={showDropdownManager}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="bg-white border shadow-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === 'subtemplate' ? 'Sub-Template' : 'Item'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSubTemplate} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}