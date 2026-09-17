import { useState, useEffect, useMemo } from "react";
import ReactDOM from "react-dom";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save, Plus, Pencil, AlertCircle, CheckCircle2, Trash2, List, ChevronDown, ChevronRight, Search, X } from "lucide-react";
import MultiUserSelectInline from "@/components/shared/MultiUserSelectInline";
import { Dialog as OtherDialog, DialogContent as OtherDialogContent, DialogHeader as OtherDialogHeader, DialogTitle as OtherDialogTitle, DialogFooter as OtherDialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import TemplateBuilder from "./TemplateBuilder";
import RevisitDatePopup from "./RevisitDatePopup";
import ChecklistCompletedSection from "./ChecklistCompletedSection";
import { replaceWorkOrderFieldsIfUnchanged } from "@/components/workflow/workOrderPersistence";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const parseDateOnly = (dateString) => {
  if (!dateString) return null;
  const [year, month, day] = String(dateString).split('-').map(Number);
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const formatDateOnly = (dateString) => {
  const date = parseDateOnly(dateString);
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : "None";
};

const isFutureRevisitDate = (dateString) => {
  const date = parseDateOnly(dateString);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
};

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
  const [, setProductTypes] = useState([]);
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  const [showRevisitPopup, setShowRevisitPopup] = useState(false);
  const [pendingRevisitDate, setPendingRevisitDate] = useState(null);
  const [loadedChecklistSnapshot, setLoadedChecklistSnapshot] = useState(undefined);
  const [loadedProductsSnapshot, setLoadedProductsSnapshot] = useState(undefined);
  const [loadedUiChecklistSnapshot, setLoadedUiChecklistSnapshot] = useState([]);
  const [loadedUiProductsSnapshot, setLoadedUiProductsSnapshot] = useState([]);
  const [loadedRevisitDateSnapshot, setLoadedRevisitDateSnapshot] = useState(undefined);
  const [loadedSipCompletedSnapshot, setLoadedSipCompletedSnapshot] = useState(undefined);
  const [saveError, setSaveError] = useState("");
  const [validationDialog, setValidationDialog] = useState(null);
  const [showCompletedItems, setShowCompletedItems] = useState(false);
  const [discardWarning, setDiscardWarning] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);

  // Keep hierarchy indexes stable while unrelated dialog state changes. Long
  // checklists should only rebuild these O(n) structures when their source data changes.
  const { checklistItemById, checklistChildrenByParentId } = useMemo(() => {
    const itemById = new Map(checklist.map(item => [item.id, item]));
    const childrenByParentId = new Map();
    checklist.forEach(item => {
      if (!item.parent_id) return;
      if (!childrenByParentId.has(item.parent_id)) childrenByParentId.set(item.parent_id, []);
      childrenByParentId.get(item.parent_id).push(item);
    });
    return { checklistItemById: itemById, checklistChildrenByParentId: childrenByParentId };
  }, [checklist]);
  const dropdownConditionByName = useMemo(
    () => new Map(dropdownConditions.map(condition => [condition.name, condition])),
    [dropdownConditions]
  );

  useEffect(() => {
    if (isOpen && workOrder) {
      loadData();
    }
  }, [isOpen, workOrder]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [freshWO, usersData, dropdownsSetting, productTypesSetting] = await Promise.all([
        WorkOrder.filter({ id: workOrder.id }),
        loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Product checklist authorized users" }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "dropdownConditions",
          label: "Product checklist dropdown conditions",
        }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "productTypes",
          label: "Product checklist product types",
        })
      ]);

      const currentWO = freshWO[0];
      if (!currentWO) return;

      setUsers(usersData);

      const cloneLoadedValue = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      setLoadedProductsSnapshot(cloneLoadedValue(currentWO.products));
      setLoadedRevisitDateSnapshot(currentWO.sip_revisit_date);
      setLoadedSipCompletedSnapshot(currentWO.sip_completed);
      setSaveError("");

      // Load products from new structure or migrate old
      if (currentWO.products && Array.isArray(currentWO.products)) {
        setProducts(currentWO.products);
        setLoadedUiProductsSnapshot(cloneLoadedValue(currentWO.products) || []);
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
        setLoadedUiProductsSnapshot(cloneLoadedValue(migratedProducts) || []);
      }

      // Reconstruct hierarchy from IDs if type/parent_id fields are missing
      setLoadedChecklistSnapshot(cloneLoadedValue(currentWO.sip_checklist));
      const rawChecklist = currentWO.sip_checklist || [];
      const reconstructedChecklist = rawChecklist.map(item => {
        // If item already has type, use it
        if (item.type) return item;
        
        // Otherwise, infer type and parent_id from ID structure
        const id = item.id || '';
        let type = 'checklist';
        let parent_id = null;
        
        // Check for subtask pattern: contains "_task_" AND has another "_task_" or ends differently
        // Pattern for subtask: parentId_task_xxx (where parentId itself contains _task_)
        if (id.includes('_subtask_')) {
          type = 'subtask';
          // Parent is everything before _subtask_
          const subtaskIdx = id.lastIndexOf('_subtask_');
          parent_id = id.substring(0, subtaskIdx);
        } else if (id.includes('_detail_')) {
          // Check if this is a task under a detail
          const detailIdx = id.indexOf('_detail_');
          const afterDetail = id.substring(detailIdx);
          if (afterDetail.includes('_task_')) {
            // This is a task under a detail
            type = 'task';
            // Parent is up to and including the detail portion
            const taskIdx = id.lastIndexOf('_task_');
            parent_id = id.substring(0, taskIdx);
          } else {
            type = 'detail';
            // Parent is everything before _detail_
            parent_id = id.substring(0, detailIdx);
          }
        } else if (id.includes('_task_')) {
          type = 'task';
          // Parent is everything before _task_
          const taskIdx = id.lastIndexOf('_task_');
          parent_id = id.substring(0, taskIdx);
        }
        
        return {
          ...item,
          type,
          parent_id
        };
      });
      
      setChecklist(reconstructedChecklist);
      setLoadedUiChecklistSnapshot(cloneLoadedValue(reconstructedChecklist) || []);

      // Load dropdown conditions
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
      
      const loadedProductTypes = productTypesSetting?.setting_value?.items || 
        ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(loadedProductTypes);
    } catch (error) {
      console.error("Error loading data:", error);
      setSaveError(error?.message || "This SIP checklist could not be loaded. Close and reopen it, or reload the latest Work Order.");
    }
    setIsLoading(false);
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    const dd = dropdownConditions.find(d => d.id === dropdownId);
    return dd?.name || null;
  };

  const _handleOtherDropdownSelect = (itemId, selectedDropdownId) => {
    updateChecklistItem(itemId, { dropdown_id: selectedDropdownId, custom_dropdown_value: "" });
    setShowOtherPopup(null);
  };

  const handleCreateCustomValue = (itemId) => {
    const value = customDropdownValue.trim();
    if (!value) return;
    if (!applyChecklistStatus(itemId, value)) return;
    setCustomDropdownValue("");
    setShowOtherPopup(null);
  };

  // Apply only genuinely new template content. Existing answered product
  // checklists are never rebuilt or replaced implicitly.
  const handleApplyTemplate = (templateData) => {
    const skippedSections = [];
    const sectionsToApply = templateData.filter(section => {
      if (section.type === 'product_header') {
        const alreadyExists = checklist.some(item => item.product_name === section.productName);
        if (alreadyExists) skippedSections.push(section.productName);
        return !alreadyExists;
      }
      if (section.type === 'sub_template') {
        const alreadyExists = checklist.some(item =>
          item.product_name === section.parentProduct && item.sub_template_name === section.subTemplateName
        );
        if (alreadyExists) skippedSections.push(`${section.parentProduct} — ${section.subTemplateName}`);
        return !alreadyExists;
      }
      return true;
    });

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
    
    sectionsToApply.forEach(section => {
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

    if (newItems.length > 0) {
      setChecklist(prev => [...prev, ...newItems]);
    }

    if (skippedSections.length > 0) {
      const examples = skippedSections.slice(0, 3).join(", ");
      const extraCount = skippedSections.length - Math.min(skippedSections.length, 3);
      setValidationDialog({
        title: "Existing checklist preserved",
        message: `${examples}${extraCount > 0 ? ` and ${extraCount} more` : ""} already exist on this SIP, so those answered checklist sections were left unchanged.`
      });
    }
  };

  const updateChecklistItem = (itemId, updates) => {
    setChecklist(prev => prev.map(item => 
      item.id === itemId ? { ...item, ...updates } : item
    ));
  };

  const getDescendantIds = (itemId) => {
    const ids = new Set([itemId]);
    const pendingParentIds = [itemId];
    while (pendingParentIds.length > 0) {
      const parentId = pendingParentIds.pop();
      (checklistChildrenByParentId.get(parentId) || []).forEach(child => {
        if (ids.has(child.id)) return;
        ids.add(child.id);
        pendingParentIds.push(child.id);
      });
    }
    return ids;
  };

  const deleteChecklistItem = (itemId) => {
    const item = checklistItemById.get(itemId);
    if (!item) return;
    const deleteIds = getDescendantIds(itemId);
    setPendingDelete({
      itemId,
      itemText: item.text || "this checklist item",
      itemType: item.type || "checklist",
      childCount: Math.max(0, deleteIds.size - 1),
    });
  };

  const confirmDeleteChecklistItem = () => {
    if (!pendingDelete?.itemId) return;
    const deleteIds = getDescendantIds(pendingDelete.itemId);
    setChecklist(prev => prev.filter(item => !deleteIds.has(item.id)));
    setPendingDelete(null);
  };

  // Check if an item's children are all complete
  const areChildrenComplete = (itemId) => {
    const children = checklistChildrenByParentId.get(itemId) || [];
    if (children.length === 0) return true;
    
    return children.every(child => {
      if (child.type === 'detail') {
        // Detail must have both approved_by and condition
        if (!child.approved_by || !child.custom_dropdown_value) return false;
        // Check if detail's children (tasks) are complete
        return areChildrenComplete(child.id);
      } else if (child.type === 'task' || child.type === 'subtask') {
        // Task/subtask must have approved_by (checked)
        if (!child.approved_by) return false;
        // Check if task's children (subtasks) are complete
        return areChildrenComplete(child.id);
      }
      return true;
    });
  };

  const applyChecklistStatus = (itemId, value) => {
    const item = checklistItemById.get(itemId);
    if (!item || !value) return false;

    const itemLabel = item.type === 'detail' ? 'detail' : 'checklist item';
    if (!item.approved_by) {
      setValidationDialog({
        title: "Approver Required",
        message: `Select who approved this ${itemLabel} before setting its status.`
      });
      return false;
    }

    const selectedCondition = dropdownConditionByName.get(value);
    if (selectedCondition?.is_completed && !areChildrenComplete(itemId)) {
      setValidationDialog({
        title: "Tasks Still Open",
        message: item.type === 'detail'
          ? "Complete the tasks under this detail before marking it completed."
          : "Complete the tasks and details under this checklist item before marking it completed."
      });
      return false;
    }

    updateChecklistItem(itemId, { custom_dropdown_value: value });
    return true;
  };

  const getItemAttentionLabel = (item) => {
    if (!item?.approved_by) return "Needs approver";
    if (!item?.custom_dropdown_value) return "Needs status";
    const selectedCondition = dropdownConditionByName.get(item.custom_dropdown_value);
    if (selectedCondition?.is_completed && !areChildrenComplete(item.id)) return "Tasks open";
    return null;
  };

  const checkIfComplete = () => {
    if (!checklist || checklist.length === 0) {
      return { complete: false, hasChecklist: false };
    }
    
    // Check if all checklist items (not tasks/subtasks) have both approved_by and custom_dropdown_value
    // AND that all selected conditions are "completed" type conditions
    const checklistItems = checklist.filter(item => item.type !== 'task' && item.type !== 'subtask');
    const allApproved = checklistItems.every(item => {
      if (!item.approved_by || !item.custom_dropdown_value) return false;
      
      // Find the selected condition and check if it's a "completed" condition
      const selectedCondition = dropdownConditionByName.get(item.custom_dropdown_value);
      // If condition exists and is NOT marked as completed, the item is not complete
      if (selectedCondition && !selectedCondition.is_completed) return false;
      
      return true;
    });

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

    // Save the checklist and completion flag together. This prevents a user from
    // completing a SIP based on local edits that would otherwise be discarded.
    await saveChecklist(undefined, { markComplete: true });
  };

  const proceedWithCheckOff = async () => {
    if (isSaving) return;
    setNoChecklistWarning(false);
    // Preserve any local product edits and complete the SIP in the same
    // concurrency-safe write, even when the user explicitly overrides the
    // missing-checklist warning.
    await saveChecklist(undefined, { markComplete: true });
  };

  // Called when Save button is clicked - first show revisit date popup
  const handleSaveClick = () => {
    if (!isRegistered) return;
    setPendingRevisitDate(loadedRevisitDateSnapshot || null);
    setShowRevisitPopup(true);
  };

  // Called after user picks (or skips) a revisit date
  const handleRevisitSave = async (dateString) => {
    setShowRevisitPopup(false);
    await saveChecklist(dateString);
  };

  const saveChecklist = async (revisitDate, { markComplete = false } = {}) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      // Build a map for quick parent lookup
      const currentChecklist = checklist;
      const itemMap = new Map();
      currentChecklist.forEach(item => itemMap.set(item.id, item));
      
      // Recursive function to find root product info by traversing parent chain
      const findRootProductInfo = (itemId, visited = new Set()) => {
        if (!itemId || visited.has(itemId)) return null;
        visited.add(itemId);
        const item = itemMap.get(itemId);
        if (!item) return null;
        const hasValidProductName = item.product_name && 
            item.product_name !== 'undefined' && 
            item.product_name !== 'General Items' &&
            item.product_name !== 'Manual Items' &&
            item.product_name !== 'Ungrouped';
        if (hasValidProductName) {
          return {
            product_name: item.product_name,
            product_type: item.product_type || '',
            sub_template_name: item.sub_template_name || null
          };
        }
        if (item.parent_id) {
          return findRootProductInfo(item.parent_id, visited);
        }
        return null;
      };
      
      const resolvedChecklist = currentChecklist.map(item => {
        const rootInfo = findRootProductInfo(item.id);
        return {
          id: item.id,
          text: item.text,
          type: item.type || 'checklist',
          parent_id: item.parent_id || null,
          approved_by: item.approved_by || '',
          assigned_to: item.assigned_to || '',
          custom_dropdown_value: item.custom_dropdown_value || '',
          dropdown_id: item.dropdown_id || '',
          dropdown_ids: item.dropdown_ids || [],
          product_name: rootInfo?.product_name || item.product_name || 'General Items',
          product_type: item.product_type || rootInfo?.product_type || '',
          sub_template_name: item.sub_template_name || rootInfo?.sub_template_name || null,
          product_id: item.product_id || null,
          sub_items: item.sub_items || []
        };
      });
      
      const expectedFields = {
        sip_checklist: loadedChecklistSnapshot,
        products: loadedProductsSnapshot,
      };
      const nextFields = {
        sip_checklist: resolvedChecklist,
        products,
      };
      // Only update revisit date if explicitly passed (null means "clear it").
      if (revisitDate !== undefined) {
        expectedFields.sip_revisit_date = loadedRevisitDateSnapshot;
        nextFields.sip_revisit_date = revisitDate || "";
      }
      if (markComplete) {
        expectedFields.sip_completed = loadedSipCompletedSnapshot;
        nextFields.sip_completed = true;

        // A completed SIP should not keep a future queue-return date. Clear only
        // future revisit dates, atomically with completion, so reopening later
        // cannot unexpectedly drop the item back into Revisit Later.
        if (revisitDate === undefined && isFutureRevisitDate(loadedRevisitDateSnapshot)) {
          expectedFields.sip_revisit_date = loadedRevisitDateSnapshot;
          nextFields.sip_revisit_date = "";
        }
      }

      setSaveError("");
      const saved = await replaceWorkOrderFieldsIfUnchanged({
        workOrderId: workOrder.id,
        expectedFields,
        nextFields,
        label: markComplete ? "SIP checklist save and completion" : "SIP product checklist",
      });
      const savedChecklist = saved.sip_checklist || [];
      const savedProducts = saved.products || [];
      Object.assign(workOrder, {
        sip_checklist: savedChecklist,
        products: savedProducts,
        sip_revisit_date: saved.sip_revisit_date,
        updated_date: saved.updated_date,
        ...(markComplete ? { sip_completed: saved.sip_completed } : {}),
      });
      setLoadedChecklistSnapshot(saved.sip_checklist === undefined ? undefined : JSON.parse(JSON.stringify(saved.sip_checklist)));
      setLoadedProductsSnapshot(saved.products === undefined ? undefined : JSON.parse(JSON.stringify(saved.products)));
      setLoadedUiChecklistSnapshot(JSON.parse(JSON.stringify(savedChecklist)));
      setLoadedUiProductsSnapshot(JSON.parse(JSON.stringify(savedProducts)));
      setLoadedRevisitDateSnapshot(saved.sip_revisit_date);
      if (markComplete) setLoadedSipCompletedSnapshot(saved.sip_completed);
      setChecklist(savedChecklist);
      setProducts(savedProducts);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
      setSaveError(error?.message || "SIP product checklist could not be saved. Reload the latest Work Order and try again.");
    } finally {
      setIsSaving(false);
    }
  };

  // Group checklist items only when checklist data changes. Search/navigation,
  // expansion, and inline editor state should not rebuild the entire product hierarchy.
  const groupedChecklist = useMemo(() => {
    const groups = {};
    const itemOrder = new Map();
    
    // Extract product name from item ID (e.g., "Channel Letters_123_abc" -> "Channel Letters")
    const extractProductNameFromId = (id) => {
      if (!id) return null;
      
      // Check for sub-template pattern first: "ProductName_sub_SubTemplateName_..."
      if (id.includes('_sub_')) {
        const beforeSub = id.split('_sub_')[0];
        // The product name is everything before _sub_, but we need to handle the timestamp/random suffix
        // Pattern: "ProductName_timestamp_random_sub_..."
        // Find where the product name ends (before first numeric timestamp)
        const parts = beforeSub.split('_');
        const nameparts = [];
        for (const part of parts) {
          // Stop when we hit a timestamp (long number) or random string pattern or "manual"
          if (/^\d{13}/.test(part) || /^[a-z0-9]{9}$/.test(part) || part === 'manual') break;
          nameparts.push(part);
        }
        if (nameparts.length > 0) return nameparts.join(' ');
      }
      
      // Standard pattern: "ProductName_timestamp_random_..." or "ProductName_manual_timestamp_random_..."
      const parts = id.split('_');
      const nameparts = [];
      for (const part of parts) {
        // Stop when we hit a timestamp (long number) or random string, or "task", "detail", "manual", "sub"
        if (/^\d{10,}/.test(part) || /^[a-z0-9]{9}$/.test(part) || ['task', 'detail', 'manual', 'sub'].includes(part)) break;
        nameparts.push(part);
      }
      if (nameparts.length > 0) return nameparts.join(' ');
      
      return null;
    };
    
    // Extract sub-template name from ID
    const extractSubTemplateFromId = (id) => {
      if (!id || !id.includes('_sub_')) return null;
      const afterSub = id.split('_sub_')[1];
      if (!afterSub) return null;
      const parts = afterSub.split('_');
      const nameparts = [];
      for (const part of parts) {
        if (/^\d{10,}/.test(part) || /^[a-z0-9]{9}$/.test(part) || ['task', 'detail'].includes(part)) break;
        nameparts.push(part);
      }
      return nameparts.length > 0 ? nameparts.join(' ') : null;
    };
    
    // Resolve product name - check field first, then extract from ID, then parent chain
    const resolveProductName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      // 1. Check if item has explicit product_name field
      if (item.product_name && !['undefined', 'General Items', 'Manual Items', 'Ungrouped'].includes(item.product_name)) {
        return item.product_name;
      }
      
      // 2. Try to extract from ID
      const fromId = extractProductNameFromId(item.id);
      if (fromId) return fromId;
      
      // 3. Try parent chain
      if (item.parent_id) {
        const parent = checklistItemById.get(item.parent_id);
        if (parent) return resolveProductName(parent, visited);
      }
      
      return null;
    };
    
    // Resolve sub-template name
    const resolveSubTemplateName = (item, visited = new Set()) => {
      if (!item || visited.has(item.id)) return null;
      visited.add(item.id);
      
      // 1. Check explicit field
      if (item.sub_template_name) return item.sub_template_name;
      
      // 2. Extract from ID
      const fromId = extractSubTemplateFromId(item.id);
      if (fromId) return fromId;
      
      // 3. Parent chain
      if (item.parent_id) {
        const parent = checklistItemById.get(item.parent_id);
        if (parent) return resolveSubTemplateName(parent, visited);
      }
      
      return null;
    };
    
    // First pass: collect all items with their resolved product names
    const itemsWithProduct = checklist.map((item, index) => {
      itemOrder.set(item.id, index);
      let productName = resolveProductName(item);
      if (!productName) productName = 'General Items';
      const subTemplateName = resolveSubTemplateName(item);
      return { item, productName, subTemplateName };
    });
    
    // Second pass: group items - but keep parent_id relationships intact
    itemsWithProduct.forEach(({ item, productName, subTemplateName }) => {
      if (!groups[productName]) {
        groups[productName] = {
          productType: item.product_type || '',
          mainItems: [],
          subTemplates: {}
        };
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
    
    // Sort items within each group by their original order
    Object.values(groups).forEach(group => {
      group.mainItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      Object.values(group.subTemplates).forEach(stItems => {
        stItems.sort((a, b) => (itemOrder.get(a.id) || 0) - (itemOrder.get(b.id) || 0));
      });
    });
    
    return groups;
  }, [checklist, checklistItemById]);
  
  // Checklist rows and product groups are expanded by default.
  const [expandedItems, setExpandedItems] = useState({});
  const [collapsedProducts, setCollapsedProducts] = useState({});
  const [newItemInput, setNewItemInput] = useState({ show: false, parentId: null, type: null, productName: null });
  const [newItemText, setNewItemText] = useState("");
  const [showAddGeneralChecklist, setShowAddGeneralChecklist] = useState(false);
  const [newGeneralChecklistText, setNewGeneralChecklistText] = useState("");
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [editingProductName, setEditingProductName] = useState(null);
  const [editingProductNameText, setEditingProductNameText] = useState("");
  const [focusedNeedsInputId, setFocusedNeedsInputId] = useState(null);
  const [checklistSearchQuery, setChecklistSearchQuery] = useState("");
  const [checklistSearchIndex, setChecklistSearchIndex] = useState(-1);
  const [focusedSearchId, setFocusedSearchId] = useState(null);

  const startEditItem = (item, e) => {
    e.stopPropagation();
    setEditingItemId(item.id);
    setEditingItemText(item.text);
  };

  const saveEditItem = () => {
    if (!editingItemText.trim()) return;
    updateChecklistItem(editingItemId, { text: editingItemText.trim() });
    setEditingItemId(null);
    setEditingItemText("");
  };

  const saveProductName = (oldName, newName) => {
    if (!newName.trim() || newName.trim() === oldName) {
      setEditingProductName(null);
      return;
    }
    const trimmed = newName.trim();
    setChecklist(prev => prev.map(item => {
      if (item.product_name === oldName) return { ...item, product_name: trimmed };
      return item;
    }));
    setEditingProductName(null);
    setEditingProductNameText("");
  };
  
  const toggleExpanded = (itemId) => {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  };

  const addNewItem = (type, parentId = null, productName = null) => {
    if (!newItemText.trim()) return;
    
    // Find the parent item to get its product_name and sub_template_name for proper grouping
    let actualProductName = productName;
    let subTemplateName = null;
    let productType = '';
    
    // Helper to traverse parent chain and get the root product info
    const getParentChainInfo = (itemId) => {
      const item = checklistItemById.get(itemId);
      if (!item) return null;
      
      // If this item has valid product_name, use it
      if (item.product_name && 
          item.product_name !== 'undefined' && 
          item.product_name !== 'General Items' &&
          item.product_name !== 'Manual Items') {
        return {
          product_name: item.product_name,
          product_type: item.product_type || '',
          sub_template_name: item.sub_template_name || null
        };
      }
      
      // Otherwise, traverse up to parent
      if (item.parent_id) {
        return getParentChainInfo(item.parent_id);
      }
      
      return null;
    };
    
    if (parentId) {
      // Get info from parent chain - this will find the original checklist item's product_name
      const parentInfo = getParentChainInfo(parentId);
      if (parentInfo) {
        actualProductName = parentInfo.product_name;
        productType = parentInfo.product_type;
        subTemplateName = parentInfo.sub_template_name;
      } else {
        // Direct parent lookup as fallback
        const parentItem = checklistItemById.get(parentId);
        if (parentItem) {
          actualProductName = parentItem.product_name || productName;
          subTemplateName = parentItem.sub_template_name || null;
          productType = parentItem.product_type || '';
        }
      }
    }
    
    // Ensure we have a valid product name - but NEVER default to General Items if we have productName passed in
    if (!actualProductName || actualProductName === 'Manual Items' || actualProductName === 'undefined') {
      actualProductName = productName || 'General Items';
    }
    
    
    // Create ID that includes product name for proper grouping (matching template item pattern)
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substr(2, 9);
    const sanitizedProductName = (actualProductName || 'General Items').replace(/\s+/g, ' ');
    const newId = subTemplateName 
      ? `${sanitizedProductName}_sub_${subTemplateName}_manual_${timestamp}_${randomSuffix}`
      : `${sanitizedProductName}_manual_${timestamp}_${randomSuffix}`;
    
    const newItem = {
      id: newId,
      text: newItemText.trim(),
      type: type,
      approved_by: "",
      custom_dropdown_value: "",
      product_name: actualProductName,
      product_type: productType,
      sub_template_name: subTemplateName,
      parent_id: parentId
    };
    
    
    // Insert the new item right after its parent in the checklist array
    // This ensures the item stays in the correct position
    if (parentId) {
      const parentIndex = checklist.findIndex(item => item.id === parentId);
      if (parentIndex !== -1) {
        // Find the last child of this parent to insert after
        let insertIndex = parentIndex + 1;
        for (let i = parentIndex + 1; i < checklist.length; i++) {
          if (checklist[i].parent_id === parentId) {
            insertIndex = i + 1;
          } else if (checklist[i].parent_id !== parentId && 
                     checklistItemById.get(checklist[i].parent_id)?.parent_id === parentId) {
            // This is a grandchild (e.g., subtask under a task), continue
            insertIndex = i + 1;
          } else {
            break;
          }
        }
        setChecklist(prev => {
          const newList = [...prev];
          newList.splice(insertIndex, 0, newItem);
          return newList;
        });
      } else {
        setChecklist(prev => [...prev, newItem]);
      }
    } else {
      setChecklist(prev => [...prev, newItem]);
    }
    
    setNewItemText("");
    setNewItemInput({ show: false, parentId: null, type: null, productName: null });
  };

  const cancelNewItemInput = () => {
    setNewItemInput({ show: false, parentId: null, type: null, productName: null });
    setNewItemText("");
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

  // Separate active and completed checklists
  const separateCompletedItems = () => {
    const active = {};
    const completed = {};
    
    Object.entries(groupedChecklist).forEach(([productName, group]) => {
      active[productName] = { ...group, mainItems: [], subTemplates: {} };
      completed[productName] = { ...group, mainItems: [], subTemplates: {} };
      
      // Separate main items
      group.mainItems.forEach(item => {
        if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
          // Main checklist item - check if completed
          const isCompleted = dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed;
          const targetGroup = isCompleted ? completed : active;
          
          // Add the item and ALL its children
          targetGroup[productName].mainItems.push(item);
        } else {
          // Child item - add to same group as its parent
          const parent = checklistItemById.get(item.parent_id);
          if (parent) {
            const parentCompleted = dropdownConditionByName.get(parent.custom_dropdown_value)?.is_completed;
            const targetGroup = parentCompleted ? completed : active;
            targetGroup[productName].mainItems.push(item);
          } else {
            active[productName].mainItems.push(item);
          }
        }
      });
      
      // Separate sub-template items
      Object.entries(group.subTemplates).forEach(([stName, stItems]) => {
        active[productName].subTemplates[stName] = [];
        completed[productName].subTemplates[stName] = [];
        
        stItems.forEach(item => {
          if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
            const isCompleted = dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed;
            const targetGroup = isCompleted ? completed : active;
            targetGroup[productName].subTemplates[stName].push(item);
          } else {
            const parent = checklistItemById.get(item.parent_id);
            if (parent) {
              const parentCompleted = dropdownConditionByName.get(parent.custom_dropdown_value)?.is_completed;
              const targetGroup = parentCompleted ? completed : active;
              targetGroup[productName].subTemplates[stName].push(item);
            } else {
              active[productName].subTemplates[stName].push(item);
            }
          }
        });
        
        // Remove empty sub-template groups
        if (active[productName].subTemplates[stName].length === 0) {
          delete active[productName].subTemplates[stName];
        }
        if (completed[productName].subTemplates[stName].length === 0) {
          delete completed[productName].subTemplates[stName];
        }
      });
      
      // Remove empty product groups
      if (active[productName].mainItems.length === 0 && Object.keys(active[productName].subTemplates).length === 0) {
        delete active[productName];
      }
      if (completed[productName].mainItems.length === 0 && Object.keys(completed[productName].subTemplates).length === 0) {
        delete completed[productName];
      }
    });
    
    return { active, completed };
  };
  
  const { active: activeChecklist, completed: completedChecklist } = separateCompletedItems();
  const countPrimaryItemsInGroup = (group) => (
    group.mainItems.filter(item => !item.parent_id && (item.type === 'checklist' || !item.type)).length +
    Object.values(group.subTemplates).reduce((sum, items) => (
      sum + items.filter(item => !item.parent_id && (item.type === 'checklist' || !item.type)).length
    ), 0)
  );
  const primaryChecklistItems = checklist.filter(item => item.type !== 'task' && item.type !== 'subtask');
  const completedPrimaryCount = primaryChecklistItems.filter(item => {
    if (!item.approved_by || !item.custom_dropdown_value) return false;
    const condition = dropdownConditionByName.get(item.custom_dropdown_value);
    return !condition || condition.is_completed;
  }).length;
  const continuedPrimaryCount = primaryChecklistItems.filter(item => {
    const condition = dropdownConditionByName.get(item.custom_dropdown_value);
    return Boolean(item.approved_by && condition && !condition.is_completed);
  }).length;
  const needsInputPrimaryItems = primaryChecklistItems.filter(item => !item.approved_by || !item.custom_dropdown_value);
  const needsInputPrimaryCount = needsInputPrimaryItems.length;
  const taskItems = checklist.filter(item => item.type === 'task' || item.type === 'subtask');
  const completedTaskCount = taskItems.filter(item => item.approved_by).length;
  const expandableChecklistIds = checklist
    .filter(item => !item.parent_id && (item.type === 'checklist' || !item.type))
    .map(item => item.id);
  const allDetailsCollapsed = expandableChecklistIds.length > 0 && expandableChecklistIds.every(id => expandedItems[id] === false);
  const toggleAllDetails = () => {
    const nextExpanded = { ...expandedItems };
    expandableChecklistIds.forEach(id => {
      nextExpanded[id] = allDetailsCollapsed;
    });
    setExpandedItems(nextExpanded);
  };
  const activeProductNames = Object.keys(activeChecklist);
  const allProductsCollapsed = activeProductNames.length > 0 && activeProductNames.every(productName => collapsedProducts[productName] === true);
  const toggleAllProducts = () => {
    setCollapsedProducts(prev => {
      const nextCollapsed = { ...prev };
      activeProductNames.forEach(productName => {
        nextCollapsed[productName] = !allProductsCollapsed;
      });
      return nextCollapsed;
    });
  };
  const findItemProductName = (groups, itemId) => {
    for (const [productName, group] of Object.entries(groups)) {
      if (group.mainItems.some(item => item.id === itemId)) return productName;
      if (Object.values(group.subTemplates).some(items => items.some(item => item.id === itemId))) return productName;
    }
    return null;
  };
  const getTopLevelChecklistId = (item) => {
    let current = item;
    const visited = new Set();
    while (current?.parent_id && !visited.has(current.id)) {
      visited.add(current.id);
      const parent = checklistItemById.get(current.parent_id);
      if (!parent) break;
      current = parent;
    }
    return current?.id || item?.id;
  };
  const focusFirstNeedsInput = () => {
    if (needsInputPrimaryItems.length === 0) return;
    setFocusedSearchId(null);

    const activeIds = new Set();
    Object.values(activeChecklist).forEach(group => {
      group.mainItems.forEach(item => activeIds.add(item.id));
      Object.values(group.subTemplates).forEach(items => items.forEach(item => activeIds.add(item.id)));
    });

    const completedIds = new Set();
    Object.values(completedChecklist).forEach(group => {
      group.mainItems.forEach(item => completedIds.add(item.id));
      Object.values(group.subTemplates).forEach(items => items.forEach(item => completedIds.add(item.id)));
    });

    const target = needsInputPrimaryItems.find(item => activeIds.has(item.id)) || needsInputPrimaryItems[0];
    const topLevelId = getTopLevelChecklistId(target);
    const isActiveTarget = activeIds.has(target.id);
    const scrollTargetId = isActiveTarget ? target.id : topLevelId;

    if (isActiveTarget) {
      const productName = findItemProductName(activeChecklist, target.id);
      if (productName) {
        setCollapsedProducts(prev => ({ ...prev, [productName]: false }));
      }
      setExpandedItems(prev => ({ ...prev, [topLevelId]: true }));
    } else if (completedIds.has(target.id) || completedIds.has(topLevelId)) {
      setShowCompletedItems(true);
    }

    setFocusedNeedsInputId(scrollTargetId);
    window.setTimeout(() => {
      const targetElement = Array.from(document.querySelectorAll("[data-sips-checklist-item-id]"))
        .find(element => element.dataset.sipsChecklistItemId === String(scrollTargetId));
      targetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };
  const normalizedChecklistSearch = checklistSearchQuery.trim().toLowerCase();
  const checklistSearchResults = normalizedChecklistSearch
    ? (() => {
        const results = [];
        const seenIds = new Set();
        Object.entries(activeChecklist).forEach(([productName, group]) => {
          const collections = [
            { items: group.mainItems, subTemplateName: "" },
            ...Object.entries(group.subTemplates).map(([subTemplateName, items]) => ({ items, subTemplateName }))
          ];
          collections.forEach(({ items, subTemplateName }) => {
            items.forEach(item => {
              if (seenIds.has(item.id)) return;
              const assignedTo = Array.isArray(item.assigned_to) ? item.assigned_to.join(" ") : item.assigned_to;
              const searchableText = [
                productName,
                subTemplateName,
                item.text,
                item.approved_by,
                item.custom_dropdown_value,
                assignedTo
              ].filter(Boolean).join(" ").toLowerCase();
              if (searchableText.includes(normalizedChecklistSearch)) {
                seenIds.add(item.id);
                results.push({ item, productName });
              }
            });
          });
        });
        return results;
      })()
    : [];
  const navigateChecklistSearch = (direction = 1) => {
    if (checklistSearchResults.length === 0) return;
    const nextIndex = checklistSearchIndex < 0
      ? (direction < 0 ? checklistSearchResults.length - 1 : 0)
      : (checklistSearchIndex + direction + checklistSearchResults.length) % checklistSearchResults.length;
    const { item, productName } = checklistSearchResults[nextIndex];
    const topLevelId = getTopLevelChecklistId(item);

    setCollapsedProducts(prev => ({ ...prev, [productName]: false }));
    setExpandedItems(prev => ({ ...prev, [topLevelId]: true }));
    setFocusedNeedsInputId(null);
    setFocusedSearchId(item.id);
    setChecklistSearchIndex(nextIndex);

    window.setTimeout(() => {
      const candidateIds = [item.id, item.parent_id, topLevelId].filter(Boolean).map(String);
      const targetElement = Array.from(document.querySelectorAll("[data-sips-checklist-item-id]"))
        .find(element => candidateIds.includes(element.dataset.sipsChecklistItemId));
      targetElement?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  };
  const clearChecklistSearch = () => {
    setChecklistSearchQuery("");
    setChecklistSearchIndex(-1);
    setFocusedSearchId(null);
  };
  const revisitDate = parseDateOnly(loadedRevisitDateSnapshot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const revisitIsFuture = Boolean(revisitDate && revisitDate > today);
  const hasUnsavedChanges = !isLoading && (
    JSON.stringify(checklist) !== JSON.stringify(loadedUiChecklistSnapshot) ||
    JSON.stringify(products) !== JSON.stringify(loadedUiProductsSnapshot)
  );

  const requestClose = () => {
    if (isSaving) return;
    if (hasUnsavedChanges) {
      setDiscardWarning(true);
      return;
    }
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] sm:w-full max-w-6xl max-h-[94vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-3 sm:p-6 [&>button]:hidden">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <DialogTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 flex-wrap">
                {workOrder?.client_name}
                {workOrder?.description && (
                  <span className="text-base font-normal text-gray-500">— {workOrder.description}</span>
                )}
                {hasUnsavedChanges && (
                  <span className="text-[11px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">Unsaved changes</span>
                )}
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

          {!isLoading && checklist.length > 0 && (
            <div className="rounded-xl border bg-slate-50 p-2 sm:p-3 space-y-2">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <div>
                <div className="text-[11px] text-gray-500">Checklist complete</div>
                <div className="text-sm font-semibold text-gray-800">{completedPrimaryCount}/{primaryChecklistItems.length}</div>
              </div>
              <button
                type="button"
                onClick={focusFirstNeedsInput}
                disabled={needsInputPrimaryCount === 0}
                className={`rounded-lg px-2 py-1 text-left transition-colors ${needsInputPrimaryCount > 0 ? "hover:bg-red-50 cursor-pointer" : "cursor-default"}`}
                title={needsInputPrimaryCount > 0 ? "Go to the first checklist item that still needs an approver or status" : "No checklist items need input"}
              >
                <div className="text-[11px] text-gray-500">Needs input</div>
                <div className={`text-sm font-semibold ${needsInputPrimaryCount > 0 ? "text-red-700" : "text-green-700"}`}>{needsInputPrimaryCount}</div>
                {needsInputPrimaryCount > 0 && <div className="text-[10px] text-red-600">Go to first</div>}
              </button>
              <div>
                <div className="text-[11px] text-gray-500">Continued</div>
                <div className="text-sm font-semibold text-amber-700">{continuedPrimaryCount}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Tasks done</div>
                <div className="text-sm font-semibold text-gray-800">{completedTaskCount}/{taskItems.length}</div>
              </div>
              <div>
                <div className="text-[11px] text-gray-500">Revisit</div>
                <div className="text-sm font-semibold text-purple-700">{formatDateOnly(loadedRevisitDateSnapshot)}</div>
                <div className={`text-[10px] font-medium ${revisitIsFuture ? "text-amber-700" : "text-gray-500"}`}>
                  {revisitIsFuture ? "Revisit Later" : "Active queue"}
                </div>
              </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:flex-wrap gap-1">
                {activeProductNames.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllProducts}
                    className="w-full sm:w-auto h-11 sm:h-8 text-xs text-purple-700"
                    aria-expanded={!allProductsCollapsed}
                  >
                    {allProductsCollapsed ? <ChevronRight className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                    {allProductsCollapsed ? "Expand all products" : "Collapse all products"}
                  </Button>
                )}
                {expandableChecklistIds.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllDetails}
                    className="w-full sm:w-auto h-11 sm:h-8 text-xs text-gray-600"
                    aria-expanded={!allDetailsCollapsed}
                  >
                    {allDetailsCollapsed ? <ChevronRight className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
                    {allDetailsCollapsed ? "Expand task details" : "Collapse task details"}
                  </Button>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <Input
                    value={checklistSearchQuery}
                    onChange={(e) => {
                      setChecklistSearchQuery(e.target.value);
                      setChecklistSearchIndex(-1);
                      setFocusedSearchId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        navigateChecklistSearch(e.shiftKey ? -1 : 1);
                      }
                    }}
                    placeholder="Find product, checklist item, detail, task, status, or assignee…"
                    className="h-11 sm:h-8 pl-8 pr-12 sm:pr-8 text-sm sm:text-xs bg-white"
                    aria-label="Search active SIP checklist items"
                  />
                  {checklistSearchQuery && (
                    <button
                      type="button"
                      onClick={clearChecklistSearch}
                      className="absolute right-0 top-1/2 -translate-y-1/2 inline-flex h-11 w-11 sm:h-8 sm:w-8 items-center justify-center rounded text-gray-400 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-inset"
                      aria-label="Clear checklist search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-1 sm:shrink-0">
                  <span className={`w-full sm:w-auto text-[11px] min-w-[72px] text-center ${normalizedChecklistSearch && checklistSearchResults.length === 0 ? "text-red-600" : "text-gray-500"}`} aria-live="polite">
                    {normalizedChecklistSearch
                      ? checklistSearchResults.length > 0 && checklistSearchIndex >= 0
                        ? `${checklistSearchIndex + 1} of ${checklistSearchResults.length}`
                        : `${checklistSearchResults.length} match${checklistSearchResults.length === 1 ? "" : "es"}`
                      : "Find items"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 sm:h-8 px-3 sm:px-2 text-xs flex-1 sm:flex-none"
                    disabled={checklistSearchResults.length === 0}
                    onClick={() => navigateChecklistSearch(-1)}
                    aria-label="Go to previous checklist search match"
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 sm:h-8 px-3 sm:px-2 text-xs flex-1 sm:flex-none"
                    disabled={checklistSearchResults.length === 0}
                    onClick={() => navigateChecklistSearch(1)}
                    aria-label="Go to next checklist search match"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Checklist Items */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-0.5">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading checklist…
              </div>
            ) : checklist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <p>No checklist items yet</p>
                <p className="text-sm mt-1">Use Checklist Builder to create and apply checklists</p>
              </div>
            ) : (
              <>
                {/* Active Items */}
                {Object.entries(activeChecklist)
                  .filter(([, group]) => {
                    const hasMainChecklistItems = group.mainItems.some(item => 
                      !item.parent_id && (item.type === 'checklist' || !item.type)
                    );
                    const hasSubTemplateItems = Object.values(group.subTemplates).some(stItems => 
                      stItems.some(item => !item.parent_id && (item.type === 'checklist' || !item.type))
                    );
                    return hasMainChecklistItems || hasSubTemplateItems;
                  })
                  .map(([productName, group]) => (
                <div 
                  key={productName} 
                  className="border-2 border-purple-200 rounded-lg p-3 bg-purple-50/20"
                >
                  <div className="flex flex-col gap-2 mb-3 sm:flex-row sm:items-start">
                    <div className="flex items-center gap-1 min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => setCollapsedProducts(prev => ({ ...prev, [productName]: !prev[productName] }))}
                        className="inline-flex min-h-11 min-w-11 sm:min-h-9 sm:min-w-9 items-center justify-center rounded-md hover:bg-purple-100 text-purple-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
                        title={collapsedProducts[productName] ? "Expand product checklist" : "Collapse product checklist"}
                        aria-label={collapsedProducts[productName] ? `Expand ${productName}` : `Collapse ${productName}`}
                        aria-expanded={!collapsedProducts[productName]}
                      >
                        {collapsedProducts[productName] ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                      {editingProductName === productName ? (
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="text-lg shrink-0" aria-hidden="true">📦</span>
                          <Input
                            value={editingProductNameText}
                            onChange={(e) => setEditingProductNameText(e.target.value)}
                            className="h-11 sm:h-9 text-base sm:text-sm font-bold flex-1 min-w-0 max-w-none sm:max-w-xs"
                            aria-label={`Product name for ${productName}`}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveProductName(productName, editingProductNameText);
                              if (e.key === 'Escape') setEditingProductName(null);
                            }}
                            onBlur={() => saveProductName(productName, editingProductNameText)}
                          />
                        </div>
                      ) : (
                        <h3 className="font-bold text-purple-800 flex flex-wrap items-center gap-2 min-w-0 rounded px-1">
                          <span className="truncate min-w-0 max-w-full">📦 {productName}</span>
                          {group.productType && (
                            <span className="text-xs font-normal bg-purple-200 px-2 py-0.5 rounded">
                              {group.productType}
                            </span>
                          )}
                          <span className="text-[10px] font-medium bg-white border border-purple-200 text-purple-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {countPrimaryItemsInGroup(group)} open
                          </span>
                        </h3>
                      )}
                    </div>
                    {isRegistered && (
                      <div className="flex items-center gap-2 w-full sm:w-auto sm:shrink-0">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCollapsedProducts(prev => ({ ...prev, [productName]: false }));
                            setNewItemInput({ show: true, parentId: null, type: 'checklist', productName: productName });
                          }}
                          className="inline-flex min-h-11 sm:min-h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 text-xs font-medium bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                          title={`Add checklist item to ${productName}`}
                          aria-label={`Add checklist item to ${productName}`}
                        >
                          <Plus className="w-4 h-4" aria-hidden="true" />
                          Add checklist
                        </button>
                        {editingProductName !== productName && (
                          <button
                            type="button"
                            onClick={() => { setEditingProductName(productName); setEditingProductNameText(productName); }}
                            className="inline-flex min-h-11 sm:min-h-9 flex-1 sm:flex-none items-center justify-center gap-1.5 px-3 text-xs font-medium rounded-md hover:bg-purple-100 text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1"
                            title={`Rename ${productName}`}
                            aria-label={`Rename ${productName}`}
                          >
                            <Pencil className="w-4 h-4" aria-hidden="true" />
                            Rename
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div className={collapsedProducts[productName] ? "hidden" : ""}>
                  {/* Inline add checklist item for this product */}
                  {newItemInput.show && newItemInput.parentId === null && newItemInput.type === 'checklist' && newItemInput.productName === productName && (
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          value={newItemText}
                          onChange={(e) => setNewItemText(e.target.value)}
                          placeholder="New checklist item..."
                          className="h-11 md:h-7 text-sm flex-1 min-w-0"
                          aria-label={`New checklist item for ${productName}`}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') addNewItem('checklist', null, productName);
                            if (e.key === 'Escape') cancelNewItemInput();
                          }}
                        />
                        <Button type="button" size="sm" className="h-11 md:h-7 px-3 text-xs" onClick={() => addNewItem('checklist', null, productName)}>Add</Button>
                        <Button type="button" size="sm" variant="ghost" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={cancelNewItemInput}>Cancel</Button>
                      </div>
                    </div>
                  )}

                  {/* Main Items with hierarchy */}
                  {group.mainItems.length > 0 && (
                    <div className="space-y-2 mb-3">
                      {/* Build hierarchy - treat all items as main items if no type field */}
                      {group.mainItems.map(rawItem => {
                        // Skip child items - they'll be rendered under their parent
                        if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                        
                        // Treat items without type as checklist items
                        const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                        // Find associated tasks/details from the SAME group
                        const itemChildren = checklistChildrenByParentId.get(item.id) || [];
                        const itemTasks = itemChildren.filter(i => i.type === 'task');
                        const itemDetails = itemChildren.filter(i => i.type === 'detail').map(detail => ({
                          ...detail,
                          tasks: (checklistChildrenByParentId.get(detail.id) || []).filter(i => i.type === 'task')
                        }));
                        
                        const displayItem = { ...item, tasks: itemTasks, details: itemDetails };
                        const isItemCompleted = dropdownConditionByName.get(displayItem.custom_dropdown_value)?.is_completed;
                        return (
                        <div data-sips-checklist-item-id={String(displayItem.id)} key={displayItem.id} className={`clay-card p-3 ${isItemCompleted ? 'bg-green-100/70' : 'bg-white'} ${focusedNeedsInputId === displayItem.id ? 'ring-2 ring-red-400 ring-offset-2' : focusedSearchId === displayItem.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
                          {/* Main checklist item */}
                          <div 
                            className="flex flex-wrap items-center gap-2 group"
                          >
                            <button
                              type="button"
                              onClick={() => toggleExpanded(displayItem.id)}
                              className="h-11 w-11 md:h-7 md:w-7 inline-flex items-center justify-center hover:bg-gray-100 rounded shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                              aria-label={`${expandedItems[displayItem.id] !== false ? "Collapse" : "Expand"} checklist item details for ${displayItem.text || "checklist item"}`}
                              aria-expanded={expandedItems[displayItem.id] !== false}
                            >
                              {(displayItem.details?.length > 0 || displayItem.tasks?.length > 0) ? (
                                (expandedItems[displayItem.id] !== false) ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />
                              ) : <div className="w-4" aria-hidden="true" />}
                            </button>
                            <span className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                            {editingItemId === displayItem.id ? (
                              <div className="flex-1 flex gap-1 min-w-0">
                                <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') { setEditingItemId(null); } }} />
                                <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs bg-green-600 hover:bg-green-700" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                              </div>
                            ) : (
                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                <span className={`font-medium text-sm flex-1 min-w-0 rounded px-1 ${isItemCompleted ? 'line-through text-gray-400' : ''}`}>{displayItem.text}</span>
                                {isRegistered && (
                                  <button type="button" onClick={(e) => startEditItem(displayItem, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" title="Edit checklist item" aria-label={`Edit checklist item ${displayItem.text || ""}`}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            )}
                            
                            {getItemAttentionLabel(displayItem) && (
                              <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                {getItemAttentionLabel(displayItem)}
                              </span>
                            )}

                            {/* Quick add buttons on hover */}
                            {isRegistered && (
                              <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setExpandedItems(prev => ({ ...prev, [displayItem.id]: true }));
                                    setNewItemInput({ show: true, parentId: displayItem.id, type: 'task', productName: displayItem.product_name || productName }); 
                                  }}
                                  className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                  title="Add Task"
                                  aria-label={`Add task under ${displayItem.text || "checklist item"}`}
                                >
                                  +Task
                                </button>
                                <button
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setExpandedItems(prev => ({ ...prev, [displayItem.id]: true }));
                                    setNewItemInput({ show: true, parentId: displayItem.id, type: 'detail', productName: displayItem.product_name || productName }); 
                                  }}
                                  className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                  title="Add Detail"
                                  aria-label={`Add detail under ${displayItem.text || "checklist item"}`}
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
                              <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-32 focus:ring-2 focus:ring-blue-400 focus:ring-offset-1" aria-label={`Answered by for checklist item: ${displayItem.text || "checklist item"}`}>
                                <SelectValue placeholder="Answered by..." />
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
                                  applyChecklistStatus(displayItem.id, val);
                                }
                              }}
                              disabled={!isRegistered}
                            >
                              <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-36 focus:ring-2 focus:ring-blue-400 focus:ring-offset-1" aria-label={`Status for checklist item: ${displayItem.text || "checklist item"}`}>
                                <SelectValue placeholder={getDropdownName(displayItem.dropdown_id) || "Answer..."}>
                                  {displayItem.custom_dropdown_value || "Answer..."}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {dropdownConditions
                                  .filter(dd => (displayItem.dropdown_ids || []).includes(dd.id))
                                  .map(dd => (
                                    <SelectItem key={dd.id} value={dd.name}>
                                      {dd.name} {dd.is_completed && '(Completed)'}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                              </SelectContent>
                            </Select>

                            {isRegistered && (
                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(displayItem.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete checklist item ${displayItem.text || ""}`}>
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>

                          {/* Expanded: Tasks and Details - expanded by default */}
                          {(expandedItems[displayItem.id] !== false) && (
                            <div className="ml-2 sm:ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-2 sm:pl-3">
                              {/* Tasks under main item */}
                              {displayItem.tasks?.map(task => (
                              <div data-sips-checklist-item-id={String(task.id)} key={task.id} className={`bg-orange-50 p-1 rounded border-l-2 border-orange-300 group ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <label htmlFor={`sips-complete-${task.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:ring-offset-1">
                                    <Checkbox 
                                      id={`sips-complete-${task.id}`}
                                      checked={!!task.approved_by}
                                      onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                      disabled={!isRegistered}
                                      className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
                                      aria-label={`${task.approved_by ? "Mark task incomplete" : "Mark task complete"}: ${task.text || "task"}`}
                                    />
                                  </label>
                                  <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-600 font-medium">T</span>
                                  {editingItemId === task.id ? (
                                    <div className="flex-1 flex gap-1 min-w-0">
                                      <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                      <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs bg-green-600 hover:bg-green-700" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                      <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                    </div>
                                  ) : (
                                    <div className="flex-1 flex items-center gap-1 min-w-0">
                                      <span className="text-xs flex-1 min-w-0 px-0.5">{task.text}</span>
                                      {isRegistered && (
                                        <button type="button" onClick={(e) => startEditItem(task, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-orange-100 text-orange-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" title="Edit task" aria-label={`Edit task ${task.text || ""}`}>
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                                  <MultiUserSelectInline
                                    users={users}
                                    selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                    onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                    disabled={!isRegistered}
                                    className="h-11 md:h-7 min-w-[96px] max-w-[140px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1"
                                    ariaLabel={`Assign users for task: ${task.text || "task"}`}
                                  />
                                  {isRegistered && (
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                      className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                                      title="Add Subtask"
                                      aria-label={`Add subtask under ${task.text || "task"}`}
                                    >
                                      +Sub
                                    </button>
                                  )}
                                  {isRegistered && (
                                    <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100" aria-label={`Delete task ${task.text || ""}`}>
                                      <Trash2 className="w-2.5 h-2.5" />
                                    </Button>
                                  )}
                                </div>
                                {/* Subtasks */}
                                {(checklistChildrenByParentId.get(task.id) || []).filter(st => st.type === 'subtask').map(subtask => (
                                  <div data-sips-checklist-item-id={String(subtask.id)} key={subtask.id} className={`ml-4 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask ${focusedSearchId === subtask.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                    <label htmlFor={`sips-complete-${subtask.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-yellow-400 focus-within:ring-offset-1">
                                      <Checkbox 
                                        id={`sips-complete-${subtask.id}`}
                                        checked={!!subtask.approved_by}
                                        onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                        disabled={!isRegistered}
                                        className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1"
                                        aria-label={`${subtask.approved_by ? "Mark subtask incomplete" : "Mark subtask complete"}: ${subtask.text || "subtask"}`}
                                      />
                                    </label>
                                    <span className="px-0.5 py-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                    {editingItemId === subtask.id ? (
                                      <div className="flex-1 flex gap-1 min-w-0">
                                        <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                        <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                      </div>
                                    ) : (
                                      <div className="flex-1 flex items-center gap-1 min-w-0">
                                        <span className="flex-1 min-w-0">{subtask.text}</span>
                                        {isRegistered && (
                                          <button type="button" onClick={(e) => startEditItem(subtask, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-yellow-100 text-yellow-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400" title="Edit subtask" aria-label={`Edit subtask ${subtask.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                        )}
                                      </div>
                                    )}
                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/subtask:opacity-100 md:focus:opacity-100" aria-label={`Delete subtask ${subtask.text || ""}`}>
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
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                      aria-label={`New subtask under ${task.text || "task"}`}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') cancelNewItemInput();
                                      }}
                                    />
                                    <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
                                  </div>
                                )}
                              </div>
                              ))}

                              {/* Inline add task input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'task' && (
                              <div className="flex flex-wrap items-center gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                                <Input
                                  value={newItemText}
                                  onChange={(e) => setNewItemText(e.target.value)}
                                  placeholder="New task..."
                                  className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                  aria-label={`New task under ${displayItem.text || "checklist item"}`}
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') addNewItem('task', displayItem.id, displayItem.product_name || productName);
                                    if (e.key === 'Escape') cancelNewItemInput();
                                  }}
                                />
                                <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('task', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                <Button type="button" size="sm" variant="ghost" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={cancelNewItemInput}>Cancel</Button>
                              </div>
                              )}

                              {/* Inline add detail input */}
                              {newItemInput.show && newItemInput.parentId === displayItem.id && newItemInput.type === 'detail' && (
                                <div className="bg-gray-50 p-2 rounded border">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New detail..."
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                      aria-label={`New detail under ${displayItem.text || "checklist item"}`}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('detail', displayItem.id, displayItem.product_name || productName);
                                        if (e.key === 'Escape') cancelNewItemInput();
                                      }}
                                    />
                                    <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('detail', displayItem.id, displayItem.product_name || productName)}>Add</Button>
                                    <Button type="button" size="sm" variant="ghost" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={cancelNewItemInput}>Cancel</Button>
                                  </div>
                                </div>
                              )}

                              {/* Detail items */}
                              {displayItem.details?.map(detail => {
                                const isDetailCompleted = dropdownConditionByName.get(detail.custom_dropdown_value)?.is_completed;
                                return (
                                <div data-sips-checklist-item-id={String(detail.id)} key={detail.id} className={`p-2 rounded border group/detail ${isDetailCompleted ? 'bg-green-100/70' : 'bg-gray-50'} ${focusedNeedsInputId === detail.id ? 'ring-2 ring-red-400 ring-offset-1' : focusedSearchId === detail.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                    {editingItemId === detail.id ? (
                                      <div className="flex-1 flex gap-1 min-w-0">
                                        <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                        <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs bg-green-600 hover:bg-green-700" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                      </div>
                                    ) : (
                                      <div className="flex-1 flex items-center gap-1 min-w-0">
                                        <span className={`text-sm flex-1 min-w-0 px-1 ${isDetailCompleted ? 'line-through text-gray-400' : ''}`}>{detail.text}</span>
                                        {isRegistered && (
                                          <button type="button" onClick={(e) => startEditItem(detail, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400" title="Edit detail" aria-label={`Edit detail ${detail.text || ""}`}>
                                            <Pencil className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                    {getItemAttentionLabel(detail) && (
                                      <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                        {getItemAttentionLabel(detail)}
                                      </span>
                                    )}

                                    {/* Quick add task button for detail */}
                                    {isRegistered && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: displayItem.product_name || productName }); }}
                                        className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 md:opacity-0 md:group-hover/detail:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                        title="Add Task"
                                        aria-label={`Add task under ${detail.text || "detail"}`}
                                      >
                                        +Task
                                      </button>
                                    )}
                                    
                                    <Select
                                      value={detail.approved_by || ""}
                                      onValueChange={(val) => updateChecklistItem(detail.id, { approved_by: val })}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-28 focus:ring-2 focus:ring-purple-400 focus:ring-offset-1" aria-label={`Answered by for detail: ${detail.text || "detail"}`}>
                                        <SelectValue placeholder="Answered..." />
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
                                          applyChecklistStatus(detail.id, val);
                                        }
                                      }}
                                      disabled={!isRegistered}
                                    >
                                      <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-32 focus:ring-2 focus:ring-purple-400 focus:ring-offset-1" aria-label={`Status for detail: ${detail.text || "detail"}`}>
                                        <SelectValue placeholder={getDropdownName(detail.dropdown_id) || "Answer..."}>
                                          {detail.custom_dropdown_value || "Answer..."}
                                        </SelectValue>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {dropdownConditions
                                          .filter(dd => (detail.dropdown_ids || []).includes(dd.id))
                                          .map(dd => (
                                            <SelectItem key={dd.id} value={dd.name}>
                                              {dd.name} {dd.is_completed && '(Completed)'}
                                            </SelectItem>
                                          ))}
                                        <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete detail ${detail.text || ""}`}>
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
                                        className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                        aria-label={`New task under ${detail.text || "detail"}`}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addNewItem('task', detail.id, displayItem.product_name || productName);
                                          if (e.key === 'Escape') cancelNewItemInput();
                                        }}
                                      />
                                      <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('task', detail.id, displayItem.product_name || productName)}>Add</Button>
                                      <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
                                    </div>
                                  )}

                                  {/* Tasks under detail */}
                                  {detail.tasks?.length > 0 && (
                                    <div className="ml-4 mt-1 space-y-0.5 border-l border-orange-200 pl-1.5">
                                      {detail.tasks.map(task => (
                                        <div data-sips-checklist-item-id={String(task.id)} key={task.id} className={`bg-orange-50 p-0.5 rounded group/dtask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                          <div className="flex flex-wrap items-center gap-1">
                                            <label htmlFor={`sips-complete-${task.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:ring-offset-1">
                                              <Checkbox 
                                                id={`sips-complete-${task.id}`}
                                                checked={!!task.approved_by}
                                                onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                                disabled={!isRegistered}
                                                className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
                                                aria-label={`${task.approved_by ? "Mark task incomplete" : "Mark task complete"}: ${task.text || "task"}`}
                                              />
                                            </label>
                                            <span className="text-xs px-0.5 py-0.5 rounded bg-orange-100 text-orange-600">T</span>
                                            {editingItemId === task.id ? (
                                              <div className="flex-1 flex gap-1 min-w-0">
                                                <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                                <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                                <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                              </div>
                                            ) : (
                                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                                <span className="text-xs flex-1 min-w-0">{task.text}</span>
                                                {isRegistered && (
                                                  <button type="button" onClick={(e) => startEditItem(task, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-orange-100 text-orange-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" title="Edit task" aria-label={`Edit task ${task.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                                )}
                                              </div>
                                            )}
                                            <MultiUserSelectInline
                                              users={users}
                                              selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                              onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                              disabled={!isRegistered}
                                              className="h-11 md:h-7 min-w-[96px] max-w-[140px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1"
                                              ariaLabel={`Assign users for task: ${task.text || "task"}`}
                                            />
                                            {isRegistered && (
                                              <button
                                                type="button"
                                                onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: task.id, type: 'subtask', productName: displayItem.product_name || productName }); }}
                                                className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 md:opacity-0 md:group-hover/dtask:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400"
                                                title="Add Subtask"
                                                aria-label={`Add subtask under ${task.text || "task"}`}
                                              >
                                                +S
                                              </button>
                                            )}
                                            {isRegistered && (
                                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/dtask:opacity-100 md:focus:opacity-100" aria-label={`Delete task ${task.text || ""}`}>
                                                <Trash2 className="w-2 h-2" />
                                              </Button>
                                            )}
                                          </div>
                                          {/* Subtasks under detail task */}
                                          {(checklistChildrenByParentId.get(task.id) || []).filter(st => st.type === 'subtask').map(subtask => (
                                            <div data-sips-checklist-item-id={String(subtask.id)} key={subtask.id} className={`ml-3 mt-0.5 flex items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsub ${focusedSearchId === subtask.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                              <label htmlFor={`sips-complete-${subtask.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-yellow-400 focus-within:ring-offset-1">
                                                <Checkbox 
                                                  id={`sips-complete-${subtask.id}`}
                                                  checked={!!subtask.approved_by}
                                                  onCheckedChange={(checked) => updateChecklistItem(subtask.id, { approved_by: checked ? "Done" : "" })}
                                                  disabled={!isRegistered}
                                                  className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-yellow-400 focus-visible:ring-offset-1"
                                                  aria-label={`${subtask.approved_by ? "Mark subtask incomplete" : "Mark subtask complete"}: ${subtask.text || "subtask"}`}
                                                />
                                              </label>
                                              <span className="px-0.5 rounded bg-yellow-100 text-yellow-700">S</span>
                                              {editingItemId === subtask.id ? (
                                      <div className="flex-1 flex gap-1 min-w-0">
                                        <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                        <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                      </div>
                                    ) : (
                                      <div className="flex-1 flex items-center gap-1 min-w-0">
                                        <span className="flex-1 min-w-0">{subtask.text}</span>
                                        {isRegistered && (
                                          <button type="button" onClick={(e) => startEditItem(subtask, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-yellow-100 text-yellow-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-400" title="Edit subtask" aria-label={`Edit subtask ${subtask.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                        )}
                                      </div>
                                    )}
                                              {isRegistered && (
                                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(subtask.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/dsub:opacity-100 md:focus:opacity-100" aria-label={`Delete subtask ${subtask.text || ""}`}>
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
                                                className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                                aria-label={`New subtask under ${task.text || "task"}`}
                                                autoFocus
                                                onKeyDown={(e) => {
                                                  if (e.key === 'Enter') addNewItem('subtask', task.id, displayItem.product_name || productName);
                                                  if (e.key === 'Escape') cancelNewItemInput();
                                                }}
                                              />
                                              <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('subtask', task.id, displayItem.product_name || productName)}>Add</Button>
                                              <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
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
                        {stItems.map(rawItem => {
                          const stItem = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
                          const stItemChildren = checklistChildrenByParentId.get(stItem.id) || [];
                          const stItemTasks = stItemChildren.filter(i => i.type === 'task');
                          const stItemDetails = stItemChildren.filter(i => i.type === 'detail').map(detail => ({
                            ...detail,
                            tasks: (checklistChildrenByParentId.get(detail.id) || []).filter(i => i.type === 'task')
                          }));
                          if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                          
                          const stDisplayItem = { ...stItem, tasks: stItemTasks, details: stItemDetails };
                          const isStItemCompleted = dropdownConditionByName.get(stDisplayItem.custom_dropdown_value)?.is_completed;
                          return (
                          <div data-sips-checklist-item-id={String(stDisplayItem.id)} key={stDisplayItem.id} className={`clay-card p-2 ${isStItemCompleted ? 'bg-green-100/70' : 'bg-white'} ${focusedNeedsInputId === stDisplayItem.id ? 'ring-2 ring-red-400 ring-offset-2' : focusedSearchId === stDisplayItem.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
                            <div 
                              className="flex flex-wrap items-center gap-2 group"
                            >
                              <button
                                type="button"
                                onClick={() => toggleExpanded(stDisplayItem.id)}
                                className="h-11 w-11 md:h-7 md:w-7 inline-flex items-center justify-center hover:bg-gray-100 rounded shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                                aria-label={`${expandedItems[stDisplayItem.id] !== false ? "Collapse" : "Expand"} checklist option details for ${stDisplayItem.text || "checklist item"}`}
                                aria-expanded={expandedItems[stDisplayItem.id] !== false}
                              >
                                {(stDisplayItem.details?.length > 0 || stDisplayItem.tasks?.length > 0) ? (
                                  (expandedItems[stDisplayItem.id] !== false) ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />
                                ) : <div className="w-4" aria-hidden="true" />}
                              </button>
                              <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Checklist</span>
                              {editingItemId === stDisplayItem.id ? (
                                <div className="flex-1 flex gap-1 min-w-0">
                                  <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                  <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs bg-green-600 hover:bg-green-700" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                  <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                </div>
                              ) : (
                                <div className="flex-1 flex items-center gap-1 min-w-0">
                                  <span className={`text-sm flex-1 min-w-0 px-1 ${isStItemCompleted ? 'line-through text-gray-400' : ''}`}>{stDisplayItem.text}</span>
                                  {isRegistered && (
                                    <button type="button" onClick={(e) => startEditItem(stDisplayItem, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400" title="Edit checklist item" aria-label={`Edit checklist item ${stDisplayItem.text || ""}`}>
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                              {getItemAttentionLabel(stDisplayItem) && (
                                <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                  {getItemAttentionLabel(stDisplayItem)}
                                </span>
                              )}

                              {/* Quick add buttons on hover for sub-templates */}
                              {isRegistered && (
                                <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpandedItems(prev => ({ ...prev, [stDisplayItem.id]: true }));
                                      setNewItemInput({ show: true, parentId: stDisplayItem.id, type: 'task', productName: stDisplayItem.product_name || productName }); 
                                    }}
                                    className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                    title="Add Task"
                                    aria-label={`Add task under ${stDisplayItem.text || "checklist item"}`}
                                  >
                                    +Task
                                  </button>
                                  <button
                                    onClick={(e) => { 
                                      e.stopPropagation(); 
                                      setExpandedItems(prev => ({ ...prev, [stDisplayItem.id]: true }));
                                      setNewItemInput({ show: true, parentId: stDisplayItem.id, type: 'detail', productName: stDisplayItem.product_name || productName }); 
                                    }}
                                    className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                                    title="Add Detail"
                                    aria-label={`Add detail under ${stDisplayItem.text || "checklist item"}`}
                                  >
                                    +Detail
                                  </button>
                                </div>
                              )}
                              
                              <Select
                                value={stDisplayItem.approved_by || ""}
                                onValueChange={(val) => updateChecklistItem(stDisplayItem.id, { approved_by: val })}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-28 focus:ring-2 focus:ring-blue-400 focus:ring-offset-1" aria-label={`Answered by for checklist item: ${stDisplayItem.text || "checklist item"}`}>
                                  <SelectValue placeholder="Answered..." />
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
                                value={stDisplayItem.custom_dropdown_value || "select_value"}
                                onValueChange={(val) => {
                                  if (val === "other") {
                                    setShowOtherPopup({ itemId: stDisplayItem.id });
                                  } else if (val !== "select_value") {
                                    applyChecklistStatus(stDisplayItem.id, val);
                                  }
                                }}
                                disabled={!isRegistered}
                              >
                                <SelectTrigger className="h-11 md:h-7 text-xs w-full sm:w-32 focus:ring-2 focus:ring-blue-400 focus:ring-offset-1" aria-label={`Status for checklist item: ${stDisplayItem.text || "checklist item"}`}>
                                  <SelectValue placeholder={getDropdownName(stDisplayItem.dropdown_id) || "Answer..."}>
                                    {stDisplayItem.custom_dropdown_value || "Answer..."}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {dropdownConditions
                                    .filter(dd => (stDisplayItem.dropdown_ids || []).includes(dd.id))
                                    .map(dd => (
                                      <SelectItem key={dd.id} value={dd.name}>
                                        {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                                      </SelectItem>
                                    ))}
                                  <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                </SelectContent>
                              </Select>

                              {isRegistered && (
                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(stDisplayItem.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete checklist item ${stDisplayItem.text || ""}`}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>

                            {/* Expanded content for sub-template items - expanded by default */}
                            {(expandedItems[stDisplayItem.id] !== false) && (
                              <div className="ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-2">
                                {stDisplayItem.tasks?.map(task => (
                                  <div data-sips-checklist-item-id={String(task.id)} key={task.id} className={`flex flex-wrap items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400 group/sttask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                    <label htmlFor={`sips-complete-${task.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:ring-offset-1">
                                      <Checkbox 
                                        id={`sips-complete-${task.id}`}
                                        checked={!!task.approved_by}
                                        onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                        disabled={!isRegistered}
                                        className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
                                        aria-label={`${task.approved_by ? "Mark task incomplete" : "Mark task complete"}: ${task.text || "task"}`}
                                      />
                                    </label>
                                    <span className="text-xs px-1 py-0.5 rounded bg-orange-100 text-orange-700">Task</span>
                                    {editingItemId === task.id ? (
                                      <div className="flex-1 flex gap-1 min-w-0">
                                        <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                        <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                      </div>
                                    ) : (
                                      <div className="flex-1 flex items-center gap-1 min-w-0">
                                        <span className="text-xs flex-1 min-w-0">{task.text}</span>
                                        {isRegistered && (
                                          <button type="button" onClick={(e) => startEditItem(task, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-orange-100 text-orange-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" title="Edit task" aria-label={`Edit task ${task.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                        )}
                                      </div>
                                    )}
                                    <MultiUserSelectInline
                                      users={users}
                                      selectedUsers={task.assigned_to ? (Array.isArray(task.assigned_to) ? task.assigned_to : [task.assigned_to]) : []}
                                      onSelectionChange={(val) => updateChecklistItem(task.id, { assigned_to: val })}
                                      disabled={!isRegistered}
                                      className="h-11 md:h-7 min-w-[96px] max-w-[140px] px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-offset-1"
                                      ariaLabel={`Assign users for task: ${task.text || "task"}`}
                                    />
                                    {isRegistered && (
                                      <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/sttask:opacity-100 md:focus:opacity-100" aria-label={`Delete task ${task.text || ""}`}>
                                        <Trash2 className="w-2.5 h-2.5" />
                                      </Button>
                                    )}
                                  </div>
                                ))}
                                
                                {/* Inline add task for sub-template */}
                                {newItemInput.show && newItemInput.parentId === stDisplayItem.id && newItemInput.type === 'task' && (
                                  <div className="flex flex-wrap items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400">
                                    <Input
                                      value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New task..."
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                      aria-label={`New task under ${stDisplayItem.text || "checklist item"}`}
                                      autoFocus
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') addNewItem('task', stDisplayItem.id, stDisplayItem.product_name || productName);
                                        if (e.key === 'Escape') cancelNewItemInput();
                                      }}
                                    />
                                    <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('task', stDisplayItem.id, stDisplayItem.product_name || productName)}>Add</Button>
                                    <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
                                  </div>
                                )}
                                
                                {stDisplayItem.details?.map(detail => (
                                  <div data-sips-checklist-item-id={String(detail.id)} key={detail.id} className={`bg-gray-50 p-1.5 rounded text-xs group/stdetail ${focusedNeedsInputId === detail.id ? 'ring-2 ring-red-400 ring-offset-1' : focusedSearchId === detail.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                      {editingItemId === detail.id ? (
                                        <div className="flex-1 flex gap-1 min-w-0">
                                          <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                          <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                          <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                        </div>
                                      ) : (
                                        <div className="flex-1 flex items-center gap-1 min-w-0">
                                          <span className="flex-1 min-w-0">{detail.text}</span>
                                          {isRegistered && (
                                            <button type="button" onClick={(e) => startEditItem(detail, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-purple-100 text-purple-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400" title="Edit detail" aria-label={`Edit detail ${detail.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                          )}
                                        </div>
                                      )}
                                      {isRegistered && (
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: stDisplayItem.product_name || productName }); }}
                                          className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 md:opacity-0 md:group-hover/stdetail:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                          title="Add Task"
                                          aria-label={`Add task under ${detail.text || "detail"}`}
                                        >
                                          +Task
                                        </button>
                                      )}
                                      {isRegistered && (
                                        <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/stdetail:opacity-100 md:focus:opacity-100" aria-label={`Delete detail ${detail.text || ""}`}>
                                          <Trash2 className="w-2.5 h-2.5" />
                                        </Button>
                                      )}
                                    </div>
                                    {/* Inline add task for sub-template detail */}
                                    {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                      <div className="ml-4 mt-1 flex items-center gap-1 bg-orange-50 p-1 rounded">
                                        <Input
                                          value={newItemText}
                                          onChange={(e) => setNewItemText(e.target.value)}
                                          placeholder="New task..."
                                          className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                          aria-label={`New task under ${detail.text || "detail"}`}
                                          autoFocus
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') addNewItem('task', detail.id, stDisplayItem.product_name || productName);
                                            if (e.key === 'Escape') cancelNewItemInput();
                                          }}
                                        />
                                        <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('task', detail.id, stDisplayItem.product_name || productName)}>Add</Button>
                                        <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
                                      </div>
                                    )}
                                    {/* Tasks under detail */}
                                    {detail.tasks?.length > 0 && (
                                      <div className="ml-4 mt-1 space-y-0.5">
                                        {detail.tasks.map(task => (
                                          <div data-sips-checklist-item-id={String(task.id)} key={task.id} className={`flex items-center gap-1 bg-orange-50 p-0.5 rounded group/stdtask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                            <label htmlFor={`sips-complete-${task.id}`} className="inline-flex h-11 w-11 md:h-7 md:w-7 shrink-0 items-center justify-center rounded cursor-pointer focus-within:ring-2 focus-within:ring-orange-400 focus-within:ring-offset-1">
                                              <Checkbox 
                                                id={`sips-complete-${task.id}`}
                                                checked={!!task.approved_by}
                                                onCheckedChange={(checked) => updateChecklistItem(task.id, { approved_by: checked ? "Done" : "" })}
                                                disabled={!isRegistered}
                                                className="h-5 w-5 md:h-4 md:w-4 shrink-0 focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-1"
                                                aria-label={`${task.approved_by ? "Mark task incomplete" : "Mark task complete"}: ${task.text || "task"}`}
                                              />
                                            </label>
                                            <span className="px-0.5 rounded bg-orange-100 text-orange-600">T</span>
                                            {editingItemId === task.id ? (
                                              <div className="flex-1 flex gap-1 min-w-0">
                                                <Input value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
                                                <Button type="button" size="sm" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={saveEditItem} aria-label="Save edit">✓</Button>
                                                <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={() => setEditingItemId(null)} aria-label="Cancel edit">✕</Button>
                                              </div>
                                            ) : (
                                              <div className="flex-1 flex items-center gap-1 min-w-0">
                                                <span className="flex-1 min-w-0">{task.text}</span>
                                                {isRegistered && (
                                                  <button type="button" onClick={(e) => startEditItem(task, e)} className="h-11 w-11 md:h-7 md:w-7 flex items-center justify-center rounded hover:bg-orange-100 text-orange-700 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400" title="Edit task" aria-label={`Edit task ${task.text || ""}`}><Pencil className="w-3 h-3" /></button>
                                                )}
                                              </div>
                                            )}
                                            {isRegistered && (
                                              <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(task.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/stdtask:opacity-100 md:focus:opacity-100" aria-label={`Delete task ${task.text || ""}`}>
                                                <Trash2 className="w-2 h-2" />
                                              </Button>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                      )}
                                      </div>
                                      ))}

                                      {/* Inline add detail for sub-template */}
                                {newItemInput.show && newItemInput.parentId === stDisplayItem.id && newItemInput.type === 'detail' && (
                                  <div className="bg-gray-50 p-1.5 rounded border">
                                    <div className="flex flex-wrap items-center gap-1">
                                      <Input
                                        value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New detail..."
                                        className="h-11 md:h-7 text-xs flex-1 min-w-0"
                                        aria-label={`New detail under ${stDisplayItem.text || "checklist item"}`}
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') addNewItem('detail', stDisplayItem.id, stDisplayItem.product_name || productName);
                                          if (e.key === 'Escape') cancelNewItemInput();
                                        }}
                                      />
                                      <Button type="button" size="sm" className="h-11 md:h-7 px-3 md:px-2 text-xs" onClick={() => addNewItem('detail', stDisplayItem.id, stDisplayItem.product_name || productName)}>Add</Button>
                                      <Button type="button" size="sm" variant="ghost" className="h-11 w-11 md:h-7 md:w-7 p-0 text-xs" onClick={cancelNewItemInput} aria-label="Cancel add">×</Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                        })}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
                ))}
                
                {/* Completed Items Section */}
                {Object.keys(completedChecklist).length > 0 && (
                  <div className="mt-5 border-t pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-between h-11 sm:h-9 text-green-800 hover:bg-green-50"
                      onClick={() => setShowCompletedItems(prev => !prev)}
                      aria-expanded={showCompletedItems}
                      aria-controls="sips-completed-items"
                    >
                      <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" aria-hidden="true" />Completed items ({completedPrimaryCount})</span>
                      {showCompletedItems ? <ChevronDown className="w-4 h-4" aria-hidden="true" /> : <ChevronRight className="w-4 h-4" aria-hidden="true" />}
                    </Button>
                    {showCompletedItems && (
                      <div id="sips-completed-items">
                      <ChecklistCompletedSection
                        completedChecklist={completedChecklist}
                        dropdownConditions={dropdownConditions}
                        users={users}
                        isRegistered={isRegistered}
                        updateChecklistItem={updateChecklistItem}
                        applyChecklistStatus={applyChecklistStatus}
                        setShowOtherPopup={setShowOtherPopup}
                        focusedNeedsInputId={focusedNeedsInputId}
                      />
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Add General Checklist Item */}
          {showAddGeneralChecklist && (
            <div className="p-3 bg-gray-50 rounded-lg border mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={newGeneralChecklistText}
                  onChange={(e) => setNewGeneralChecklistText(e.target.value)}
                  placeholder="New general checklist item..."
                  className="h-11 sm:h-8 text-sm flex-1 min-w-0"
                  aria-label="New general checklist item"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newGeneralChecklistText.trim()) {
                      const timestamp = Date.now();
                      const randomSuffix = Math.random().toString(36).substr(2, 9);
                      const newItem = {
                        id: `General Items_manual_${timestamp}_${randomSuffix}`,
                        text: newGeneralChecklistText.trim(),
                        type: 'checklist',
                        approved_by: "",
                        custom_dropdown_value: "",
                        product_name: "General Items",
                        product_type: "",
                        parent_id: null
                      };
                      setChecklist(prev => [...prev, newItem]);
                      setNewGeneralChecklistText("");
                      setShowAddGeneralChecklist(false);
                    }
                    if (e.key === 'Escape') { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }
                  }}
                />
                <Button 
                  size="sm" 
                  className="h-11 sm:h-8 px-3" 
                  onClick={() => {
                    if (newGeneralChecklistText.trim()) {
                      const timestamp = Date.now();
                      const randomSuffix = Math.random().toString(36).substr(2, 9);
                      const newItem = {
                        id: `General Items_manual_${timestamp}_${randomSuffix}`,
                        text: newGeneralChecklistText.trim(),
                        type: 'checklist',
                        approved_by: "",
                        custom_dropdown_value: "",
                        product_name: "General Items",
                        product_type: "",
                        parent_id: null
                      };
                      setChecklist(prev => [...prev, newItem]);
                      setNewGeneralChecklistText("");
                      setShowAddGeneralChecklist(false);
                    }
                  }}
                >
                  Add
                </Button>
                <Button type="button" size="sm" variant="ghost" className="h-11 sm:h-8 px-3" onClick={() => { setShowAddGeneralChecklist(false); setNewGeneralChecklistText(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Actions */}
          {saveError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <div className="font-medium">SIP product checklist save blocked</div>
              <div className="mt-1 text-xs">{saveError}</div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs text-red-700">Reloading discards unsaved checklist and product edits.</span>
                <Button type="button" size="sm" variant="outline" onClick={loadData} disabled={isLoading || isSaving} className="shrink-0 border-red-300 bg-white text-red-800">
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Reload latest
                </Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3 pt-3 sm:pt-4 border-t">
            <Button variant="outline" onClick={requestClose} disabled={isSaving} className="sm:flex-1 h-11 sm:h-10">
              Cancel
            </Button>
            {isRegistered && (
              <Button
                variant="outline"
                onClick={() => setShowAddGeneralChecklist(true)}
                className="sm:flex-1 h-11 sm:h-10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            )}
            {isRegistered && !workOrder.sip_completed && (
              <Button
                onClick={handleCheckOff}
                disabled={isSaving}
                className="sm:flex-1 h-11 sm:h-10 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
            <Button 
              onClick={handleSaveClick}
              disabled={isSaving || !isRegistered}
              className="sm:flex-1 h-11 sm:h-10 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              Save & Revisit
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
            handleApplyTemplate(templateData);
            setShowTemplateBuilder(false);
          }}
          existingChecklist={checklist}
          isAdmin={isAdmin}
          workOrderProducts={products}
        />,
        document.body
      )}



      {/* Revisit Date Popup */}
      <RevisitDatePopup
        isOpen={showRevisitPopup}
        onClose={() => setShowRevisitPopup(false)}
        onSave={handleRevisitSave}
        currentDate={pendingRevisitDate}
      />

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

      {/* Unsaved changes warning */}
      <AlertDialog open={discardWarning} onOpenChange={setDiscardWarning}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Discard unsaved SIP changes?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Checklist answers, assignments, items, or product edits made in this window have not been saved yet. Leaving now will discard them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDiscardWarning(false);
                onClose();
              }}
              className="bg-red-600 hover:bg-red-700"
            >
              Discard Changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checklist item deletion */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-500" />
              Delete {pendingDelete?.itemType === 'task' ? 'task' : pendingDelete?.itemType === 'detail' ? 'detail' : pendingDelete?.itemType === 'subtask' ? 'subtask' : 'checklist item'}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              “{pendingDelete?.itemText}” will be removed from this SIP checklist.
              {pendingDelete?.childCount > 0 ? ` Its ${pendingDelete.childCount} nested ${pendingDelete.childCount === 1 ? 'item' : 'items'} will also be removed so no orphaned checklist data is left behind.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChecklistItem} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation guidance */}
      <AlertDialog open={!!validationDialog} onOpenChange={(open) => { if (!open) setValidationDialog(null); }}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              {validationDialog?.title || "Checklist Needs Attention"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {validationDialog?.message}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setValidationDialog(null)}>OK</AlertDialogAction>
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
            <AlertDialogAction onClick={proceedWithCheckOff} disabled={isSaving} className="bg-green-600 hover:bg-green-700">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
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
                        if (showOtherPopup?.itemId && applyChecklistStatus(showOtherPopup.itemId, dd.name)) {
                          setShowOtherPopup(null);
                        }
                      }}
                      className={`p-3 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2 transition-colors ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${dd.is_completed ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        {dd.is_completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : <List className="w-4 h-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <span className="font-medium">{dd.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                          {dd.is_completed ? 'Completed' : 'Continued'}
                        </span>
                      </div>
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