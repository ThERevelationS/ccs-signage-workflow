import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronRight, CheckSquare, List, Copy, GripVertical, Check } from "lucide-react";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/shared/globalSettingsPersistence";
import { saveSettingMapEntryIfUnchanged } from "@/components/sips/templateBuilderPersistence";

const GlobalSettings = base44.entities.GlobalSettings;

// MMM uses separate setting keys to keep everything independent from SIPs
const SETTING_KEYS = {
  productTypes: 'mmmProductTypes',
  productTypeTemplates: 'mmmProductTypeTemplates',
  subTemplateItems: 'mmmSubTemplateItems',
  dropdownConditions: 'mmmDropdownConditions',
};

export default function MmmTemplateBuilder({ isOpen, onClose, onApplyTemplate, existingChecklist = [], isAdmin = false, workOrderProducts = [] }) {
  const [activeTab, setActiveTab] = useState("selectors");
  const [productTypes, setProductTypes] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  const [subTemplates, setSubTemplates] = useState([]); // stored in mmmSubTemplateItems as array
  const [subTemplateItems, setSubTemplateItems] = useState({});
  const [dropdownConditions, setDropdownConditions] = useState([]);

  const [selectedProducts, setSelectedProducts] = useState([]);
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [productTypeItems, setProductTypeItems] = useState([]);
  const [newItemText, setNewItemText] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [expandedItems, setExpandedItems] = useState({});
  const [editingProductTypeName, setEditingProductTypeName] = useState(null);
  const [editingProductTypeValue, setEditingProductTypeValue] = useState("");
  const [newDropdownName, setNewDropdownName] = useState("");
  const [editingDropdown, setEditingDropdown] = useState(null);
  const [productTypeHasChanges, setProductTypeHasChanges] = useState(false);
  const [productTypeSaveStatus, setProductTypeSaveStatus] = useState('idle');
  const [openDropdownId, setOpenDropdownId] = useState(null);

  // Sub-templates for MMM - stored as list in mmmSubTemplateList GlobalSettings
  const [selectedSubTemplate, setSelectedSubTemplate] = useState(null);
  const [subTemplateChecklistItems, setSubTemplateChecklistItems] = useState([]);
  const [newSubTemplateName, setNewSubTemplateName] = useState("");
  const [editingSubTemplateId, setEditingSubTemplateId] = useState(null);
  const [editingSubTemplateName, setEditingSubTemplateName] = useState("");
  const [subTemplateHasChanges, setSubTemplateHasChanges] = useState(false);
  const [subTemplateSaveStatus, setSubTemplateSaveStatus] = useState('idle');

  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  const [persistenceError, setPersistenceError] = useState("");
  const settingBaselinesRef = useRef({});
  const settingSaveQueuesRef = useRef({});
  const settingSaveBlockedRef = useRef({});

  useEffect(() => {
    if (isOpen) loadData();
  }, [isOpen]);

  const loadData = async () => {
    try {
      const keys = [
        SETTING_KEYS.productTypes,
        SETTING_KEYS.productTypeTemplates,
        'mmmSubTemplateList',
        SETTING_KEYS.subTemplateItems,
        SETTING_KEYS.dropdownConditions,
      ];
      const records = await Promise.all(keys.map((key) => loadSingleGlobalSetting({
        entity: GlobalSettings,
        settingKey: key,
        label: `MMM setting ${key}`,
      })));
      const byKey = Object.fromEntries(keys.map((key, index) => [key, records[index] || null]));
      settingBaselinesRef.current = byKey;
      settingSaveBlockedRef.current = {};

      setProductTypes(byKey[SETTING_KEYS.productTypes]?.setting_value?.items || []);
      setProductTypeTemplates(byKey[SETTING_KEYS.productTypeTemplates]?.setting_value || {});
      setSubTemplates(byKey.mmmSubTemplateList?.setting_value?.items || []);
      setSubTemplateItems(byKey[SETTING_KEYS.subTemplateItems]?.setting_value || {});
      setDropdownConditions(byKey[SETTING_KEYS.dropdownConditions]?.setting_value?.items || []);
      return true;
    } catch (error) {
      console.error("Error loading MMM template data:", error);
      setPersistenceError(error?.message || "MMM template settings could not be loaded safely.");
      return false;
    }
  };

  const queueSettingOperation = (key, operation) => {
    const previous = settingSaveQueuesRef.current[key] || Promise.resolve();
    const queued = previous.then(async () => {
      if (settingSaveBlockedRef.current[key]) return null;
      try {
        return await operation();
      } catch (error) {
        settingSaveBlockedRef.current[key] = true;
        console.error("MMM setting save blocked:", key, error);
        setPersistenceError(error?.message || `MMM setting ${key} changed in another session. Reload latest before saving again.`);
        return null;
      }
    });
    settingSaveQueuesRef.current[key] = queued;
    return queued;
  };

  const saveSetting = (key, value) => queueSettingOperation(key, async () => {
    const saved = await saveGlobalSettingValueIfUnchanged({
      entity: GlobalSettings,
      loadedRecord: settingBaselinesRef.current[key] || null,
      settingKey: key,
      nextValue: value,
      label: `MMM setting ${key}`,
    });
    settingBaselinesRef.current[key] = saved;
    return saved;
  });

  const saveMapEntry = (key, currentMap, entryKey, nextEntry, { remove = false } = {}) => queueSettingOperation(key, async () => {
    let baseline = settingBaselinesRef.current[key] || null;
    if (!baseline?.id) {
      const nextMap = { ...(currentMap || {}) };
      if (remove) delete nextMap[entryKey];
      else nextMap[entryKey] = nextEntry;
      const created = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: null,
        settingKey: key,
        nextValue: nextMap,
        label: `MMM setting ${key}`,
      });
      settingBaselinesRef.current[key] = created;
      return created;
    }

    const saved = await saveSettingMapEntryIfUnchanged({
      entity: GlobalSettings,
      settingRecord: baseline,
      entryKey,
      expectedEntry: currentMap?.[entryKey],
      nextEntry,
      remove,
      label: `MMM ${key} entry ${entryKey}`,
    });
    settingBaselinesRef.current[key] = saved;
    return saved;
  });

  const saveProductTypes = async (types) => {
    const saved = await saveSetting(SETTING_KEYS.productTypes, { items: types });
    if (!saved) return false;
    setProductTypes(saved.setting_value?.items || types);
    return true;
  };
  const saveProductTypeTemplates = async (templates) => {
    const saved = await saveSetting(SETTING_KEYS.productTypeTemplates, templates);
    if (!saved) return false;
    setProductTypeTemplates(saved.setting_value || templates);
    return true;
  };
  const saveSubTemplateMapEntry = async (entryKey, nextEntry, options = {}) => {
    const saved = await saveMapEntry(SETTING_KEYS.subTemplateItems, subTemplateItems, entryKey, nextEntry, options);
    if (!saved) return false;
    setSubTemplateItems(saved.setting_value || {});
    return true;
  };
  const saveProductTemplateMapEntry = async (entryKey, nextEntry, options = {}) => {
    const saved = await saveMapEntry(SETTING_KEYS.productTypeTemplates, productTypeTemplates, entryKey, nextEntry, options);
    if (!saved) return false;
    setProductTypeTemplates(saved.setting_value || {});
    return true;
  };
  const saveDropdownConditions = async (items) => {
    const saved = await saveSetting(SETTING_KEYS.dropdownConditions, { items });
    if (!saved) return false;
    setDropdownConditions(saved.setting_value?.items || items);
    return true;
  };
  const saveSubTemplateList = async (list) => {
    const saved = await saveSetting('mmmSubTemplateList', { items: list });
    if (!saved) return false;
    setSubTemplates(saved.setting_value?.items || list);
    return true;
  };

  const getExistingProductNames = () => { const names = new Set(); existingChecklist.forEach(item => { if (item.product_name) names.add(item.product_name); }); return names; };

  const addProductToSelection = (productType) => {
    const existingNames = getExistingProductNames();
    const selectedNames = new Set(selectedProducts.map(p => p.customName));
    const allNames = new Set([...existingNames, ...selectedNames]);
    let customName = productType;
    let counter = 1;
    while (allNames.has(customName)) { counter++; customName = `${productType} ${counter}`; }
    setSelectedProducts([...selectedProducts, { id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, productType, customName, subTemplates: [] }]);
  };

  const updateProductName = (productId, newName) => {
    const existingNames = getExistingProductNames();
    const otherSelectedNames = selectedProducts.filter(p => p.id !== productId).map(p => p.customName);
    if (existingNames.has(newName) || otherSelectedNames.includes(newName)) { alert("A product with this name already exists."); return false; }
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
          type: 'product_header', productName: product.customName, productType: product.productType,
          items: template.items.map(item => ({ ...item, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, details: item.details?.map(d => ({ ...d, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, tasks: d.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) })), tasks: item.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) }))
        });
      }
      product.subTemplates.forEach(stId => {
        const subTemplate = subTemplates.find(st => st.id === stId);
        const stItems = subTemplateItems[stId];
        if (subTemplate && stItems?.items) {
          combinedItems.push({
            type: 'sub_template', parentProduct: product.customName, subTemplateName: subTemplate.name,
            items: stItems.items.map(item => ({ ...item, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, details: item.details?.map(d => ({ ...d, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, tasks: d.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) })), tasks: item.tasks?.map(t => ({ ...t, id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}` })) }))
          });
        }
      });
    });
    if (onApplyTemplate && combinedItems.length > 0) onApplyTemplate(combinedItems);
    setSelectedProducts([]);
  };

  // Sub-template management (stored in GlobalSettings instead of ChecklistSubItem entity)
  const createSubTemplate = async () => {
    if (!newSubTemplateName.trim()) return;
    const newST = { id: Date.now().toString(), name: newSubTemplateName.trim(), applies_to_product_types: [], order: subTemplates.length };
    await saveSubTemplateList([...subTemplates, newST]);
    setNewSubTemplateName("");
  };

  const deleteSubTemplate = async (st) => {
    if (!confirm(`Delete "${st.name}"?`)) return;
    const listSaved = await saveSubTemplateList(subTemplates.filter(s => s.id !== st.id));
    if (!listSaved) return;
    const itemsSaved = await saveSubTemplateMapEntry(st.id, undefined, { remove: true });
    if (!itemsSaved) return;
    if (selectedSubTemplate === st.id) { setSelectedSubTemplate(null); setSubTemplateChecklistItems([]); }
  };

  const selectSubTemplateForEditing = (st) => {
    setSelectedSubTemplate(st.id);
    setSubTemplateChecklistItems(subTemplateItems[st.id]?.items || []);
    setExpandedItems({});
    setSubTemplateHasChanges(false);
    setSubTemplateSaveStatus('idle');
  };

  const saveSubTemplateChecklist = async () => {
    if (!selectedSubTemplate) return;
    const saved = await saveSubTemplateMapEntry(selectedSubTemplate, { items: subTemplateChecklistItems });
    if (!saved) return;
    setSubTemplateHasChanges(false);
    setSubTemplateSaveStatus('saved');
  };

  const selectProductType = (type) => {
    setSelectedProductType(type);
    setProductTypeItems(productTypeTemplates[type]?.items || []);
    setExpandedItems({});
    setProductTypeHasChanges(false);
    setProductTypeSaveStatus('idle');
  };

  const saveProductTypeTemplate = async () => {
    if (!selectedProductType) return;
    const saved = await saveProductTemplateMapEntry(selectedProductType, { items: productTypeItems });
    if (!saved) return;
    setProductTypeHasChanges(false);
    setProductTypeSaveStatus('saved');
  };

  const addChecklistItem = (items, setItems, isProductType = false) => {
    if (!newItemText.trim()) return;
    setItems([...items, { id: Date.now().toString(), text: newItemText.trim(), type: 'checklist', dropdown_ids: [], details: [], tasks: [] }]);
    setNewItemText("");
    if (isProductType) { setProductTypeHasChanges(true); setProductTypeSaveStatus('idle'); }
    else { setSubTemplateHasChanges(true); setSubTemplateSaveStatus('idle'); }
  };

  const addDetailItem = (items, setItems, parentId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => item.id === parentId ? { ...item, details: [...(item.details || []), { id: Date.now().toString(), text: text.trim(), type: 'detail', dropdown_ids: [], tasks: [] }] } : item));
  };

  const addTask = (items, setItems, parentId, detailId, text) => {
    if (!text.trim()) return;
    setItems(items.map(item => {
      if (item.id === parentId) {
        if (detailId) return { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: [...(d.tasks || []), { id: Date.now().toString(), text: text.trim(), type: 'task', assigned_to: '' }] } : d) };
        return { ...item, tasks: [...(item.tasks || []), { id: Date.now().toString(), text: text.trim(), type: 'task', assigned_to: '' }] };
      }
      return item;
    }));
  };

  const updateItem = (items, setItems, id, updates, detailId = null, taskId = null) => {
    setItems(items.map(item => {
      if (item.id === id) {
        if (detailId) return { ...item, details: item.details.map(d => d.id === detailId ? (taskId ? { ...d, tasks: d.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) } : { ...d, ...updates }) : d) };
        if (taskId) return { ...item, tasks: item.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) };
        return { ...item, ...updates };
      }
      return item;
    }));
  };

  const deleteItem = (items, setItems, id, detailId = null, taskId = null) => {
    if (taskId) setItems(items.map(item => item.id === id ? (detailId ? { ...item, details: item.details.map(d => d.id === detailId ? { ...d, tasks: d.tasks.filter(t => t.id !== taskId) } : d) } : { ...item, tasks: item.tasks.filter(t => t.id !== taskId) }) : item));
    else if (detailId) setItems(items.map(item => item.id === id ? { ...item, details: item.details.filter(d => d.id !== detailId) } : item));
    else setItems(items.filter(item => item.id !== id));
  };

  const handleDragEnd = (result, items, setItems, isProductType = false) => {
    if (!result.destination) return;
    const reordered = Array.from(items);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setItems(reordered);
    if (isProductType) { setProductTypeHasChanges(true); setProductTypeSaveStatus('idle'); }
    else { setSubTemplateHasChanges(true); setSubTemplateSaveStatus('idle'); }
  };

  const toggleItemExpanded = (itemId) => setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));

  const renderConditionSelect = (item, items, setItems, detailId = null, onChangeCallback = null) => {
    const uniqueId = detailId ? `mmm-${item.id}-${detailId}` : `mmm-${item.id}`;
    const isOpen = openDropdownId === uniqueId;
    let currentIds = [];
    if (detailId) {
      const detail = items.find(i => i.id === item.id)?.details?.find(d => d.id === detailId);
      currentIds = detail?.dropdown_ids || [];
    } else {
      currentIds = item.dropdown_ids || [];
    }
    const selectedNames = currentIds.map(id => dropdownConditions.find(d => d.id === id)?.name).filter(Boolean);

    const toggleCondition = (conditionId) => {
      const newIds = currentIds.includes(conditionId) ? currentIds.filter(id => id !== conditionId) : [...currentIds, conditionId];
      if (detailId) updateItem(items, setItems, item.id, { dropdown_ids: newIds }, detailId);
      else updateItem(items, setItems, item.id, { dropdown_ids: newIds });
      if (onChangeCallback) onChangeCallback();
    };

    const getButtonRect = () => {
      const btn = document.querySelector(`[data-mmm-dropdown-id="${uniqueId}"]`);
      return btn?.getBoundingClientRect() || { bottom: 0, left: 0 };
    };

    return (
      <div className="relative">
        <button type="button" data-mmm-dropdown-id={uniqueId} onClick={(e) => { e.stopPropagation(); setOpenDropdownId(isOpen ? null : uniqueId); }}
          className="h-6 text-xs px-2 border rounded flex items-center gap-1 bg-white hover:bg-gray-50 min-w-[100px]">
          <span className="truncate flex-1 text-left">{selectedNames.length === 0 ? "Condition" : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} selected`}</span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" />
        </button>
        {isOpen && ReactDOM.createPortal(
          <>
            <div className="fixed inset-0 z-[300]" onClick={() => setOpenDropdownId(null)} />
            <div className="fixed z-[301] bg-white border rounded-lg shadow-2xl min-w-[240px] max-h-64 overflow-y-auto"
              style={{ top: getButtonRect().bottom + 4, left: getButtonRect().left }}>
              <div className="p-2 border-b bg-gray-50 font-medium text-xs sticky top-0">Select Conditions</div>
              {[...dropdownConditions.filter(d => d.is_completed), ...dropdownConditions.filter(d => !d.is_completed)].map(dd => (
                <div key={dd.id} onClick={(e) => { e.stopPropagation(); toggleCondition(dd.id); }}
                  className={`flex items-center gap-2 px-3 py-2 hover:bg-orange-50 cursor-pointer text-sm ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}>
                  <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${currentIds.includes(dd.id) ? 'bg-orange-500 border-orange-500' : 'border-gray-300'}`}>
                    {currentIds.includes(dd.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>{dd.name}</span>
                  <span className={`text-xs px-1 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>{dd.is_completed ? '✓' : 'C'}</span>
                </div>
              ))}
              <div onClick={(e) => { e.stopPropagation(); setShowOtherPopup({ items, setItems, itemId: item.id, detailId }); setOpenDropdownId(null); }}
                className="flex items-center gap-2 px-3 py-2 hover:bg-orange-50 cursor-pointer text-sm text-orange-600 font-medium border-t sticky bottom-0 bg-white">
                <Plus className="w-4 h-4" /><span>Add New Condition...</span>
              </div>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

  const renderCompactItem = (item, index, items, setItems, provided, isProductType = false) => {
    const markChanged = () => { if (isProductType) { setProductTypeHasChanges(true); setProductTypeSaveStatus('idle'); } else { setSubTemplateHasChanges(true); setSubTemplateSaveStatus('idle'); } };
    const updateWithChange = (id, updates, detailId = null, taskId = null) => { updateItem(items, setItems, id, updates, detailId, taskId); markChanged(); };
    const deleteWithChange = (id, detailId = null, taskId = null) => { deleteItem(items, setItems, id, detailId, taskId); markChanged(); };

    return (
      <div ref={provided.innerRef} {...provided.draggableProps} className={`border rounded p-1.5 bg-white mb-1 ${expandedItems[item.id] ? 'ring-1 ring-orange-300' : ''}`}>
        <div className="flex items-center gap-1">
          <div {...provided.dragHandleProps} className="cursor-grab"><GripVertical className="w-3 h-3 text-gray-400" /></div>
          <button onClick={() => toggleItemExpanded(item.id)} className="p-0.5">{expandedItems[item.id] ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}</button>
          <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">C</span>
          {editingItem === item.id ? (
            <Input value={item.text} onChange={(e) => updateWithChange(item.id, { text: e.target.value })} onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)} autoFocus className="h-5 text-xs flex-1" />
          ) : (
            <span className="flex-1 text-xs font-medium truncate cursor-pointer" onClick={() => setEditingItem(item.id)}>{item.text}</span>
          )}
          {renderConditionSelect(item, items, setItems, null, markChanged)}
          <button onClick={() => deleteWithChange(item.id)} className="p-0.5 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
        </div>
        {expandedItems[item.id] && (
          <div className="ml-5 mt-1 pl-2 border-l-2 border-gray-200 space-y-1">
            {item.tasks?.map(task => (
              <div key={task.id} className="flex items-center gap-1 bg-orange-50 p-1 rounded text-xs group/task">
                <span className="px-1 py-0.5 rounded bg-orange-100 text-orange-700">T</span>
                {editingItem === task.id ? (
                  <Input value={task.text} onChange={(e) => updateWithChange(item.id, { text: e.target.value }, null, task.id)} onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                ) : (
                  <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(task.id)}>{task.text}</span>
                )}
                <button onClick={() => deleteWithChange(item.id, null, task.id)} className="p-0.5 opacity-0 group-hover/task:opacity-100"><Trash2 className="w-2.5 h-2.5 text-red-400" /></button>
              </div>
            ))}
            <Input placeholder="+ task" className="h-5 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTask(items, setItems, item.id, null, e.target.value); markChanged(); e.target.value = ""; } }} />
            {item.details?.map(detail => (
              <div key={detail.id} className="bg-gray-50 p-1 rounded border">
                <div className="flex items-center gap-1 text-xs">
                  <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">D</span>
                  {editingItem === detail.id ? (
                    <Input value={detail.text} onChange={(e) => updateWithChange(item.id, { text: e.target.value }, detail.id)} onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                  ) : (
                    <span className="flex-1 truncate cursor-pointer" onClick={() => setEditingItem(detail.id)}>{detail.text}</span>
                  )}
                  {renderConditionSelect(item, items, setItems, detail.id, markChanged)}
                  <button onClick={() => deleteWithChange(item.id, detail.id)} className="p-0.5"><Trash2 className="w-2.5 h-2.5 text-red-400" /></button>
                </div>
                <div className="ml-4 mt-1 space-y-0.5">
                  {detail.tasks?.map(task => (
                    <div key={task.id} className="flex items-center gap-1 bg-orange-50 p-0.5 rounded text-xs group/dtask">
                      <span className="px-0.5 rounded bg-orange-100 text-orange-700">T</span>
                      {editingItem === task.id ? (
                        <Input value={task.text} onChange={(e) => updateWithChange(item.id, { text: e.target.value }, detail.id, task.id)} onBlur={() => setEditingItem(null)} autoFocus className="h-4 text-xs flex-1" />
                      ) : (
                        <span className="flex-1 text-xs truncate cursor-pointer" onClick={() => setEditingItem(task.id)}>{task.text}</span>
                      )}
                      <button onClick={() => deleteWithChange(item.id, detail.id, task.id)} className="p-0.5 opacity-0 group-hover/dtask:opacity-100"><Trash2 className="w-2 h-2 text-red-400" /></button>
                    </div>
                  ))}
                  <Input placeholder="+ task" className="h-4 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTask(items, setItems, item.id, detail.id, e.target.value); markChanged(); e.target.value = ""; } }} />
                </div>
              </div>
            ))}
            <Input placeholder="+ detail" className="h-5 text-xs" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addDetailItem(items, setItems, item.id, e.target.value); markChanged(); e.target.value = ""; } }} />
          </div>
        )}
      </div>
    );
  };

  const renderItemEditor = (items, setItems, isProductType = false) => (
    <DragDropContext onDragEnd={(result) => handleDragEnd(result, items, setItems, isProductType)}>
      <Droppable droppableId="mmm-items">
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

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-[95vw] max-w-[1600px] h-[90vh] overflow-hidden flex flex-col bg-white rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-2 border-b bg-orange-50 flex items-center justify-between">
            <div><h2 className="text-lg font-bold text-orange-800">MMM Checklist Builder</h2></div>
            <Button variant="ghost" size="sm" onClick={onClose}><X className="w-4 h-4" /></Button>
          </div>

          {persistenceError && (
            <div className="mx-3 mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex items-start justify-between gap-3">
              <div>
                <div className="font-medium">MMM template update blocked</div>
                <div className="mt-1">{persistenceError}</div>
              </div>
              <Button type="button" size="sm" variant="outline" className="h-7 shrink-0 border-red-300 bg-white text-red-800" onClick={async () => { setPersistenceError(""); await loadData(); }}>
                Reload latest
              </Button>
            </div>
          )}

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
                  <h3 className="font-bold text-sm mb-2">All Product Checklists</h3>
                  <div className="space-y-1 flex-1 overflow-y-auto">
                    {productTypes.length === 0 && <div className="text-center py-6 text-gray-400 text-sm border rounded border-dashed">No product types yet. Create them in the Product Checklists tab.</div>}
                    {productTypes.map(type => {
                      const hasTemplate = productTypeTemplates[type]?.items?.length > 0;
                      return (
                        <div key={type} onClick={() => hasTemplate && addProductToSelection(type)}
                          className={`p-2 rounded border flex items-center justify-between ${hasTemplate ? 'bg-white hover:bg-orange-50 cursor-pointer' : 'bg-gray-100 opacity-50'}`}>
                          <div><div className="font-medium text-sm">{type}</div><div className="text-xs text-gray-500">{hasTemplate ? `${productTypeTemplates[type].items.length} items` : 'No template'}</div></div>
                          {hasTemplate && <Plus className="w-4 h-4 text-orange-500" />}
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
                            const applicableSTs = subTemplates.filter(st => { const hasItems = subTemplateItems[st.id]?.items?.length > 0; const appliesToThis = st.applies_to_product_types?.includes(product.productType) || st.applies_to_product_types?.length === 0; return hasItems && appliesToThis; });
                            if (applicableSTs.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1">
                                {applicableSTs.map(st => {
                                  const isSelected = product.subTemplates.includes(st.id);
                                  return (
                                    <div key={st.id} onClick={() => toggleSubTemplateForProduct(product.id, st.id)}
                                      className={`text-xs px-1.5 py-1 rounded border flex items-center gap-1 cursor-pointer ${isSelected ? 'bg-orange-100 border-orange-400' : 'bg-white hover:border-orange-300'}`}>
                                      <div className={`w-3 h-3 rounded border flex items-center justify-center ${isSelected ? 'bg-orange-500 border-orange-500' : 'border-gray-400'}`}>
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
                    <Button onClick={handleApplyTemplate} className="w-full mt-2 bg-orange-600 hover:bg-orange-700">
                      <CheckSquare className="w-4 h-4 mr-2" />Apply to Project
                    </Button>
                  )}
                </div>

                <div className="border-l pl-3">
                  <h3 className="font-bold text-sm mb-2">Preview</h3>
                  <div className="bg-gray-50 border rounded-lg p-3 max-h-[60vh] overflow-y-auto">
                    {selectedProducts.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">Select products to preview</div>
                    ) : selectedProducts.map(product => {
                      const template = productTypeTemplates[product.productType];
                      return (
                        <div key={product.id} className="mb-4 last:mb-0">
                          <h4 className="font-bold text-sm text-orange-800 mb-2 pb-1 border-b">📋 {product.customName}</h4>
                          {template?.items?.map((item, idx) => (
                            <div key={idx} className="mb-2">
                              <div className="flex items-start gap-2 p-2 bg-white rounded border">
                                <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                                <div className="font-medium text-xs flex-1">{item.text}</div>
                              </div>
                              {item.tasks?.map((task, tIdx) => <div key={tIdx} className="ml-6 mt-1 flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs"><div className="w-3 h-3 border rounded flex-shrink-0" /><span>{task.text}</span></div>)}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Product Templates Tab */}
            <TabsContent value="producttypes" className="overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-4 h-full">
                <div className="space-y-1 overflow-y-auto">
                  <div className="flex gap-1 mb-2">
                    <Input id="mmmNewPT" placeholder="New product type..." className="h-7 text-sm" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { saveProductTypes([...productTypes, e.target.value.trim()]); e.target.value = ""; } }} />
                    <Button size="sm" className="h-7 px-2" onClick={() => { const input = document.getElementById('mmmNewPT'); if (input?.value.trim()) { saveProductTypes([...productTypes, input.value.trim()]); input.value = ""; } }}><Plus className="w-3 h-3" /></Button>
                  </div>
                  {productTypes.map((type, index) => (
                    <div key={type} onClick={() => editingProductTypeName !== type && selectProductType(type)}
                      className={`p-1.5 rounded border cursor-pointer flex items-center gap-1 mb-1 ${selectedProductType === type ? 'bg-orange-100 border-orange-300' : 'bg-white hover:bg-gray-50'}`}>
                      {editingProductTypeName === type ? (
                        <div className="flex-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input value={editingProductTypeValue} onChange={(e) => setEditingProductTypeValue(e.target.value)} className="h-6 text-xs flex-1" autoFocus
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter' && editingProductTypeValue.trim()) {
                                const newName = editingProductTypeValue.trim();
                                const newTypes = productTypes.map(t => t === type ? newName : t);
                                const typesSaved = await saveProductTypes(newTypes);
                                if (!typesSaved) return;
                                if (productTypeTemplates[type]) { const nt = { ...productTypeTemplates }; nt[newName] = nt[type]; delete nt[type]; await saveProductTypeTemplates(nt); }
                                if (selectedProductType === type) setSelectedProductType(newName);
                                setEditingProductTypeName(null);
                              }
                              if (e.key === 'Escape') setEditingProductTypeName(null);
                            }} />
                          <Button size="sm" className="h-6 px-1" onClick={async () => {
                            if (editingProductTypeValue.trim()) {
                              const newName = editingProductTypeValue.trim();
                              const newTypes = productTypes.map(t => t === type ? newName : t);
                              const typesSaved = await saveProductTypes(newTypes);
                              if (!typesSaved) return;
                              if (productTypeTemplates[type]) { const nt = { ...productTypeTemplates }; nt[newName] = nt[type]; delete nt[type]; await saveProductTypeTemplates(nt); }
                              if (selectedProductType === type) setSelectedProductType(newName);
                            }
                            setEditingProductTypeName(null);
                          }}><Save className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0"><div className="font-medium text-xs truncate">{type}</div><div className="text-xs text-gray-500">{productTypeTemplates[type]?.items?.length || 0} items</div></div>
                          <button onClick={(e) => { e.stopPropagation(); setEditingProductTypeName(type); setEditingProductTypeValue(type); }} className="p-0.5"><Pencil className="w-3 h-3 text-gray-400" /></button>
                          <button onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${type}"?`)) { saveProductTypes(productTypes.filter((_, i) => i !== index)); if (selectedProductType === type) { setSelectedProductType(null); setProductTypeItems([]); } } }} className="p-0.5"><Trash2 className="w-3 h-3 text-red-500" /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden bg-gray-50 border rounded-lg p-3">
                  {selectedProductType ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-sm">{selectedProductType}</h3>
                        {(productTypeHasChanges || productTypeSaveStatus === 'saved') && (
                          <Button onClick={saveProductTypeTemplate} size="sm" className={`h-7 ${productTypeSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                            <Save className="w-3 h-3 mr-1" />{productTypeSaveStatus === 'saved' ? 'Saved' : 'Save'}
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

                <div className="overflow-hidden border rounded-lg p-3 bg-white">
                  <h3 className="font-bold text-sm mb-2 pb-1 border-b">Live Preview</h3>
                  {selectedProductType && productTypeItems.length > 0 ? (
                    <div className="max-h-[65vh] overflow-y-auto">
                      <h4 className="font-bold text-sm text-orange-800 mb-2 pb-1 border-b">📋 {selectedProductType}</h4>
                      {productTypeItems.map(item => (
                        <div key={item.id} className="mb-2">
                          <div className="flex items-start gap-2 p-2 bg-white rounded border">
                            <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                            <div className="font-medium text-xs flex-1">{item.text}</div>
                          </div>
                          {item.tasks?.map(task => <div key={task.id} className="ml-6 mt-1 flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs"><div className="w-3 h-3 border rounded flex-shrink-0" /><span>{task.text}</span></div>)}
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center py-8 text-gray-400 text-sm">{selectedProductType ? 'Add items to see preview' : 'Select a product type to preview'}</div>}
                </div>
              </div>
            </TabsContent>

            {/* Sub-Templates Tab */}
            <TabsContent value="subtemplates" className="overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-[200px_1fr_1fr] gap-4 h-full">
                <div className="space-y-1 overflow-y-auto">
                  <div className="flex gap-1 mb-2">
                    <Input value={newSubTemplateName} onChange={(e) => setNewSubTemplateName(e.target.value)} placeholder="New option..." className="h-7 text-sm" onKeyDown={(e) => e.key === 'Enter' && createSubTemplate()} />
                    <Button size="sm" className="h-7 px-2" onClick={createSubTemplate}><Plus className="w-3 h-3" /></Button>
                  </div>
                  {subTemplates.map(st => (
                    <div key={st.id} onClick={() => editingSubTemplateId !== st.id && selectSubTemplateForEditing(st)}
                      className={`p-1.5 rounded border cursor-pointer flex items-center gap-1 mb-1 ${selectedSubTemplate === st.id ? 'bg-orange-100 border-orange-300' : 'bg-white hover:bg-gray-50'}`}>
                      {editingSubTemplateId === st.id ? (
                        <div className="flex-1 flex gap-1" onClick={(e) => e.stopPropagation()}>
                          <Input value={editingSubTemplateName} onChange={(e) => setEditingSubTemplateName(e.target.value)} className="h-6 text-xs flex-1" autoFocus
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') { await saveSubTemplateList(subTemplates.map(s => s.id === st.id ? { ...s, name: editingSubTemplateName } : s)); setEditingSubTemplateId(null); }
                              if (e.key === 'Escape') setEditingSubTemplateId(null);
                            }} />
                          <Button size="sm" className="h-6 px-1" onClick={async () => { await saveSubTemplateList(subTemplates.map(s => s.id === st.id ? { ...s, name: editingSubTemplateName } : s)); setEditingSubTemplateId(null); }}><Save className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0"><div className="font-medium text-xs truncate">{st.name}</div><div className="text-xs text-gray-500">{subTemplateItems[st.id]?.items?.length || 0} items</div></div>
                          <button onClick={(e) => { e.stopPropagation(); setEditingSubTemplateId(st.id); setEditingSubTemplateName(st.name); }} className="p-0.5"><Pencil className="w-3 h-3 text-gray-400" /></button>
                          <button onClick={(e) => { e.stopPropagation(); deleteSubTemplate(st); }} className="p-0.5"><Trash2 className="w-3 h-3 text-red-500" /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden bg-gray-50 border rounded-lg p-3 flex flex-col">
                  {selectedSubTemplate ? (
                    <>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-sm">{subTemplates.find(st => st.id === selectedSubTemplate)?.name}</h3>
                        {(subTemplateHasChanges || subTemplateSaveStatus === 'saved') && (
                          <Button onClick={saveSubTemplateChecklist} size="sm" className={`h-7 ${subTemplateSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : 'bg-orange-600 hover:bg-orange-700'}`}>
                            <Save className="w-3 h-3 mr-1" />{subTemplateSaveStatus === 'saved' ? 'Saved' : 'Save'}
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
                      <div className="mt-3 pt-3 border-t">
                        <p className="text-xs font-medium text-gray-600 mb-2">Applies to Product Types:</p>
                        <div className="flex flex-wrap gap-1">
                          {productTypes.map(type => {
                            const currentST = subTemplates.find(st => st.id === selectedSubTemplate);
                            const isApplied = currentST?.applies_to_product_types?.includes(type);
                            return (
                              <button key={type} onClick={async () => {
                                const currentApplies = currentST?.applies_to_product_types || [];
                                const newApplies = isApplied ? currentApplies.filter(t => t !== type) : [...currentApplies, type];
                                await saveSubTemplateList(subTemplates.map(s => s.id === selectedSubTemplate ? { ...s, applies_to_product_types: newApplies } : s));
                              }} className={`text-xs px-2 py-1 rounded border flex items-center gap-1 ${isApplied ? 'bg-orange-100 border-orange-400' : 'bg-white border-gray-300 hover:border-orange-300'}`}>
                                <div className={`w-3 h-3 rounded border flex items-center justify-center ${isApplied ? 'bg-orange-500 border-orange-500' : 'border-gray-400'}`}>
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
                  ) : <div className="flex items-center justify-center h-full text-gray-500 text-sm">Select an option template</div>}
                </div>

                <div className="overflow-hidden border rounded-lg p-3 bg-white">
                  <h3 className="font-bold text-sm mb-2 pb-1 border-b">Live Preview</h3>
                  {selectedSubTemplate && subTemplateChecklistItems.length > 0 ? (
                    <div className="max-h-[65vh] overflow-y-auto">
                      <h4 className="font-bold text-sm text-orange-800 mb-2">🔗 {subTemplates.find(st => st.id === selectedSubTemplate)?.name}</h4>
                      {subTemplateChecklistItems.map(item => (
                        <div key={item.id} className="mb-2">
                          <div className="flex items-start gap-2 p-2 bg-white rounded border">
                            <div className="w-4 h-4 border-2 rounded mt-0.5 flex-shrink-0" />
                            <div className="font-medium text-xs flex-1">{item.text}</div>
                          </div>
                          {item.tasks?.map(task => <div key={task.id} className="ml-6 mt-1 flex items-center gap-2 p-1.5 bg-orange-50 rounded text-xs"><div className="w-3 h-3 border rounded flex-shrink-0" /><span>{task.text}</span></div>)}
                        </div>
                      ))}
                    </div>
                  ) : <div className="text-center py-8 text-gray-400 text-sm">{selectedSubTemplate ? 'Add items to see preview' : 'Select an option template to preview'}</div>}
                </div>
              </div>
            </TabsContent>

            {/* Conditions Tab */}
            <TabsContent value="dropdowns" className="overflow-y-auto p-3" style={{ marginTop: 0 }}>
              <div className="mb-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm">
                <p className="font-medium mb-1">How to use conditions:</p>
                <p className="text-gray-600">These conditions are specific to the Monday Morning Meeting checklists and are completely separate from SIPs conditions.</p>
              </div>
              <div className="flex gap-2 mb-4">
                <Input value={newDropdownName} onChange={(e) => setNewDropdownName(e.target.value)} placeholder="New condition..." className="flex-1 h-8 text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter' && newDropdownName.trim()) { saveDropdownConditions([...dropdownConditions, { id: Date.now().toString(), name: newDropdownName.trim(), is_completed: false, order: dropdownConditions.length }]); setNewDropdownName(""); } }} />
                <Button size="sm" onClick={() => { if (newDropdownName.trim()) { saveDropdownConditions([...dropdownConditions, { id: Date.now().toString(), name: newDropdownName.trim(), is_completed: false, order: dropdownConditions.length }]); setNewDropdownName(""); } }}><Plus className="w-3 h-3 mr-1" />Add</Button>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-green-300">
                    <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-3 h-3 text-white" /></div>
                    <h3 className="font-bold text-green-800">Completed Conditions</h3>
                  </div>
                  <div className="space-y-1">
                    {dropdownConditions.filter(dd => dd.is_completed).map(dd => (
                      <div key={dd.id} className="flex items-center gap-1 p-2 border rounded text-sm bg-green-50 border-green-300">
                        <button onClick={() => { const cont = dropdownConditions.filter(d => !d.is_completed); const comp = dropdownConditions.filter(d => d.is_completed && d.id !== dd.id); saveDropdownConditions([...comp, ...cont, { ...dd, is_completed: false }]); }} className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0 hover:bg-green-600" title="Move to Continued"><Check className="w-3 h-3 text-white" /></button>
                        {editingDropdown === dd.id ? (
                          <><Input id={`mmm-edit-${dd.id}`} defaultValue={dd.name} className="flex-1 h-6 text-sm" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { const n = e.target.value.trim(); if (n) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: n } : d)); setEditingDropdown(null); } if (e.key === 'Escape') setEditingDropdown(null); }} />
                          <Button size="sm" className="h-6 px-2" onClick={() => { const input = document.getElementById(`mmm-edit-${dd.id}`); const n = input?.value.trim(); if (n) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: n } : d)); setEditingDropdown(null); }}><Save className="w-3 h-3" /></Button></>
                        ) : (
                          <><span className="flex-1 truncate">{dd.name}</span><button onClick={() => setEditingDropdown(dd.id)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button></>
                        )}
                        <button onClick={() => { if (confirm(`Delete "${dd.name}"?`)) saveDropdownConditions(dropdownConditions.filter(d => d.id !== dd.id)); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                      </div>
                    ))}
                    {dropdownConditions.filter(d => d.is_completed).length === 0 && <div className="text-center py-4 text-gray-400 text-sm border rounded border-dashed">No completed conditions</div>}
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-yellow-300">
                    <div className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center"><span className="text-white text-xs font-bold">C</span></div>
                    <h3 className="font-bold text-yellow-800">Continued Conditions</h3>
                  </div>
                  <div className="space-y-1">
                    {dropdownConditions.filter(dd => !dd.is_completed).map(dd => (
                      <div key={dd.id} className="flex items-center gap-1 p-2 border rounded text-sm bg-yellow-50 border-yellow-300">
                        <button onClick={() => { const comp = dropdownConditions.filter(d => d.is_completed); const cont = dropdownConditions.filter(d => !d.is_completed && d.id !== dd.id); saveDropdownConditions([...comp, { ...dd, is_completed: true }, ...cont]); }} className="w-5 h-5 rounded-full bg-yellow-500 flex items-center justify-center flex-shrink-0 hover:bg-yellow-600" title="Move to Completed"><span className="text-white text-xs font-bold">C</span></button>
                        {editingDropdown === dd.id ? (
                          <><Input id={`mmm-edit-${dd.id}`} defaultValue={dd.name} className="flex-1 h-6 text-sm" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') { const n = e.target.value.trim(); if (n) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: n } : d)); setEditingDropdown(null); } if (e.key === 'Escape') setEditingDropdown(null); }} />
                          <Button size="sm" className="h-6 px-2" onClick={() => { const input = document.getElementById(`mmm-edit-${dd.id}`); const n = input?.value.trim(); if (n) saveDropdownConditions(dropdownConditions.map(d => d.id === dd.id ? { ...d, name: n } : d)); setEditingDropdown(null); }}><Save className="w-3 h-3" /></Button></>
                        ) : (
                          <><span className="flex-1 truncate">{dd.name}</span><button onClick={() => setEditingDropdown(dd.id)} className="p-1 hover:bg-gray-100 rounded"><Pencil className="w-3 h-3 text-gray-400" /></button></>
                        )}
                        <button onClick={() => { if (confirm(`Delete "${dd.name}"?`)) saveDropdownConditions(dropdownConditions.filter(d => d.id !== dd.id)); }} className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-3 h-3 text-red-500" /></button>
                      </div>
                    ))}
                    {dropdownConditions.filter(d => !d.is_completed).length === 0 && <div className="text-center py-4 text-gray-400 text-sm border rounded border-dashed">No continued conditions</div>}
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="px-3 py-2 border-t bg-gray-50 flex justify-end">
            <Button onClick={onClose} variant="outline" size="sm">Close</Button>
          </div>
        </div>
      </div>

      <Dialog open={!!showOtherPopup} onOpenChange={() => setShowOtherPopup(null)}>
        <DialogContent className="max-w-sm z-[110]">
          <DialogHeader><DialogTitle>Add Condition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="max-h-36 overflow-y-auto border rounded">
              {dropdownConditions.map(dd => (
                <div key={dd.id} onClick={() => { if (showOtherPopup) { const { items, setItems, itemId, detailId } = showOtherPopup; const curIds = detailId ? (items.find(i => i.id === itemId)?.details?.find(d => d.id === detailId)?.dropdown_ids || []) : (items.find(i => i.id === itemId)?.dropdown_ids || []); const newIds = curIds.includes(dd.id) ? curIds : [...curIds, dd.id]; if (detailId) updateItem(items, setItems, itemId, { dropdown_ids: newIds }, detailId); else updateItem(items, setItems, itemId, { dropdown_ids: newIds }); setShowOtherPopup(null); } }}
                  className="p-2 border-b last:border-b-0 hover:bg-orange-50 cursor-pointer flex items-center gap-2 text-sm">
                  <List className="w-4 h-4 text-orange-500" /><span>{dd.name}</span>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={customDropdownValue} onChange={(e) => setCustomDropdownValue(e.target.value)} placeholder="New condition..." onKeyDown={(e) => {
                if (e.key === 'Enter' && customDropdownValue.trim()) {
                  const newDD = { id: Date.now().toString(), name: customDropdownValue.trim(), is_completed: false };
                  saveDropdownConditions([...dropdownConditions, newDD]);
                  if (showOtherPopup) { const { items, setItems, itemId, detailId } = showOtherPopup; const curIds = detailId ? (items.find(i => i.id === itemId)?.details?.find(d => d.id === detailId)?.dropdown_ids || []) : (items.find(i => i.id === itemId)?.dropdown_ids || []); const newIds = [...curIds, newDD.id]; if (detailId) updateItem(items, setItems, itemId, { dropdown_ids: newIds }, detailId); else updateItem(items, setItems, itemId, { dropdown_ids: newIds }); }
                  setCustomDropdownValue(""); setShowOtherPopup(null);
                }
              }} />
              <Button onClick={() => {
                if (customDropdownValue.trim()) {
                  const newDD = { id: Date.now().toString(), name: customDropdownValue.trim(), is_completed: false };
                  saveDropdownConditions([...dropdownConditions, newDD]);
                  if (showOtherPopup) { const { items, setItems, itemId, detailId } = showOtherPopup; const curIds = detailId ? (items.find(i => i.id === itemId)?.details?.find(d => d.id === detailId)?.dropdown_ids || []) : (items.find(i => i.id === itemId)?.dropdown_ids || []); const newIds = [...curIds, newDD.id]; if (detailId) updateItem(items, setItems, itemId, { dropdown_ids: newIds }, detailId); else updateItem(items, setItems, itemId, { dropdown_ids: newIds }); }
                  setCustomDropdownValue(""); setShowOtherPopup(null);
                }
              }} disabled={!customDropdownValue.trim()}><Plus className="w-4 h-4" /></Button>
            </div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowOtherPopup(null)}>Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}