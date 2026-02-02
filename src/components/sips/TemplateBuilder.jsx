import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Save, ArrowUp, ArrowDown, Copy, Search, Eye, History, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CustomDropdownManager from "./CustomDropdownManager";

const ChecklistTemplate = base44.entities.ChecklistTemplate;
const ChecklistSubItem = base44.entities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

export default function TemplateBuilder({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState("items");
  const [templates, setTemplates] = useState([]);
  const [subItems, setSubItems] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  
  // Template Item Editor
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateName, setTemplateName] = useState("");
  const [templateProductType, setTemplateProductType] = useState("");
  const [templateItems, setTemplateItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [showDropdownManager, setShowDropdownManager] = useState(null);
  
  // Sub-item Editor
  const [newSubItemName, setNewSubItemName] = useState("");
  const [newSubItemProductTypes, setNewSubItemProductTypes] = useState([]);
  const [editingSubItem, setEditingSubItem] = useState(null);
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // New features state
  const [templateSearch, setTemplateSearch] = useState("");
  const [templateFilterType, setTemplateFilterType] = useState("all");
  const [showPreview, setShowPreview] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(null);

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [templatesData, subItemsData, settings] = await Promise.all([
        ChecklistTemplate.list(),
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);
      
      setTemplates(templatesData);
      setSubItems(subItemsData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      setProductTypes(productTypesSetting?.setting_value?.items || ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
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

  // Template Management
  const createNewTemplate = () => {
    setSelectedTemplate(null);
    setTemplateName("");
    setTemplateProductType("");
    setTemplateItems([]);
  };

  const selectTemplate = (template) => {
    setSelectedTemplate(template);
    setTemplateName(template.name);
    setTemplateProductType(template.product_type || "");
    setTemplateItems(template.items || []);
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      alert("Template name is required");
      return;
    }
    
    const data = {
      name: templateName.trim(),
      product_type: templateProductType || "",
      items: templateItems
    };

    try {
      if (selectedTemplate) {
        await ChecklistTemplate.update(selectedTemplate.id, data);
      } else {
        await ChecklistTemplate.create(data);
      }
      await loadData();
      createNewTemplate();
    } catch (error) {
      console.error("Error saving template:", error);
    }
  };

  const deleteTemplate = async () => {
    if (!deleteConfirm) return;
    try {
      await ChecklistTemplate.delete(deleteConfirm.id);
      await loadData();
      if (selectedTemplate?.id === deleteConfirm.id) {
        createNewTemplate();
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting template:", error);
    }
  };

  // Duplicate template
  const duplicateTemplate = async (template) => {
    try {
      const newTemplate = {
        name: `${template.name} (Copy)`,
        product_type: template.product_type || "",
        items: template.items.map(item => ({
          ...item,
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        }))
      };
      await ChecklistTemplate.create(newTemplate);
      await loadData();
    } catch (error) {
      console.error("Error duplicating template:", error);
    }
  };

  // Filter templates
  const filteredTemplates = templates.filter(template => {
    const matchesSearch = !templateSearch || 
      template.name.toLowerCase().includes(templateSearch.toLowerCase());
    const matchesType = templateFilterType === "all" || 
      template.product_type === templateFilterType ||
      (!template.product_type && templateFilterType === "none");
    return matchesSearch && matchesType;
  });

  // Template Items
  const addTemplateItem = () => {
    if (!newItemText.trim()) return;
    setTemplateItems([...templateItems, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      custom_dropdown_key: "",
      sub_items: []
    }]);
    setNewItemText("");
  };

  const updateTemplateItem = (id, updates) => {
    setTemplateItems(templateItems.map(item => 
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const deleteTemplateItem = (id) => {
    setTemplateItems(templateItems.filter(item => item.id !== id));
  };

  const moveTemplateItem = (index, direction) => {
    const newItems = [...templateItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setTemplateItems(newItems);
  };

  const addSubItemToTemplateItem = (itemId, subItemId) => {
    const subItem = subItems.find(si => si.id === subItemId);
    if (!subItem) return;
    
    setTemplateItems(templateItems.map(item => {
      if (item.id === itemId) {
        const existingSubItems = item.sub_items || [];
        if (existingSubItems.find(si => si.id === subItemId)) return item;
        return {
          ...item,
          sub_items: [...existingSubItems, { id: subItemId, text: subItem.name }]
        };
      }
      return item;
    }));
  };

  const removeSubItemFromTemplateItem = (itemId, subItemId) => {
    setTemplateItems(templateItems.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          sub_items: (item.sub_items || []).filter(si => si.id !== subItemId)
        };
      }
      return item;
    }));
  };

  // Sub-item Management
  const createSubItem = async () => {
    if (!newSubItemName.trim()) return;
    try {
      await ChecklistSubItem.create({
        name: newSubItemName.trim(),
        applies_to_product_types: newSubItemProductTypes,
        order: subItems.length
      });
      await loadData();
      setNewSubItemName("");
      setNewSubItemProductTypes([]);
    } catch (error) {
      console.error("Error creating sub-item:", error);
    }
  };

  const updateSubItem = async (id, updates) => {
    try {
      await ChecklistSubItem.update(id, updates);
      await loadData();
      setEditingSubItem(null);
    } catch (error) {
      console.error("Error updating sub-item:", error);
    }
  };

  const deleteSubItem = async () => {
    if (!deleteConfirm) return;
    try {
      await ChecklistSubItem.delete(deleteConfirm.id);
      await loadData();
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Error deleting sub-item:", error);
    }
  };

  const moveSubItem = async (index, direction) => {
    const newItems = [...subItems];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < newItems.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    
    // Update order in database
    try {
      await Promise.all(newItems.map((item, idx) => 
        ChecklistSubItem.update(item.id, { order: idx })
      ));
      await loadData();
    } catch (error) {
      console.error("Error reordering sub-items:", error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-6xl max-h-[95vh] overflow-hidden flex flex-col bg-white rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-4 py-3 border-b bg-gray-50 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">Checklist Template Builder</h2>
              <p className="text-xs text-gray-500">Manage templates, sub-items, and product types</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-4 py-2 border-b bg-white">
              <TabsList className="grid w-full grid-cols-3 bg-gray-200 p-1">
                <TabsTrigger value="items" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Checklist Templates</TabsTrigger>
                <TabsTrigger value="subitems" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Sub-items Pool</TabsTrigger>
                <TabsTrigger value="producttypes" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Product Types</TabsTrigger>
              </TabsList>
            </div>

            {/* Checklist Templates Tab */}
            <TabsContent value="items" className="flex-1 overflow-hidden p-4 grid grid-cols-3 gap-4">
              {/* Template List */}
              <div className="space-y-2 overflow-y-auto pr-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold">Templates ({filteredTemplates.length})</h3>
                  <Button size="sm" onClick={createNewTemplate}>
                    <Plus className="w-4 h-4 mr-1" />
                    New
                  </Button>
                </div>
                
                {/* Search and Filter */}
                <div className="space-y-2 mb-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      value={templateSearch}
                      onChange={(e) => setTemplateSearch(e.target.value)}
                      placeholder="Search templates..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  <Select value={templateFilterType} onValueChange={setTemplateFilterType}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Filter by type..." />
                    </SelectTrigger>
                    <SelectContent className="z-[100]">
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="none">No Type</SelectItem>
                      {productTypes.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    onClick={() => selectTemplate(template)}
                    className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedTemplate?.id === template.id 
                        ? 'bg-blue-100 border-blue-300' 
                        : 'bg-white hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="font-medium">{template.name}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {template.product_type || "No product type"} • {template.items?.length || 0} items
                    </div>
                    <div className="flex gap-1 mt-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateTemplate(template);
                        }}
                        className="h-6 px-2"
                        title="Duplicate template"
                      >
                        <Copy className="w-3 h-3 text-blue-500" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowVersionHistory(template);
                        }}
                        className="h-6 px-2"
                        title="Version history"
                      >
                        <History className="w-3 h-3 text-gray-500" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ id: template.id, type: 'template', name: template.name });
                        }}
                        className="h-6 px-2"
                        title="Delete template"
                      >
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Template Editor */}
              <div className="col-span-2 overflow-y-auto bg-gray-50 border rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg">
                    {selectedTemplate ? "Edit Template" : "Create New Template"}
                  </h3>
                  {templateItems.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(true)}
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      Preview
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Template Name</Label>
                    <Input
                      value={templateName}
                      onChange={(e) => setTemplateName(e.target.value)}
                      placeholder="e.g., Channel Letter Standard Checklist"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Product Type</Label>
                    <Select value={templateProductType} onValueChange={setTemplateProductType}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select product type..." />
                      </SelectTrigger>
                      <SelectContent className="z-[100]">
                        <SelectItem value={null}>None</SelectItem>
                        {productTypes.map(type => (
                          <SelectItem key={type} value={type}>{type}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Checklist Items</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        value={newItemText}
                        onChange={(e) => setNewItemText(e.target.value)}
                        placeholder="Add checklist item..."
                        onKeyDown={(e) => e.key === 'Enter' && addTemplateItem()}
                      />
                      <Button onClick={addTemplateItem} size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {templateItems.map((item, index) => (
                      <div key={item.id} className="border rounded-lg p-3 bg-white">
                        <div className="flex items-start gap-2">
                          <div className="flex flex-col">
                            <button onClick={() => moveTemplateItem(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                              <ArrowUp className="w-3 h-3" />
                            </button>
                            <button onClick={() => moveTemplateItem(index, 'down')} disabled={index === templateItems.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                              <ArrowDown className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="flex-1 space-y-2">
                            {editingItem === item.id ? (
                              <Input
                                value={item.text}
                                onChange={(e) => updateTemplateItem(item.id, { text: e.target.value })}
                                onBlur={() => setEditingItem(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                                autoFocus
                                className="h-8 text-sm"
                              />
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="flex-1 font-medium text-sm">{item.text}</span>
                                <button onClick={() => setEditingItem(item.id)} className="p-1">
                                  <Pencil className="w-3 h-3 text-gray-400" />
                                </button>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Custom Dropdown:</Label>
                              <Input
                                value={item.custom_dropdown_key || ""}
                                onChange={(e) => updateTemplateItem(item.id, { custom_dropdown_key: e.target.value })}
                                placeholder="Dropdown key (e.g., 'fabrication_status')"
                                className="h-7 text-xs flex-1"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowDropdownManager(item.custom_dropdown_key || '')}
                                className="h-7 px-2"
                                title="Manage dropdown options"
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            </div>

                            {/* Sub-items for this checklist item */}
                            <div>
                              <Label className="text-xs">Sub-items (checkboxes):</Label>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {(item.sub_items || []).map(si => (
                                  <div key={si.id} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs flex items-center gap-1">
                                    {si.text}
                                    <button onClick={() => removeSubItemFromTemplateItem(item.id, si.id)}>
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </button>
                                  </div>
                                ))}
                                <Select onValueChange={(val) => addSubItemToTemplateItem(item.id, val)}>
                                  <SelectTrigger className="h-6 w-24 text-xs">
                                    <SelectValue placeholder="+ Add" />
                                  </SelectTrigger>
                                  <SelectContent className="z-[100]">
                                    {subItems.filter(si => {
                                      // Filter by product type if template has one
                                      if (!templateProductType) return true;
                                      return si.applies_to_product_types?.includes(templateProductType) || !si.applies_to_product_types?.length;
                                    }).map(si => (
                                      <SelectItem key={si.id} value={si.id}>{si.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>
                          </div>

                          <button onClick={() => deleteTemplateItem(item.id)} className="p-1">
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 pt-4 border-t">
                    <Button onClick={saveTemplate} className="flex-1">
                      <Save className="w-4 h-4 mr-2" />
                      {selectedTemplate ? "Update Template" : "Create Template"}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Sub-items Tab */}
            <TabsContent value="subitems" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div className="bg-gray-50 border rounded-lg p-4">
                  <h3 className="font-bold mb-2 text-sm">Create New Sub-item</h3>
                  <div className="space-y-3">
                    <Input
                      value={newSubItemName}
                      onChange={(e) => setNewSubItemName(e.target.value)}
                      placeholder="Sub-item name..."
                      onKeyDown={(e) => e.key === 'Enter' && createSubItem()}
                    />
                    <div>
                      <Label className="text-xs mb-1 block">Applies to Product Types (optional):</Label>
                      <div className="flex flex-wrap gap-1">
                        {productTypes.map(type => (
                          <label key={type} className="flex items-center gap-1 text-sm">
                            <input
                              type="checkbox"
                              checked={newSubItemProductTypes.includes(type)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setNewSubItemProductTypes([...newSubItemProductTypes, type]);
                                } else {
                                  setNewSubItemProductTypes(newSubItemProductTypes.filter(t => t !== type));
                                }
                              }}
                              className="w-3 h-3"
                            />
                            {type}
                          </label>
                        ))}
                      </div>
                    </div>
                    <Button onClick={createSubItem} className="w-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Create Sub-item
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-sm">Sub-items Pool ({subItems.length})</h3>
                  {subItems.map((subItem, index) => (
                    <div key={subItem.id} className="bg-white border rounded-lg p-3 flex items-center gap-2">
                      <div className="flex flex-col">
                        <button onClick={() => moveSubItem(index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => moveSubItem(index, 'down')} disabled={index === subItems.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>

                      {editingSubItem === subItem.id ? (
                        <div className="flex-1 space-y-2">
                          <Input
                            value={subItem.name}
                            onChange={(e) => updateSubItem(subItem.id, { name: e.target.value })}
                            className="h-8"
                          />
                          <div className="flex flex-wrap gap-1">
                            {productTypes.map(type => (
                              <label key={type} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={subItem.applies_to_product_types?.includes(type)}
                                  onChange={(e) => {
                                    const current = subItem.applies_to_product_types || [];
                                    const updated = e.target.checked
                                      ? [...current, type]
                                      : current.filter(t => t !== type);
                                    updateSubItem(subItem.id, { applies_to_product_types: updated });
                                  }}
                                  className="w-3 h-3"
                                />
                                {type}
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1">
                          <div className="font-medium">{subItem.name}</div>
                          {subItem.applies_to_product_types?.length > 0 && (
                            <div className="text-xs text-gray-500 mt-1">
                              {subItem.applies_to_product_types.join(", ")}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="flex gap-1">
                        <button onClick={() => setEditingSubItem(editingSubItem === subItem.id ? null : subItem.id)} className="p-1">
                          <Pencil className="w-4 h-4 text-gray-500" />
                        </button>
                        <button onClick={() => setDeleteConfirm({ id: subItem.id, type: 'subitem', name: subItem.name })} className="p-1">
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* Product Types Tab */}
            <TabsContent value="producttypes" className="flex-1 overflow-y-auto p-4">
              <div className="bg-gray-50 border rounded-lg p-4 max-w-2xl">
                <h3 className="font-bold mb-1 text-sm">Manage Product Types</h3>
                <p className="text-xs text-gray-500 mb-3">Used for templates and product selection</p>
                
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="Add product type..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.target.value.trim()) {
                        saveProductTypes([...productTypes, e.target.value.trim()]);
                        e.target.value = "";
                      }
                    }}
                  />
                  <Button onClick={(e) => {
                    const input = e.target.closest('.clay-card').querySelector('input');
                    if (input.value.trim()) {
                      saveProductTypes([...productTypes, input.value.trim()]);
                      input.value = "";
                    }
                  }}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>

                <div className="space-y-1">
                  {productTypes.map((type, index) => (
                    <div key={index} className="flex items-center gap-2 p-2 bg-white rounded border">
                      <div className="flex flex-col">
                        <button onClick={() => {
                          const newTypes = [...productTypes];
                          if (index > 0) {
                            [newTypes[index], newTypes[index - 1]] = [newTypes[index - 1], newTypes[index]];
                            saveProductTypes(newTypes);
                          }
                        }} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => {
                          const newTypes = [...productTypes];
                          if (index < productTypes.length - 1) {
                            [newTypes[index], newTypes[index + 1]] = [newTypes[index + 1], newTypes[index]];
                            saveProductTypes(newTypes);
                          }
                        }} disabled={index === productTypes.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                          <ArrowDown className="w-3 h-3" />
                        </button>
                      </div>
                      <span className="flex-1">{type}</span>
                      <button onClick={() => {
                        if (confirm(`Delete product type "${type}"?`)) {
                          saveProductTypes(productTypes.filter((_, i) => i !== index));
                        }
                      }}>
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  ))}
                </div>
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
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteConfirm?.type === 'template' ? 'Template' : 'Sub-item'}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirm?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteConfirm?.type === 'template' ? deleteTemplate : deleteSubItem} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={() => setShowPreview(false)}>
          <div className="clay-card w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold text-lg">Template Preview: {templateName || "Untitled"}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowPreview(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-3">
                {templateItems.map((item, index) => (
                  <div key={item.id} className="border rounded-lg p-3 bg-purple-50/30">
                    <div className="grid grid-cols-3 gap-2 items-center mb-2">
                      <div className="font-medium text-sm">{item.text}</div>
                      <div className="h-8 bg-gray-100 rounded border text-xs flex items-center px-2 text-gray-400">
                        Approved by...
                      </div>
                      <div className="h-8 bg-gray-100 rounded border text-xs flex items-center px-2 text-gray-400">
                        {item.custom_dropdown_key || "Status..."}
                      </div>
                    </div>
                    {item.sub_items && item.sub_items.length > 0 && (
                      <div className="ml-4 mt-2 space-y-1">
                        {item.sub_items.map(si => (
                          <label key={si.id} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" disabled className="h-4 w-4" />
                            <span>{si.text}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Modal */}
      {showVersionHistory && (
        <div className="fixed inset-0 bg-black/50 z-[80] flex items-center justify-center p-4" onClick={() => setShowVersionHistory(null)}>
          <div className="clay-card w-full max-w-md max-h-[60vh] overflow-hidden flex flex-col bg-white" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-bold">Version History: {showVersionHistory.name}</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowVersionHistory(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4 overflow-y-auto flex-1">
              <div className="space-y-2">
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Current Version</span>
                    <span className="text-xs text-gray-500">
                      {new Date(showVersionHistory.updated_date || showVersionHistory.created_date).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    {showVersionHistory.items?.length || 0} items
                  </div>
                </div>
                <div className="p-3 bg-gray-50 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">Created</span>
                    <span className="text-xs text-gray-500">
                      {new Date(showVersionHistory.created_date).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    by {showVersionHistory.created_by || "Unknown"}
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-4 text-center">
                Full version history tracking coming soon
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}