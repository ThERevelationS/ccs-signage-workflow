import { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { 
  Plus, Trash2, Pencil, Save, X, ChevronDown, ChevronRight, CheckSquare, 
  List, Copy, GripVertical, Check, AlertTriangle
} from "lucide-react";
import { loadSingleGlobalSetting, saveGlobalSettingValueIfUnchanged } from "@/components/permitting/permitGlobalSettingsPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  createChecklistSubItemIfAbsent,
  deleteChecklistSubItemIfUnchanged,
  reorderChecklistSubItemsIfUnchanged,
  saveSettingMapEntryIfUnchanged,
  updateChecklistSubItemIfUnchanged,
} from "./templateBuilderPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

const ChecklistSubItem = staffEntities.ChecklistSubItem;
const GlobalSettings = base44.entities.GlobalSettings;

// Keep the condition menu inside the visible viewport, including above the
// trigger when there is more room there (e.g. near the bottom of a phone).
function getConditionDropdownPosition(anchor, viewport) {
  const gutter = 8;
  const gap = 4;
  const viewportRight = viewport.left + viewport.width;
  const viewportBottom = viewport.top + viewport.height;
  const width = Math.min(280, Math.max(0, viewport.width - gutter * 2));
  const left = Math.min(Math.max(anchor.left, viewport.left + gutter), viewportRight - gutter - width);
  const roomBelow = Math.max(0, viewportBottom - gutter - anchor.bottom - gap);
  const roomAbove = Math.max(0, anchor.top - gap - viewport.top - gutter);
  const openAbove = roomBelow < Math.min(192, viewport.height / 2) && roomAbove > roomBelow;
  const maxHeight = Math.min(256, openAbove ? roomAbove : roomBelow);
  const desiredTop = openAbove ? anchor.top - gap - maxHeight : anchor.bottom + gap;
  const top = Math.max(viewport.top + gutter, Math.min(desiredTop, viewportBottom - gutter - maxHeight));

  return { left, top, width, maxHeight };
}

// Count only new checklist groups/options that Apply will actually add.
// Saved Work Order products are present for adding options, not for reapplying.
function countPendingChecklistAdditions(products, productTypeTemplates, subTemplates, subTemplateItems) {
  const availableOptions = new Set(subTemplates.filter(st => subTemplateItems[st.id]?.items?.length > 0).map(st => st.id));
  return products.reduce((count, product) => count +
    (!product.isExisting && productTypeTemplates[product.productType]?.items?.length > 0 ? 1 : 0) +
    product.subTemplates.filter(id => availableOptions.has(id)).length, 0);
}

