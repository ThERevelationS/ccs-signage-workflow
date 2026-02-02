import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Save, ArrowUp, ArrowDown, X, ChevronDown, ChevronRight, CheckSquare, List, MoreHorizontal, Copy, Clipboard } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const ChecklistSubItem = base44.entities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

export default function TemplateBuilder({ isOpen, onClose, onApplyTemplate, existingChecklist = [], isAdmin = false }) {
  const [activeTab, setActiveTab] = useState("selectors");
  const [subTemplates, setSubTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  const [subTemplateItems, setSubTemplateItems] = useState({});
  const [dropdownConditions, setDropdownConditions] = useState([]);
  
  // Template Selector state
  const [selectedProducts, setSelectedProducts] = useState([]);
  
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
  const [expandedItems, setExpandedItems] = useState({});
  
  // Dropdown/Conditions Editor
  const [newDropdownName, setNewDropdownName] = useState("");
  const [editingDropdown, setEditingDropdown] = useState(null);
  
  // Other Dropdown Popup
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  
  // Clipboard for copy/paste
  const [clipboard, setClipboard] = useState(null); // { type: 'subtemplate' | 'producttype', data: ... }

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
      
      const ptTemplates = settings.find(s => s.setting_key === 'productTypeTemplates');
      setProductTypeTemplates(ptTemplates?.setting_value || {});
      
      const stItems = settings.find(s => s.setting_key === 'subTemplateItems');
      setSubTemplateItems(stItems?.setting_value || {});
      
      const dropdownsSetting = settings.find(s => s.setting_key === 'dropdownConditions');
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
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

  const saveDropdownConditions = async (items) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'dropdownConditions' });
      if (settings.length > 0) {
        await GlobalSettings.update(settings[0].id, { setting_value: { items } });
      } else {
        await GlobalSettings.create({ setting_key: 'dropdownConditions', setting_value: { items } });
      }
      setDropdownConditions(items);
    } catch (error) {
      console.error("Error saving dropdown conditions:", error);
    }
  };

  // Get existing product names from checklist to prevent duplicates
  const getExistingProductNames = () => {
    const names = new Set();
    existingChecklist.forEach(item => {
      if (item.product_name) names.add(item.product_name);
    });
    return names;
  };

  const addProductToSelection = (productType) => {
    const existingNames = getExistingProductNames();
    const selectedNames = new Set(selectedProducts.map(p => p.customName));
    const allNames = new Set([...existingNames, ...selectedNames]);
    
    let customName = productType;
    let counter = 1;
    while (allNames.has(customName)) {
      counter++;
      customName = `${productType} ${counter}`;
    }
    
    setSelectedProducts([...selectedProducts, {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      productType,
      customName,
      subTemplates: []
    }]);
  };

  const updateProductName = (productId, newName) => {
    const existingNames = getExistingProductNames();
    const otherSelectedNames = selectedProducts.filter(p => p.id !== productId).map(p => p.customName);
    
    if (existingNames.has(newName) || otherSelectedNames.includes(newName)) {
      alert("A product with this name already exists. Please choose a unique name.");
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
    if (selectedProducts.length === 0) {
      alert("Please select at least one product template to apply.");
      return;
    }
    
    const combinedItems = [];
    
    selectedProducts.forEach(product => {
      const template = productTypeTemplates[product.productType];
      if (template?.items) {
        combinedItems.push({
          type: 'product_header',
          productName: product.customName,
          productType: product.productType,
          items: template.items.map(item => ({
            ...item,
            id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            details: item.details?.map(d => ({
              ...d,
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              tasks: d.tasks?.map(t => ({
                ...t,
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              }))
            })),
            tasks: item.tasks?.map(t => ({
              ...t,
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }))
          }))
        });
      }
      
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
              id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              details: item.details?.map(d => ({
                ...d,
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                tasks: d.tasks?.map(t => ({
                  ...t,
                  id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
                }))
              })),
              tasks: item.tasks?.map(t => ({
                ...t,
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
              }))
            }))
          });
        }
      });
    });
    
    if (onApplyTemplate && combinedItems.length > 0) {
      onApplyTemplate(combinedItems);
    }
    
    setSelectedProducts([]);
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

  // Duplicate Sub-Template
  const duplicateSubTemplate = async (subTemplate) => {
    try {
      const newName = `${subTemplate.name} (Copy)`;
      const newSubTemplate = await ChecklistSubItem.create({
        name: newName,
        applies_to_product_types: subTemplate.applies_to_product_types || [],
        order: subTemplates.length
      });
      
      // Copy the items too
      const originalItems = subTemplateItems[subTemplate.id]?.items || [];
      if (originalItems.length > 0) {
        const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({
          ...item,
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
        }));
        const updated = {
          ...subTemplateItems,
          [newSubTemplate.id]: { items: copiedItems }
        };
        await saveSubTemplateItems(updated);
      }
      
      await loadData();
    } catch (error) {
      console.error("Error duplicating sub-template:", error);
    }
  };

  // Copy Sub-Template to clipboard
  const copySubTemplateToClipboard = (subTemplate) => {
    const items = subTemplateItems[subTemplate.id]?.items || [];
    setClipboard({
      type: 'subtemplate',
      data: {
        name: subTemplate.name,
        items: JSON.parse(JSON.stringify(items))
      }
    });
  };

  // Paste from clipboard to Sub-Template
  const pasteToSubTemplate = async () => {
    if (!clipboard || clipboard.type !== 'subtemplate' || !selectedSubTemplate) return;
    
    const existingItems = subTemplateChecklistItems;
    const pastedItems = clipboard.data.items.map(item => ({
      ...item,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }));
    
    const mergedItems = [...existingItems, ...pastedItems];
    setSubTemplateChecklistItems(mergedItems);
    
    const updated = {
      ...subTemplateItems,
      [selectedSubTemplate]: { items: mergedItems }
    };
    await saveSubTemplateItems(updated);
  };

  // Duplicate Main Product Template
  const duplicateProductTypeTemplate = async (productType) => {
    const newTypeName = `${productType} (Copy)`;
    const newTypes = [...productTypes, newTypeName];
    await saveProductTypes(newTypes);
    
    // Copy the template items
    const originalItems = productTypeTemplates[productType]?.items || [];
    if (originalItems.length > 0) {
      const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({
        ...item,
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
      }));
      const updated = {
        ...productTypeTemplates,
        [newTypeName]: { items: copiedItems }
      };
      await saveProductTypeTemplates(updated);
    }
  };

  // Copy Product Type Template to clipboard
  const copyProductTypeToClipboard = (productType) => {
    const items = productTypeTemplates[productType]?.items || [];
    setClipboard({
      type: 'producttype',
      data: {
        name: productType,
        items: JSON.parse(JSON.stringify(items))
      }
    });
  };

  // Paste from clipboard to Product Type
  const pasteToProductType = async () => {
    if (!clipboard || clipboard.type !== 'producttype' || !selectedProductType) return;
    
    const existingItems = productTypeItems;
    const pastedItems = clipboard.data.items.map(item => ({
      ...item,
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9)
    }));
    
    const mergedItems = [...existingItems, ...pastedItems];
    setProductTypeItems(mergedItems);
    
    const updated = {
      ...productTypeTemplates,
      [selectedProductType]: { items: mergedItems }
    };
    await saveProductTypeTemplates(updated);
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

  // Hierarchical item management
  const addChecklistItem = (items, setItems) => {
    if (!newItemText.trim()) return;
    setItems([...items, {
      id: Date.now().toString(),
      text: newItemText.trim(),
      type: 'checklist',
      dropdown_id: "",
      details: [],
      tasks: []
    }]);
    setNewItemText("");
  };

  const addDetailItem = (items, setItems, parentId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => {
      if (item.id === parentId) {
        return {
          ...item,
          details: [...(item.details || []), {
            id: Date.now().toString(),
            text: text.trim(),
            type: 'detail',
            dropdown_id: "",
            tasks: []
          }]
        };
      }
      return item;
    }));
  };

  const addTask = (items, setItems, parentId, detailId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => {
      if (item.id === parentId) {
        if (detailId) {
          return {
            ...item,
            details: item.details.map(d => {
              if (d.id === detailId) {
                return {
                  ...d,
                  tasks: [...(d.tasks || []), {
                    id: Date.now().toString(),
                    text: text.trim(),
                    type: 'task'
                  }]
                };
              }
              return d;
            })
          };
        } else {
          return {
            ...item,
            tasks: [...(item.tasks || []), {
              id: Date.now().toString(),
              text: text.trim(),
              type: 'task'
            }]
          };
        }
      }
      return item;
    }));
  };

  const updateItem = (items, setItems, id, updates, detailId = null, taskId = null) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (detailId) {
          return {
            ...item,
            details: item.details.map(d => {
              if (d.id === detailId) {
                if (taskId) {
                  return {
                    ...d,
                    tasks: d.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
                  };
                }
                return { ...d, ...updates };
              }
              return d;
            })
          };
        }
        if (taskId) {
          return {
            ...item,
            tasks: item.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t)
          };
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const deleteItem = (items, setItems, id, detailId = null, taskId = null) => {
    if (taskId) {
      setItems(items.map(item => {
        if (item.id === id) {
          if (detailId) {
            return {
              ...item,
              details: item.details.map(d => {
                if (d.id === detailId) {
                  return { ...d, tasks: d.tasks.filter(t => t.id !== taskId) };
                }
                return d;
              })
            };
          }
          return { ...item, tasks: item.tasks.filter(t => t.id !== taskId) };
        }
        return item;
      }));
    } else if (detailId) {
      setItems(items.map(item => {
        if (item.id === id) {
          return { ...item, details: item.details.filter(d => d.id !== detailId) };
        }
        return item;
      }));
    } else {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const moveItem = (items, setItems, index, direction) => {
    const newItems = [...items];
    if (direction === 'up' && index > 0) {
      [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
    } else if (direction === 'down' && index < items.length - 1) {
      [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
    }
    setItems(newItems);
  };

  const toggleItemExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  // Handle Other dropdown selection
  const handleOtherDropdownSelect = (items, setItems, itemId, detailId, selectedDropdownId) => {
    if (detailId) {
      updateItem(items, setItems, itemId, { dropdown_id: selectedDropdownId }, detailId);
    } else {
      updateItem(items, setItems, itemId, { dropdown_id: selectedDropdownId });
    }
    setShowOtherPopup(null);
  };

  const handleCreateCustomDropdown = () => {
    if (!customDropdownValue.trim()) return;
    const newDropdown = {
      id: Date.now().toString(),
      name: customDropdownValue.trim()
    };
    const updated = [...dropdownConditions, newDropdown];
    saveDropdownConditions(updated);
    
    if (showOtherPopup) {
      const { items, setItems, itemId, detailId } = showOtherPopup;
      handleOtherDropdownSelect(items, setItems, itemId, detailId, newDropdown.id);
    }
    setCustomDropdownValue("");
  };

  if (!isOpen) return null;

  // Dropdown select with Other option
  const renderDropdownSelect = (item, items, setItems, detailId = null) => {
    const itemDropdownId = detailId 
      ? items.find(i => i.id === item.id)?.details?.find(d => d.id === detailId)?.dropdown_id
      : item.dropdown_id;
    
    const selectedDropdown = dropdownConditions.find(d => d.id === itemDropdownId);
    
    return (
      <div className="flex items-center gap-1">
        <Select
          value={itemDropdownId || "none"}
          onValueChange={(val) => {
            if (val === "other") {
              setShowOtherPopup({ items, setItems, itemId: item.id, detailId });
            } else if (val === "none") {
              if (detailId) {
                updateItem(items, setItems, item.id, { dropdown_id: "" }, detailId);
              } else {
                updateItem(items, setItems, item.id, { dropdown_id: "" });
              }
            } else {
              if (detailId) {
                updateItem(items, setItems, item.id, { dropdown_id: val }, detailId);
              } else {
                updateItem(items, setItems, item.id, { dropdown_id: val });
              }
            }
          }}
        >
          <SelectTrigger className="h-7 text-xs w-36">
            <SelectValue placeholder="Dropdown...">
              {selectedDropdown?.name || "None"}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            {dropdownConditions.map(dd => (
              <SelectItem key={dd.id} value={dd.id}>{dd.name}</SelectItem>
            ))}
            <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  };

  // Render hierarchical item editor
  const renderItemEditor = (items, setItems) => (
    <div className="space-y-2 max-h-[45vh] overflow-y-auto">
      {items.map((item, index) => (
        <div key={item.id} className="border rounded-lg p-3 bg-white">
          {/* Main Checklist Item */}
          <div className="flex items-start gap-2">
            <div className="flex flex-col">
              <button onClick={() => moveItem(items, setItems, index, 'up')} disabled={index === 0} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <ArrowUp className="w-3 h-3" />
              </button>
              <button onClick={() => moveItem(items, setItems, index, 'down')} disabled={index === items.length - 1} className="text-gray-400 hover:text-gray-600 disabled:opacity-30">
                <ArrowDown className="w-3 h-3" />
              </button>
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                {editingItem === item.id ? (
                  <Input
                    value={item.text}
                    onChange={(e) => updateItem(items, setItems, item.id, { text: e.target.value })}
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

              <div className="flex items-center gap-2 text-xs">
                <button 
                  onClick={() => toggleItemExpanded(item.id)}
                  className="flex items-center gap-1 text-gray-500 hover:text-gray-700"
                >
                  {expandedItems[item.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  Details ({item.details?.length || 0}) | Tasks ({item.tasks?.length || 0})
                </button>
                {renderDropdownSelect(item, items, setItems)}
              </div>

              {/* Expanded Content */}
              {expandedItems[item.id] && (
                <div className="ml-4 mt-2 space-y-3 border-l-2 border-gray-200 pl-3">
                  {/* Tasks under main item */}
                  {item.tasks?.map((task, tIdx) => (
                    <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                      <span className="text-xs px-1.5 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                      {editingItem === task.id ? (
                        <Input
                          value={task.text}
                          onChange={(e) => updateItem(items, setItems, item.id, { text: e.target.value }, null, task.id)}
                          onBlur={() => setEditingItem(null)}
                          onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                          autoFocus
                          className="h-6 text-xs flex-1"
                        />
                      ) : (
                        <>
                          <span className="flex-1 text-sm">{task.text}</span>
                          <button onClick={() => setEditingItem(task.id)} className="p-1"><Pencil className="w-3 h-3 text-gray-400" /></button>
                        </>
                      )}
                      <button onClick={() => deleteItem(items, setItems, item.id, null, task.id)} className="p-1">
                        <Trash2 className="w-3 h-3 text-red-500" />
                      </button>
                    </div>
                  ))}
                  
                  {/* Add Task to main item */}
                  <div className="flex gap-1">
                    <Input
                      placeholder="Add task..."
                      className="h-6 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          addTask(items, setItems, item.id, null, e.target.value);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-orange-600" onClick={(e) => {
                      const input = e.target.closest('.flex').querySelector('input');
                      if (input.value.trim()) {
                        addTask(items, setItems, item.id, null, input.value);
                        input.value = "";
                      }
                    }}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>

                  {/* Detail Items */}
                  {item.details?.map((detail, dIdx) => (
                    <div key={detail.id} className="bg-gray-50 p-2 rounded border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                        {editingItem === detail.id ? (
                          <Input
                            value={detail.text}
                            onChange={(e) => updateItem(items, setItems, item.id, { text: e.target.value }, detail.id)}
                            onBlur={() => setEditingItem(null)}
                            onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                            autoFocus
                            className="h-6 text-xs flex-1"
                          />
                        ) : (
                          <>
                            <span className="flex-1 text-sm">{detail.text}</span>
                            <button onClick={() => setEditingItem(detail.id)} className="p-1"><Pencil className="w-3 h-3 text-gray-400" /></button>
                          </>
                        )}
                        {renderDropdownSelect(item, items, setItems, detail.id)}
                        <button onClick={() => deleteItem(items, setItems, item.id, detail.id)} className="p-1">
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                      
                      {/* Tasks under detail */}
                      <div className="ml-4 mt-2 space-y-1 border-l-2 border-orange-200 pl-2">
                        {detail.tasks?.map((task) => (
                          <div key={task.id} className="flex items-center gap-2 bg-orange-50 p-1.5 rounded">
                            <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                            {editingItem === task.id ? (
                              <Input
                                value={task.text}
                                onChange={(e) => updateItem(items, setItems, item.id, { text: e.target.value }, detail.id, task.id)}
                                onBlur={() => setEditingItem(null)}
                                onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                                autoFocus
                                className="h-5 text-xs flex-1"
                              />
                            ) : (
                              <>
                                <span className="flex-1 text-xs">{task.text}</span>
                                <button onClick={() => setEditingItem(task.id)} className="p-0.5"><Pencil className="w-2.5 h-2.5 text-gray-400" /></button>
                              </>
                            )}
                            <button onClick={() => deleteItem(items, setItems, item.id, detail.id, task.id)} className="p-0.5">
                              <Trash2 className="w-2.5 h-2.5 text-red-500" />
                            </button>
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <Input
                            placeholder="Add task..."
                            className="h-5 text-xs flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && e.target.value.trim()) {
                                addTask(items, setItems, item.id, detail.id, e.target.value);
                                e.target.value = "";
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add Detail Item */}
                  <div className="flex gap-1">
                    <Input
                      placeholder="Add detail item..."
                      className="h-6 text-xs flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          addDetailItem(items, setItems, item.id, e.target.value);
                          e.target.value = "";
                        }
                      }}
                    />
                    <Button size="sm" variant="ghost" className="h-6 px-2 text-purple-600" onClick={(e) => {
                      const input = e.target.closest('.flex').querySelector('input');
                      if (input.value.trim()) {
                        addDetailItem(items, setItems, item.id, input.value);
                        input.value = "";
                      }
                    }}>
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <button onClick={() => deleteItem(items, setItems, item.id)} className="p-1">
              <Trash2 className="w-4 h-4 text-red-500" />
            </button>
          </div>
        </div>
      ))}

      {items.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>No items yet. Add checklist items above.</p>
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
              <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-1'} bg-gray-200 p-1`}>
                <TabsTrigger value="selectors" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Template Selectors</TabsTrigger>
                {isAdmin && (
                  <>
                    <TabsTrigger value="producttypes" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Main Product Templates</TabsTrigger>
                    <TabsTrigger value="subtemplates" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Sub-Templates</TabsTrigger>
                    <TabsTrigger value="dropdowns" className="data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow font-medium">Dropdowns/Conditions</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            {/* Template Selectors Tab */}
            <TabsContent value="selectors" className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <h3 className="font-bold text-sm">Add Main Product Templates</h3>
                  <p className="text-xs text-gray-500">Click to add a product type. You can add multiple of the same type with unique names.</p>
                  
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

                <div className="space-y-3">
                  <h3 className="font-bold text-sm">Selected Products ({selectedProducts.length})</h3>
                  {existingChecklist.length > 0 && (
                    <p className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                      ✓ Project has {getExistingProductNames().size} existing products. New templates will be added.
                    </p>
                  )}
                  
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
                        <button onClick={(e) => { e.stopPropagation(); duplicateSubTemplate(st); }} className="p-1" title="Duplicate">
                          <Copy className="w-3 h-3 text-blue-500" />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); copySubTemplateToClipboard(st); }} className="p-1" title="Copy to clipboard">
                          <Clipboard className="w-3 h-3 text-green-500" />
                        </button>
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

              <div className="col-span-2 overflow-y-auto bg-gray-50 border rounded-lg p-4">
                {selectedSubTemplate ? (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-lg">
                        {subTemplates.find(st => st.id === selectedSubTemplate)?.name} Items
                      </h3>
                      <div className="flex gap-2">
                        {clipboard?.type === 'subtemplate' && (
                          <Button onClick={pasteToSubTemplate} size="sm" variant="outline" className="text-green-600">
                            <Clipboard className="w-4 h-4 mr-1" />
                            Paste
                          </Button>
                        )}
                        <Button onClick={saveSubTemplateChecklist} size="sm">
                          <Save className="w-4 h-4 mr-1" />
                          Save
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-medium">Add Checklist Item</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={newItemText}
                            onChange={(e) => setNewItemText(e.target.value)}
                            placeholder="Item text..."
                            className="flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems)}
                          />
                          <Button onClick={() => addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems)} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>

                      {renderItemEditor(subTemplateChecklistItems, setSubTemplateChecklistItems)}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select a sub-template to edit its checklist items</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Main Product Templates Tab */}
            <TabsContent value="producttypes" className="flex-1 overflow-hidden p-4 grid grid-cols-3 gap-4">
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

                <h3 className="font-bold text-sm">Main Product Templates ({productTypes.length})</h3>
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
                      <button onClick={(e) => { e.stopPropagation(); duplicateProductTypeTemplate(type); }} className="p-1" title="Duplicate">
                        <Copy className="w-3 h-3 text-blue-500" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); copyProductTypeToClipboard(type); }} className="p-1" title="Copy to clipboard">
                        <Clipboard className="w-3 h-3 text-green-500" />
                      </button>
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
                        <Label className="text-sm font-medium">Add Checklist Item</Label>
                        <div className="flex gap-2 mt-1">
                          <Input
                            value={newItemText}
                            onChange={(e) => setNewItemText(e.target.value)}
                            placeholder="Item text..."
                            className="flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(productTypeItems, setProductTypeItems)}
                          />
                          <Button onClick={() => addChecklistItem(productTypeItems, setProductTypeItems)} size="sm" variant="outline">
                            <Plus className="w-3 h-3 mr-1" />
                            Add
                          </Button>
                        </div>
                      </div>

                      {renderItemEditor(productTypeItems, setProductTypeItems)}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select a product type to edit its template</p>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Dropdowns/Conditions Tab */}
            <TabsContent value="dropdowns" className="flex-1 overflow-y-auto p-4">
              <div className="max-w-2xl mx-auto">
                <div className="bg-gray-50 border rounded-lg p-4 mb-4">
                  <h3 className="font-bold mb-2">Create Dropdown/Condition</h3>
                  <p className="text-xs text-gray-500 mb-3">These dropdowns can be assigned to checklist items and detail items in templates.</p>
                  <div className="flex gap-2">
                    <Input
                      value={newDropdownName}
                      onChange={(e) => setNewDropdownName(e.target.value)}
                      placeholder="Dropdown name (e.g., Fabrication Status, Design Approval)..."
                      className="flex-1"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newDropdownName.trim()) {
                          const newItem = { id: Date.now().toString(), name: newDropdownName.trim() };
                          saveDropdownConditions([...dropdownConditions, newItem]);
                          setNewDropdownName("");
                        }
                      }}
                    />
                    <Button onClick={() => {
                      if (newDropdownName.trim()) {
                        const newItem = { id: Date.now().toString(), name: newDropdownName.trim() };
                        saveDropdownConditions([...dropdownConditions, newItem]);
                        setNewDropdownName("");
                      }
                    }}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>

                <h3 className="font-bold text-sm mb-3">Dropdowns/Conditions ({dropdownConditions.length})</h3>
                
                {dropdownConditions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500 border rounded-lg bg-gray-50">
                    <List className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                    <p>No dropdowns created yet.</p>
                    <p className="text-xs mt-1">Add dropdowns above to use them in templates.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {dropdownConditions.map((dd, index) => (
                      <div key={dd.id} className="flex items-center gap-2 p-3 border rounded-lg bg-white">
                        <div className="flex flex-col">
                          <button 
                            onClick={() => {
                              if (index > 0) {
                                const newItems = [...dropdownConditions];
                                [newItems[index], newItems[index - 1]] = [newItems[index - 1], newItems[index]];
                                saveDropdownConditions(newItems);
                              }
                            }} 
                            disabled={index === 0} 
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button 
                            onClick={() => {
                              if (index < dropdownConditions.length - 1) {
                                const newItems = [...dropdownConditions];
                                [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
                                saveDropdownConditions(newItems);
                              }
                            }} 
                            disabled={index === dropdownConditions.length - 1} 
                            className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                        </div>
                        
                        {editingDropdown === dd.id ? (
                          <div className="flex-1 flex gap-2">
                            <Input
                              defaultValue={dd.name}
                              className="flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  const newName = e.target.value.trim();
                                  if (newName) {
                                    saveDropdownConditions(dropdownConditions.map(d => 
                                      d.id === dd.id ? { ...d, name: newName } : d
                                    ));
                                  }
                                  setEditingDropdown(null);
                                }
                                if (e.key === 'Escape') setEditingDropdown(null);
                              }}
                              onBlur={(e) => {
                                const newName = e.target.value.trim();
                                if (newName) {
                                  saveDropdownConditions(dropdownConditions.map(d => 
                                    d.id === dd.id ? { ...d, name: newName } : d
                                  ));
                                }
                                setEditingDropdown(null);
                              }}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex-1">
                              <span className="font-medium">{dd.name}</span>
                            </div>
                            <button onClick={() => setEditingDropdown(dd.id)} className="p-1.5 hover:bg-gray-100 rounded">
                              <Pencil className="w-4 h-4 text-gray-500" />
                            </button>
                          </>
                        )}
                        
                        <button 
                          onClick={() => {
                            if (confirm(`Delete "${dd.name}"?`)) {
                              saveDropdownConditions(dropdownConditions.filter(d => d.id !== dd.id));
                            }
                          }} 
                          className="p-1.5 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    ))}
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

      {/* Other Dropdown Popup */}
      <Dialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select or Create Dropdown</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-medium mb-2 block">All Available Dropdowns</Label>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                {dropdownConditions.length === 0 ? (
                  <div className="p-4 text-center text-gray-500 text-sm">
                    No dropdowns created yet.
                  </div>
                ) : (
                  dropdownConditions.map(dd => (
                    <div
                      key={dd.id}
                      onClick={() => {
                        if (showOtherPopup) {
                          handleOtherDropdownSelect(
                            showOtherPopup.items, 
                            showOtherPopup.setItems, 
                            showOtherPopup.itemId, 
                            showOtherPopup.detailId,
                            dd.id
                          );
                        }
                      }}
                      className="p-3 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2"
                    >
                      <List className="w-4 h-4 text-purple-500" />
                      <span>{dd.name}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Or Create Custom Dropdown</Label>
              <div className="flex gap-2">
                <Input
                  value={customDropdownValue}
                  onChange={(e) => setCustomDropdownValue(e.target.value)}
                  placeholder="New dropdown name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomDropdown()}
                />
                <Button onClick={handleCreateCustomDropdown} disabled={!customDropdownValue.trim()}>
                  <Plus className="w-4 h-4 mr-1" />
                  Create
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowOtherPopup(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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