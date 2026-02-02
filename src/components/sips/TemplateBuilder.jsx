import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Trash2, Pencil, Save, ArrowUp, ArrowDown, X, ChevronDown, ChevronRight, CheckSquare } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import CustomDropdownManager from "./CustomDropdownManager";

const ChecklistSubItem = base44.entities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

export default function TemplateBuilder({ isOpen, onClose, onApplyTemplate }) {
  const [activeTab, setActiveTab] = useState("selectors");
  const [subTemplates, setSubTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  const [subTemplateItems, setSubTemplateItems] = useState({});
  
  // Template Selector state - now supports multiple of same type with custom names
  const [selectedProducts, setSelectedProducts] = useState([]); // [{id, productType, customName, subTemplates: []}]
  
  // Sub-template Editor
  const [newSubTemplateName, setNewSubTemplateName] = useState("");
  const [editingSubTemplateId, setEditingSubTemplateId] = useState(null);
  const [editingSubTemplateName, setEditingSubTemplateName] = useState("");
  const [selectedSubTemplate, setSelectedSubTemplate] = useState(null);
  const [subTemplateChecklistItems, setSubTemplateChecklistItems] = useState([]);
  
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
      const [subTemplatesData, settings] = await Promise.all([
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);
      
      setSubTemplates(subTemplatesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      const types = productTypesSetting?.setting_value?.items || ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(types);
      
      // Load product type templates
      const ptTemplates = settings.find(s => s.setting_key === 'productTypeTemplates');
      setProductTypeTemplates(ptTemplates?.setting_value || {});
      
      // Load sub-template checklist items
      const stItems = settings.find(s => s.setting_key === 'subTemplateItems');
      setSubTemplateItems(stItems?.setting_value || {});
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

  const saveSubTemplateItems = async (items) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'subTemplateItems' });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: items });
      } else {
        await GlobalSettings.create({ setting_key: 'subTemplateItems', setting_value: items });
      }
      setSubTemplateItems(items);
    } catch (error) {
      console.error("Error saving sub-template items:", error);
    }
  };

  // Template Selection - Add a product type with custom name
  const addProductToSelection = (productType) => {
    const existingCount = selectedProducts.filter(p => p.productType === productType).length;
    const customName = existingCount > 0 ? `${productType} ${existingCount + 1}` : productType;
    
    setSelectedProducts([...selectedProducts, {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      productType,
      customName,
      subTemplates: []
    }]);
  };

  const updateProductName = (productId, newName) => {
    // Check for duplicate names
    const isDuplicate = selectedProducts.some(p => p.id !== productId && p.customName === newName);
    if (isDuplicate) {
      alert("Product name must be unique");
      return false;
    }
    setSelectedProducts(selectedProducts.map(p => 
      p.id === productId ? { ...p, customName: newName } : p
    ));
    return true;
  };

  const removeProductFromSelection = (productId) => {
    setSelectedProducts(selectedProducts.filter(p => p.id !== productId));
  };

  const toggleSubTemplateForProduct = (productId, subTemplateId) => {
    setSelectedProducts(selectedProducts.map(p => {
      if (p.id === productId) {
        const hasIt = p.subTemplates.includes(subTemplateId);
        return {
          ...p,
          subTemplates: hasIt 
            ? p.subTemplates.filter(id => id !== subTemplateId)
            : [...p.subTemplates, subTemplateId]
        };
      }
      return p;
    }));
  };

  const handleApplyTemplate = () => {
    // Combine all selected products and their sub-templates
    const combinedItems = [];
    
    selectedProducts.forEach(product => {
      const template = productTypeTemplates[product.productType];
      if (template?.items) {
        // Add product type items under the custom name
        combinedItems.push({
          type: 'product_header',
          productName: product.customName,
          productType: product.productType,
          items: template.items.map(item => ({
            ...item,
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
          }))
        });
      }
      
      // Add selected sub-templates for this product
      product.subTemplates.forEach(stId => {
        const subTemplate = subTemplates.find(st => st.id === stId);
        const stItems = subTemplateItems[stId];
        if (subTemplate && stItems?.items) {
          combinedItems.push({
            type: 'sub_template',
            parentProduct: product.customName,
            subTemplateName: subTemplate.name,
            items: stItems.items.map(item => ({
              ...item,
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }))
          });
        }
      });
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

  const startEditingSubTemplate = (subTemplate) => {
    setEditingSubTemplateId(subTemplate.id);
    setEditingSubTemplateName(subTemplate.name);
  };

  const saveSubTemplateName = async () => {
    if (!editingSubTemplateName.trim()) return;
    try {
      await ChecklistSubItem.update(editingSubTemplateId, { name: editingSubTemplateName.trim() });
      await loadData();
      setEditingSubTemplateId(null);
      setEditingSubTemplateName("");
    } catch (error) {
      console.error("Error updating sub-template:", error);
    }
  };

  const cancelEditingSubTemplate = () => {
    setEditingSubTemplateId(null);
    setEditingSubTemplateName("");
  };

  const deleteSubTemplate = async () => {
    if (!deleteConfirm) return;
    const idToDelete = deleteConfirm.id;
    setDeleteConfirm(null);
    
    try {
      await ChecklistSubItem.delete(idToDelete);
      // Also delete associated items
      const updated = { ...subTemplateItems };
      delete updated[idToDelete];
      await saveSubTemplateItems(updated);
      
      if (selectedSubTemplate === idToDelete) {
        setSelectedSubTemplate(null);
        setSubTemplateChecklistItems([]);
      }
      await loadData();
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

  // Sub-template checklist editor
  const selectSubTemplateForEditing = (subTemplate) => {
    setSelectedSubTemplate(subTemplate.id);
    setSubTemplateChecklistItems(subTemplateItems[subTemplate.id]?.items || []);
  };

  const saveSubTemplateChecklist = () => {
    const updated = {
      ...subTemplateItems,
      [selectedSubTemplate]: { items: subTemplateChecklistItems }
    };
    saveSubTemplateItems(updated);
  };

  const addSubTemplateChecklistItem = (type) => {
    if (!newItemText.trim()) return;
    setSubTemplateChecklistItems([...subTemplateChecklistItems, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      type: type,
      custom_dropdown_key: ""
    }]);
    setNewItemText("");
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
      [selectedProductType]: { items: productTypeItems }
    };
    saveProductTypeTemplates(updated);
  };

  const addChecklistItem = (type = 'checklist') => {
    if (!newItemText.trim()) return;
    setProductTypeItems([...productTypeItems, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      type: type,
      custom_dropdown_key: ""
    }]);
    setNewItemText("");
  };

  const updateItem = (id, updates, isSubTemplate = false) => {
    if (isSubTemplate) {
      setSubTemplateChecklistItems(subTemplateChecklistItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
    } else {
      setProductTypeItems(productTypeItems.map(item => 
        item.id === id ? { ...item, ...updates } : item
      ));
    }
  };

  const deleteItem = (id, isSubTemplate = false) => {
    if (isSubTemplate) {
      setSubTemplateChecklistItems(subTemplateChecklistItems.filter(item => item.id !== id));
    } else {
      setProductTypeItems(productTypeItems.filter(item => item.id !== id));
    }
  };

  const moveItem = (index, direction, isSubTemplate = false) => {
    const items = isSubTemplate ? [...subTemplateChecklistItems] : [...productTypeItems];
    if (direction === 'up' && index > 0) {
      [items[index], items[index - 1]] = [items[index - 1], items[index]];
    } else if (direction === 'down' && index < items.length - 1) {
      [items[index], items[index + 1]] = [items[index + 1], items[index]];
    }
    if (isSubTemplate) {
      setSubTemplateChecklistItems(items);
    } else {
      setProductTypeItems(items);
    }
  };

  const toggleItemExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  if (!isOpen) return null;

  // Render checklist item editor (shared between product types and sub-templates)
  const renderItemEditor = (items, isSubTemplate = false) => (
    <div className="space-y-2 max-h-[45vh] overflow-y-auto">
      {items.map((item, index) => (
        <div key={item.id} className={`border rounded-lg p-3 bg-white ${item.type === 'task' ? 'border-l-4 border-l-orange-400' : ''}`}>
          <div className="flex items-start gap-2">
            <div className="flex flex-col">
              <button onClick={() => moveItem(index, 'up', isSubTemplate)} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button onClick={() => moveItem(index, 'down', isSubTemplate)} disabled={index === items.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
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
                    onChange={(e) => updateItem(item.id, { text: e.target.value }, isSubTemplate)}
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
                    Dropdown: {item.custom_dropdown_key || 'none'}
                  </button>

                  {expandedItems[item.id] && (
                    <div className="ml-4 space-y-2 pt-2 border-t">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs">Dropdown Key:</Label>
                        <Input
                          value={item.custom_dropdown_key || ""}
                          onChange={(e) => updateItem(item.id, { custom_dropdown_key: e.target.value }, isSubTemplate)}
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
                    </div>
                  )}
                </>
              )}
            </div>

            <button onClick={() => deleteItem(item.id, isSubTemplate)} className="p-1">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No items yet. Add checklist items or tasks above.</p>
        </div>
      )}
    </div>
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
              <div className="grid grid-cols-2 gap-4">
                {/* Left: Add Product Types */}
                <div className="space-y-3">
                  <h3 className="font-bold text-sm">Add Product Types</h3>
                  <p className="text-xs text-gray-500">Click to add a product type. You can add multiple of the same type.</p>
                  
                  <div className="space-y-1 max-h-[50vh] overflow-y-auto">
                    {productTypes.map(type => {
                      const hasTemplate = productTypeTemplates[type]?.items?.length > 0;
                      return (
                        <div
                          key={type}
                          onClick={() => hasTemplate && addProductToSelection(type)}
                          className={`p-2 rounded-lg border transition-colors flex items-center justify-between ${
                            hasTemplate 
                              ? 'bg-white hover:bg-blue-50 border-gray-200 cursor-pointer' 
                              : 'bg-gray-100 border-gray-200 opacity-50 cursor-not-allowed'
                          }`}
                        >
                          <div>
                            <div className="font-medium text-sm">{type}</div>
                            <div className="text-xs text-gray-500">
                              {hasTemplate ? `${productTypeTemplates[type].items.length} items` : 'No template configured'}
                            </div>
                          </div>
                          {hasTemplate && <Plus className="w-4 h-4 text-blue-500" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Selected Products with Sub-template options */}
                <div className="space-y-3">
                  <h3 className="font-bold text-sm">Selected Products ({selectedProducts.length})</h3>
                  
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 border rounded-lg bg-gray-50">
                      <p>No products selected.</p>
                      <p className="text-xs mt-1">Click a product type on the left to add it.</p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                      {selectedProducts.map(product => (
                        <div key={product.id} className="border rounded-lg p-3 bg-white">
                          <div className="flex items-center gap-2 mb-2">
                            <Input
                              value={product.customName}
                              onChange={(e) => updateProductName(product.id, e.target.value)}
                              className="h-8 font-medium flex-1"
                              placeholder="Product name..."
                            />
                            <button onClick={() => removeProductFromSelection(product.id)} className="p-1">
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">Type: {product.productType}</div>
                          
                          {/* Sub-template checkboxes */}
                          {subTemplates.length > 0 && (
                            <div className="border-t pt-2 mt-2">
                              <Label className="text-xs font-medium block mb-1">Apply Sub-Templates:</Label>
                              <div className="flex flex-wrap gap-2">
                                {subTemplates.map(st => {
                                  const hasItems = subTemplateItems[st.id]?.items?.length > 0;
                                  const isSelected = product.subTemplates.includes(st.id);
                                  return (
                                    <div 
                                      key={st.id} 
                                      onClick={() => hasItems && toggleSubTemplateForProduct(product.id, st.id)}
                                      className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border transition-colors ${
                                        !hasItems 
                                          ? 'opacity-50 cursor-not-allowed bg-gray-100' 
                                          : isSelected 
                                            ? 'bg-purple-100 border-purple-400 cursor-pointer' 
                                            : 'bg-white border-gray-300 hover:border-purple-300 cursor-pointer'
                                      }`}
                                    >
                                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                                        isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-400'
                                      }`}>
                                        {isSelected && (
                                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </div>
                                      <span className="font-medium">{st.name}</span>
                                      <span className="text-gray-500">({subTemplateItems[st.id]?.items?.length || 0})</span>
                                    </div>
                                  );
                                })}
                              </div>
                              {subTemplates.length === 0 && (
                                <p className="text-xs text-gray-400">No sub-templates created. Add them in the Sub-Templates tab.</p>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {selectedProducts.length > 0 && (
                    <Button 
                      onClick={handleApplyTemplate}
                      className="w-full bg-purple-600 hover:bg-purple-700"
                    >
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Apply Template to Project
                    </Button>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Sub-Templates Tab */}
            <TabsContent value="subtemplates" className="flex-1 overflow-hidden p-4 grid grid-cols-3 gap-4">
              {/* Sub-template List */}
              <div className="space-y-2 overflow-y-auto">
                <div className="bg-gray-50 border rounded-lg p-3 mb-3">
                  <h3 className="font-bold mb-2 text-sm">Create Sub-Template</h3>
                  <div className="flex gap-2">
                    <Input
                      value={newSubTemplateName}
                      onChange={(e) => setNewSubTemplateName(e.target.value)}
                      placeholder="Name..."
                      className="h-8 text-sm"
                      onKeyDown={(e) => e.key === 'Enter' && createSubTemplate()}
                    />
                    <Button size="sm" className="h-8" onClick={createSubTemplate}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <h3 className="font-bold text-sm">Sub-Templates ({subTemplates.length})</h3>
                {subTemplates.map((st, index) => (
                  <div
                    key={st.id}
                    onClick={() => editingSubTemplateId !== st.id && selectSubTemplateForEditing(st)}
                    className={`p-2 rounded-lg border cursor-pointer transition-colors flex items-center gap-2 ${
                      selectedSubTemplate === st.id 
                        ? 'bg-purple-100 border-purple-300' 
                        : 'bg-white hover:bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex flex-col">
                      <button onClick={(e) => { e.stopPropagation(); moveSubTemplate(index, 'up'); }} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); moveSubTemplate(index, 'down'); }} disabled={index === subTemplates.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>

                    {editingSubTemplateId === st.id ? (
                      <div className="flex-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <Input
                          value={editingSubTemplateName}
                          onChange={(e) => setEditingSubTemplateName(e.target.value)}
                          className="h-7 text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSubTemplateName();
                            if (e.key === 'Escape') cancelEditingSubTemplate();
                          }}
                        />
                        <Button size="sm" className="h-7 px-2" onClick={saveSubTemplateName}>
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={cancelEditingSubTemplate}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="font-medium text-sm">{st.name}</div>
                          <div className="text-xs text-gray-500">
                            {subTemplateItems[st.id]?.items?.length || 0} items
                          </div>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); startEditingSubTemplate(st); }} className="p-1">
                          <Pencil className="w-3 h-3 text-gray-500" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ id: st.id, type: 'subtemplate', name: st.name }); }} className="p-1">
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* Sub-template Checklist Editor */}
              <div className="col-span-2 overflow-y-auto bg-gray-50 border rounded-lg p-4">
                {selectedSubTemplate ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">
                        {subTemplates.find(st => st.id === selectedSubTemplate)?.name} Items
                      </h3>
                      <Button onClick={saveSubTemplateChecklist} size="sm">
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
                            onKeyDown={(e) => e.key === 'Enter' && addSubTemplateChecklistItem('checklist')}
                          />
                          <Button onClick={() => addSubTemplateChecklistItem('checklist')} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Checklist
                          </Button>
                          <Button onClick={() => addSubTemplateChecklistItem('task')} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Task
                          </Button>
                        </div>
                      </div>

                      {renderItemEditor(subTemplateChecklistItems, true)}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select a sub-template to edit its checklist items</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Product Types Tab */}
            <TabsContent value="producttypes" className="flex-1 overflow-hidden p-4 grid grid-cols-3 gap-4">
              {/* Product Type List */}
              <div className="space-y-2 overflow-y-auto">
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

                <h3 className="font-bold text-sm">Product Types ({productTypes.length})</h3>
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
                            onKeyDown={(e) => e.key === 'Enter' && addChecklistItem('checklist')}
                          />
                          <Button onClick={() => addChecklistItem('checklist')} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Checklist
                          </Button>
                          <Button onClick={() => addChecklistItem('task')} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Task
                          </Button>
                        </div>
                      </div>

                      {renderItemEditor(productTypeItems, false)}
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
            <AlertDialogTitle>Delete Sub-Template?</AlertDialogTitle>
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