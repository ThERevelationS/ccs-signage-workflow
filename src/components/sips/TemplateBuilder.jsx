import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { 
  Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronRight, CheckSquare, 
  List, Copy, Clipboard, GripVertical, Eye, EyeOff, Check
} from "lucide-react";

const ChecklistSubItem = base44.entities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

export default function TemplateBuilder({ isOpen, onClose, onApplyTemplate, existingChecklist = [], isAdmin = false, workOrderProducts = [] }) {
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
  const [editingProductTypeName, setEditingProductTypeName] = useState(null);
  const [editingProductTypeValue, setEditingProductTypeValue] = useState("");
  
  // Conditions Editor
  const [newDropdownName, setNewDropdownName] = useState("");
  const [editingDropdown, setEditingDropdown] = useState(null);
  
  // Other Dropdown Popup
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  
  // Preview mode
  const [showPreview, setShowPreview] = useState(false);
  
  // Clipboard
  const [clipboard, setClipboard] = useState(null);
  
  // Multi-select dropdown state
  const [openDropdownId, setOpenDropdownId] = useState(null);
  
  // Track changes and save state for Product Templates and Sub-Templates
  const [productTypeHasChanges, setProductTypeHasChanges] = useState(false);
  const [productTypeSaveStatus, setProductTypeSaveStatus] = useState('idle'); // 'idle' | 'saved'
  const [subTemplateHasChanges, setSubTemplateHasChanges] = useState(false);
  const [subTemplateSaveStatus, setSubTemplateSaveStatus] = useState('idle'); // 'idle' | 'saved'

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const loadData = async () => {
    try {
      const [subTemplatesData, settings] = await Promise.all([
        ChecklistSubItem.list(),
        GlobalSettings.list()
      ]);
      
      setSubTemplates(subTemplatesData.sort((a, b) => (a.order || 0) - (b.order || 0)));
      
      const productTypesSetting = settings.find(s => s.setting_key === 'productTypes');
      setProductTypes(productTypesSetting?.setting_value?.items || ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
      
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
      if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: { items: types } });
      else await GlobalSettings.create({ setting_key: 'productTypes', setting_value: { items: types } });
      setProductTypes(types);
    } catch (error) { console.error("Error saving product types:", error); }
  };

  const saveProductTypeTemplates = async (templates) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'productTypeTemplates' });
      if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: templates });
      else await GlobalSettings.create({ setting_key: 'productTypeTemplates', setting_value: templates });
      setProductTypeTemplates(templates);
    } catch (error) { console.error("Error saving product type templates:", error); }
  };

  const saveSubTemplateItems = async (items) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'subTemplateItems' });
      if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: items });
      else await GlobalSettings.create({ setting_key: 'subTemplateItems', setting_value: items });
      setSubTemplateItems(items);
    } catch (error) { console.error("Error saving sub-template items:", error); }
  };

  const saveDropdownConditions = async (items) => {
    try {
      const settings = await GlobalSettings.filter({ setting_key: 'dropdownConditions' });
      if (settings.length > 0) await GlobalSettings.update(settings[0].id, { setting_value: { items } });
      else await GlobalSettings.create({ setting_key: 'dropdownConditions', setting_value: { items } });
      setDropdownConditions(items);
    } catch (error) { console.error("Error saving dropdown conditions:", error); }
  };

  // Template Selection
  const getExistingProductNames = () => {
    const names = new Set();
    existingChecklist.forEach(item => { if (item.product_name) names.add(item.product_name); });
    return names;
  };

  const addProductToSelection = (productType) => {
    const existingNames = getExistingProductNames();
    const selectedNames = new Set(selectedProducts.map(p => p.customName));
    const allNames = new Set([...existingNames, ...selectedNames]);
    
    let customName = productType;
    let counter = 1;
    while (allNames.has(customName)) { counter++; customName = `${productType} ${counter}`; }
    
    setSelectedProducts([...selectedProducts, {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      productType, customName, subTemplates: []
    }]);
  };

  const updateProductName = (productId, newName) => {
    const existingNames = getExistingProductNames();
    const otherSelectedNames = selectedProducts.filter(p => p.id !== productId).map(p => p.customName);
    if (existingNames.has(newName) || otherSelectedNames.includes(newName)) {
      alert("A product with this name already exists.");
      return false;
    }
    setSelectedProducts(selectedProducts.map(p => p.id === productId ? { ...p, customName: newName } : p));
    return true;
  };

  const toggleSubTemplateForProduct = (productId, subTemplateId) => {
    setSelectedProducts(selectedProducts.map(p => {
      if (p.id === productId) {
        const hasIt = p.subTemplates.includes(subTemplateId);
        return { ...p, subTemplates: hasIt ? p.subTemplates.filter(id => id !== subTemplateId) : [...p.subTemplates, subTemplateId] };
      }
      return p;
    }));
  };

  const handleApplyTemplate = () => {
    if (selectedProducts.length === 0) { alert("Please select at least one product template."); return; }
    
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
            details: item.details?.map(d => ({ ...d, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, tasks: d.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) })),
            tasks: item.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }))
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
              details: item.details?.map(d => ({ ...d, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, tasks: d.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) })),
              tasks: item.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }))
            }))
          });
        }
      });
    });
    
    console.log("Applying template with items:", combinedItems.length);
    if (onApplyTemplate && combinedItems.length > 0) {
      onApplyTemplate(combinedItems);
    }
    setSelectedProducts([]);
    // Note: Don't call onClose() here - let the parent handle closing after applying
  };

  // Sub-template Management
  const createSubTemplate = async () => {
    if (!newSubTemplateName.trim()) return;
    try {
      await ChecklistSubItem.create({ name: newSubTemplateName.trim(), applies_to_product_types: [], order: subTemplates.length });
      await loadData();
      setNewSubTemplateName("");
    } catch (error) { console.error("Error creating sub-template:", error); }
  };

  const deleteSubTemplate = async (subTemplate) => {
    if (!confirm(`Delete "${subTemplate.name}"?`)) return;
    if (selectedSubTemplate === subTemplate.id) { setSelectedSubTemplate(null); setSubTemplateChecklistItems([]); }
    try {
      await ChecklistSubItem.delete(subTemplate.id);
      const updated = { ...subTemplateItems };
      delete updated[subTemplate.id];
      await saveSubTemplateItems(updated);
      await loadData();
    } catch (error) { console.error("Error deleting sub-template:", error); }
  };

  const selectSubTemplateForEditing = (subTemplate) => {
    setSelectedSubTemplate(subTemplate.id);
    setSubTemplateChecklistItems(subTemplateItems[subTemplate.id]?.items || []);
    setExpandedItems({});
    setSubTemplateHasChanges(false);
    setSubTemplateSaveStatus('idle');
  };

  const saveSubTemplateChecklist = async () => {
    await saveSubTemplateItems({ ...subTemplateItems, [selectedSubTemplate]: { items: subTemplateChecklistItems } });
    setSubTemplateHasChanges(false);
    setSubTemplateSaveStatus('saved');
  };

  const duplicateSubTemplate = async (subTemplate) => {
    try {
      const newSubTemplate = await ChecklistSubItem.create({ name: `${subTemplate.name} (Copy)`, applies_to_product_types: subTemplate.applies_to_product_types || [], order: subTemplates.length });
      const originalItems = subTemplateItems[subTemplate.id]?.items || [];
      if (originalItems.length > 0) {
        const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }));
        await saveSubTemplateItems({ ...subTemplateItems, [newSubTemplate.id]: { items: copiedItems } });
      }
      await loadData();
    } catch (error) { console.error("Error duplicating sub-template:", error); }
  };

  // Product Type Management
  const selectProductType = (type) => {
    setSelectedProductType(type);
    setProductTypeItems(productTypeTemplates[type]?.items || []);
    setExpandedItems({});
    setProductTypeHasChanges(false);
    setProductTypeSaveStatus('idle');
  };

  const saveProductTypeTemplate = async () => {
    await saveProductTypeTemplates({ ...productTypeTemplates, [selectedProductType]: { items: productTypeItems } });
    setProductTypeHasChanges(false);
    setProductTypeSaveStatus('saved');
  };

  const duplicateProductTypeTemplate = async (productType) => {
    const newTypeName = `${productType} (Copy)`;
    await saveProductTypes([...productTypes, newTypeName]);
    const originalItems = productTypeTemplates[productType]?.items || [];
    if (originalItems.length > 0) {
      const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }));
      await saveProductTypeTemplates({ ...productTypeTemplates, [newTypeName]: { items: copiedItems } });
    }
  };

  // Checklist Item Management
  const addChecklistItem = (items, setItems, isProductType = false) => {
    if (!newItemText.trim()) return;
    setItems([...items, { id: Date.now().toString(), text: newItemText.trim(), type: 'checklist', dropdown_ids: [], details: [], tasks: [] }]);
    setNewItemText("");
    if (isProductType) {
      setProductTypeHasChanges(true);
      setProductTypeSaveStatus('idle');
    } else {
      setSubTemplateHasChanges(true);
      setSubTemplateSaveStatus('idle');
    }
  };

  const addDetailItem = (items, setItems, parentId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => item.id === parentId ? { ...item, details: [...(item.details || []), { id: Date.now().toString(), text: text.trim(), type: 'detail', dropdown_ids: [], tasks: [] }] } : item));
  };

  const addTask = (items, setItems, parentId, detailId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => {
      if (item.id === parentId) {
        if (detailId) return { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: [...(d.tasks || []), { id: Date.now().toString(), text: text.trim(), type: 'task', assigned_to: '', subtasks: [] }] } : d) };
        return { ...item, tasks: [...(item.tasks || []), { id: Date.now().toString(), text: text.trim(), type: 'task', assigned_to: '', subtasks: [] }] };
      }
      return item;
    }));
  };

  const addSubtask = (items, setItems, parentId, detailId, taskId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => {
      if (item.id === parentId) {
        if (detailId) {
          return { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now().toString(), text: text.trim() }] } : t) } : d) };
        } else {
          return { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now().toString(), text: text.trim() }] } : t) };
        }
      }
      return item;
    }));
  };

  const updateItem = (items, setItems, id, updates, detailId = null, taskId = null, subtaskId = null) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (detailId) {
          return { ...item, details: item.details.map(d => d.id === detailId ? (taskId ? { ...d, tasks: d.tasks.map(t => t.id === taskId ? (subtaskId ? { ...t, subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, ...updates } : st) } : { ...t, ...updates }) : t) } : { ...d, ...updates }) : d) };
        }
        if (taskId) {
          return { ...item, tasks: item.tasks.map(t => t.id === taskId ? (subtaskId ? { ...t, subtasks: t.subtasks.map(st => st.id === subtaskId ? { ...st, ...updates } : st) } : { ...t, ...updates }) : t) };
        }
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const deleteItem = (items, setItems, id, detailId = null, taskId = null, subtaskId = null) => {
    if (subtaskId) {
      setItems(items.map(item => item.id === id ? (detailId ? { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(st => st.id !== subtaskId) } : t) } : d) } : { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, subtasks: t.subtasks.filter(st => st.id !== subtaskId) } : t) }) : item));
    } else if (taskId) {
      setItems(items.map(item => item.id === id ? (detailId ? { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: d.tasks.filter(t => t.id !== taskId) } : d) } : { ...item, tasks: item.tasks.filter(t => t.id !== taskId) }) : item));
    } else if (detailId) {
      setItems(items.map(item => item.id === id ? { ...item, details: item.details.filter(d => d.id !== detailId) } : item));
    } else {
      setItems(items.filter(item => item.id !== id));
    }
  };

  // Drag and Drop
  const handleDragEnd = (result, items, setItems, isProductType = false) => {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setItems(reordered);
    if (isProductType) {
      setProductTypeHasChanges(true);
      setProductTypeSaveStatus('idle');
    } else {
      setSubTemplateHasChanges(true);
      setSubTemplateSaveStatus('idle');
    }
  };

  const handleSubTemplateDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(subTemplates);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    try {
      await Promise.all(reordered.map((item, idx) => ChecklistSubItem.update(item.id, { order: idx })));
      await loadData();
    } catch (error) { console.error("Error reordering:", error); }
  };

  const handleProductTypeDragEnd = async (result) => {
    if (!result.destination) return;
    const reordered = Array.from(productTypes);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    await saveProductTypes(reordered);
  };

  const toggleItemExpanded = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  // Condition dropdown selection
  const handleOtherDropdownSelect = (items, setItems, itemId, detailId, selectedDropdownId) => {
    let currentIds = [];
    if (detailId) {
      const item = items.find(i => i.id === itemId);
      const detail = item?.details?.find(d => d.id === detailId);
      currentIds = detail?.dropdown_ids || (detail?.dropdown_id ? [detail.dropdown_id] : []);
    } else {
      const item = items.find(i => i.id === itemId);
      currentIds = item?.dropdown_ids || (item?.dropdown_id ? [item.dropdown_id] : []);
    }
    const newIds = currentIds.includes(selectedDropdownId) ? currentIds : [...currentIds, selectedDropdownId];
    if (detailId) updateItem(items, setItems, itemId, { dropdown_ids: newIds, dropdown_id: "" }, detailId);
    else updateItem(items, setItems, itemId, { dropdown_ids: newIds, dropdown_id: "" });
    setShowOtherPopup(null);
  };

  const handleCreateCustomDropdown = () => {
    if (!customDropdownValue.trim()) return;
    const newDropdown = { id: Date.now().toString(), name: customDropdownValue.trim() };
    saveDropdownConditions([...dropdownConditions, newDropdown]);
    if (showOtherPopup) handleOtherDropdownSelect(showOtherPopup.items, showOtherPopup.setItems, showOtherPopup.itemId, showOtherPopup.detailId, newDropdown.id);
    setCustomDropdownValue("");
  };

  if (!isOpen) return null;

  // Compact condition multi-select with portal
  const renderConditionSelect = (item, items, setItems, detailId = null, onChangeCallback = null) => {
    const uniqueId = detailId ? `${item.id}-${detailId}` : item.id;
    const isOpen = openDropdownId === uniqueId;
    let currentIds = [];
    if (detailId) {
      const detail = items.find(i => i.id === item.id)?.details?.find(d => d.id === detailId);
      currentIds = detail?.dropdown_ids || (detail?.dropdown_id ? [detail.dropdown_id] : []);
    } else {
      currentIds = item.dropdown_ids || (item.dropdown_id ? [item.dropdown_id] : []);
    }
    const selectedNames = currentIds.map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
    
    const toggleCondition = (conditionId) => {
      const newIds = currentIds.includes(conditionId) ? currentIds.filter(id => id !== conditionId) : [...currentIds, conditionId];
      if (detailId) updateItem(items, setItems, item.id, { dropdown_ids: newIds, dropdown_id: "" }, detailId);
      else updateItem(items, setItems, item.id, { dropdown_ids: newIds, dropdown_id: "" });
      if (onChangeCallback) onChangeCallback();
    };

    const getButtonRect = () => {
      const btn = document.querySelector(`[data-dropdown-id="${uniqueId}"]`);
      return btn?.getBoundingClientRect() || { bottom: 0, left: 0 };
    };
    
    return (
      <div className="relative">
        <button type="button" data-dropdown-id={uniqueId} onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isOpen ? null : uniqueId); }}
          className="h-6 text-xs px-2 border rounded flex items-center gap-1 bg-white hover:bg-gray-50 min-w-[100px]">
          <span className="truncate flex-1 text-left">{selectedNames.length === 0 ? "Condition" : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} selected`}</span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
        {isOpen && ReactDOM.createPortal(
          <>
            <div className="fixed inset-0 z-[300]" onClick={() => setOpenDropdownId(null)} />
            <div className="fixed z-[301] bg-white border rounded-lg shadow-2xl min-w-[240px] max-h-64 overflow-y-auto" 
              style={{ 
                top: getButtonRect().bottom + 4,
                left: getButtonRect().left
              }}>
              <div className="p-2 border-b bg-gray-50 font-medium text-xs sticky top-0">Select Conditions</div>
              {dropdownConditions.map(dd => (
                <div key={dd.id} onClick={(e) => { e.stopPropagation(); toggleCondition(dd.id); }}
                  className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm">
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${currentIds.includes(dd.id) ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}>
                    {currentIds.includes(dd.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>{dd.name}</span>
                </div>
              ))}
              <div onClick={(e) => { e.stopPropagation(); setShowOtherPopup({ items, setItems, itemId: item.id, detailId }); setOpenDropdownId(null); }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer text-sm text-purple-600 font-medium border-t sticky bottom-0 bg-white">
                <Plus className="w-4 h-4" /><span>Add New Condition...</span>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  // Get users list
  const [users, setUsers] = useState([]);
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const usersData = await base44.entities.AuthorizedEmail.list();
        setUsers(usersData);
      } catch (error) {
        console.error("Error loading users:", error);
      }
    };
    if (isOpen) loadUsers();
  }, [isOpen]);

  // Compact checklist item row
  const renderCompactItem = (item, index, items, setItems, provided, isProductType = false) => {
    const markChanged = () => {
      if (isProductType) {
        setProductTypeHasChanges(true);
        setProductTypeSaveStatus('idle');
      } else {
        setSubTemplateHasChanges(true);
        setSubTemplateSaveStatus('idle');
      }
    };
    
    const updateItemWithChange = (itemId, updates, detailId = null, taskId = null, subtaskId = null) => {
      updateItem(items, setItems, itemId, updates, detailId, taskId, subtaskId);
      markChanged();
    };
    
    const deleteItemWithChange = (id, detailId = null, taskId = null, subtaskId = null) => {
      deleteItem(items, setItems, id, detailId, taskId, subtaskId);
      markChanged();
    };
    
    const addTaskWithChange = (parentId, detailId, text) => {
      addTask(items, setItems, parentId, detailId, text);
      markChanged();
    };
    
    const addSubtaskWithChange = (parentId, detailId, taskId, text) => {
      addSubtask(items, setItems, parentId, detailId, taskId, text);
      markChanged();
    };
    
    const addDetailItemWithChange = (parentId, text) => {
      addDetailItem(items, setItems, parentId, text);
      markChanged();
    };
    
    return (
    <div ref={provided.innerRef} {...provided.draggableProps} 
      className={`border rounded p-1.5 bg-white mb-1 ${expandedItems[item.id] ? 'ring-1 ring-blue-300' : ''}`}>
      <div className="flex items-center gap-1">
        <div {...provided.dragHandleProps} className="cursor-grab"><GripVertical className="w-3 h-3 text-gray-400" /></div>
        <button onClick={() => toggleItemExpanded(item.id)} className="p-0.5">
          {expandedItems[item.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
        <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-700">C</span>
        {editingItem === item.id ? (
          <Input value={item.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value })}
            onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
            autoFocus className="h-5 text-xs flex-1" />
        ) : (
          <span className="flex-1 text-xs font-medium truncate cursor-pointer" onClick={() => setEditingItem(item.id)}>{item.text}</span>
        )}
        {renderConditionSelect(item, items, setItems, null, markChanged)}
        <button onClick={() => deleteItemWithChange(item.id)} className="p-0.5 hover:bg-red-50 rounded">
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
      </div>
      
      {expandedItems[item.id] && (
        <div className="ml-5 mt-1 pl-2 border-l-2 border-gray-200 space-y-1">
          {/* Tasks */}
          {item.tasks?.map((task) => (
            <div key={task.id} className="space-y-0.5">
              <div className="flex items-center gap-1 bg-orange-50 p-1 rounded text-xs group/task">
                <span className="px-1 py-0.5 rounded bg-orange-100 text-orange-700 text-xs">T</span>
                {editingItem === task.id ? (
                  <Input value={task.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, null, task.id)}
                    onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                ) : (
                  <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(task.id)}>{task.text}</span>
                )}
                <Input 
                  value={task.assigned_to || ""} 
                  onChange={(e) => updateItemWithChange(item.id, { assigned_to: e.target.value }, null, task.id)}
                  placeholder="Assign..." 
                  className="h-4 text-xs w-20" 
                  list={`users-${task.id}`}
                />
                <datalist id={`users-${task.id}`}>
                  {users.map(u => <option key={u.email} value={u.full_name || u.email} />)}
                </datalist>
                <button onClick={() => deleteItemWithChange(item.id, null, task.id)} className="p-0.5 opacity-0 group-hover/task:opacity-100"><Trash2 className="w-2.5 h-2.5 text-red-400" /></button>
              </div>
              {/* Subtasks */}
              {task.subtasks?.map((subtask) => (
                <div key={subtask.id} className="ml-4 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask">
                  <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                  {editingItem === subtask.id ? (
                    <Input value={subtask.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, null, task.id, subtask.id)}
                      onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                  ) : (
                    <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(subtask.id)}>{subtask.text}</span>
                  )}
                  <button onClick={() => deleteItemWithChange(item.id, null, task.id, subtask.id)} className="p-0.5 opacity-0 group-hover/subtask:opacity-100"><Trash2 className="w-2 h-2 text-red-400" /></button>
                </div>
              ))}
              <Input placeholder="+ subtask" className="ml-4 h-4 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addSubtaskWithChange(item.id, null, task.id, e.target.value); e.target.value = ""; } }} />
            </div>
          ))}
          <Input placeholder="+ task" className="h-5 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTaskWithChange(item.id, null, e.target.value); e.target.value = ""; } }} />
          
          {/* Details */}
          {item.details?.map((detail) => (
            <div key={detail.id} className="bg-gray-50 p-1 rounded border">
              <div className="flex items-center gap-1 text-xs">
                <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">D</span>
                {editingItem === detail.id ? (
                  <Input value={detail.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id)}
                    onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                ) : (
                  <span className="flex-1 truncate cursor-pointer" onClick={() => setEditingItem(detail.id)}>{detail.text}</span>
                )}
                {renderConditionSelect(item, items, setItems, detail.id, markChanged)}
                <button onClick={() => deleteItemWithChange(item.id, detail.id)} className="p-0.5"><Trash2 className="w-2.5 h-2.5 text-red-400" /></button>
              </div>
              <div className="ml-4 mt-1 space-y-0.5">
                {detail.tasks?.map((task) => (
                  <div key={task.id} className="space-y-0.5">
                    <div className="flex items-center gap-1 bg-orange-50 p-0.5 rounded text-xs group/dtask">
                      <span className="px-0.5 rounded bg-orange-100 text-orange-700">T</span>
                      {editingItem === task.id ? (
                        <Input value={task.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id, task.id)}
                          onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                      ) : (
                        <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(task.id)}>{task.text}</span>
                      )}
                      <Input 
                        value={task.assigned_to || ""} 
                        onChange={(e) => updateItemWithChange(item.id, { assigned_to: e.target.value }, detail.id, task.id)}
                        placeholder="Assign..." 
                        className="h-4 text-xs w-16" 
                        list={`users-detail-${task.id}`}
                      />
                      <datalist id={`users-detail-${task.id}`}>
                        {users.map(u => <option key={u.email} value={u.full_name || u.email} />)}
                      </datalist>
                      <button onClick={() => deleteItemWithChange(item.id, detail.id, task.id)} className="p-0.5 opacity-0 group-hover/dtask:opacity-100"><Trash2 className="w-2 h-2 text-red-400" /></button>
                    </div>
                    {/* Subtasks under detail tasks */}
                    {task.subtasks?.map((subtask) => (
                      <div key={subtask.id} className="ml-3 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsubtask">
                        <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                        {editingItem === subtask.id ? (
                          <Input value={subtask.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id, task.id, subtask.id)}
                            onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                        ) : (
                          <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(subtask.id)}>{subtask.text}</span>
                        )}
                        <button onClick={() => deleteItemWithChange(item.id, detail.id, task.id, subtask.id)} className="p-0.5 opacity-0 group-hover/dsubtask:opacity-100"><Trash2 className="w-2 h-2 text-red-400" /></button>
                      </div>
                    ))}
                    <Input placeholder="+ subtask" className="ml-3 h-4 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addSubtaskWithChange(item.id, detail.id, task.id, e.target.value); e.target.value = ""; } }} />
                  </div>
                ))}
                <Input placeholder="+ task" className="h-4 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTaskWithChange(item.id, detail.id, e.target.value); e.target.value = ""; } }} />
              </div>
            </div>
          ))}
          <Input placeholder="+ detail" className="h-5 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addDetailItemWithChange(item.id, e.target.value); e.target.value = ""; } }} />
        </div>
      )}
    </div>
  );};

  // Mark changes when items are modified
  const markProductTypeChanged = () => {
    setProductTypeHasChanges(true);
    setProductTypeSaveStatus('idle');
  };
  
  const markSubTemplateChanged = () => {
    setSubTemplateHasChanges(true);
    setSubTemplateSaveStatus('idle');
  };

  // Item editor with drag-drop
  const renderItemEditor = (items, setItems, isProductType = false) => (
    <DragDropContext onDragEnd={(result) => handleDragEnd(result, items, setItems, isProductType)}>
      <Droppable droppableId="items">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-[55vh] overflow-y-auto pr-1">
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(provided) => renderCompactItem(item, index, items, setItems, provided, isProductType)}
              </Draggable>
            ))}
            {provided.placeholder}

          </div>
        )}
      </Droppable>
    </DragDropContext>
  );

  // Preview renderer
  const renderPreview = (items, title) => (
    <div className="bg-white border rounded-lg p-3 max-h-[60vh] overflow-y-auto">
      <h4 className="font-bold text-sm mb-2 pb-1 border-b">{title}</h4>
      {items.map((item, idx) => {
        const conditionNames = (item.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
        return (
          <div key={item.id} className="mb-2">
            <div className="flex items-start gap-2 p-2 bg-gray-50 rounded">
              <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium text-sm">{item.text}</div>
                {conditionNames.length > 0 && (
                  <div className="mt-1"><span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">{conditionNames.join(', ')}</span></div>
                )}
              </div>
            </div>
            {item.tasks?.map(task => (
              <div key={task.id} className="ml-6 mt-1 flex items-center gap-2 p-1.5 bg-orange-50 rounded text-sm">
                <div className="w-3 h-3 border rounded flex-shrink-0" />
                <span>{task.text}</span>
              </div>
            ))}
            {item.details?.map(detail => {
              const detailConditions = (detail.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
              return (
                <div key={detail.id} className="ml-6 mt-1">
                  <div className="flex items-start gap-2 p-1.5 bg-purple-50 rounded">
                    <div className="w-3 h-3 border rounded mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <span className="text-sm">{detail.text}</span>
                      {detailConditions.length > 0 && <span className="ml-2 text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded">{detailConditions.join(', ')}</span>}
                    </div>
                  </div>
                  {detail.tasks?.map(task => (
                    <div key={task.id} className="ml-4 mt-1 flex items-center gap-2 p-1 bg-orange-50 rounded text-xs">
                      <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                      <span>{task.text}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-[95vw] max-w-[1600px] h-[90vh] overflow-hidden flex flex-col bg-white rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between">
            <div><h2 className="text-lg font-bold">Checklist Builder</h2></div>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b bg-white">
              <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-4' : 'grid-cols-1'} bg-gray-200 p-0.5 h-8`}>
                <TabsTrigger value="selectors" className="text-xs data-[state=active]:bg-white">Select & Apply</TabsTrigger>
                {isAdmin && (
                  <>
                    <TabsTrigger value="producttypes" className="text-xs data-[state=active]:bg-white">Product Checklists</TabsTrigger>
                    <TabsTrigger value="subtemplates" className="text-xs data-[state=active]:bg-white">Checklist Options</TabsTrigger>
                    <TabsTrigger value="dropdowns" className="text-xs data-[state=active]:bg-white">Conditions</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            {/* Select & Apply Tab */}
            <TabsContent value="selectors" className="overflow-y-auto p-3 flex-1" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-[1fr_2fr_2fr] gap-4 h-full">
                <div className="flex flex-col h-full">
                  {/* Products from Work Order */}
                  {workOrderProducts && workOrderProducts.length > 0 && (
                    <div className="mb-4">
                      <h3 className="font-bold text-sm mb-2 text-purple-700">📦 Products on this Job</h3>
                      <div className="space-y-1 max-h-[25vh] overflow-y-auto border rounded-lg p-2 bg-purple-50">
                        {workOrderProducts.map((product, index) => {
                          const hasTemplate = product.product_type && productTypeTemplates[product.product_type]?.items?.length > 0;
                          return (
                            <div 
                              key={product.id} 
                              onClick={() => {
                                if (hasTemplate) {
                                  // Add this specific product with its description as the name
                                  const existingNames = getExistingProductNames();
                                  const selectedNames = new Set(selectedProducts.map(p => p.customName));
                                  const allNames = new Set([...existingNames, ...selectedNames]);
                                  
                                  let customName = product.description || product.product_type;
                                  let counter = 1;
                                  while (allNames.has(customName)) { counter++; customName = `${product.description || product.product_type} ${counter}`; }
                                  
                                  setSelectedProducts([...selectedProducts, {
                                    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                                    productType: product.product_type,
                                    customName: customName,
                                    subTemplates: []
                                  }]);
                                }
                              }}
                              className={`p-2 rounded border flex items-center justify-between ${hasTemplate ? 'bg-white hover:bg-purple-100 cursor-pointer border-purple-300' : 'bg-gray-100 opacity-50 border-gray-200'}`}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{product.description || `Product ${index + 1}`}</div>
                                <div className="text-xs text-purple-600">{product.product_type || 'No type'}</div>
                              </div>
                              {hasTemplate && <Plus className="w-4 h-4 text-purple-500 flex-shrink-0" />}
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Click a product to apply its template</p>
                    </div>
                  )}
                  
                  <h3 className="font-bold text-sm mb-2">All Product Checklists</h3>
                  <div className="space-y-1 flex-1 overflow-y-auto">
                    {productTypes.map(type => {
                      const hasTemplate = productTypeTemplates[type]?.items?.length > 0;
                      return (
                        <div key={type} onClick={() => hasTemplate && addProductToSelection(type)}
                          className={`p-2 rounded border flex items-center justify-between ${hasTemplate ? 'bg-white hover:bg-blue-50 cursor-pointer' : 'bg-gray-100 opacity-50'}`}>
                          <div><div className="font-medium text-sm">{type}</div><div className="text-xs text-gray-500">{hasTemplate ? `${productTypeTemplates[type].items.length} items` : 'No template'}</div></div>
                          {hasTemplate && <Plus className="w-4 h-4 text-blue-500" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col h-full">
                  <h3 className="font-bold text-sm mb-2">Selected ({selectedProducts.length})</h3>
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border rounded bg-gray-50 text-sm">Click a product type to add</div>
                  ) : (
                    <div className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {selectedProducts.map(product => (
                        <div key={product.id} className="border rounded p-2 bg-white">
                          <div className="flex items-center gap-2 mb-1">
                            <Input value={product.customName} onChange={(e) => updateProductName(product.id, e.target.value)} className="h-7 text-sm flex-1" />
                            <button onClick={() => setSelectedProducts(selectedProducts.filter(p => p.id !== product.id))} className="p-1"><Trash2 className="w-4 h-4 text-red-500" /></button>
                          </div>
                          <div className="text-xs text-gray-500 mb-1">Type: {product.productType}</div>
                          {(() => {
                            // Get applicable sub-templates for this product type
                            const applicableSTs = subTemplates.filter(st => {
                              const hasItems = subTemplateItems[st.id]?.items?.length > 0;
                              const appliesToThis = st.applies_to_product_types?.includes(product.productType) || st.applies_to_product_types?.length === 0;
                              return hasItems && appliesToThis;
                            });
                            if (applicableSTs.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1">
                                {applicableSTs.map(st => {
                                  const isSelected = product.subTemplates.includes(st.id);
                                  return (
                                    <div key={st.id} onClick={() => toggleSubTemplateForProduct(product.id, st.id)}
                                      className={`text-xs px-1.5 py-1 rounded border flex items-center gap-1 ${isSelected ? 'bg-purple-100 border-purple-400 cursor-pointer' : 'bg-white cursor-pointer hover:border-purple-300'}`}>
                                      <div className={`w-3 h-3 rounded border flex items-center justify-center ${isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-400'}`}>
                                        {isSelected && <Check className="w-2 h-2 text-white" />}
                                      </div>
                                      <span>{st.name}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedProducts.length > 0 && (
                    <Button onClick={handleApplyTemplate} className="w-full mt-2 bg-purple-600 hover:bg-purple-700">
                      <CheckSquare className="w-4 h-4 mr-2" />Apply to Project
                    </Button>
                  )}
                </div>

                {/* Preview Column */}
                <div className="border-l pl-3">
                  <h3 className="font-bold text-sm mb-2">Preview</h3>
                  <div className="bg-gray-50 border rounded-lg p-3 max-h-[60vh] overflow-y-auto">
                    {selectedProducts.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">Select products to preview</div>
                    ) : (
                      selectedProducts.map(product => {
                        const template = productTypeTemplates[product.productType];
                        return (
                          <div key={product.id} className="mb-4 last:mb-0">
                            <h4 className="font-bold text-sm text-purple-800 mb-2 pb-1 border-b">📦 {product.customName}</h4>
                            {template?.items?.map((item, idx) => {
                              const conditionNames = (item.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
                              return (
                                <div key={idx} className="mb-2">
                                  <div className="flex items-start gap-2 p-2 bg-white rounded border">
                                    <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-xs">{item.text}</div>
                                      {conditionNames.length > 0 && (
                                        <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded mt-1 inline-block">{conditionNames.join(', ')}</span>
                                      )}
                                    </div>
                                  </div>
                                  {item.tasks?.map((task, tIdx) => (
                                    <div key={tIdx} className="ml-6 mt-1 flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs">
                                      <div className="w-3 h-3 border rounded flex-shrink-0" />
                                      <span>{task.text}</span>
                                    </div>
                                  ))}
                                  {item.details?.map((detail, dIdx) => (
                                    <div key={dIdx} className="ml-6 mt-1">
                                      <div className="flex items-start gap-2 p-1.5 bg-purple-50 rounded">
                                        <div className="w-3 h-3 border rounded mt-0.5 flex-shrink-0" />
                                        <span className="text-xs">{detail.text}</span>
                                      </div>
                                      {detail.tasks?.map((task, dtIdx) => (
                                        <div key={dtIdx} className="ml-4 mt-1 flex items-center gap-2 p-1 bg-orange-50 rounded text-xs">
                                          <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                                          <span>{task.text}</span>
                                        </div>
                                      ))}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                            {/* Sub-templates preview */}
                            {product.subTemplates.map(stId => {
                              const subTemplate = subTemplates.find(st => st.id === stId);
                              const stItems = subTemplateItems[stId];
                              if (!subTemplate || !stItems?.items) return null;
                              return (
                                <div key={stId} className="ml-3 mt-2 border-l-2 border-blue-300 pl-2">
                                  <h5 className="text-xs font-semibold text-blue-700 mb-1">🔗 {subTemplate.name}</h5>
                                  {stItems.items.map((item, idx) => (
                                    <div key={idx} className="flex items-start gap-1 p-1 bg-white rounded border mb-1">
                                      <div className="w-3 h-3 border rounded mt-0.5 flex-shrink-0" />
                                      <span className="text-xs">{item.text}</span>
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Sub-Templates Tab */}
            <TabsContent value="subtemplates" className="overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-4 h-full">
              <div className="space-y-1 overflow-y-auto">
                <div className="flex gap-1 mb-2">
                  <Input value={newSubTemplateName} onChange={(e) => setNewSubTemplateName(e.target.value)} placeholder="New sub-template..." className="h-7 text-sm" onKeyDown={(e) => e.key === 'Enter' && createSubTemplate()} />
                  <Button size="sm" className="h-7 px-2" onClick={createSubTemplate}><Plus className="w-3 h-3" /></Button>
                </div>
                <DragDropContext onDragEnd={handleSubTemplateDragEnd}>
                  <Droppable droppableId="subtemplates">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}>
                        {subTemplates.map((st, index) => (
                          <Draggable key={st.id} draggableId={st.id} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps}
                                onClick={() => editingSubTemplateId !== st.id && selectSubTemplateForEditing(st)}
                                className={`p-1.5 rounded border cursor-pointer flex items-center gap-1 mb-1 ${selectedSubTemplate === st.id ? 'bg-purple-100 border-purple-300' : 'bg-white hover:bg-gray-50'}`}>
                                <div {...provided.dragHandleProps}><GripVertical className="w-3 h-3 text-gray-400" /></div>
                                {editingSubTemplateId === st.id ? (
                                  <div className="flex-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input value={editingSubTemplateName} onChange={(e) => setEditingSubTemplateName(e.target.value)} className="h-6 text-xs flex-1" autoFocus
                                      onKeyDown={async (e) => { if (e.key === 'Enter') { await ChecklistSubItem.update(st.id, { name: editingSubTemplateName }); await loadData(); setEditingSubTemplateId(null); } if (e.key === 'Escape') setEditingSubTemplateId(null); }} />
                                    <Button size="sm" className="h-6 px-1" onClick={async () => { await ChecklistSubItem.update(st.id, { name: editingSubTemplateName }); await loadData(); setEditingSubTemplateId(null); }}><Save className="w-3 h-3" /></Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1 min-w-0"><div className="font-medium text-xs truncate">{st.name}</div><div className="text-xs text-gray-500">{subTemplateItems[st.id]?.items?.length || 0} items</div></div>
                                    <button onClick={(e) => { e.stopPropagation(); duplicateSubTemplate(st); }} className="p-0.5"><Copy className="w-3 h-3 text-blue-500" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setEditingSubTemplateId(st.id); setEditingSubTemplateName(st.name); }} className="p-0.5"><Pencil className="w-3 h-3 text-gray-400" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); deleteSubTemplate(st); }} className="p-0.5"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                  </>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>

              {/* Editor */}
              <div className="overflow-hidden bg-gray-50 border rounded-lg p-3 flex flex-col">
                {selectedSubTemplate ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm">{subTemplates.find(st => st.id === selectedSubTemplate)?.name}</h3>
                      {(subTemplateHasChanges || subTemplateSaveStatus === 'saved') && (
                        <Button 
                          onClick={saveSubTemplateChecklist} 
                          size="sm" 
                          className={`h-7 ${subTemplateSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {subTemplateSaveStatus === 'saved' ? 'Saved' : 'Save'}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1 mb-2">
                      <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add checklist item..." className="h-7 text-sm flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems, false)} />
                      <Button onClick={() => addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems, false)} size="sm" variant="outline" className="h-7"><Plus className="w-3 h-3" /></Button>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                      {renderItemEditor(subTemplateChecklistItems, setSubTemplateChecklistItems, false)}
                    </div>
                    
                    {/* Product Type Assignment */}
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs font-medium text-gray-600 mb-2">Applies to Product Types:</p>
                      <div className="flex flex-wrap gap-1">
                        {productTypes.map(type => {
                          const currentST = subTemplates.find(st => st.id === selectedSubTemplate);
                          const isApplied = currentST?.applies_to_product_types?.includes(type);
                          return (
                            <button
                              key={type}
                              onClick={async () => {
                                const currentApplies = currentST?.applies_to_product_types || [];
                                const newApplies = isApplied 
                                  ? currentApplies.filter(t => t !== type)
                                  : [...currentApplies, type];
                                await ChecklistSubItem.update(selectedSubTemplate, { applies_to_product_types: newApplies });
                                await loadData();
                              }}
                              className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isApplied ? 'bg-blue-100 border-blue-400' : 'bg-white border-gray-300 hover:border-blue-300'}`}
                            >
                              <div className={`w-3 h-3 rounded border flex items-center justify-center ${isApplied ? 'bg-blue-500 border-blue-500' : 'border-gray-400'}`}>
                                {isApplied && <Check className="w-2 h-2 text-white" />}
                              </div>
                              <span>{type}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">If none selected, applies to all types</p>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a sub-template</div>
                )}
              </div>

              {/* Live Preview */}
              <div className="overflow-hidden border rounded-lg p-3 bg-white">
                <h3 className="font-bold text-sm mb-2 pb-1 border-b">Live Preview</h3>
                {selectedSubTemplate && subTemplateChecklistItems.length > 0 ? (
                  <div className="max-h-[65vh] overflow-y-auto">
                    <h4 className="font-bold text-sm text-blue-800 mb-2 pb-1 border-b">🔗 {subTemplates.find(st => st.id === selectedSubTemplate)?.name}</h4>
                    {subTemplateChecklistItems.map((item) => {
                      const conditionNames = (item.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
                      return (
                        <div key={item.id} className="mb-2">
                          <div className="flex items-start gap-2 p-2 bg-white rounded border">
                            <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                            <div className="flex-1">
                              <div className="font-medium text-xs">{item.text}</div>
                              {conditionNames.length > 0 && (
                                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded mt-1 inline-block">{conditionNames.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          {item.tasks?.map(task => (
                            <div key={task.id} className="ml-6 mt-1">
                              <div className="flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs">
                                <div className="w-3 h-3 border rounded flex-shrink-0" />
                                <span className="flex-1">{task.text}</span>
                                {task.assigned_to && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{task.assigned_to}</span>}
                              </div>
                              {task.subtasks?.map(st => (
                                <div key={st.id} className="ml-4 mt-0.5 flex items-center gap-2 p-1 bg-yellow-50 rounded text-xs">
                                  <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                                  <span>{st.text}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                          {item.details?.map(detail => {
                            const detailConditions = (detail.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
                            return (
                              <div key={detail.id} className="ml-6 mt-1">
                                <div className="flex items-start gap-2 p-1.5 bg-purple-50 rounded">
                                  <div className="w-3 h-3 border rounded mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-xs">{detail.text}</span>
                                    {detailConditions.length > 0 && <span className="ml-2 text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded">{detailConditions.join(', ')}</span>}
                                  </div>
                                </div>
                                {detail.tasks?.map(task => (
                                  <div key={task.id} className="ml-4 mt-0.5">
                                    <div className="flex items-center gap-2 p-1 bg-orange-50 rounded text-xs">
                                      <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                                      <span className="flex-1">{task.text}</span>
                                      {task.assigned_to && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{task.assigned_to}</span>}
                                    </div>
                                    {task.subtasks?.map(st => (
                                      <div key={st.id} className="ml-3 mt-0.5 flex items-center gap-2 p-0.5 bg-yellow-50 rounded text-xs">
                                        <div className="w-2 h-2 border rounded flex-shrink-0" />
                                        <span>{st.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {selectedSubTemplate ? 'Add items to see preview' : 'Select a sub-template to preview'}
                  </div>
                )}
              </div>
              </div>
            </TabsContent>

            {/* Product Templates Tab */}
            <TabsContent value="producttypes" className="overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-4 h-full">
              <div className="space-y-1 overflow-y-auto">
                <div className="flex gap-1 mb-2">
                  <Input id="newPT" placeholder="New product type..." className="h-7 text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { saveProductTypes([...productTypes, e.target.value.trim()]); e.target.value = ""; } }} />
                  <Button size="sm" className="h-7 px-2" onClick={() => { const input = document.getElementById('newPT'); if (input?.value.trim()) { saveProductTypes([...productTypes, input.value.trim()]); input.value = ""; } }}><Plus className="w-3 h-3" /></Button>
                </div>
                <DragDropContext onDragEnd={handleProductTypeDragEnd}>
                  <Droppable droppableId="producttypes">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}>
                        {productTypes.map((type, index) => (
                          <Draggable key={type} draggableId={type} index={index}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps} onClick={() => editingProductTypeName !== type && selectProductType(type)}
                                className={`p-1.5 rounded border cursor-pointer flex items-center gap-1 mb-1 ${selectedProductType === type ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-50'}`}>
                                <div {...provided.dragHandleProps}><GripVertical className="w-3 h-3 text-gray-400" /></div>
                                {editingProductTypeName === type ? (
                                  <div className="flex-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input 
                                      value={editingProductTypeValue} 
                                      onChange={(e) => setEditingProductTypeValue(e.target.value)} 
                                      className="h-6 text-xs flex-1" 
                                      autoFocus
                                      onKeyDown={async (e) => { 
                                        if (e.key === 'Enter' && editingProductTypeValue.trim()) { 
                                          const newName = editingProductTypeValue.trim();
                                          const newTypes = productTypes.map(t => t === type ? newName : t);
                                          await saveProductTypes(newTypes);
                                          // Update templates if the type had a template
                                          if (productTypeTemplates[type]) {
                                            const newTemplates = { ...productTypeTemplates };
                                            newTemplates[newName] = newTemplates[type];
                                            delete newTemplates[type];
                                            await saveProductTypeTemplates(newTemplates);
                                          }
                                          if (selectedProductType === type) setSelectedProductType(newName);
                                          setEditingProductTypeName(null); 
                                        } 
                                        if (e.key === 'Escape') setEditingProductTypeName(null); 
                                      }} 
                                    />
                                    <Button size="sm" className="h-6 px-1" onClick={async () => { 
                                      if (editingProductTypeValue.trim()) {
                                        const newName = editingProductTypeValue.trim();
                                        const newTypes = productTypes.map(t => t === type ? newName : t);
                                        await saveProductTypes(newTypes);
                                        if (productTypeTemplates[type]) {
                                          const newTemplates = { ...productTypeTemplates };
                                          newTemplates[newName] = newTemplates[type];
                                          delete newTemplates[type];
                                          await saveProductTypeTemplates(newTemplates);
                                        }
                                        if (selectedProductType === type) setSelectedProductType(newName);
                                      }
                                      setEditingProductTypeName(null); 
                                    }}><Save className="w-3 h-3" /></Button>
                                  </div>
                                ) : (
                                  <>
                                    <div className="flex-1 min-w-0"><div className="font-medium text-xs truncate">{type}</div><div className="text-xs text-gray-500">{productTypeTemplates[type]?.items?.length || 0} items</div></div>
                                    <button onClick={(e) => { e.stopPropagation(); duplicateProductTypeTemplate(type); }} className="p-0.5"><Copy className="w-3 h-3 text-blue-500" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); setEditingProductTypeName(type); setEditingProductTypeValue(type); }} className="p-0.5"><Pencil className="w-3 h-3 text-gray-400" /></button>
                                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${type}"?`)) { saveProductTypes(productTypes.filter((_, i) => i !== index)); if (selectedProductType === type) { setSelectedProductType(null); setProductTypeItems([]); } } }} className="p-0.5"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                  </>
                                )}
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </DragDropContext>
              </div>

              {/* Editor */}
              <div className="overflow-hidden bg-gray-50 border rounded-lg p-3">
                {selectedProductType ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm">{selectedProductType}</h3>
                      {(productTypeHasChanges || productTypeSaveStatus === 'saved') && (
                        <Button 
                          onClick={saveProductTypeTemplate} 
                          size="sm" 
                          className={`h-7 ${productTypeSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {productTypeSaveStatus === 'saved' ? 'Saved' : 'Save'}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1 mb-2">
                      <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add checklist item..." className="h-7 text-sm flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(productTypeItems, setProductTypeItems, true)} />
                      <Button onClick={() => addChecklistItem(productTypeItems, setProductTypeItems, true)} size="sm" variant="outline" className="h-7"><Plus className="w-3 h-3" /></Button>
                    </div>
                    {renderItemEditor(productTypeItems, setProductTypeItems, true)}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select a product type</div>
                )}
              </div>

              {/* Live Preview */}
              <div className="overflow-hidden border rounded-lg p-3 bg-white">
                <h3 className="font-bold text-sm mb-2 pb-1 border-b">Live Preview</h3>
                {selectedProductType && productTypeItems.length > 0 ? (
                  <div className="max-h-[65vh] overflow-y-auto">
                    <h4 className="font-bold text-sm text-purple-800 mb-2 pb-1 border-b">📦 {selectedProductType}</h4>
                    {productTypeItems.map((item) => {
                      const conditionNames = (item.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
                      return (
                        <div key={item.id} className="mb-2">
                          <div className="flex items-start gap-2 p-2 bg-white rounded border">
                            <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-xs">{item.text}</div>
                              {conditionNames.length > 0 && (
                                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded mt-1 inline-block">{conditionNames.join(', ')}</span>
                              )}
                            </div>
                          </div>
                          {item.tasks?.map(task => (
                            <div key={task.id} className="ml-6 mt-1">
                              <div className="flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs">
                                <div className="w-3 h-3 border rounded flex-shrink-0" />
                                <span className="flex-1">{task.text}</span>
                                {task.assigned_to && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{task.assigned_to}</span>}
                              </div>
                              {task.subtasks?.map(st => (
                                <div key={st.id} className="ml-4 mt-0.5 flex items-center gap-2 p-1 bg-yellow-50 rounded text-xs">
                                  <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                                  <span>{st.text}</span>
                                </div>
                              ))}
                            </div>
                          ))}
                          {item.details?.map(detail => {
                            const detailConditions = (detail.dropdown_ids || []).map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);
                            return (
                              <div key={detail.id} className="ml-6 mt-1">
                                <div className="flex items-start gap-2 p-1.5 bg-purple-50 rounded">
                                  <div className="w-3 h-3 border rounded mt-0.5 flex-shrink-0" />
                                  <div className="flex-1">
                                    <span className="text-xs">{detail.text}</span>
                                    {detailConditions.length > 0 && <span className="ml-2 text-xs px-1 py-0.5 bg-purple-100 text-purple-700 rounded">{detailConditions.join(', ')}</span>}
                                  </div>
                                </div>
                                {detail.tasks?.map(task => (
                                  <div key={task.id} className="ml-4 mt-0.5">
                                    <div className="flex items-center gap-2 p-1 bg-orange-50 rounded text-xs">
                                      <div className="w-2.5 h-2.5 border rounded flex-shrink-0" />
                                      <span className="flex-1">{task.text}</span>
                                      {task.assigned_to && <span className="text-xs px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{task.assigned_to}</span>}
                                    </div>
                                    {task.subtasks?.map(st => (
                                      <div key={st.id} className="ml-3 mt-0.5 flex items-center gap-2 p-0.5 bg-yellow-50 rounded text-xs">
                                        <div className="w-2 h-2 border rounded flex-shrink-0" />
                                        <span>{st.text}</span>
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400 text-sm">
                    {selectedProductType ? 'Add items to see preview' : 'Select a product type to preview'}
                  </div>
                )}
              </div>
              </div>
            </TabsContent>

            {/* Conditions Tab */}
            <TabsContent value="dropdowns" className="overflow-y-auto p-3" style={{ marginTop: 0 }}>
              {/* Instructions */}
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
                  <p className="font-medium mb-1">How to use conditions:</p>
                  <p className="text-gray-600">Drag conditions to reorder them within each section. Click the colored circle icon to toggle between <span className="font-medium text-green-700">Completed</span> (✓ green) and <span className="font-medium text-yellow-700">Continued</span> (C yellow). Dropdowns will show Completed conditions first, then Continued conditions.</p>
                </div>
                
                <div className="flex gap-2 mb-4">
                  <Input value={newDropdownName} onChange={(e) => setNewDropdownName(e.target.value)} placeholder="New condition..." className="flex-1 h-8 text-sm"
                    onKeyDown={(e) => { if (e.key === 'Enter' && newDropdownName.trim()) { saveDropdownConditions([...dropdownConditions, { id: Date.now().toString(), name: newDropdownName.trim(), is_completed: false, order: dropdownConditions.length }]); setNewDropdownName(""); } }} />
                  <Button size="sm" onClick={() => { if (newDropdownName.trim()) { saveDropdownConditions([...dropdownConditions, { id: Date.now().toString(), name: newDropdownName.trim(), is_completed: false, order: dropdownConditions.length }]); setNewDropdownName(""); } }}><Plus className="w-3 h-3 mr-1" />Add</Button>
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                  {/* Completed Conditions */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-300">
                      <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                      <h3 className="font-bold text-green-800">Completed Conditions</h3>
                      <span className="text-xs text-green-600">({dropdownConditions.filter(d => d.is_completed).length})</span>
                    </div>
                    <DragDropContext onDragEnd={(result) => {
                      if (!result.destination) return;
                      const completedItems = dropdownConditions.filter(d => d.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0));
                      const reordered = Array.from(completedItems);
                      const [removed] = reordered.splice(result.source.index, 1);
                      reordered.splice(result.destination.index, 0, removed);
                      // Update order values
                      const updatedCompleted = reordered.map((item, idx) => ({ ...item, order: idx }));
                      const continuedItems = dropdownConditions.filter(d => !d.is_completed);
                      saveDropdownConditions([...updatedCompleted, ...continuedItems]);
                    }}>
                      <Droppable droppableId="completed-conditions">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-[50vh] overflow-y-auto">
                            {dropdownConditions.filter(dd => dd.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0)).map((dd, index) => (
                              <Draggable key={dd.id} draggableId={dd.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-1 p-2 border rounded text-sm bg-green-50 border-green-300">
                                    <div {...provided.dragHandleProps} className="cursor-grab"><GripVertical className="w-3 h-3 text-gray-400" /></div>
                                    <button 
                                      onClick={() => {
                                        const continuedItems = dropdownConditions.filter(d => !d.is_completed);
                                        const completedItems = dropdownConditions.filter(d => d.is_completed && d.id !== dd.id);
                                        const movedItem = { ...dd, is_completed: false, order: continuedItems.length };
                                        saveDropdownConditions([...completedItems, ...continuedItems, movedItem]);
                                      }}
                                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500 hover:bg-green-600"
                                      title="Click to mark as Continued"
                                    >
                                      <Check className="w-3 h-3 text-white" />
                                    </button>
                                    {editingDropdown === dd.id ? (
                                      <>
                                        <Input 
                                          id={`edit-${dd.id}`}
                                          defaultValue={dd.name} 
                                          className="flex-1 h-6 text-sm" 
                                          autoFocus
                                          onKeyDown={(e) => { 
                                            if (e.key === 'Enter') { 
                                              const newName = e.target.value.trim(); 
                                              if (newName) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: newName } : d)); 
                                              setEditingDropdown(null); 
                                            } 
                                            if (e.key === 'Escape') setEditingDropdown(null); 
                                          }}
                                        />
                                        <Button size="sm" className="h-6 px-2" onClick={() => {
                                          const input = document.getElementById(`edit-${dd.id}`);
                                          const newName = input?.value.trim();
                                          if (newName) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: newName } : d));
                                          setEditingDropdown(null);
                                        }}><Save className="w-3 h-3" /></Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="flex-1 truncate">{dd.name}</span>
                                        <button onClick={() => setEditingDropdown(dd.id)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button>
                                      </>
                                    )}
                                    <button onClick={() => { if (confirm(`Delete "${dd.name}"?`)) saveDropdownConditions(dropdownConditions.filter(d => d.id !== dd.id)); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {dropdownConditions.filter(d => d.is_completed).length === 0 && (
                              <div className="text-center py-4 text-gray-400 text-sm border rounded border-dashed">No completed conditions</div>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </div>

                  {/* Continued Conditions */}
                  <div>
                    <div className="flex items-center gap-2 mb-2 pb-2 border-b border-yellow-300">
                      <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center"><span className="text-white text-xs font-bold">C</span></div>
                      <h3 className="font-bold text-yellow-800">Continued Conditions</h3>
                      <span className="text-xs text-yellow-600">({dropdownConditions.filter(d => !d.is_completed).length})</span>
                    </div>
                    <DragDropContext onDragEnd={(result) => {
                      if (!result.destination) return;
                      const continuedItems = dropdownConditions.filter(d => !d.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0));
                      const reordered = Array.from(continuedItems);
                      const [removed] = reordered.splice(result.source.index, 1);
                      reordered.splice(result.destination.index, 0, removed);
                      // Update order values
                      const updatedContinued = reordered.map((item, idx) => ({ ...item, order: idx }));
                      const completedItems = dropdownConditions.filter(d => d.is_completed);
                      saveDropdownConditions([...completedItems, ...updatedContinued]);
                    }}>
                      <Droppable droppableId="continued-conditions">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-[50vh] overflow-y-auto">
                            {dropdownConditions.filter(dd => !dd.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0)).map((dd, index) => (
                              <Draggable key={dd.id} draggableId={dd.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-1 p-2 border rounded text-sm bg-yellow-50 border-yellow-300">
                                    <div {...provided.dragHandleProps} className="cursor-grab"><GripVertical className="w-3 h-3 text-gray-400" /></div>
                                    <button 
                                      onClick={() => {
                                        const completedItems = dropdownConditions.filter(d => d.is_completed);
                                        const continuedItems = dropdownConditions.filter(d => !d.is_completed && d.id !== dd.id);
                                        const movedItem = { ...dd, is_completed: true, order: completedItems.length };
                                        saveDropdownConditions([...completedItems, movedItem, ...continuedItems]);
                                      }}
                                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 bg-yellow-500 hover:bg-yellow-600"
                                      title="Click to mark as Completed"
                                    >
                                      <span className="text-white text-xs font-bold">C</span>
                                    </button>
                                    {editingDropdown === dd.id ? (
                                      <>
                                        <Input 
                                          id={`edit-${dd.id}`}
                                          defaultValue={dd.name} 
                                          className="flex-1 h-6 text-sm" 
                                          autoFocus
                                          onKeyDown={(e) => { 
                                            if (e.key === 'Enter') { 
                                              const newName = e.target.value.trim(); 
                                              if (newName) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: newName } : d)); 
                                              setEditingDropdown(null); 
                                            } 
                                            if (e.key === 'Escape') setEditingDropdown(null); 
                                          }}
                                        />
                                        <Button size="sm" className="h-6 px-2" onClick={() => {
                                          const input = document.getElementById(`edit-${dd.id}`);
                                          const newName = input?.value.trim();
                                          if (newName) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: newName } : d));
                                          setEditingDropdown(null);
                                        }}><Save className="w-3 h-3" /></Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="flex-1 truncate">{dd.name}</span>
                                        <button onClick={() => setEditingDropdown(dd.id)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button>
                                      </>
                                    )}
                                    <button onClick={() => { if (confirm(`Delete "${dd.name}"?`)) saveDropdownConditions(dropdownConditions.filter(d => d.id !== dd.id)); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                                  </div>
                                )}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                            {dropdownConditions.filter(d => !d.is_completed).length === 0 && (
                              <div className="text-center py-4 text-gray-400 text-sm border rounded border-dashed">No continued conditions</div>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </DragDropContext>
                  </div>
                </div>
            </TabsContent>
          </Tabs>

          <div className="px-3 py-2 border-t bg-gray-50 flex justify-end">
            <Button onClick={onClose} variant="outline" size="sm">Close</Button>
          </div>
        </div>
      </div>

      {/* Create Condition Dialog */}
      <Dialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <DialogContent className="max-w-sm z-[110]">
          <DialogHeader><DialogTitle>Add Condition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="max-h-36 overflow-y-auto border rounded">
              {dropdownConditions.map(dd => (
                <div key={dd.id} onClick={() => showOtherPopup && handleOtherDropdownSelect(showOtherPopup.items, showOtherPopup.setItems, showOtherPopup.itemId, showOtherPopup.detailId, dd.id)}
                  className="p-2 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2 text-sm">
                  <List className="w-4 h-4 text-purple-500" /><span>{dd.name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={customDropdownValue} onChange={(e) => setCustomDropdownValue(e.target.value)} placeholder="New condition..." onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomDropdown()} />
              <Button onClick={handleCreateCustomDropdown} disabled={!customDropdownValue.trim()}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowOtherPopup(null)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}