export default function TemplateBuilder({ isOpen, onClose, onApplyTemplate, existingChecklist = [], isAdmin = false, workOrderProducts = [] }) {
  const [activeTab, setActiveTab] = useState("selectors");
  const [subTemplates, setSubTemplates] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productTypeTemplates, setProductTypeTemplates] = useState({});
  const [subTemplateItems, setSubTemplateItems] = useState({});
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [settingRecords, setSettingRecords] = useState({});
  const [persistenceError, setPersistenceError] = useState("");
  const [isSubTemplateReordering, setIsSubTemplateReordering] = useState(false);
  const [noticeDialog, setNoticeDialog] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [pendingEditorSwitch, setPendingEditorSwitch] = useState(null);
  const [pendingNavigation, setPendingNavigation] = useState(null);
  
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
  const [newProductTypeName, setNewProductTypeName] = useState("");
  const [editingProductTypeName, setEditingProductTypeName] = useState(null);
  const [editingProductTypeValue, setEditingProductTypeValue] = useState("");
  
  // Conditions Editor
  const [newDropdownName, setNewDropdownName] = useState("");
  const [editingDropdown, setEditingDropdown] = useState(null);
  const [editingDropdownName, setEditingDropdownName] = useState("");
  
  // Other Dropdown Popup
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  
  // Multi-select dropdown state
  const [openDropdownId, setOpenDropdownId] = useState(null);
  const conditionTriggerRef = useRef(null);
  const conditionPopupRef = useRef(null);
  const [, refreshConditionPosition] = useState(0);

  useEffect(() => {
    if (!isOpen || !openDropdownId) return undefined;

    const reposition = () => refreshConditionPosition(value => value + 1);
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpenDropdownId(null);
      conditionTriggerRef.current?.focus();
    };

    conditionPopupRef.current?.querySelector('button')?.focus();
    window.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('resize', reposition);
    window.visualViewport?.addEventListener('scroll', reposition);
    window.addEventListener('keydown', closeOnEscape, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('resize', reposition);
      window.visualViewport?.removeEventListener('scroll', reposition);
      window.removeEventListener('keydown', closeOnEscape, true);
    };
  }, [isOpen, openDropdownId]);

  // Get users list
  const [users, setUsers] = useState([]);
  useEffect(() => {
    // Never reuse directory suggestions from a previous Builder opening.
    // Cleanup also fences late success/failure responses after close/unmount.
    let cancelled = false;
    setUsers([]);
    if (isOpen) {
      const loadUsers = async () => {
        try {
          const usersData = await loadAllEntityRows({
            entity: staffEntities.AuthorizedEmail,
            sort: null,
            label: "SIP Template Builder authorized users",
          });
          if (!cancelled) setUsers(usersData);
        } catch (error) {
          if (!cancelled) console.error("Error loading users:", error);
        }
      };
      void loadUsers();
    }
    return () => { cancelled = true; };
  }, [isOpen]);
  
  // Track changes and save state for Product Templates and Sub-Templates
  const [productTypeHasChanges, setProductTypeHasChanges] = useState(false);
  const [productTypeSaveStatus, setProductTypeSaveStatus] = useState('idle'); // 'idle' | 'saved'
  const [subTemplateHasChanges, setSubTemplateHasChanges] = useState(false);
  const [subTemplateSaveStatus, setSubTemplateSaveStatus] = useState('idle'); // 'idle' | 'saved'
  const [savingChecklist, setSavingChecklist] = useState(null);
  const [isReloading, setIsReloading] = useState(false);
  const reloadInFlightRef = useRef(false);
  const templateLoadSequenceRef = useRef(0);
  const invalidatePendingTemplateLoads = () => { templateLoadSequenceRef.current += 1; };
  const builderHeadingRef = useRef(null);
  const reloadButtonRef = useRef(null);
  const checklistSaveInFlight = useRef(null);
  // Catalog mutations (create/rename/delete/duplicate/reorder) all write the
  // same entity rows and settings maps. Serialize them — plus checklist saves —
  // so a repeated click cannot double-submit and two writes cannot collide on
  // the same optimistic-concurrency record while either is still in flight.
  const catalogActionInFlightRef = useRef(false);
  const catalogActionBlockedNotice = () => {
    setNoticeDialog({
      title: "Template change still saving",
      message: "Another template change is still saving. Wait for it to finish, then try again.",
    });
  };
  const beginCatalogAction = () => {
    if (catalogActionInFlightRef.current || checklistSaveInFlight.current) {
      catalogActionBlockedNotice();
      return false;
    }
    catalogActionInFlightRef.current = true;
    return true;
  };
  const subTemplateDraftRef = useRef(null);
  const productTypeDraftRef = useRef(null);
  subTemplateDraftRef.current = { id: selectedSubTemplate, items: subTemplateChecklistItems };
  productTypeDraftRef.current = { id: selectedProductType, items: productTypeItems };
  // Rename sessions carry identity too: a late save response may only close
  // the exact rename draft it came from, never a newer or reopened editor.
  const renameDraftRef = useRef(null);
  renameDraftRef.current = {
    subTemplateId: editingSubTemplateId,
    subTemplateName: editingSubTemplateName,
    productTypeId: editingProductTypeName,
    productTypeName: editingProductTypeValue,
    conditionId: editingDropdown,
    conditionName: editingDropdownName,
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    void loadData();
    // Closing/unmounting cancels the authority of this opening's reads.
    // A late response must not repopulate a hidden or newly reopened editor.
    return () => { invalidatePendingTemplateLoads(); };
  }, [isOpen]);

  const loadData = async () => {
    // Older reads must not replace newer catalog/setting snapshots. Writes
    // also invalidate reads started before their successful persistence.
    const loadSequence = ++templateLoadSequenceRef.current;
    try {
      const [subTemplatesData, productTypesSetting, ptTemplates, stItems, dropdownsSetting] = await Promise.all([
        loadAllEntityRows({ entity: ChecklistSubItem, sort: null, label: "SIP checklist sub-templates" }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'productTypes', label: 'SIP Product Types' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'productTypeTemplates', label: 'SIP Product Type Templates' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'subTemplateItems', label: 'SIP Sub-Template Items' }),
        loadSingleGlobalSetting({ entity: GlobalSettings, settingKey: 'dropdownConditions', label: 'SIP Dropdown Conditions' }),
      ]);
      if (loadSequence !== templateLoadSequenceRef.current) return null;

      setSubTemplates([...subTemplatesData].sort((a, b) => (a.order || 0) - (b.order || 0)));
      setSettingRecords({
        productTypes: productTypesSetting,
        productTypeTemplates: ptTemplates,
        subTemplateItems: stItems,
        dropdownConditions: dropdownsSetting,
      });
      setProductTypes(productTypesSetting?.setting_value?.items || ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"]);
      setProductTypeTemplates(ptTemplates?.setting_value || {});
      setSubTemplateItems(stItems?.setting_value || {});
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
      // Return the verified read: React state updates are asynchronous and
      // must not be used as the source for restoring an open editor draft.
      return {
        subTemplates: subTemplatesData,
        productTypes: productTypesSetting?.setting_value?.items || [],
        productTypeTemplates: ptTemplates?.setting_value || {},
        subTemplateItems: stItems?.setting_value || {},
      };
    } catch (error) {
      if (loadSequence !== templateLoadSequenceRef.current) return null;
      console.error("Error loading data:", error);
      setPersistenceError(error?.message || "Template Builder data could not be loaded safely.");
      return null;
    }
  };

  const saveWholeSetting = async (key, nextValue, label, applyLocal) => {
    setPersistenceError("");
    try {
      const saved = await saveGlobalSettingValueIfUnchanged({
        entity: GlobalSettings,
        loadedRecord: settingRecords[key] || null,
        settingKey: key,
        nextValue,
        label,
      });
      invalidatePendingTemplateLoads();
      setSettingRecords(prev => ({ ...prev, [key]: saved }));
      applyLocal(saved.setting_value);
      return saved;
    } catch (error) {
      console.error(`${label} save blocked:`, error);
      setPersistenceError(error?.message || `${label} changed in another session. Reload before retrying.`);
      throw error;
    }
  };

  const saveProductTypes = async (types) => {
    const saved = await saveWholeSetting('productTypes', { items: types }, 'SIP Product Types', value => setProductTypes(value?.items || []));
    return saved;
  };

  const saveProductTypeTemplates = async (templates) => {
    const saved = await saveWholeSetting('productTypeTemplates', templates, 'SIP Product Type Templates', value => setProductTypeTemplates(value || {}));
    return saved;
  };

  const saveSubTemplateItems = async (items) => {
    const saved = await saveWholeSetting('subTemplateItems', items, 'SIP Sub-Template Items', value => setSubTemplateItems(value || {}));
    return saved;
  };

  const saveDropdownConditions = async (items) => {
    const saved = await saveWholeSetting('dropdownConditions', { items }, 'SIP Dropdown Conditions', value => setDropdownConditions(value?.items || []));
    return saved;
  };

  // Inline condition mutations (section reorder, group move) may not overlap
  // another catalog write or a checklist save; the lock is held until the
  // write settles and released on failure too.
  const saveDropdownConditionsCatalog = (nextConditions, label) => {
    if (!beginCatalogAction()) return;
    saveDropdownConditions(nextConditions)
      .catch(error => {
        console.error(`Error saving dropdown conditions (${label}):`, error);
      })
      .finally(() => {
        catalogActionInFlightRef.current = false;
      });
  };

  const startDropdownRename = (condition) => {
    setEditingDropdown(condition.id);
    setEditingDropdownName(condition.name || "");
  };

  const cancelDropdownRename = () => {
    setEditingDropdown(null);
    setEditingDropdownName("");
  };

  const saveDropdownRename = async (condition) => {
    const submittedDraft = editingDropdownName;
    const name = submittedDraft.trim();
    if (!name || !beginCatalogAction()) return;
    try {
      await saveDropdownConditions(dropdownConditions.map(item => item.id === condition.id ? { ...item, name } : item));
      // Only dismiss the rename editor when it still shows the draft this
      // save came from; a newer rename session must not be closed by it.
      if (renameDraftRef.current.conditionId === condition.id && renameDraftRef.current.conditionName === submittedDraft) {
        cancelDropdownRename();
      }
    } catch (error) {
      console.error("Error renaming condition:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const createDropdownCondition = async () => {
    const submittedName = newDropdownName;
    const name = submittedName.trim();
    if (!name || !beginCatalogAction()) return;
    try {
      await saveDropdownConditions([...dropdownConditions, { id: Date.now().toString(), name, is_completed: false, order: dropdownConditions.length }]);
      // Keep any newer name typed while the create was still in flight.
      setNewDropdownName(current => (current === submittedName ? "" : current));
    } catch (error) {
      console.error("Error creating condition:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const saveSubTemplateEntry = async (subTemplateId, nextEntry, { remove = false, label = 'SIP Sub-Template Items' } = {}) => {
    const currentSetting = settingRecords.subTemplateItems;
    if (!currentSetting?.id) {
      if (remove) return null;
      return saveSubTemplateItems({ ...subTemplateItems, [subTemplateId]: nextEntry });
    }
    setPersistenceError("");
    try {
      const saved = await saveSettingMapEntryIfUnchanged({
        entity: GlobalSettings,
        settingRecord: currentSetting,
        entryKey: subTemplateId,
        expectedEntry: subTemplateItems[subTemplateId],
        nextEntry,
        remove,
        label,
      });
      invalidatePendingTemplateLoads();
      setSettingRecords(prev => ({ ...prev, subTemplateItems: saved }));
      setSubTemplateItems(saved.setting_value || {});
      return saved;
    } catch (error) {
      console.error(`${label} save blocked:`, error);
      setPersistenceError(error?.message || `${label} changed in another session. Reload before retrying.`);
      throw error;
    }
  };

  const saveProductTypeTemplateEntry = async (productType, nextEntry, { remove = false, label = 'SIP Product Type Template' } = {}) => {
    const currentSetting = settingRecords.productTypeTemplates;
    if (!currentSetting?.id) {
      if (remove) return null;
      return saveProductTypeTemplates({ ...productTypeTemplates, [productType]: nextEntry });
    }
    setPersistenceError("");
    try {
      const saved = await saveSettingMapEntryIfUnchanged({
        entity: GlobalSettings,
        settingRecord: currentSetting,
        entryKey: productType,
        expectedEntry: productTypeTemplates[productType],
        nextEntry,
        remove,
        label,
      });
      invalidatePendingTemplateLoads();
      setSettingRecords(prev => ({ ...prev, productTypeTemplates: saved }));
      setProductTypeTemplates(saved.setting_value || {});
      return saved;
    } catch (error) {
      console.error(`${label} save blocked:`, error);
      setPersistenceError(error?.message || `${label} changed in another session. Reload before retrying.`);
      throw error;
    }
  };

  // Pre-populate selected products from existing checklist on open
  useEffect(() => {
    if (!isOpen) return;
    if (existingChecklist.length === 0) return;
    // Build product groups from existing checklist
    const productMap = new Map();
    existingChecklist.forEach(item => {
      if (!item.product_name || item.product_name === 'General Items') return;
      if (!productMap.has(item.product_name)) {
        productMap.set(item.product_name, {
          id: `existing_${item.product_name}_${Math.random().toString(36).substr(2, 6)}`,
          productType: item.product_type || '',
          customName: item.product_name,
          subTemplates: [],
          isExisting: true
        });
      }
    });
    if (productMap.size > 0) {
      setSelectedProducts(Array.from(productMap.values()));
    }
  }, [isOpen]);

  // Template Selection
  const getExistingProductNames = () => {
    const names = new Set();
    existingChecklist.forEach(item => { if (item.product_name) names.add(item.product_name); });
    return names;
  };

  const addProductToSelection = (productType) => {
    const selectedNames = new Set(selectedProducts.map(p => p.customName));
    
    let customName = productType;
    let counter = 1;
    while (selectedNames.has(customName)) { counter++; customName = `${productType} ${counter}`; }
    
    setSelectedProducts([...selectedProducts, {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      productType, customName, subTemplates: [], isExisting: false
    }]);
  };

  const updateProductName = (productId, newName) => {
    const existingNames = getExistingProductNames();
    const otherSelectedNames = selectedProducts.filter(p => p.id !== productId).map(p => p.customName);
    if (existingNames.has(newName) || otherSelectedNames.includes(newName)) {
      setNoticeDialog({
        title: "Product name already in use",
        message: "Choose a different product name before applying this template."
      });
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
    if (selectedProducts.length === 0) {
      setNoticeDialog({
        title: "Select a product template",
        message: "Choose at least one product template before applying checklist items."
      });
      return;
    }
    
    const combinedItems = [];
    selectedProducts.forEach(product => {
      const template = productTypeTemplates[product.productType];
      // Existing products are represented here so checklist options can be added
      // without rebuilding their answered base checklist.
      if (!product.isExisting && template?.items) {
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
    
    if (combinedItems.length === 0) {
      setNoticeDialog({
        title: "Nothing new selected",
        message: "Existing product checklists are preserved. Select a new product checklist or add a checklist option to an existing product before applying."
      });
      return;
    }
    if (onApplyTemplate) {
      onApplyTemplate(combinedItems);
    }
    setSelectedProducts([]);
    // Note: Don't call onClose() here - let the parent handle closing after applying
  };

  // Sub-template Management
  const createSubTemplate = async () => {
    const submittedName = newSubTemplateName;
    const name = submittedName.trim();
    if (!name || !beginCatalogAction()) return;
    setPersistenceError("");
    try {
      const result = await createChecklistSubItemIfAbsent({
        entity: ChecklistSubItem,
        data: { name, applies_to_product_types: [], order: subTemplates.length },
        label: `SIP sub-template ${name}`,
      });
      if (result.status === 'existing') {
        setPersistenceError(`A sub-template named "${name}" already exists. The existing template was kept instead of creating a duplicate.`);
      }
      await loadData();
      // Keep any newer name typed while the create was still in flight.
      setNewSubTemplateName(current => (current === submittedName ? "" : current));
    } catch (error) {
      console.error("Error creating sub-template:", error);
      setPersistenceError(error?.message || "The sub-template could not be created safely.");
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const performDeleteSubTemplate = async (subTemplate) => {
    if (!beginCatalogAction()) return;
    setPersistenceError("");
    try {
      await deleteChecklistSubItemIfUnchanged({
        entity: ChecklistSubItem,
        record: subTemplate,
        label: `SIP sub-template ${subTemplate.name || subTemplate.id} deletion`,
      });
      if (selectedSubTemplate === subTemplate.id) {
        setSelectedSubTemplate(null);
        setSubTemplateChecklistItems([]);
      }
      try {
        await saveSubTemplateEntry(subTemplate.id, undefined, {
          remove: true,
          label: `SIP sub-template ${subTemplate.name || subTemplate.id} item cleanup`,
        });
      } catch (cleanupError) {
        setPersistenceError(`${cleanupError?.message || "The sub-template was deleted, but its hidden item-map cleanup could not be confirmed."} The deleted template itself will not reappear.`);
      }
      await loadData();
    } catch (error) {
      console.error("Error deleting sub-template:", error);
      setPersistenceError(error?.message || "This sub-template changed in another session and was not deleted.");
      await loadData();
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const deleteSubTemplate = (subTemplate) => {
    setConfirmDialog({
      title: "Delete reusable checklist option?",
      message: `Delete “${subTemplate.name}” from Template Builder? Work Orders that already use this option keep their saved checklist rows and answers. This only removes the reusable option and its template configuration, so it cannot be added to new jobs. This cannot be undone.`,
      confirmLabel: "Delete Reusable Option",
      onConfirm: () => performDeleteSubTemplate(subTemplate),
    });
  };

  const requestDeleteProductType = (type, index) => {
    setConfirmDialog({
      title: "Remove product checklist from builder?",
      message: `Remove “${type}” from the SIPS Product Checklists list? Work Orders that already use this checklist keep their saved checklist rows and answers. This stops the checklist from appearing for new selections; its stored template configuration is retained internally.`,
      confirmLabel: "Remove from Builder",
      onConfirm: async () => {
        if (!beginCatalogAction()) return;
        try {
          await saveProductTypes(productTypes.filter((_, i) => i !== index));
          if (selectedProductType === type) {
            setSelectedProductType(null);
            setProductTypeItems([]);
          }
        } catch (error) {
          console.error("Error removing product checklist:", error);
        } finally {
          catalogActionInFlightRef.current = false;
        }
      },
    });
  };

  const requestDeleteCondition = (condition) => {
    setConfirmDialog({
      title: "Delete condition?",
      message: `Delete “${condition.name}”? Existing saved checklist answers are not rewritten, but this condition will no longer be available for new selections.`,
      confirmLabel: "Delete Condition",
      onConfirm: async () => {
        if (!beginCatalogAction()) return;
        try {
          await saveDropdownConditions(dropdownConditions.filter(d => d.id !== condition.id));
        } catch (error) {
          console.error("Error deleting condition:", error);
        } finally {
          catalogActionInFlightRef.current = false;
        }
      },
    });
  };

  const runConfirmedAction = async () => {
    if (!confirmDialog?.onConfirm || isConfirming) return;
    if (catalogActionInFlightRef.current || checklistSaveInFlight.current) {
      catalogActionBlockedNotice();
      return;
    }
    setIsConfirming(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (error) {
      console.error("SIPS Template Builder confirmed action failed:", error);
      setConfirmDialog(null);
    } finally {
      setIsConfirming(false);
    }
  };

  const blockNavigationWhileSaving = () => {
    if (!checklistSaveInFlight.current && !catalogActionInFlightRef.current && !reloadInFlightRef.current) return false;
    const savingChecklistNow = checklistSaveInFlight.current && !reloadInFlightRef.current;
    setNoticeDialog({
      title: reloadInFlightRef.current ? "Checklist reload in progress"
        : savingChecklistNow ? "Checklist save in progress"
        : "Template change in progress",
      message: reloadInFlightRef.current
        ? "Finish reloading your checklist before switching editors, changing tabs, or closing the builder."
        : savingChecklistNow
          ? "Finish saving your checklist before switching editors, changing tabs, or closing the builder."
          : "Finish the current save before switching editors, changing tabs, or closing the builder.",
    });
    return true;
  };

  const selectSubTemplateForEditing = (subTemplate, discardUnsaved = false) => {
    if (blockNavigationWhileSaving()) return;
    if (!discardUnsaved && selectedSubTemplate === subTemplate.id) return;
    if (!discardUnsaved && selectedSubTemplate && (subTemplateHasChanges || (activeTab === 'subtemplates' && newItemText.trim()))) {
      setPendingEditorSwitch({ kind: 'subtemplate', id: subTemplate.id, name: subTemplate.name });
      return;
    }
    setSelectedSubTemplate(subTemplate.id);
    setNewItemText("");
    setSubTemplateChecklistItems(subTemplateItems[subTemplate.id]?.items || []);
    setExpandedItems({});
    setSubTemplateHasChanges(false);
    setSubTemplateSaveStatus('idle');
  };

  const renameSubTemplate = async (subTemplate, nextName) => {
    const submittedDraft = String(nextName || '');
    const name = submittedDraft.trim();
    if (!subTemplate?.id || !name) return false;
    if (!beginCatalogAction()) return false;
    setPersistenceError("");
    try {
      const duplicate = subTemplates.find(st => st.id !== subTemplate.id && String(st.name || '').trim().toLowerCase() === name.toLowerCase());
      if (duplicate) throw new Error(`A sub-template named "${name}" already exists.`);
      const saved = await updateChecklistSubItemIfUnchanged({
        entity: ChecklistSubItem,
        record: subTemplate,
        nextFields: { name },
        label: `SIP sub-template rename ${subTemplate.name || subTemplate.id}`,
      });
      invalidatePendingTemplateLoads();
      setSubTemplates(prev => prev.map(st => st.id === saved.id ? saved : st));
      // Only dismiss the rename editor when it still shows the draft this
      // save came from; a newer rename session must not be closed by it.
      if (renameDraftRef.current.subTemplateId === subTemplate.id && renameDraftRef.current.subTemplateName === submittedDraft) {
        setEditingSubTemplateId(null);
        setEditingSubTemplateName("");
      }
      return true;
    } catch (error) {
      console.error("Sub-template rename blocked:", error);
      setPersistenceError(error?.message || "This sub-template changed in another session. Reload before renaming it.");
      await loadData();
      return false;
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const updateSubTemplateProductTypes = async (subTemplate, nextApplies) => {
    if (!subTemplate?.id) return false;
    if (!beginCatalogAction()) return false;
    setPersistenceError("");
    try {
      const saved = await updateChecklistSubItemIfUnchanged({
        entity: ChecklistSubItem,
        record: subTemplate,
        nextFields: { applies_to_product_types: nextApplies },
        label: `SIP sub-template product types ${subTemplate.name || subTemplate.id}`,
      });
      invalidatePendingTemplateLoads();
      setSubTemplates(prev => prev.map(st => st.id === saved.id ? saved : st));
      return true;
    } catch (error) {
      console.error("Sub-template product type update blocked:", error);
      setPersistenceError(error?.message || "This sub-template changed in another session. Latest data was reloaded.");
      await loadData();
      return false;
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const saveSubTemplateChecklist = async () => {
    if (!selectedSubTemplate || checklistSaveInFlight.current) return;
    if (catalogActionInFlightRef.current) {
      catalogActionBlockedNotice();
      return;
    }
    const snapshot = { kind: 'subTemplate', id: selectedSubTemplate, items: subTemplateChecklistItems };
    checklistSaveInFlight.current = snapshot;
    setSavingChecklist(snapshot.kind);
    try {
      await saveSubTemplateEntry(snapshot.id, { items: snapshot.items }, {
        label: `SIP sub-template checklist ${subTemplates.find(st => st.id === snapshot.id)?.name || snapshot.id}`,
      });
      // A user may keep editing while the request is in flight. Only mark the
      // exact saved draft clean; never clear the flag for a newer local draft.
      if (subTemplateDraftRef.current.id === snapshot.id && subTemplateDraftRef.current.items === snapshot.items) {
        setSubTemplateHasChanges(false);
        setSubTemplateSaveStatus('saved');
      }
    } catch (error) {
      console.error("Error saving sub-template checklist:", error);
      setSubTemplateSaveStatus('idle');
    } finally {
      checklistSaveInFlight.current = null;
      setSavingChecklist(null);
    }
  };

  const duplicateSubTemplate = async (subTemplate) => {
    if (!beginCatalogAction()) return;
    setPersistenceError("");
    const names = new Set(subTemplates.map(st => String(st.name || '').trim().toLowerCase()));
    let copyName = `${subTemplate.name} (Copy)`;
    let suffix = 2;
    while (names.has(copyName.toLowerCase())) copyName = `${subTemplate.name} (Copy ${suffix++})`;

    let createdResult = null;
    try {
      createdResult = await createChecklistSubItemIfAbsent({
        entity: ChecklistSubItem,
        data: { name: copyName, applies_to_product_types: subTemplate.applies_to_product_types || [], order: subTemplates.length },
        label: `SIP sub-template copy ${copyName}`,
      });
      const newSubTemplate = createdResult.record;
      const originalItems = subTemplateItems[subTemplate.id]?.items || [];
      if (originalItems.length > 0) {
        const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }));
        try {
          await saveSubTemplateEntry(newSubTemplate.id, { items: copiedItems }, { label: `SIP copied items ${copyName}` });
        } catch (settingsError) {
          if (createdResult.status === 'created') {
            const latestCreated = await ChecklistSubItem.get(newSubTemplate.id).catch(() => null);
            if (latestCreated?.id) {
              await deleteChecklistSubItemIfUnchanged({
                entity: ChecklistSubItem,
                record: latestCreated,
                label: `SIP copy rollback ${copyName}`,
              }).catch(() => null);
            }
          }
          throw settingsError;
        }
      }
      await loadData();
    } catch (error) {
      console.error("Error duplicating sub-template:", error);
      setPersistenceError(error?.message || "The sub-template copy could not be completed safely.");
      await loadData();
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  // Product Type Management
  const createProductType = async () => {
    const submittedName = newProductTypeName;
    const name = submittedName.trim();
    if (!name || !beginCatalogAction()) return;
    try {
      await saveProductTypes([...productTypes, name]);
      // Keep any newer name typed while the create was still in flight.
      setNewProductTypeName(current => (current === submittedName ? "" : current));
    } catch (error) {
      console.error("Error creating product checklist:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const renameProductType = async (type, nextName) => {
    const submittedDraft = String(nextName || '');
    const newName = submittedDraft.trim();
    if (!type || !newName) return;
    if (!beginCatalogAction()) return;
    try {
      await saveProductTypes(productTypes.map(t => (t === type ? newName : t)));
      if (productTypeTemplates[type]) {
        const newTemplates = { ...productTypeTemplates };
        newTemplates[newName] = newTemplates[type];
        delete newTemplates[type];
        await saveProductTypeTemplates(newTemplates);
      }
      // Retarget the open editor only when the renamed checklist is still
      // open; a stale save must not steal a different open checklist.
      setSelectedProductType(current => (current === type ? newName : current));
      // Only dismiss the rename editor when it still shows the draft this
      // save came from; a newer rename session must not be closed by it.
      if (renameDraftRef.current.productTypeId === type && renameDraftRef.current.productTypeName === submittedDraft) {
        setEditingProductTypeName(null);
        setEditingProductTypeValue("");
      }
    } catch (error) {
      console.error("Error renaming product checklist:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  const selectProductType = (type, discardUnsaved = false) => {
    if (blockNavigationWhileSaving()) return;
    if (!discardUnsaved && selectedProductType === type) return;
    if (!discardUnsaved && selectedProductType && (productTypeHasChanges || (activeTab === 'producttypes' && newItemText.trim()))) {
      setPendingEditorSwitch({ kind: 'producttype', id: type, name: type });
      return;
    }
    setSelectedProductType(type);
    setNewItemText("");
    setProductTypeItems(productTypeTemplates[type]?.items || []);
    setExpandedItems({});
    setProductTypeHasChanges(false);
    setProductTypeSaveStatus('idle');
  };

  const editingSubTemplateOriginalName = editingSubTemplateId
    ? (subTemplates.find(st => st.id === editingSubTemplateId)?.name || "")
    : "";
  const editingDropdownOriginalName = editingDropdown
    ? (dropdownConditions.find(condition => condition.id === editingDropdown)?.name || "")
    : "";
  const hasUnsavedNameDrafts = Boolean(
    newSubTemplateName.trim()
    || newProductTypeName.trim()
    || newDropdownName.trim()
    || (editingSubTemplateId && editingSubTemplateName.trim() !== editingSubTemplateOriginalName.trim())
    || (editingProductTypeName && editingProductTypeValue.trim() !== String(editingProductTypeName).trim())
    || (editingDropdown && editingDropdownName.trim() !== editingDropdownOriginalName.trim())
  );
  // Text in the Add item field and unfinished names are not saved until their actions run.
  const hasUnsavedEditorChanges = subTemplateHasChanges
    || productTypeHasChanges
    || Boolean(newItemText.trim())
    || hasUnsavedNameDrafts;
  const reloadLatest = async () => {
    if (reloadInFlightRef.current || checklistSaveInFlight.current || catalogActionInFlightRef.current) return;
    reloadInFlightRef.current = true;
    setIsReloading(true);
    try {
      const latest = await loadData();
      if (!latest) return; // Keep edits and the error if the read failed.
      // An explicit reload is a fresh baseline, never a silent rebase of
      // older unsaved local edits onto another person's template changes.
      setSubTemplateChecklistItems(latest.subTemplateItems[selectedSubTemplate]?.items || []);
      setProductTypeItems(latest.productTypeTemplates[selectedProductType]?.items || []);
      setSubTemplateHasChanges(false);
      setProductTypeHasChanges(false);
      setSubTemplateSaveStatus('idle');
      setProductTypeSaveStatus('idle');
      setNewItemText("");
      setNewSubTemplateName("");
      setNewProductTypeName("");
      setNewDropdownName("");
      setEditingSubTemplateId(null);
      setEditingSubTemplateName("");
      setEditingProductTypeName(null);
      setEditingProductTypeValue("");
      setEditingDropdown(null);
      setEditingDropdownName("");
      setExpandedItems({});
      if (selectedSubTemplate && !latest.subTemplates.some(st => st.id === selectedSubTemplate)) {
        setSelectedSubTemplate(null);
      }
      if (selectedProductType && !latest.productTypes.includes(selectedProductType)) {
        setSelectedProductType(null);
      }
      setPersistenceError("");
    } finally {
      reloadInFlightRef.current = false;
      setIsReloading(false);
    }
  };
  const requestReloadLatest = () => {
    if (blockNavigationWhileSaving()) return;
    if (hasUnsavedEditorChanges) setPendingNavigation({ kind: 'reload' });
    else void reloadLatest();
  };
  const requestTabChange = (tab) => {
    if (tab === activeTab || blockNavigationWhileSaving()) return;
    if (hasUnsavedEditorChanges) setPendingNavigation({ kind: 'tab', tab });
    else setActiveTab(tab);
  };
  const requestClose = () => {
    if (blockNavigationWhileSaving()) return;
    if (hasUnsavedEditorChanges) setPendingNavigation({ kind: 'close' });
    else onClose();
  };
  const confirmNavigation = () => {
    const next = pendingNavigation;
    setPendingNavigation(null);
    if (!next) return;
    if (next.kind === 'reload') {
      void reloadLatest();
      return;
    }
    // Discard both the dirty flags and their local drafts. Otherwise returning
    // to an editor tab can show discarded edits as though they were saved.
    if (subTemplateHasChanges && selectedSubTemplate) {
      setSubTemplateChecklistItems(subTemplateItems[selectedSubTemplate]?.items || []);
    }
    if (productTypeHasChanges && selectedProductType) {
      setProductTypeItems(productTypeTemplates[selectedProductType]?.items || []);
    }
    setSubTemplateHasChanges(false);
    setProductTypeHasChanges(false);
    setNewItemText("");
    setNewSubTemplateName("");
    setNewProductTypeName("");
    setNewDropdownName("");
    setEditingSubTemplateId(null);
    setEditingSubTemplateName("");
    setEditingProductTypeName(null);
    setEditingProductTypeValue("");
    setEditingDropdown(null);
    setEditingDropdownName("");
    setSubTemplateSaveStatus('idle');
    setProductTypeSaveStatus('idle');
    if (next.kind === 'close') onClose();
    else setActiveTab(next.tab);
  };

  const confirmEditorSwitch = () => {
    const request = pendingEditorSwitch;
    setPendingEditorSwitch(null);
    if (!request) return;
    if (request.kind === 'subtemplate') {
      const next = subTemplates.find(st => st.id === request.id);
      if (next) selectSubTemplateForEditing(next, true);
    } else if (request.kind === 'producttype' && productTypes.includes(request.id)) {
      selectProductType(request.id, true);
    }
  };

  const saveProductTypeTemplate = async () => {
    if (!selectedProductType || checklistSaveInFlight.current) return;
    if (catalogActionInFlightRef.current) {
      catalogActionBlockedNotice();
      return;
    }
    const snapshot = { kind: 'productType', id: selectedProductType, items: productTypeItems };
    checklistSaveInFlight.current = snapshot;
    setSavingChecklist(snapshot.kind);
    try {
      await saveProductTypeTemplateEntry(snapshot.id, { items: snapshot.items }, {
        label: `SIP Product Type Template ${snapshot.id}`,
      });
      if (productTypeDraftRef.current.id === snapshot.id && productTypeDraftRef.current.items === snapshot.items) {
        setProductTypeHasChanges(false);
        setProductTypeSaveStatus('saved');
      }
    } catch (error) {
      console.error("Error saving product type template:", error);
      setProductTypeSaveStatus('idle');
    } finally {
      checklistSaveInFlight.current = null;
      setSavingChecklist(null);
    }
  };

  const duplicateProductTypeTemplate = async (productType) => {
    if (!beginCatalogAction()) return;
    const names = new Set(productTypes.map(t => String(t || '').trim().toLowerCase()));
    let newTypeName = `${productType} (Copy)`;
    let suffix = 2;
    while (names.has(newTypeName.toLowerCase())) newTypeName = `${productType} (Copy ${suffix++})`;
    try {
      // Copy the item map before listing the new checklist so a failed first
      // save leaves nothing behind and a failed name save only retains a
      // hidden template entry, never an empty duplicate in the list.
      const originalItems = productTypeTemplates[productType]?.items || [];
      if (originalItems.length > 0) {
        const copiedItems = JSON.parse(JSON.stringify(originalItems)).map(item => ({ ...item, id: Date.now().toString() + Math.random().toString(36).substr(2, 9) }));
        await saveProductTypeTemplates({ ...productTypeTemplates, [newTypeName]: { items: copiedItems } });
      }
      await saveProductTypes([...productTypes, newTypeName]);
    } catch (error) {
      console.error("Error duplicating product checklist:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
  };

  // Checklist Item Management
  const addChecklistItem = (items, setItems, isProductType = false) => {
    if (!newItemText.trim()) return;
    setItems([...items, { id: Date.now().toString(), text: newItemText.trim(), type: 'checklist', dropdown_ids: [], details: [], tasks: [], approved_by: "" }]);
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
    setItems(items.map(item => item.id === parentId ? { ...item, details: [...(item.details || []), { id: Date.now().toString(), text: text.trim(), type: 'detail', dropdown_ids: [], tasks: [], approved_by: "" }] } : item));
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
    if (isSubTemplateReordering || !result.destination || result.source.index === result.destination.index) return;
    if (!beginCatalogAction()) return;
    const reordered = Array.from(subTemplates);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    setPersistenceError("");
    setIsSubTemplateReordering(true);
    try {
      const savedRows = await reorderChecklistSubItemsIfUnchanged({
        entity: ChecklistSubItem,
        loadedRows: subTemplates,
        reorderedRows: reordered,
        readCurrentRows: () => loadAllEntityRows({
          entity: ChecklistSubItem,
          sort: null,
          label: 'SIP checklist sub-templates reorder verification',
        }),
        label: 'SIP sub-template reorder',
      });
      invalidatePendingTemplateLoads();
      setSubTemplates([...savedRows].sort((a, b) => (a.order || 0) - (b.order || 0)));
    } catch (error) {
      console.error("Error reordering:", error);
      setPersistenceError(error?.message || "The sub-template order changed in another session. Latest data was reloaded.");
      await loadData();
    } finally {
      setIsSubTemplateReordering(false);
      catalogActionInFlightRef.current = false;
    }
  };

  const handleProductTypeDragEnd = async (result) => {
    if (!result.destination || !beginCatalogAction()) return;
    const reordered = Array.from(productTypes);
    const [removed] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, removed);
    try {
      await saveProductTypes(reordered);
    } catch (error) {
      console.error("Error reordering product checklists:", error);
    } finally {
      catalogActionInFlightRef.current = false;
    }
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
    if (!customDropdownValue.trim() || !beginCatalogAction()) return;
    const newDropdown = { id: Date.now().toString(), name: customDropdownValue.trim() };
    saveDropdownConditions([...dropdownConditions, newDropdown])
      .catch(error => {
        console.error("Error creating condition:", error);
      })
      .finally(() => {
        catalogActionInFlightRef.current = false;
      });
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

    const getPopupStyle = () => {
      const visualViewport = window.visualViewport;
      return getConditionDropdownPosition(
        conditionTriggerRef.current?.getBoundingClientRect() || { left: 8, top: 8, bottom: 52 },
        {
          left: visualViewport?.offsetLeft ?? 0,
          top: visualViewport?.offsetTop ?? 0,
          width: visualViewport?.width ?? window.innerWidth,
          height: visualViewport?.height ?? window.innerHeight,
        }
      );
    };
    
    return (
      <div className="relative">
        <button
          type="button"
          data-dropdown-id={uniqueId}
          onClick={(e) => { e.stopPropagation(); conditionTriggerRef.current = e.currentTarget; setOpenDropdownId(isOpen ? null : uniqueId); }}
          className="h-11 text-xs px-2 border rounded flex items-center gap-1 bg-white hover:bg-gray-50 min-w-[100px] touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-6"
          aria-expanded={isOpen}
          aria-label={`${detailId ? 'Detail' : 'Checklist item'} conditions`}
        >
          <span className="truncate flex-1 text-left">{selectedNames.length === 0 ? "Condition" : selectedNames.length === 1 ? selectedNames[0] : `${selectedNames.length} selected`}</span>
          <ChevronDown className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
        </button>
        {isOpen && ReactDOM.createPortal(
          <>
            <div className="fixed inset-0 z-[300]" onClick={() => { setOpenDropdownId(null); conditionTriggerRef.current?.focus(); }} />
            <div
              ref={conditionPopupRef}
              className="fixed z-[301] bg-white border rounded-lg shadow-2xl max-h-64 overflow-y-auto overscroll-contain"
              style={getPopupStyle()}
              role="group"
              aria-label={`${detailId ? 'Detail' : 'Checklist item'} conditions`}
            >
              <div className="p-2 border-b bg-gray-50 font-medium text-xs sticky top-0">Select Conditions</div>
              {[...dropdownConditions.filter(d => d.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0)),
                ...dropdownConditions.filter(d => !d.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0))
              ].map(dd => (
                <button type="button"
                  key={dd.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCondition(dd.id); }}
                  className={`w-full min-h-11 flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer text-left text-sm touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400 ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}
                  aria-pressed={currentIds.includes(dd.id)}
                >
                  <div
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${currentIds.includes(dd.id) ? 'bg-purple-500 border-purple-500' : 'border-gray-300'}`}
                    aria-hidden="true"
                  >
                    {currentIds.includes(dd.id) && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span>{dd.name}</span>
                  <span className={`text-xs px-1 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-700' : 'bg-yellow-200 text-yellow-700'}`}>
                    {dd.is_completed ? '✓' : 'C'}
                  </span>
                </button>
              ))}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowOtherPopup({ items, setItems, itemId: item.id, detailId }); setOpenDropdownId(null); }}
                className="w-full min-h-11 flex items-center gap-2 px-3 py-2 hover:bg-purple-50 cursor-pointer text-left text-sm text-purple-600 font-medium border-t sticky bottom-0 bg-white touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400"
              >
                <Plus className="w-4 h-4" aria-hidden="true" /><span>Add New Condition...</span>
              </button>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  };

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
      className={`min-w-0 border rounded p-1.5 bg-white mb-1 ${expandedItems[item.id] ? 'ring-1 ring-blue-300' : ''}`}>
      <div className="flex flex-wrap items-center gap-1 lg:flex-nowrap">
        <div
          {...provided.dragHandleProps}
          className="h-11 w-11 shrink-0 cursor-grab flex items-center justify-center touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-auto lg:w-auto"
          aria-label={`Drag to reorder checklist item ${item.text}`}
          title={`Drag to reorder checklist item ${item.text}`}
        >
          <GripVertical className="w-4 h-4 text-gray-400 lg:w-3 lg:h-3" aria-hidden="true" />
        </div>
        <button
          type="button"
          onClick={() => toggleItemExpanded(item.id)}
          className="h-11 w-11 shrink-0 rounded flex items-center justify-center touch-manipulation hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-6 lg:w-6"
          aria-expanded={Boolean(expandedItems[item.id])}
          aria-label={`${expandedItems[item.id] ? 'Collapse' : 'Expand'} checklist item ${item.text}`}
          title={`${expandedItems[item.id] ? 'Collapse' : 'Expand'} checklist item ${item.text}`}
        >
          {expandedItems[item.id] ? <ChevronDown className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" />}
        </button>
        <span className="text-xs px-1 py-0.5 rounded bg-blue-100 text-blue-700">C</span>
        {editingItem === item.id ? (
          <Input value={item.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value })}
            onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
            autoFocus className="h-11 text-xs flex-1 lg:h-5" aria-label="Checklist item text" />
        ) : (
          <button
            type="button"
            className="min-w-0 min-h-11 flex-1 truncate rounded px-1 text-left text-xs font-medium touch-manipulation hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:min-h-0 lg:px-0"
            onClick={() => setEditingItem(item.id)}
            aria-label={`Edit checklist item ${item.text}`}
            title={`Edit checklist item ${item.text}`}
          >
            {item.text}
          </button>
        )}
        {renderConditionSelect(item, items, setItems, null, markChanged)}
        <select
          value={item.approved_by || ""}
          onChange={(e) => updateItemWithChange(item.id, { approved_by: e.target.value })}
          className="h-11 max-w-[9rem] text-xs px-1 border rounded bg-white touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-5 lg:max-w-none"
          aria-label={`Answered by for checklist item ${item.text}`}
        >
          <option value="">Answered by...</option>
          {users.map(u => <option key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</option>)}
        </select>
        <button
          type="button"
          onClick={() => deleteItemWithChange(item.id)}
          className="h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6"
          aria-label={`Delete checklist item ${item.text}`}
          title={`Delete checklist item ${item.text}`}
        >
          <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
        </button>
      </div>
      
      {expandedItems[item.id] && (
        <div className="ml-1 sm:ml-5 mt-1 pl-1 sm:pl-2 min-w-0 border-l-2 border-gray-200 space-y-1">
          {/* Tasks */}
          {item.tasks?.map((task) => (
            <div key={task.id} className="space-y-0.5">
              <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 bg-orange-50 p-1 rounded text-xs group/task lg:flex lg:flex-nowrap">
                <span className="px-1 py-0.5 rounded bg-orange-100 text-orange-700 text-xs">T</span>
                {editingItem === task.id ? (
                  <Input value={task.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, null, task.id)}
                    onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                    autoFocus className="h-11 min-w-0 w-full text-xs flex-1 lg:h-4 lg:w-auto" aria-label={`Task ${task.text} text`} />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 min-h-11 w-full flex-1 whitespace-normal break-words rounded px-1 text-left text-xs touch-manipulation hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:min-h-0 lg:w-auto lg:truncate lg:px-0"
                    onClick={() => setEditingItem(task.id)}
                    aria-label={`Edit task ${task.text}`}
                    title={`Edit task ${task.text}`}
                  >
                    {task.text}
                  </button>
                )}
                <Input 
                  value={task.assigned_to || ""} 
                  onChange={(e) => updateItemWithChange(item.id, { assigned_to: e.target.value }, null, task.id)}
                  placeholder="Assign..." 
                  className="col-span-3 row-start-2 h-11 min-w-0 w-full text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:h-4 lg:w-20"
                  list={`users-${task.id}`}
                  aria-label={`Assign task ${task.text}`}
                />
                <datalist id={`users-${task.id}`}>
                  {users.map(u => <option key={u.email} value={u.full_name || u.email} />)}
                </datalist>
                <button
                  type="button"
                  onClick={() => deleteItemWithChange(item.id, null, task.id)}
                  className="col-start-3 row-start-1 h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover/task:opacity-100 lg:focus-visible:opacity-100"
                  title={`Delete task ${task.text}`}
                  aria-label={`Delete task ${task.text}`}
                >
                  <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
                </button>
              </div>
              {/* Subtasks */}
              {task.subtasks?.map((subtask) => (
                <div key={subtask.id} className="ml-1 sm:ml-4 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask lg:flex">
                  <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                  {editingItem === subtask.id ? (
                    <Input value={subtask.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, null, task.id, subtask.id)}
                      onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                      autoFocus className="h-11 min-w-0 w-full text-xs flex-1 lg:h-4 lg:w-auto" aria-label={`Subtask ${subtask.text} text`} />
                  ) : (
                    <button
                      type="button"
                      className="min-w-0 min-h-11 w-full flex-1 whitespace-normal break-words rounded px-1 text-left text-xs touch-manipulation hover:bg-yellow-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 lg:min-h-0 lg:w-auto lg:truncate lg:px-0"
                      onClick={() => setEditingItem(subtask.id)}
                      aria-label={`Edit subtask ${subtask.text}`}
                      title={`Edit subtask ${subtask.text}`}
                    >
                      {subtask.text}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => deleteItemWithChange(item.id, null, task.id, subtask.id)}
                    className="h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover/subtask:opacity-100 lg:focus-visible:opacity-100"
                    title={`Delete subtask ${subtask.text}`}
                    aria-label={`Delete subtask ${subtask.text}`}
                  >
                    <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="pl-1 sm:pl-4"><Input placeholder="+ subtask" aria-label={`Add subtask under ${task.text}`} className="h-11 min-w-0 w-full text-xs lg:h-4" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addSubtaskWithChange(item.id, null, task.id, e.target.value); e.target.value = ""; } }} /></div>
            </div>
          ))}
          <Input placeholder="+ task" aria-label={`Add task under checklist item ${item.text}`} className="h-11 text-xs lg:h-5" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTaskWithChange(item.id, null, e.target.value); e.target.value = ""; } }} />
          
          {/* Details */}
          {item.details?.map((detail) => (
            <div key={detail.id} className="min-w-0 bg-gray-50 p-1 rounded border">
              <div className="flex flex-wrap items-center gap-1 text-xs lg:flex-nowrap">
                <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">D</span>
                {editingItem === detail.id ? (
                  <Input value={detail.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id)}
                    onBlur={() => setEditingItem(null)} autoFocus className="h-11 text-xs flex-1 lg:h-4" aria-label="Detail text" />
                ) : (
                  <button
                    type="button"
                    className="min-w-0 min-h-11 flex-1 truncate rounded px-1 text-left touch-manipulation hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:min-h-0 lg:px-0"
                    onClick={() => setEditingItem(detail.id)}
                    aria-label={`Edit detail ${detail.text}`}
                    title={`Edit detail ${detail.text}`}
                  >
                    {detail.text}
                  </button>
                )}
                {renderConditionSelect(item, items, setItems, detail.id, markChanged)}
                <select
                  value={detail.approved_by || ""}
                  onChange={(e) => updateItemWithChange(item.id, { approved_by: e.target.value }, detail.id)}
                  className="h-11 max-w-[9rem] text-xs px-1 border rounded bg-white touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-4 lg:max-w-none"
                  aria-label={`Answered by for detail ${detail.text}`}
                >
                  <option value="">Answered...</option>
                  {users.map(u => <option key={u.email} value={u.full_name || u.email}>{u.full_name || u.email}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => deleteItemWithChange(item.id, detail.id)}
                  className="h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6"
                  aria-label={`Delete detail ${detail.text}`}
                  title={`Delete detail ${detail.text}`}
                >
                  <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
                </button>
              </div>
              <div className="ml-1 sm:ml-4 mt-1 min-w-0 space-y-0.5">
                {detail.tasks?.map((task) => (
                  <div key={task.id} className="space-y-0.5">
                    <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 bg-orange-50 p-0.5 rounded text-xs group/dtask lg:flex lg:flex-nowrap">
                      <span className="px-0.5 rounded bg-orange-100 text-orange-700">T</span>
                      {editingItem === task.id ? (
                        <Input value={task.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id, task.id)}
                          onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                          autoFocus className="h-11 min-w-0 w-full text-xs flex-1 lg:h-4 lg:w-auto" aria-label={`Task ${task.text} text`} />
                      ) : (
                        <button
                          type="button"
                          className="min-w-0 min-h-11 w-full flex-1 whitespace-normal break-words rounded px-1 text-left text-xs touch-manipulation hover:bg-orange-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:min-h-0 lg:w-auto lg:truncate lg:px-0"
                          onClick={() => setEditingItem(task.id)}
                          aria-label={`Edit task ${task.text}`}
                          title={`Edit task ${task.text}`}
                        >
                          {task.text}
                        </button>
                      )}
                      <Input 
                        value={task.assigned_to || ""} 
                        onChange={(e) => updateItemWithChange(item.id, { assigned_to: e.target.value }, detail.id, task.id)}
                        placeholder="Assign..." 
                        className="col-span-3 row-start-2 h-11 min-w-0 w-full text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:h-4 lg:w-16"
                        list={`users-detail-${task.id}`}
                        aria-label={`Assign detail task ${task.text}`}
                      />
                      <datalist id={`users-detail-${task.id}`}>
                        {users.map(u => <option key={u.email} value={u.full_name || u.email} />)}
                      </datalist>
                      <button
                        type="button"
                        onClick={() => deleteItemWithChange(item.id, detail.id, task.id)}
                        className="col-start-3 row-start-1 h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover/dtask:opacity-100 lg:focus-visible:opacity-100"
                        title={`Delete task ${task.text}`}
                        aria-label={`Delete task ${task.text}`}
                      >
                        <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
                      </button>
                    </div>
                    {/* Subtasks under detail tasks */}
                    {task.subtasks?.map((subtask) => (
                      <div key={subtask.id} className="ml-1 sm:ml-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsubtask lg:flex">
                        <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                        {editingItem === subtask.id ? (
                          <Input value={subtask.text} onChange={(e) => updateItemWithChange(item.id, { text: e.target.value }, detail.id, task.id, subtask.id)}
                            onBlur={() => setEditingItem(null)} onKeyDown={(e) => e.key === 'Enter' && setEditingItem(null)}
                            autoFocus className="h-11 min-w-0 w-full text-xs flex-1 lg:h-4 lg:w-auto" aria-label={`Subtask ${subtask.text} text`} />
                        ) : (
                          <button
                            type="button"
                            className="min-w-0 min-h-11 w-full flex-1 whitespace-normal break-words rounded px-1 text-left text-xs touch-manipulation hover:bg-yellow-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400 lg:min-h-0 lg:w-auto lg:truncate lg:px-0"
                            onClick={() => setEditingItem(subtask.id)}
                            aria-label={`Edit subtask ${subtask.text}`}
                            title={`Edit subtask ${subtask.text}`}
                          >
                            {subtask.text}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteItemWithChange(item.id, detail.id, task.id, subtask.id)}
                          className="h-11 w-11 shrink-0 rounded text-red-500 hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-6 lg:w-6 lg:opacity-0 lg:group-hover/dsubtask:opacity-100 lg:focus-visible:opacity-100"
                          title={`Delete subtask ${subtask.text}`}
                          aria-label={`Delete subtask ${subtask.text}`}
                        >
                          <Trash2 className="w-4 h-4 mx-auto" aria-hidden="true" />
                        </button>
                      </div>
                    ))}
                    <div className="pl-1 sm:pl-3"><Input placeholder="+ subtask" aria-label={`Add subtask under ${task.text}`} className="h-11 min-w-0 w-full text-xs lg:h-4" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addSubtaskWithChange(item.id, detail.id, task.id, e.target.value); e.target.value = ""; } }} /></div>
                  </div>
                ))}
                <Input placeholder="+ task" aria-label={`Add task under detail ${detail.text}`} className="h-11 text-xs lg:h-4" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addTaskWithChange(item.id, detail.id, e.target.value); e.target.value = ""; } }} />
              </div>
            </div>
          ))}
          <Input placeholder="+ detail" aria-label={`Add detail under checklist item ${item.text}`} className="h-11 text-xs lg:h-5" onKeyDown={(e) => { if (e.key === 'Enter' && e.target.value.trim()) { addDetailItemWithChange(item.id, e.target.value); e.target.value = ""; } }} />
        </div>
      )}
    </div>
  );};

  const savedProductCount = selectedProducts.filter(product => product.isExisting).length;
  const pendingChecklistAdditions = countPendingChecklistAdditions(
    selectedProducts, productTypeTemplates, subTemplates, subTemplateItems
  );

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

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-[70] flex items-center justify-center p-1 sm:p-4" inert={isReloading ? "" : undefined} onClick={(e) => e.stopPropagation()}>
        <div className="w-full sm:w-[95vw] max-w-[1600px] h-[96dvh] sm:h-[90vh] overflow-hidden flex flex-col bg-white rounded-lg sm:rounded-xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="px-3 py-2 border-b bg-gray-50 flex items-center justify-between gap-2">
            <div className="min-w-0"><h2 ref={builderHeadingRef} tabIndex={-1} className="text-lg font-bold truncate focus:outline-none">Checklist Builder</h2></div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 shrink-0 p-0 touch-manipulation focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-8 lg:w-8"
              onClick={requestClose}
              aria-label="Close Checklist Builder"
              title="Close Checklist Builder"
            >
              <X className="w-5 h-5 lg:w-4 lg:h-4" aria-hidden="true" />
            </Button>
          </div>

          {persistenceError && (
            <div className="mx-3 mt-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <div className="font-medium">Checklist Builder update blocked</div>
                <div className="mt-1 break-words">{persistenceError}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 shrink-0 sm:flex sm:gap-1">
                <Button ref={reloadButtonRef} type="button" size="sm" variant="outline" className="h-11 border-red-300 bg-white text-red-800 touch-manipulation lg:h-7" onClick={requestReloadLatest} disabled={isReloading}>Reload latest</Button>
                <Button type="button" size="sm" variant="ghost" className="h-11 text-red-800 touch-manipulation lg:h-7" onClick={() => setPersistenceError("")}>Dismiss</Button>
              </div>
            </div>
          )}

          <Tabs value={activeTab} onValueChange={requestTabChange} className="flex-1 flex flex-col overflow-hidden">
            <div className="px-3 py-1.5 border-b bg-white">
              <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-1'} bg-gray-200 p-0.5 h-auto sm:h-8 gap-0.5`}>
                <TabsTrigger value="selectors" className="min-h-11 text-xs touch-manipulation data-[state=active]:bg-white sm:min-h-0">Select & Apply</TabsTrigger>
                {isAdmin && (
                  <>
                    <TabsTrigger value="producttypes" className="min-h-11 text-xs touch-manipulation data-[state=active]:bg-white sm:min-h-0">Product Checklists</TabsTrigger>
                    <TabsTrigger value="subtemplates" className="min-h-11 text-xs touch-manipulation data-[state=active]:bg-white sm:min-h-0">Checklist Options</TabsTrigger>
                    <TabsTrigger value="dropdowns" className="min-h-11 text-xs touch-manipulation data-[state=active]:bg-white sm:min-h-0">Conditions</TabsTrigger>
                  </>
                )}
              </TabsList>
            </div>

            {/* Select & Apply Tab */}
            <TabsContent value="selectors" className="overflow-y-auto p-3 flex-1" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr_2fr] gap-4 h-auto lg:h-full">
                <div className="flex flex-col h-auto lg:h-full">
                  {/* Products from Work Order */}
                  {workOrderProducts && workOrderProducts.length > 0 && (
                    <div className="mb-4">
                      <h3 className="font-bold text-sm mb-2 text-purple-700">📦 Products on this Job</h3>
                      <div className="space-y-1 max-h-[25vh] overflow-y-auto border rounded-lg p-2 bg-purple-50">
                        {workOrderProducts.map((product, index) => {
                          const hasTemplate = product.product_type && productTypeTemplates[product.product_type]?.items?.length > 0;
                          return (
                            <button type="button"
                              key={product.id}
                              type="button"
                              onClick={() => {
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
                                  subTemplates: [],
                                  isExisting: false
                                }]);
                              }}
                              disabled={!hasTemplate}
                              className={`min-h-11 w-full p-2 rounded border flex items-center justify-between text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 ${hasTemplate ? 'bg-white hover:bg-purple-100 border-purple-300' : 'bg-gray-100 opacity-50 border-gray-200 cursor-not-allowed'}`}
                              aria-label={hasTemplate
                                ? `Add checklist template for ${product.description || `Product ${index + 1}`}`
                                : `${product.description || `Product ${index + 1}`} has no checklist template`}
                            >
                              <span className="flex-1 min-w-0">
                                <span className="font-medium text-sm truncate block">{product.description || `Product ${index + 1}`}</span>
                                <span className="text-xs text-purple-600 block">{product.product_type || 'No type'}</span>
                              </span>
                              {hasTemplate && <Plus className="w-4 h-4 text-purple-500 flex-shrink-0" aria-hidden="true" />}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">Choose a product to add its checklist template</p>
                    </div>
                  )}
                  
                  <h3 className="font-bold text-sm mb-2">All Product Checklists</h3>
                  <div className="space-y-1 flex-1 overflow-y-auto">
                    {productTypes.map(type => {
                      const hasTemplate = productTypeTemplates[type]?.items?.length > 0;
                      return (
                        <button type="button"
                          key={type}
                          type="button"
                          onClick={() => addProductToSelection(type)}
                          disabled={!hasTemplate}
                          className={`min-h-11 w-full p-2 rounded border flex items-center justify-between text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 ${hasTemplate ? 'bg-white hover:bg-blue-50' : 'bg-gray-100 opacity-50 cursor-not-allowed'}`}
                          aria-label={hasTemplate ? `Add ${type} checklist with ${productTypeTemplates[type].items.length} items` : `${type} has no checklist template`}
                        >
                          <span>
                            <span className="font-medium text-sm block">{type}</span>
                            <span className="text-xs text-gray-500 block">{hasTemplate ? `${productTypeTemplates[type].items.length} items` : 'No template'}</span>
                          </span>
                          {hasTemplate && <Plus className="w-4 h-4 text-blue-500" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col h-auto lg:h-full">
                  <h3 className="font-bold text-sm">Checklist Setup</h3>
                  {selectedProducts.length > 0 && (
                    <div className="text-xs text-gray-600 mt-1 mb-2 space-y-1">
                      <p>{savedProductCount} saved on Work Order · {pendingChecklistAdditions} new to add</p>
                      <p>Saved checklist rows and answers stay unchanged. Deselecting a pending template only changes what will be added.</p>
                    </div>
                  )}
                  {selectedProducts.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 border rounded bg-gray-50 text-sm">Choose a product type to add</div>
                  ) : (
                    <DragDropContext onDragEnd={(result) => {
                      if (!result.destination) return;
                      const reordered = Array.from(selectedProducts);
                      const [removed] = reordered.splice(result.source.index, 1);
                      reordered.splice(result.destination.index, 0, removed);
                      setSelectedProducts(reordered);
                    }}>
                    <Droppable droppableId="selected-products">
                      {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 max-h-[50vh] overflow-y-auto">
                      {selectedProducts.map((product, idx) => (
                        <Draggable key={product.id} draggableId={product.id} index={idx} isDragDisabled={product.isExisting}>
                          {(provided) => (
                        <div ref={provided.innerRef} {...provided.draggableProps} className="border rounded p-2 bg-white">
                          <div className="flex items-center gap-2 mb-1">
                            {product.isExisting ? (
                              <div className="h-11 w-11 shrink-0 rounded bg-green-50 flex items-center justify-center lg:h-7 lg:w-7" title="Saved Work Order checklist order cannot be changed here" aria-label="Saved checklist — order unchanged">
                                <Check className="w-4 h-4 text-green-600" aria-hidden="true" />
                              </div>
                            ) : (
                              <div
                                {...provided.dragHandleProps}
                                className="h-11 w-11 shrink-0 rounded flex items-center justify-center cursor-grab touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-7 lg:w-7"
                                aria-label={`Reorder pending checklist ${product.customName}`}
                                title={`Reorder pending checklist ${product.customName}`}
                              >
                                <GripVertical className="w-4 h-4 text-gray-400" aria-hidden="true" />
                              </div>
                            )}
                            <Input
                              value={product.customName}
                              onChange={(e) => updateProductName(product.id, e.target.value)}
                              disabled={product.isExisting}
                              className="h-11 min-w-0 flex-1 text-sm lg:h-7"
                              aria-label={product.isExisting
                                ? `Saved product name ${product.customName}`
                                : `Product name for ${product.productType} checklist`}
                            />
                            {product.isExisting && (
                              <span
                                className="text-[10px] font-medium rounded bg-green-100 text-green-700 px-1.5 py-0.5"
                                title="Saved Work Order checklist — preserved and not reapplied"
                              >
                                Saved
                              </span>
                            )}
                            {!product.isExisting && (
                              <button
                                type="button"
                                onClick={() => setSelectedProducts(current => current.filter(p => p.id !== product.id))}
                                className="h-11 w-11 shrink-0 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 touch-manipulation lg:h-7 lg:w-7"
                                title="Deselect this pending checklist; saved Work Order data is unchanged"
                                aria-label={`Deselect pending checklist ${product.customName}; saved Work Order data is unchanged`}
                              >
                                <X className="w-4 h-4 mx-auto" aria-hidden="true" />
                              </button>
                            )}
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
                                  const isAlreadyApplied = product.isExisting && existingChecklist.some(item =>
                                    item.product_name === product.customName && item.sub_template_name === st.name
                                  );
                                  return (
                                    <button type="button"
                                      key={st.id}
                                      type="button"
                                      onClick={() => { if (!isAlreadyApplied) toggleSubTemplateForProduct(product.id, st.id); }}
                                      aria-pressed={isAlreadyApplied || isSelected}
                                      aria-disabled={isAlreadyApplied}
                                      aria-label={isAlreadyApplied
                                        ? `${st.name}, already applied to saved Work Order checklist`
                                        : isSelected
                                          ? `Deselect pending checklist option ${st.name} for ${product.customName}; saved answers stay unchanged`
                                          : `Select checklist option ${st.name} to add to ${product.customName}`}
                                      title={isAlreadyApplied
                                        ? "Already saved on this Work Order — cannot be removed here"
                                        : isSelected
                                          ? "Deselect pending addition — saved checklist answers are unchanged"
                                          : "Select this option to add checklist rows"}
                                      className={`min-h-11 max-w-full px-2 py-1.5 rounded border inline-flex items-center gap-1.5 text-left text-xs touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1 ${
                                        isAlreadyApplied
                                          ? 'bg-green-50 border-green-200 text-green-700 cursor-default'
                                          : isSelected
                                            ? 'bg-purple-100 border-purple-400'
                                            : 'bg-white hover:border-purple-300'
                                      }`}
                                    >
                                      <span
                                        className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${
                                          isAlreadyApplied
                                            ? 'bg-green-500 border-green-500'
                                            : isSelected
                                              ? 'bg-purple-500 border-purple-500'
                                              : 'border-gray-400'
                                        }`}
                                        aria-hidden="true"
                                      >
                                        {(isAlreadyApplied || isSelected) && <Check className="w-3 h-3 text-white" />}
                                      </span>
                                      <span className="min-w-0 break-words">{st.name}</span>
                                      {isAlreadyApplied && <span className="shrink-0 font-medium">Saved</span>}
                                      {!isAlreadyApplied && isSelected && <span className="shrink-0 font-medium">To add</span>}
                                    </button>
                                  );
                                })}
                              </div>
                            );
                          })()}
                          </div>
                          )}
                          </Draggable>
                          ))}
                          {provided.placeholder}
                          </div>
                          )}
                          </Droppable>
                          </DragDropContext>
                          )}
                          {selectedProducts.length > 0 && (
                          <Button
                            type="button"
                            onClick={handleApplyTemplate}
                            disabled={pendingChecklistAdditions === 0}
                            className="min-h-11 w-full mt-2 bg-purple-600 hover:bg-purple-700 touch-manipulation focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-2 disabled:opacity-50"
                            aria-label={pendingChecklistAdditions > 0
                              ? `Apply ${pendingChecklistAdditions} new checklist selection${pendingChecklistAdditions === 1 ? '' : 's'} to project`
                              : 'Nothing new selected to add to project'}
                          >
                            <CheckSquare className="w-4 h-4 mr-2" aria-hidden="true" />Apply to Project
                          </Button>
                          )}
                </div>

                {/* Preview Column */}
                <div className="border-t pt-3 lg:border-t-0 lg:pt-0 lg:border-l lg:pl-3">
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
                            {product.isExisting && (
                              <div className="mb-2 rounded border border-green-200 bg-green-50 px-2 py-1.5 text-xs text-green-800">
                                Existing base checklist is already saved and will stay unchanged. Only newly selected checklist options below will be added.
                              </div>
                            )}
                            {!product.isExisting && template?.items?.map((item, idx) => {
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
            <TabsContent value="subtemplates" className="overflow-y-auto lg:overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_1fr] gap-4 h-auto lg:h-full">
              <div className="space-y-1 overflow-y-auto">
                <div className="flex gap-1 mb-2">
                  <Input value={newSubTemplateName} onChange={(e) => setNewSubTemplateName(e.target.value)} placeholder="New checklist option..." className="h-11 text-sm lg:h-7" onKeyDown={(e) => e.key === 'Enter' && createSubTemplate()} />
                  <Button type="button" size="sm" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-7 lg:w-auto lg:px-2" onClick={createSubTemplate} aria-label="Add checklist option">
                    <Plus className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" />
                  </Button>
                </div>
                <DragDropContext onDragEnd={handleSubTemplateDragEnd}>
                  <Droppable droppableId="subtemplates">
                    {(provided) => (
                      <div ref={provided.innerRef} {...provided.droppableProps}>
                        {subTemplates.map((st, index) => (
                          <Draggable key={st.id} draggableId={st.id} index={index} isDragDisabled={isSubTemplateReordering}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps}
                                onClick={() => editingSubTemplateId !== st.id && selectSubTemplateForEditing(st)}
                                className={`p-1.5 rounded border cursor-pointer flex items-center gap-1 mb-1 ${selectedSubTemplate === st.id ? 'bg-purple-100 border-purple-300' : 'bg-white hover:bg-gray-50'}`}>
                                <div
                                  {...provided.dragHandleProps}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-11 w-11 shrink-0 rounded flex items-center justify-center cursor-grab touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-7 lg:w-7"
                                  aria-label={`Reorder checklist option ${st.name}`}
                                  title={`Reorder checklist option ${st.name}`}
                                  aria-disabled={isSubTemplateReordering}
                                >
                                  <GripVertical className="w-4 h-4 text-gray-400 lg:w-3 lg:h-3" aria-hidden="true" />
                                </div>
                                {editingSubTemplateId === st.id ? (
                                  <div className="flex-1 min-w-0 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input value={editingSubTemplateName} onChange={(e) => setEditingSubTemplateName(e.target.value)} className="h-11 min-w-0 flex-1 text-sm lg:h-6 lg:text-xs" aria-label={`Rename checklist option ${st.name}`} autoFocus
                                      onKeyDown={async (e) => { if (e.key === 'Enter') await renameSubTemplate(st, editingSubTemplateName); if (e.key === 'Escape') { setEditingSubTemplateId(null); setEditingSubTemplateName(""); } }} />
                                    <Button type="button" size="sm" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-6 lg:w-auto lg:px-1" aria-label={`Save checklist option name ${st.name}`} title={`Save checklist option name ${st.name}`} onClick={() => renameSubTemplate(st, editingSubTemplateName)}><Save className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" /></Button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); selectSubTemplateForEditing(st); }}
                                      aria-pressed={selectedSubTemplate === st.id}
                                      aria-label={`Edit checklist option ${st.name}`}
                                      className="h-11 flex-1 min-w-0 rounded text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 lg:h-auto"
                                    >
                                      <span className="block font-medium text-xs truncate">{st.name}</span>
                                      <span className="block text-xs text-gray-500">{subTemplateItems[st.id]?.items?.length || 0} items</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); duplicateSubTemplate(st); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-blue-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-7 lg:w-7"
                                      title={`Duplicate ${st.name}`}
                                      aria-label={`Duplicate checklist option ${st.name}`}
                                    >
                                      <Copy className="w-4 h-4 text-blue-500 mx-auto" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingSubTemplateId(st.id); setEditingSubTemplateName(st.name); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-gray-100 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 lg:h-7 lg:w-7"
                                      title={`Rename ${st.name}`}
                                      aria-label={`Rename checklist option ${st.name}`}
                                    >
                                      <Pencil className="w-4 h-4 text-gray-500 mx-auto" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); deleteSubTemplate(st); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-7 lg:w-7"
                                      title={`Delete ${st.name}`}
                                      aria-label={`Delete checklist option ${st.name}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500 mx-auto" aria-hidden="true" />
                                    </button>
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
                      <h3 className="min-w-0 flex-1 truncate font-bold text-sm">{subTemplates.find(st => st.id === selectedSubTemplate)?.name}</h3>
                      {(subTemplateHasChanges || subTemplateSaveStatus === 'saved') && (
                        <Button 
                          onClick={saveSubTemplateChecklist}
                          size="sm"
                          disabled={savingChecklist === 'subTemplate'}
                          aria-busy={savingChecklist === 'subTemplate'}
                          className={`h-11 shrink-0 ml-2 touch-manipulation lg:h-7 ${subTemplateSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                          type="button"
                          aria-label={savingChecklist === 'subTemplate' ? "Saving checklist option" : subTemplateSaveStatus === 'saved' ? "Checklist option saved" : "Save checklist option"}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {savingChecklist === 'subTemplate' ? 'Saving…' : subTemplateSaveStatus === 'saved' ? 'Saved' : 'Save'}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1 mb-2">
                      <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add checklist item..." className="h-11 min-w-0 flex-1 text-sm lg:h-7" aria-label="New checklist option item"
                        onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems, false)} />
                      <Button type="button" disabled={!newItemText.trim()} onClick={() => addChecklistItem(subTemplateChecklistItems, setSubTemplateChecklistItems, false)} size="sm" variant="outline" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-7 lg:w-auto lg:px-3" aria-label="Add checklist item">
                        <Plus className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" />
                      </Button>
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
                            <button type="button"
                              key={type}
                              onClick={async () => {
                                const currentApplies = currentST?.applies_to_product_types || [];
                                const newApplies = isApplied 
                                  ? currentApplies.filter(t => t !== type)
                                  : [...currentApplies, type];
                                await updateSubTemplateProductTypes(currentST, newApplies);
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
            <TabsContent value="producttypes" className="overflow-y-auto lg:overflow-hidden p-3" style={{ marginTop: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr_1fr] gap-4 h-auto lg:h-full">
              <div className="space-y-1 overflow-y-auto">
                <div className="flex gap-1 mb-2">
                  <Input value={newProductTypeName} onChange={(e) => setNewProductTypeName(e.target.value)} placeholder="New product type..." className="h-11 text-sm lg:h-7" onKeyDown={(e) => e.key === 'Enter' && createProductType()} />
                  <Button type="button" size="sm" disabled={!newProductTypeName.trim()} className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-7 lg:w-auto lg:px-2" onClick={createProductType} aria-label="Add product type">
                    <Plus className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" />
                  </Button>
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
                                <div
                                  {...provided.dragHandleProps}
                                  onClick={(e) => e.stopPropagation()}
                                  className="h-11 w-11 shrink-0 rounded flex items-center justify-center cursor-grab touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-7 lg:w-7"
                                  aria-label={`Reorder product checklist ${type}`}
                                  title={`Reorder product checklist ${type}`}
                                >
                                  <GripVertical className="w-4 h-4 text-gray-400 lg:w-3 lg:h-3" aria-hidden="true" />
                                </div>
                                {editingProductTypeName === type ? (
                                  <div className="flex-1 min-w-0 flex gap-1" onClick={(e) => e.stopPropagation()}>
                                    <Input 
                                      value={editingProductTypeValue} 
                                      onChange={(e) => setEditingProductTypeValue(e.target.value)} 
                                      className="h-11 min-w-0 flex-1 text-sm lg:h-6 lg:text-xs"
                                      aria-label={`Rename product checklist ${type}`}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') void renameProductType(type, editingProductTypeValue);
                                        if (e.key === 'Escape') { setEditingProductTypeName(null); setEditingProductTypeValue(""); }
                                      }}
                                    />
                                    <Button type="button" size="sm" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-6 lg:w-auto lg:px-1" aria-label={`Save product checklist name ${type}`} title={`Save product checklist name ${type}`} onClick={() => void renameProductType(type, editingProductTypeValue)}><Save className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" /></Button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); selectProductType(type); }}
                                      aria-pressed={selectedProductType === type}
                                      aria-label={`Edit product checklist ${type}`}
                                      className="h-11 flex-1 min-w-0 rounded text-left touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-auto"
                                    >
                                      <span className="block font-medium text-xs truncate">{type}</span>
                                      <span className="block text-xs text-gray-500">{productTypeTemplates[type]?.items?.length || 0} items</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); duplicateProductTypeTemplate(type); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-blue-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 lg:h-7 lg:w-7"
                                      title={`Duplicate ${type}`}
                                      aria-label={`Duplicate product checklist ${type}`}
                                    >
                                      <Copy className="w-4 h-4 text-blue-500 mx-auto" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setEditingProductTypeName(type); setEditingProductTypeValue(type); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-gray-100 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 lg:h-7 lg:w-7"
                                      title={`Rename ${type}`}
                                      aria-label={`Rename product checklist ${type}`}
                                    >
                                      <Pencil className="w-4 h-4 text-gray-500 mx-auto" aria-hidden="true" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); requestDeleteProductType(type, index); }}
                                      className="h-11 w-11 shrink-0 rounded hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-7 lg:w-7"
                                      title={`Remove ${type} from Product Checklists`}
                                      aria-label={`Remove product checklist ${type} from Template Builder`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500 mx-auto" aria-hidden="true" />
                                    </button>
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
                      <h3 className="min-w-0 flex-1 truncate font-bold text-sm">{selectedProductType}</h3>
                      {(productTypeHasChanges || productTypeSaveStatus === 'saved') && (
                        <Button 
                          onClick={saveProductTypeTemplate}
                          size="sm"
                          disabled={savingChecklist === 'productType'}
                          aria-busy={savingChecklist === 'productType'}
                          className={`h-11 shrink-0 ml-2 touch-manipulation lg:h-7 ${productTypeSaveStatus === 'saved' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                          type="button"
                          aria-label={savingChecklist === 'productType' ? "Saving product checklist" : productTypeSaveStatus === 'saved' ? "Product checklist saved" : "Save product checklist"}
                        >
                          <Save className="w-3 h-3 mr-1" />
                          {savingChecklist === 'productType' ? 'Saving…' : productTypeSaveStatus === 'saved' ? 'Saved' : 'Save'}
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-1 mb-2">
                      <Input value={newItemText} onChange={(e) => setNewItemText(e.target.value)} placeholder="Add checklist item..." className="h-11 min-w-0 flex-1 text-sm lg:h-7" aria-label="New product checklist item"
                        onKeyDown={(e) => e.key === 'Enter' && addChecklistItem(productTypeItems, setProductTypeItems, true)} />
                      <Button type="button" disabled={!newItemText.trim()} onClick={() => addChecklistItem(productTypeItems, setProductTypeItems, true)} size="sm" variant="outline" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-7 lg:w-auto lg:px-3" aria-label="Add product checklist item">
                        <Plus className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" />
                      </Button>
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
                  <Input
                    value={newDropdownName}
                    onChange={(e) => setNewDropdownName(e.target.value)}
                    placeholder="New condition..."
                    className="h-11 min-w-0 flex-1 text-sm lg:h-8"
                    aria-label="New condition name"
                    onKeyDown={(e) => e.key === 'Enter' && createDropdownCondition()}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={!newDropdownName.trim()}
                    className="h-11 shrink-0 px-3 touch-manipulation focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-1 lg:h-8"
                    aria-label="Add condition"
                    onClick={createDropdownCondition}
                  >
                    <Plus className="w-4 h-4 mr-1" aria-hidden="true" />Add
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
                      saveDropdownConditionsCatalog([...updatedCompleted, ...continuedItems], 'completed reorder');
                    }}>
                      <Droppable droppableId="completed-conditions">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-[50vh] overflow-y-auto">
                            {dropdownConditions.filter(dd => dd.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0)).map((dd, index) => (
                              <Draggable key={dd.id} draggableId={dd.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-1 p-2 border rounded text-sm bg-green-50 border-green-300">
                                    <div
                                      {...provided.dragHandleProps}
                                      className="h-11 w-11 shrink-0 rounded flex items-center justify-center cursor-grab touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 lg:h-7 lg:w-7"
                                      aria-label={`Reorder completed condition ${dd.name}`}
                                      title={`Reorder completed condition ${dd.name}`}
                                    >
                                      <GripVertical className="w-4 h-4 text-gray-400 lg:w-3 lg:h-3" aria-hidden="true" />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const continuedItems = dropdownConditions.filter(d => !d.is_completed);
                                        const completedItems = dropdownConditions.filter(d => d.is_completed && d.id !== dd.id);
                                        const movedItem = { ...dd, is_completed: false, order: continuedItems.length };
                                        saveDropdownConditionsCatalog([...completedItems, ...continuedItems, movedItem], 'mark continued');
                                      }}
                                      className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500 hover:bg-green-600 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-2 lg:h-7 lg:w-7"
                                      title={`Mark ${dd.name} as Continued`}
                                      aria-label={`Mark condition ${dd.name} as Continued`}
                                    >
                                      <Check className="w-4 h-4 text-white lg:w-3 lg:h-3" aria-hidden="true" />
                                    </button>
                                    {editingDropdown === dd.id ? (
                                      <>
                                        <Input 
                                          id={`edit-${dd.id}`}
                                          value={editingDropdownName}
                                          onChange={(e) => setEditingDropdownName(e.target.value)}
                                          className="h-11 min-w-0 flex-1 text-sm lg:h-6"
                                          aria-label={`Condition name ${dd.name}`}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveDropdownRename(dd);
                                            if (e.key === 'Escape') cancelDropdownRename();
                                          }}
                                        />
                                        <Button type="button" size="sm" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-6 lg:w-auto lg:px-2" aria-label={`Save condition name ${dd.name}`} title={`Save condition name ${dd.name}`} onClick={() => saveDropdownRename(dd)}><Save className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" /></Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="min-w-0 flex-1 truncate">{dd.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => startDropdownRename(dd)}
                                          className="h-11 w-11 shrink-0 rounded flex items-center justify-center hover:bg-gray-100 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 lg:h-7 lg:w-7"
                                          aria-label={`Rename condition ${dd.name}`}
                                          title={`Rename condition ${dd.name}`}
                                        >
                                          <Pencil className="w-4 h-4 text-gray-500 lg:w-3 lg:h-3" aria-hidden="true" />
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => requestDeleteCondition(dd)}
                                      className="h-11 w-11 shrink-0 rounded flex items-center justify-center hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-7 lg:w-7"
                                      aria-label={`Delete condition ${dd.name}`}
                                      title={`Delete condition ${dd.name}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500 lg:w-3 lg:h-3" aria-hidden="true" />
                                    </button>
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
                      saveDropdownConditionsCatalog([...completedItems, ...updatedContinued], 'continued reorder');
                    }}>
                      <Droppable droppableId="continued-conditions">
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-1 max-h-[50vh] overflow-y-auto">
                            {dropdownConditions.filter(dd => !dd.is_completed).sort((a, b) => (a.order || 0) - (b.order || 0)).map((dd, index) => (
                              <Draggable key={dd.id} draggableId={dd.id} index={index}>
                                {(provided) => (
                                  <div ref={provided.innerRef} {...provided.draggableProps} className="flex items-center gap-1 p-2 border rounded text-sm bg-yellow-50 border-yellow-300">
                                    <div
                                      {...provided.dragHandleProps}
                                      className="h-11 w-11 shrink-0 rounded flex items-center justify-center cursor-grab touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500 lg:h-7 lg:w-7"
                                      aria-label={`Reorder continued condition ${dd.name}`}
                                      title={`Reorder continued condition ${dd.name}`}
                                    >
                                      <GripVertical className="w-4 h-4 text-gray-400 lg:w-3 lg:h-3" aria-hidden="true" />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const completedItems = dropdownConditions.filter(d => d.is_completed);
                                        const continuedItems = dropdownConditions.filter(d => !d.is_completed && d.id !== dd.id);
                                        const movedItem = { ...dd, is_completed: true, order: completedItems.length };
                                        saveDropdownConditionsCatalog([...completedItems, movedItem, ...continuedItems], 'mark completed');
                                      }}
                                      className="h-11 w-11 rounded-full flex items-center justify-center flex-shrink-0 bg-yellow-500 hover:bg-yellow-600 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-600 focus-visible:ring-offset-2 lg:h-7 lg:w-7"
                                      title={`Mark ${dd.name} as Completed`}
                                      aria-label={`Mark condition ${dd.name} as Completed`}
                                    >
                                      <span className="text-white text-sm font-bold lg:text-xs" aria-hidden="true">C</span>
                                    </button>
                                    {editingDropdown === dd.id ? (
                                      <>
                                        <Input 
                                          id={`edit-${dd.id}`}
                                          value={editingDropdownName}
                                          onChange={(e) => setEditingDropdownName(e.target.value)}
                                          className="h-11 min-w-0 flex-1 text-sm lg:h-6"
                                          aria-label={`Condition name ${dd.name}`}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') saveDropdownRename(dd);
                                            if (e.key === 'Escape') cancelDropdownRename();
                                          }}
                                        />
                                        <Button type="button" size="sm" className="h-11 w-11 shrink-0 px-0 touch-manipulation lg:h-6 lg:w-auto lg:px-2" aria-label={`Save condition name ${dd.name}`} title={`Save condition name ${dd.name}`} onClick={() => saveDropdownRename(dd)}><Save className="w-4 h-4 lg:w-3 lg:h-3" aria-hidden="true" /></Button>
                                      </>
                                    ) : (
                                      <>
                                        <span className="min-w-0 flex-1 truncate">{dd.name}</span>
                                        <button
                                          type="button"
                                          onClick={() => startDropdownRename(dd)}
                                          className="h-11 w-11 shrink-0 rounded flex items-center justify-center hover:bg-gray-100 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 lg:h-7 lg:w-7"
                                          aria-label={`Rename condition ${dd.name}`}
                                          title={`Rename condition ${dd.name}`}
                                        >
                                          <Pencil className="w-4 h-4 text-gray-500 lg:w-3 lg:h-3" aria-hidden="true" />
                                        </button>
                                      </>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => requestDeleteCondition(dd)}
                                      className="h-11 w-11 shrink-0 rounded flex items-center justify-center hover:bg-red-50 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 lg:h-7 lg:w-7"
                                      aria-label={`Delete condition ${dd.name}`}
                                      title={`Delete condition ${dd.name}`}
                                    >
                                      <Trash2 className="w-4 h-4 text-red-500 lg:w-3 lg:h-3" aria-hidden="true" />
                                    </button>
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
            <Button type="button" onClick={requestClose} variant="outline" size="sm" className="h-11 min-w-24 touch-manipulation lg:h-8">Close</Button>
          </div>
        </div>
      </div>

      <AlertDialog open={!!noticeDialog} onOpenChange={(open) => { if (!open) setNoticeDialog(null); }}>
        <AlertDialogContent className="clay-card w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto border-none z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-start gap-2 text-left">
              <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500" aria-hidden="true" />
              <span className="min-w-0 break-words">{noticeDialog?.title || "SIPS Template Builder"}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words text-left">{noticeDialog?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogAction className="h-11 w-full touch-manipulation sm:w-auto" onClick={() => setNoticeDialog(null)}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmDialog} onOpenChange={(open) => { if (!open && !isConfirming) setConfirmDialog(null); }}>
        <AlertDialogContent className="clay-card w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto border-none z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-start gap-2 text-left">
              <Trash2 className="w-5 h-5 shrink-0 text-red-500" aria-hidden="true" />
              <span className="min-w-0 break-words">{confirmDialog?.title || "Confirm deletion"}</span>
            </AlertDialogTitle>
            <AlertDialogDescription className="break-words text-left">{confirmDialog?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-11 w-full touch-manipulation sm:w-auto" disabled={isConfirming}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={runConfirmedAction}
              disabled={isConfirming}
              aria-busy={isConfirming}
              className="h-11 w-full bg-red-600 hover:bg-red-700 touch-manipulation sm:w-auto"
            >
              {isConfirming
                ? (confirmDialog?.confirmLabel === "Remove from Builder" ? "Removing from Builder…" : "Deleting…")
                : (confirmDialog?.confirmLabel || "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* The reload is modal for keyboard users as well as pointer users.
          Keep the editable Builder inert until its verified read settles. */}
      <AlertDialog open={isReloading}>
        <AlertDialogContent
          className="clay-card z-[140] w-[calc(100vw-1rem)] max-w-sm border-none"
          onEscapeKeyDown={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (reloadButtonRef.current?.isConnected) reloadButtonRef.current.focus();
            else builderHeadingRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Reloading latest checklist templates…</AlertDialogTitle>
            <AlertDialogDescription role="status" aria-live="polite" tabIndex={0} className="focus:outline-none">
              Checking the newest saved templates. Editing will resume when the reload finishes.
            </AlertDialogDescription>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingNavigation} onOpenChange={(open) => { if (!open) setPendingNavigation(null); }}>
        <AlertDialogContent className="clay-card w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto border-none z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingNavigation?.kind === 'reload' ? 'Discard edits and reload latest templates?' : 'Discard unsaved checklist edits?'}</AlertDialogTitle>
            <AlertDialogDescription>{pendingNavigation?.kind === 'reload'
              ? 'Reloading the latest templates will discard unsaved checklist edits, unfinished names, and any new item you have not added. Your draft stays available if the reload fails. Choose Keep editing to preserve it.'
              : `${pendingNavigation?.kind === 'close' ? 'Closing the builder' : 'Switching tabs'} will discard unsaved checklist edits, unfinished names, and any new item you haven't added. Save or add your work first, or discard to continue.`}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep editing</AlertDialogCancel>
            <AlertDialogAction className="h-11 bg-amber-700 hover:bg-amber-800" onClick={confirmNavigation}>{pendingNavigation?.kind === 'reload' ? 'Discard edits & reload latest' : pendingNavigation?.kind === 'close' ? 'Discard and close' : 'Discard and switch'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingEditorSwitch} onOpenChange={(open) => { if (!open) setPendingEditorSwitch(null); }}>
        <AlertDialogContent className="clay-card w-[calc(100vw-1rem)] max-w-lg max-h-[calc(100dvh-1rem)] overflow-y-auto border-none z-[120]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-left">Discard unsaved checklist edits?</AlertDialogTitle>
            <AlertDialogDescription className="break-words text-left">
              Switching to “{pendingEditorSwitch?.name}” will discard unsaved checklist edits and any new item you haven't added to the current {pendingEditorSwitch?.kind === 'subtemplate' ? 'checklist option' : 'product checklist'}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-0">
            <AlertDialogCancel className="h-11 w-full touch-manipulation sm:w-auto">Keep editing</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 w-full bg-amber-700 hover:bg-amber-800 touch-manipulation sm:w-auto"
              onClick={confirmEditorSwitch}
            >
              Discard and switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create Condition Dialog */}
      <Dialog open={!!showOtherPopup} onOpenChange={(open) => { if (!open) setShowOtherPopup(null); }}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-sm z-[110]">
          <DialogHeader><DialogTitle>Add Condition</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="max-h-48 overflow-y-auto overscroll-contain border rounded">
              {dropdownConditions.length > 0 ? dropdownConditions.map(dd => (
                <button type="button"
                  key={dd.id}
                  type="button"
                  onClick={() => showOtherPopup && handleOtherDropdownSelect(showOtherPopup.items, showOtherPopup.setItems, showOtherPopup.itemId, showOtherPopup.detailId, dd.id)}
                  className="min-h-11 w-full px-3 py-2 border-b last:border-b-0 hover:bg-purple-50 flex items-center gap-2 text-left text-sm touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-400"
                  aria-label={`Add condition ${dd.name}`}
                >
                  <List className="w-4 h-4 shrink-0 text-purple-500" aria-hidden="true" />
                  <span className="min-w-0 flex-1 break-words">{dd.name}</span>
                </button>
              )) : (
                <div className="px-3 py-4 text-center text-sm text-gray-500">No saved conditions yet.</div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={customDropdownValue}
                onChange={(e) => setCustomDropdownValue(e.target.value)}
                placeholder="New condition..."
                className="h-11 min-w-0 flex-1"
                aria-label="New condition name"
                onKeyDown={(e) => e.key === 'Enter' && handleCreateCustomDropdown()}
              />
              <Button
                type="button"
                onClick={handleCreateCustomDropdown}
                disabled={!customDropdownValue.trim()}
                className="h-11 w-11 shrink-0 px-0 touch-manipulation"
                aria-label="Create and add condition"
                title="Create and add condition"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11 min-w-24 touch-manipulation" onClick={() => setShowOtherPopup(null)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}