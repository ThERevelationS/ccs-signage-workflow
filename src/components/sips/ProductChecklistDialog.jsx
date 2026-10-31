import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import { isDefinitiveSipsSaveRejection, reconcileInterruptedSipsSave } from "./checklistSaveRecovery";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadSingleGlobalSetting } from "@/components/shared/globalSettingsPersistence";
import { staffEntities } from "@/components/staff/staffEntities";

const WorkOrder = staffEntities.WorkOrder;
const AuthorizedEmail = staffEntities.AuthorizedEmail;

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
  const [loadError, setLoadError] = useState("");
  const loadErrorAlertRef = useRef(null);
  const loadErrorFocusPendingRef = useRef(false);
  const [hasLoadedChecklist, setHasLoadedChecklist] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // React state can lag rapid clicks: fence saves synchronously before the first await.
  const saveInFlightRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const [showTemplateBuilder, setShowTemplateBuilder] = useState(false);
  const [dropdownConditions, setDropdownConditions] = useState([]);
  const [incompleteWarning, setIncompleteWarning] = useState(null);
  const [unfinishedEditsWarning, setUnfinishedEditsWarning] = useState(null);
  const unfinishedEditsActionRef = useRef(null);
  const unfinishedDraftTargetRef = useRef(null);
  const focusCustomDraftOnOpenRef = useRef(false);
  const [noChecklistWarning, setNoChecklistWarning] = useState(null);
  const [, setProductTypes] = useState([]);
  const [showOtherPopup, setShowOtherPopup] = useState(null);
  const [customDropdownValue, setCustomDropdownValue] = useState("");
  const customStatusInputRef = useRef(null);
  const otherPopupValidationReturnRef = useRef(null);
  // A rejected status keeps its focus target until the warning actually closes.
  const otherPopupValidationPendingRef = useRef(false);
  const staleValidationFocusRef = useRef(false);
  const loadDataRequestRef = useRef(0);
  const customStatusDraftsByItemIdRef = useRef(new Map());
  const otherPopupFocusItemIdRef = useRef(null);
  const otherPopupDismissedRef = useRef(false);
  // A Work Order switch or explicit reload invalidates modal focus targets,
  // warning attempts and transient drafts from the previous checklist view.
  const resetOtherPopupForReload = () => {
    staleValidationFocusRef.current = true;
    validationFocusItemIdRef.current = null;
    unfinishedDraftTargetRef.current = null;
    focusCustomDraftOnOpenRef.current = false;
    setUnfinishedEditsWarning(null);
    customStatusDraftsByItemIdRef.current.clear();
    otherPopupValidationReturnRef.current = null;
    otherPopupValidationPendingRef.current = false;
    otherPopupFocusItemIdRef.current = null;
    otherPopupDismissedRef.current = false;
    setCustomDropdownValue("");
    setShowOtherPopup(null);
    setValidationDialog(null);
  };
  useEffect(() => {
    resetOtherPopupForReload();
    // Reload focus is scoped to the original job, never a later selection.
    reloadSuccessFocusRequestRef.current = null;
    // A failed date selection belongs only to the Work Order that submitted it.
    failedRevisitSelectionRef.current = undefined;
    failedRevisitWorkOrderIdRef.current = null;
  }, [workOrder?.id]);
  const [showRevisitPopup, setShowRevisitPopup] = useState(false);
  const [pendingRevisitDate, setPendingRevisitDate] = useState(null);
  const [pendingRevisitRetry, setPendingRevisitRetry] = useState(undefined);
  const [loadedChecklistSnapshot, setLoadedChecklistSnapshot] = useState(undefined);
  const [loadedProductsSnapshot, setLoadedProductsSnapshot] = useState(undefined);
  const [loadedUiChecklistSnapshot, setLoadedUiChecklistSnapshot] = useState([]);
  const [loadedUiProductsSnapshot, setLoadedUiProductsSnapshot] = useState([]);
  const [loadedRevisitDateSnapshot, setLoadedRevisitDateSnapshot] = useState(undefined);
  const [loadedSipCompletedSnapshot, setLoadedSipCompletedSnapshot] = useState(undefined);
  // A separate baseline fences checklist saves if another session moves the
  // job, completes it, or changes SIP completion while this dialog is open.
  const loadedWorkflowSnapshotRef = useRef(null);
  const [saveError, setSaveError] = useState("");
  const [saveOutcomeUncertain, setSaveOutcomeUncertain] = useState(false);
  const saveErrorAlertRef = useRef(null);
  const saveFailureFocusPendingRef = useRef(false);
  // Preserve a failed Revisit choice for the next confirmation, not an auto-retry.
  const failedRevisitSelectionRef = useRef(undefined);
  const failedRevisitWorkOrderIdRef = useRef(null);
  const [validationDialog, setValidationDialog] = useState(null);
  const [showCompletedItems, setShowCompletedItems] = useState(false);
  const [discardWarning, setDiscardWarning] = useState(null); // "close" or "reload"
  const reloadLatestButtonRef = useRef(null);
  const reloadSuccessHeadingRef = useRef(null);
  const reloadSuccessFocusRequestRef = useRef(null);
  const returnToReloadRef = useRef(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const deleteFocusRecoveryRef = useRef(false);
  const checklistCloseButtonRef = useRef(null);
  const saveRevisitButtonRef = useRef(null);
  const completeButtonRef = useRef(null);
  const validationFocusItemIdRef = useRef(null);
  const completingWithoutChecklistRef = useRef(false);

  // Keep hierarchy indexes stable while unrelated dialog state changes. Long
  // checklists should only rebuild these O(n) structures when their source data changes.
  const { checklistItemById, checklistChildrenByParentId, checklistChildrenByParentType, childrenCompleteByItemId } = useMemo(() => {
    const itemById = new Map(checklist.map(item => [item.id, item]));
    const childrenByParentId = new Map();
    const childrenByParentType = new Map();
    checklist.forEach(item => {
      if (!item.parent_id) return;
      if (!childrenByParentId.has(item.parent_id)) childrenByParentId.set(item.parent_id, []);
      childrenByParentId.get(item.parent_id).push(item);
      if (!childrenByParentType.has(item.parent_id)) {
        childrenByParentType.set(item.parent_id, { task: [], detail: [], subtask: [] });
      }
      const typedChildren = childrenByParentType.get(item.parent_id);
      if (typedChildren[item.type]) typedChildren[item.type].push(item);
    });

    // Cache descendant-completion state once per checklist change. Rendering attention
    // labels and validating a status should not recursively walk the same subtrees again.
    const completionByItemId = new Map();
    const computing = new Set();
    const computeChildrenComplete = (itemId) => {
      if (completionByItemId.has(itemId)) return completionByItemId.get(itemId);
      if (computing.has(itemId)) return false;
      computing.add(itemId);
      const children = childrenByParentId.get(itemId) || [];
      const isComplete = children.every(child => {
        if (child.type === 'detail') {
          return Boolean(child.approved_by && child.custom_dropdown_value && computeChildrenComplete(child.id));
        }
        if (child.type === 'task' || child.type === 'subtask') {
          return Boolean(child.approved_by && computeChildrenComplete(child.id));
        }
        return true;
      });
      computing.delete(itemId);
      completionByItemId.set(itemId, isComplete);
      return isComplete;
    };
    checklist.forEach(item => computeChildrenComplete(item.id));

    return {
      checklistItemById: itemById,
      checklistChildrenByParentId: childrenByParentId,
      checklistChildrenByParentType: childrenByParentType,
      childrenCompleteByItemId: completionByItemId,
    };
  }, [checklist]);
  const dropdownConditionByName = useMemo(
    () => new Map(dropdownConditions.map(condition => [condition.name, condition])),
    [dropdownConditions]
  );
  const { dropdownConditionById, dropdownConditionOrderById } = useMemo(() => ({
    dropdownConditionById: new Map(dropdownConditions.map(condition => [condition.id, condition])),
    dropdownConditionOrderById: new Map(dropdownConditions.map((condition, index) => [condition.id, index])),
  }), [dropdownConditions]);
  const dropdownOptionsByChecklistItemId = useMemo(() => {
    const optionsByItemId = new Map();
    checklist.forEach(item => {
      if (!Array.isArray(item.dropdown_ids) || item.dropdown_ids.length === 0) return;
      const options = item.dropdown_ids
        .map(id => dropdownConditionById.get(id))
        .filter(Boolean)
        .sort((a, b) => (dropdownConditionOrderById.get(a.id) ?? Number.MAX_SAFE_INTEGER)
          - (dropdownConditionOrderById.get(b.id) ?? Number.MAX_SAFE_INTEGER));
      optionsByItemId.set(item.id, options);
    });
    return optionsByItemId;
  }, [checklist, dropdownConditionById, dropdownConditionOrderById]);
  const itemAttentionLabelById = useMemo(() => {
    const labels = new Map();
    checklist.forEach(item => {
      let label = null;
      if (!item?.approved_by) {
        label = "Needs approver";
      } else if (!item?.custom_dropdown_value) {
        label = "Needs status";
      } else {
        const selectedCondition = dropdownConditionByName.get(item.custom_dropdown_value);
        if (selectedCondition?.is_completed && childrenCompleteByItemId.get(item.id) === false) {
          label = "Tasks open";
        }
      }
      labels.set(item.id, label);
    });
    return labels;
  }, [checklist, dropdownConditionByName, childrenCompleteByItemId]);
  const checklistRenderMetaById = useMemo(() => {
    const metaById = new Map();
    checklist.forEach(rawItem => {
      const item = rawItem.type ? rawItem : { ...rawItem, type: 'checklist' };
      const tasks = checklistChildrenByParentType.get(item.id)?.task || [];
      const details = (checklistChildrenByParentType.get(item.id)?.detail || []).map(detail => ({
        ...detail,
        tasks: checklistChildrenByParentType.get(detail.id)?.task || [],
      }));
      metaById.set(item.id, {
        displayItem: { ...item, tasks, details },
        isCompleted: Boolean(dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed),
        attentionLabel: itemAttentionLabelById.get(item.id) || null,
      });
    });
    return metaById;
  }, [checklist, checklistChildrenByParentType, dropdownConditionByName, itemAttentionLabelById]);

  useEffect(() => {
    if (isOpen && workOrder) loadData();
    // Older asynchronous reads must never overwrite the next Work Order.
    return () => { loadDataRequestRef.current += 1; };
  }, [isOpen, workOrder?.id]);

  const loadData = async () => {
    if (saveInFlightRef.current) return;
    const requestId = ++loadDataRequestRef.current;
    loadInFlightRef.current = true;
    // Keep unsaved editor text, custom status drafts and retry choices until
    // the replacement Work Order is verified. A failed reload must not erase them.
    setIsLoading(true);
    try {
      const [freshWO, usersData, dropdownsSetting, productTypesSetting, taskDescriptionsSetting] = await Promise.all([
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
        }),
        loadSingleGlobalSetting({
          entity: base44.entities.GlobalSettings,
          settingKey: "salesTaskDescriptions",
          label: "Product checklist SIPS task eligibility",
        })
      ]);

      if (requestId !== loadDataRequestRef.current) return;
      const currentWO = freshWO[0];
      if (!currentWO) throw new Error("Work Order no longer available. Close and reopen the checklist.");
      if (currentWO.deleted === true) throw new Error("This Work Order is in Trash. Close the checklist and reload the SIPS board before continuing.");
      if (currentWO.completed === true || currentWO.is_rider === true) {
        throw new Error("This Work Order is no longer an active SIPS job. Close the checklist and reload the SIPS board before continuing.");
      }
      // Match the SIPS board's three queue rules. A job moved to an unrelated
      // task cannot become saveable merely because someone reloads its checklist.
      const configuredSipsTask = Boolean(currentWO.current_task_description &&
        (taskDescriptionsSetting?.setting_value?.items || []).some(item =>
          item.text === currentWO.current_task_description && (item.page === "SIPs" || item.wip)
        ));
      if (currentWO.current_task_assigned_to !== "SIPs" && !configuredSipsTask) {
        throw new Error("This Work Order's current task no longer belongs to SIPS. Close the checklist and refresh the SIPS board before continuing.");
      }

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
      
      // Commit reload cleanup only after the new checklist has been read and
      // reconstructed successfully. On failure, all local drafts remain intact.
      saveFailureFocusPendingRef.current = false;
      // A successful read resolves an uncertain write, but must not silently
      // discard a date the server did NOT save. Keep it only for this Work
      // Order's next explicit Save & Revisit confirmation; never auto-write.
      if (failedRevisitWorkOrderIdRef.current !== workOrder.id ||
          (failedRevisitSelectionRef.current !== undefined &&
           (failedRevisitSelectionRef.current || "") === (currentWO.sip_revisit_date || ""))) {
        failedRevisitSelectionRef.current = undefined;
        failedRevisitWorkOrderIdRef.current = null;
      }
      resetOtherPopupForReload();
      setEditingItemId(null);
      setEditingItemText("");
      setEditingProductName(null);
      setEditingProductNameText("");
      setNewItemInput({ show: false, parentId: null, type: null, productName: null });
      setNewItemText("");
      setShowAddGeneralChecklist(false);
      setNewGeneralChecklistText("");
      setChecklist(reconstructedChecklist);
      setLoadedUiChecklistSnapshot(cloneLoadedValue(reconstructedChecklist) || []);

      // Load dropdown conditions
      setDropdownConditions(dropdownsSetting?.setting_value?.items || []);
      
      const loadedProductTypes = productTypesSetting?.setting_value?.items || 
        ["Channel Letters", "Cabinet Sign", "Monument", "Pylon", "Wall Sign", "Window Graphics", "Vehicle Wrap"];
      setProductTypes(loadedProductTypes);
      loadedWorkflowSnapshotRef.current = {
        completed: currentWO.completed ?? null,
        is_rider: currentWO.is_rider ?? null,
        current_stage: currentWO.current_stage ?? null,
        current_task_assigned_to: currentWO.current_task_assigned_to ?? null,
        current_task_description: currentWO.current_task_description ?? null,
        sip_completed: currentWO.sip_completed ?? null,
      };
      // Only a fully reconstructed, current checklist may replace a failed-load state.
      setHasLoadedChecklist(true);
      setSaveOutcomeUncertain(false);
      loadErrorFocusPendingRef.current = false;
      setLoadError("");
    } catch (error) {
      if (requestId !== loadDataRequestRef.current) return;
      console.error("Error loading data:", error);
      // Loading failure is not an empty checklist or a failed save. Keep the
      // previous snapshot/drafts and block mutations until a successful retry.
      loadErrorFocusPendingRef.current = true;
      setLoadError(error?.message || "This SIP checklist could not be loaded. Retry or close it.");
    } finally {
      if (requestId === loadDataRequestRef.current) {
        loadInFlightRef.current = false;
        setIsLoading(false);
      }
    }
  };

  const getDropdownName = (dropdownId) => {
    if (!dropdownId) return null;
    return dropdownConditionById.get(dropdownId)?.name || null;
  };

  const _handleOtherDropdownSelect = (itemId, selectedDropdownId) => {
    updateChecklistItem(itemId, { dropdown_id: selectedDropdownId, custom_dropdown_value: "" });
    setShowOtherPopup(null);
  };

  const openOtherPopup = (itemId) => {
    if (otherPopupValidationPendingRef.current || validationDialog) return;
    // Modal owns focus until it closes, including any stale Search/Needs Input timer.
    cancelPendingNavigationFocus();
    otherPopupFocusItemIdRef.current = itemId;
    otherPopupDismissedRef.current = false;
    otherPopupValidationReturnRef.current = null;
    setCustomDropdownValue(customStatusDraftsByItemIdRef.current.get(itemId) || "");
    setShowOtherPopup({ itemId });
  };

  const updateCustomStatusDraft = (value) => {
    if (showOtherPopup?.itemId) customStatusDraftsByItemIdRef.current.set(showOtherPopup.itemId, value);
    setCustomDropdownValue(value);
  };

  const dismissOtherPopup = () => {
    if (validationDialog || otherPopupValidationPendingRef.current) return; // Keep the parent open until validation fully closes.
    otherPopupDismissedRef.current = true;
    otherPopupValidationReturnRef.current = null;
    setShowOtherPopup(null);
  };

  const handleOtherPopupCloseAutoFocus = (event) => {
    // Reload/switch clears the source row before Radix finishes closing.
    // Never use native trigger restoration for that now-stale popup.
    if (isLoading || !otherPopupFocusItemIdRef.current) {
      event.preventDefault();
      otherPopupDismissedRef.current = false;
      return;
    }
    if (!isOpen || !otherPopupDismissedRef.current) return;
    otherPopupDismissedRef.current = false;
    event.preventDefault();
    const row = findRenderedChecklistItemElement([otherPopupFocusItemIdRef.current]);
    const statusControl = row?.querySelector('[aria-label^="Status for "]');
    // The row may have moved, been collapsed, or unmounted while the modal
    // was open. Try each visible, enabled fallback independently.
    const destination = [statusControl, checklistSearchInputRef.current, checklistCloseButtonRef.current]
      .find(target => target?.isConnected && !target.disabled && target.getClientRects().length);
    destination?.focus();
  };

  const handleCreateCustomValue = (itemId) => {
    if (otherPopupValidationPendingRef.current || validationDialog) return;
    const value = customDropdownValue.trim();
    if (!value) return;
    otherPopupValidationReturnRef.current = customStatusInputRef.current;
    // Rejected validation keeps this dialog and the draft value available.
    if (!applyChecklistStatus(itemId, value, { fromOtherPopup: true })) return;
    otherPopupValidationReturnRef.current = null;
    otherPopupDismissedRef.current = true;
    customStatusDraftsByItemIdRef.current.delete(itemId);
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
      staleValidationFocusRef.current = false;
      validationFocusItemIdRef.current = null;
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
    // The dialog's original Delete trigger is about to unmount. Avoid
    // restoring focus to that deleted row, and reset navigation indexes
    // that may now point to a different Search result.
    deleteFocusRecoveryRef.current = true;
    setFocusedSearchId(null);
    setFocusedNeedsInputId(null);
    focusedNeedsInputSourceIdRef.current = null;
    setChecklistSearchIndex(-1);
    setChecklist(prev => prev.filter(item => !deleteIds.has(item.id)));
    setPendingDelete(null);
  };

  // Descendant completion is memoized above so repeated render/validation checks are O(1).
  const areChildrenComplete = (itemId) => childrenCompleteByItemId.get(itemId) ?? true;

  const applyChecklistStatus = (itemId, value, { fromOtherPopup = false } = {}) => {
    const item = checklistItemById.get(itemId);
    if (!item || !value) return false;

    const itemLabel = item.type === 'detail' ? 'detail' : 'checklist item';
    if (!item.approved_by) {
      staleValidationFocusRef.current = false;
      if (fromOtherPopup) otherPopupValidationPendingRef.current = true;
      validationFocusItemIdRef.current = itemId;
      setValidationDialog({
        title: "Approver Required",
        message: `Select who approved this ${itemLabel} before setting its status.`
      });
      return false;
    }

    const selectedCondition = dropdownConditionByName.get(value);
    if (selectedCondition?.is_completed && !areChildrenComplete(itemId)) {
      staleValidationFocusRef.current = false;
      if (fromOtherPopup) otherPopupValidationPendingRef.current = true;
      validationFocusItemIdRef.current = itemId;
      setValidationDialog({
        title: "Tasks Still Open",
        message: item.type === 'detail'
          ? "Complete the tasks under this detail before marking it completed."
          : "Complete the tasks and details under this checklist item before marking it completed."
      });
      return false;
    }

    // Moving between Active and Completed can unmount the status trigger.
    // Direct edits restore Search focus; the Other popup restores focus
    // after it closes so a timer cannot steal focus behind the popup.
    const wasCompleted = Boolean(dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed);
    const willBeCompleted = Boolean(selectedCondition?.is_completed);
    if (wasCompleted !== willBeCompleted) {
      setFocusedSearchId(null);
      setFocusedNeedsInputId(null);
      setChecklistSearchIndex(-1);
      if (!fromOtherPopup) scheduleNavigationFocus(() => checklistSearchInputRef.current?.focus());
    }

    updateChecklistItem(itemId, { custom_dropdown_value: value });
    return true;
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
    if (saveOutcomeUncertain || isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current || blockOnUnsubmittedDrafts("complete")) return;
    const status = checkIfComplete();
    
    if (!status.hasChecklist) {
      completingWithoutChecklistRef.current = false;
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
    if (saveOutcomeUncertain || isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current || blockOnUnsubmittedDrafts("complete")) return;
    completingWithoutChecklistRef.current = true;
    setNoChecklistWarning(false);
    // Preserve any local product edits and complete the SIP in the same
    // concurrency-safe write, even when the user explicitly overrides the
    // missing-checklist warning.
    await saveChecklist(undefined, { markComplete: true });
  };

  // Called when Save button is clicked - first show revisit date popup
  const handleSaveClick = () => {
    if (saveOutcomeUncertain || !isRegistered || isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current || blockOnUnsubmittedDrafts("save")) return;
    // The Revisit confirmation owns keyboard focus until it closes.
    // Do not allow a queued checklist navigation callback behind it.
    cancelPendingNavigationFocus();
    setPendingRevisitDate(loadedRevisitDateSnapshot || null);
    setPendingRevisitRetry(failedRevisitSelectionRef.current);
    setShowRevisitPopup(true);
  };

  // Called after user picks (or skips) a revisit date
  const handleRevisitSave = async (dateString) => {
    if (saveOutcomeUncertain || isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current) return;
    if (blockOnUnsubmittedDrafts("save")) {
      setShowRevisitPopup(false);
      return;
    }
    setShowRevisitPopup(false);
    await saveChecklist(dateString);
  };

  const saveChecklist = async (revisitDate, { markComplete = false } = {}) => {
    if (saveOutcomeUncertain || isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current ||
        blockOnUnsubmittedDrafts(markComplete ? "complete" : "save")) return;
    saveInFlightRef.current = true;
    saveFailureFocusPendingRef.current = false;
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

        // Completion must also compare the loaded revisit date when it is not
        // future. Otherwise another session can schedule a future revisit while
        // this checklist is open, leaving a completed SIP with a stale return
        // date. Keep today/past dates unchanged; clear future dates atomically.
        if (revisitDate === undefined) {
          expectedFields.sip_revisit_date = loadedRevisitDateSnapshot;
          nextFields.sip_revisit_date = isFutureRevisitDate(loadedRevisitDateSnapshot)
            ? ""
            : (loadedRevisitDateSnapshot || "");
        }
      }

      setSaveError("");
      let saved;
      try {
        saved = await replaceWorkOrderFieldsIfUnchanged({
          workOrderId: workOrder.id,
          expectedFields,
          nextFields,
          // Backend guard_fields compares current server state, not just fields
          // we are writing. Reject a stale SIPS task/stage/completion context.
          guardFields: loadedWorkflowSnapshotRef.current,
          label: markComplete ? "SIP checklist save and completion" : "SIP product checklist",
        });
      } catch (writeError) {
        if (isDefinitiveSipsSaveRejection(writeError)) throw writeError;
        // Lost responses can occur after a successful server commit. Read
        // once and reconcile all written fields plus unchanged workflow guards;
        // never resubmit the write to discover what happened.
        const outcome = await reconcileInterruptedSipsSave({
          workOrderId: workOrder.id,
          nextFields,
          guardFields: loadedWorkflowSnapshotRef.current,
          readWorkOrders: query => WorkOrder.filter(query),
        });
        if (!outcome.verified) {
          const uncertainty = new Error("The checklist save result could not be verified. The checklist or Revisit date may already be saved. Do not save again until you reload the latest Work Order. Your local edits are still here.");
          uncertainty.saveOutcomeUncertain = true;
          throw uncertainty;
        }
        saved = outcome.record;
      }
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
      failedRevisitSelectionRef.current = undefined;
      failedRevisitWorkOrderIdRef.current = null;
      setSaveOutcomeUncertain(false);
      if (onUpdate) onUpdate();
      onClose();
    } catch (error) {
      console.error("Error saving checklist:", error);
      if (error?.saveOutcomeUncertain) setSaveOutcomeUncertain(true);
      if (revisitDate !== undefined) {
        failedRevisitSelectionRef.current = revisitDate;
        failedRevisitWorkOrderIdRef.current = workOrder.id;
      }
      saveFailureFocusPendingRef.current = true;
      setSaveError(error?.message === "The record no longer matches its loaded state."
        ? "This Work Order changed stage, task, or completion state in another session. Nothing was saved. Reload latest to review the new workflow before trying again."
        : (error?.message || "SIP product checklist could not be saved. Reload the latest Work Order and try again."));
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  // Radix can restore focus while a Revisit dialog is closing. Focus a rejected
  // save's error only when saving and modal cleanup allow it, and never on load
  // errors or after the employee switches Work Orders.
  const focusSaveFailureIfReady = () => {
    if (!saveFailureFocusPendingRef.current || !isOpen || isLoading || isSaving || loadError ||
        showRevisitPopup || showTemplateBuilder || showOtherPopup) return;
    const target = saveErrorAlertRef.current;
    if (!target?.isConnected || !target.getClientRects().length) return;
    saveFailureFocusPendingRef.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (saveError) focusSaveFailureIfReady();
  }, [isOpen, isLoading, isSaving, saveError, showRevisitPopup, showTemplateBuilder, showOtherPopup, workOrder?.id]);

  // Loading errors use their own focus recovery. Defer until the loading
  // overlay and any confirmation dialog close so focus remains in the dialog.
  const focusLoadFailureIfReady = () => {
    if (!loadErrorFocusPendingRef.current || !isOpen || isLoading || isSaving ||
        showRevisitPopup || showTemplateBuilder || showOtherPopup || discardWarning) return;
    const target = loadErrorAlertRef.current;
    if (!target?.isConnected || !target.getClientRects().length) return;
    loadErrorFocusPendingRef.current = false;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (loadError) focusLoadFailureIfReady();
  }, [loadError, isOpen, isLoading, isSaving, showRevisitPopup, showTemplateBuilder, showOtherPopup, discardWarning, workOrder?.id]);

  // A manual Reload latest replaces the entire dialog with a loading screen.
  // On verified success, focus its current Work Order heading rather than
  // leaving keyboard focus on a removed error button or loading overlay.
  const focusSuccessfulReloadIfReady = () => {
    if (!isOpen || isLoading || isSaving || !hasLoadedChecklist || loadError ||
        reloadSuccessFocusRequestRef.current !== workOrder?.id ||
        showRevisitPopup || showTemplateBuilder || showOtherPopup || discardWarning ||
        unfinishedEditsWarning || validationDialog || incompleteWarning || noChecklistWarning || pendingDelete) return;
    const heading = reloadSuccessHeadingRef.current;
    if (!heading?.isConnected || !heading.getClientRects().length) return;
    reloadSuccessFocusRequestRef.current = null;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ block: "nearest" });
  };
  useEffect(() => {
    if (!isOpen) {
      reloadSuccessFocusRequestRef.current = null;
      return;
    }
    focusSuccessfulReloadIfReady();
  }, [isOpen, isLoading, isSaving, hasLoadedChecklist, loadError, workOrder?.id,
    showRevisitPopup, showTemplateBuilder, showOtherPopup, discardWarning,
    unfinishedEditsWarning, validationDialog, incompleteWarning, noChecklistWarning, pendingDelete]);

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
  
  // The serialized diff only depends on the two arrays — recompute it when
  // they change, not on every render (each keystroke used to rescan the list).
  const checklistDirtyFromSnapshot = useMemo(
    () => JSON.stringify(checklist) !== JSON.stringify(loadedUiChecklistSnapshot),
    [checklist, loadedUiChecklistSnapshot]
  );
  const productsDirtyFromSnapshot = useMemo(
    () => JSON.stringify(products) !== JSON.stringify(loadedUiProductsSnapshot),
    [products, loadedUiProductsSnapshot]
  );

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
  const focusedNeedsInputSourceIdRef = useRef(null);
  const needsInputSummaryRef = useRef(null);
  const [checklistSearchQuery, setChecklistSearchQuery] = useState("");
  const checklistSearchInputRef = useRef(null);
  const [checklistSearchIndex, setChecklistSearchIndex] = useState(-1);
  const [focusedSearchId, setFocusedSearchId] = useState(null);
  const pendingNavigationFocusTimerRef = useRef(null);
  const navigationFocusVersionRef = useRef(0);

  const cancelPendingNavigationFocus = () => {
    navigationFocusVersionRef.current += 1;
    if (pendingNavigationFocusTimerRef.current !== null) {
      window.clearTimeout(pendingNavigationFocusTimerRef.current);
      pendingNavigationFocusTimerRef.current = null;
    }
  };
  const scheduleNavigationFocus = (focusCallback) => {
    cancelPendingNavigationFocus();
    const version = navigationFocusVersionRef.current;
    pendingNavigationFocusTimerRef.current = window.setTimeout(() => {
      pendingNavigationFocusTimerRef.current = null;
      if (navigationFocusVersionRef.current !== version) return;
      focusCallback();
    }, 0);
  };

  // Cancel queued focus before the checklist closes, switches work orders,
  // reloads, or yields to Template Builder / the Revisit confirmation.
  useLayoutEffect(() => {
    if (!isOpen || isLoading || showTemplateBuilder || showRevisitPopup || showOtherPopup) {
      cancelPendingNavigationFocus();
    }
    return cancelPendingNavigationFocus;
  }, [isOpen, isLoading, showTemplateBuilder, showRevisitPopup, showOtherPopup, workOrder?.id]);

  // Warning dialogs must keep focus inside their modal while displayed.
  useLayoutEffect(() => {
    if (incompleteWarning || validationDialog || noChecklistWarning || unfinishedEditsWarning) cancelPendingNavigationFocus();
  }, [incompleteWarning, validationDialog, noChecklistWarning, unfinishedEditsWarning]);

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

  // Active/completed grouping is checklist-derived. Expansion, search position,
  // inline editing, and dialog warnings should not rebuild the whole hierarchy.
  const { active: activeChecklist, completed: completedChecklist, searchIndex: checklistSearchIndexData } = useMemo(() => {
    const active = {};
    const completed = {};
    const searchIndex = [];
    const addSearchEntry = (item, productName, subTemplateName = "") => {
      const assignedTo = Array.isArray(item.assigned_to) ? item.assigned_to.join(" ") : item.assigned_to;
      const searchableText = [
        productName,
        subTemplateName,
        item.text,
        item.approved_by,
        item.custom_dropdown_value,
        assignedTo
      ].filter(Boolean).join(" ").toLowerCase();
      searchIndex.push({ item, productName, searchableText });
    };

    Object.entries(groupedChecklist).forEach(([productName, group]) => {
      active[productName] = { ...group, mainItems: [], subTemplates: {} };
      completed[productName] = { ...group, mainItems: [], subTemplates: {} };

      group.mainItems.forEach(item => {
        if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
          const isCompleted = dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed;
          (isCompleted ? completed : active)[productName].mainItems.push(item);
          if (!isCompleted) addSearchEntry(item, productName);
          return;
        }
        const parent = checklistItemById.get(item.parent_id);
        if (parent) {
          const parentCompleted = dropdownConditionByName.get(parent.custom_dropdown_value)?.is_completed;
          (parentCompleted ? completed : active)[productName].mainItems.push(item);
          if (!parentCompleted) addSearchEntry(item, productName);
        } else {
          active[productName].mainItems.push(item);
          addSearchEntry(item, productName);
        }
      });

      Object.entries(group.subTemplates).forEach(([stName, stItems]) => {
        active[productName].subTemplates[stName] = [];
        completed[productName].subTemplates[stName] = [];

        stItems.forEach(item => {
          if (!item.parent_id && (item.type === 'checklist' || !item.type)) {
            const isCompleted = dropdownConditionByName.get(item.custom_dropdown_value)?.is_completed;
            (isCompleted ? completed : active)[productName].subTemplates[stName].push(item);
            if (!isCompleted) addSearchEntry(item, productName, stName);
            return;
          }
          const parent = checklistItemById.get(item.parent_id);
          if (parent) {
            const parentCompleted = dropdownConditionByName.get(parent.custom_dropdown_value)?.is_completed;
            (parentCompleted ? completed : active)[productName].subTemplates[stName].push(item);
            if (!parentCompleted) addSearchEntry(item, productName, stName);
          } else {
            active[productName].subTemplates[stName].push(item);
            addSearchEntry(item, productName, stName);
          }
        });

        if (active[productName].subTemplates[stName].length === 0) delete active[productName].subTemplates[stName];
        if (completed[productName].subTemplates[stName].length === 0) delete completed[productName].subTemplates[stName];
      });

      if (active[productName].mainItems.length === 0 && Object.keys(active[productName].subTemplates).length === 0) delete active[productName];
      if (completed[productName].mainItems.length === 0 && Object.keys(completed[productName].subTemplates).length === 0) delete completed[productName];
    });

    return { active, completed, searchIndex };
  }, [groupedChecklist, dropdownConditionByName, checklistItemById]);

  // Build summary data in one pass only when checklist/status data changes.
  const {
    primaryChecklistItems,
    completedPrimaryCount,
    continuedPrimaryCount,
    needsInputPrimaryItems,
    taskItems,
    completedTaskCount,
    expandableChecklistIds,
  } = useMemo(() => {
    const primaryItems = [];
    const needsInputItems = [];
    const tasks = [];
    const expandableIds = [];
    let completedPrimary = 0;
    let continuedPrimary = 0;
    let completedTasks = 0;

    checklist.forEach(item => {
      if (item.type === 'task' || item.type === 'subtask') {
        tasks.push(item);
        if (item.approved_by) completedTasks += 1;
        return;
      }

      primaryItems.push(item);
      if (!item.parent_id && (item.type === 'checklist' || !item.type)) expandableIds.push(item.id);
      if (!item.approved_by || !item.custom_dropdown_value) {
        needsInputItems.push(item);
        return;
      }

      const condition = dropdownConditionByName.get(item.custom_dropdown_value);
      if (condition && !condition.is_completed) continuedPrimary += 1;
      else completedPrimary += 1;
    });

    return {
      primaryChecklistItems: primaryItems,
      completedPrimaryCount: completedPrimary,
      continuedPrimaryCount: continuedPrimary,
      needsInputPrimaryItems: needsInputItems,
      taskItems: tasks,
      completedTaskCount: completedTasks,
      expandableChecklistIds: expandableIds,
    };
  }, [checklist, dropdownConditionByName]);
  const needsInputPrimaryCount = needsInputPrimaryItems.length;
  const activeProductNames = useMemo(() => Object.keys(activeChecklist), [activeChecklist]);
  const needsInputNavigationIndex = useMemo(() => {
    const activeIds = new Set();
    const completedIds = new Set();
    const activeProductByItemId = new Map();

    Object.entries(activeChecklist).forEach(([productName, group]) => {
      group.mainItems.forEach(item => {
        activeIds.add(item.id);
        activeProductByItemId.set(item.id, productName);
      });
      Object.values(group.subTemplates).forEach(items => items.forEach(item => {
        activeIds.add(item.id);
        activeProductByItemId.set(item.id, productName);
      }));
    });

    Object.values(completedChecklist).forEach(group => {
      group.mainItems.forEach(item => completedIds.add(item.id));
      Object.values(group.subTemplates).forEach(items => items.forEach(item => completedIds.add(item.id)));
    });

    return { activeIds, completedIds, activeProductByItemId };
  }, [activeChecklist, completedChecklist]);
  const activeProductRenderGroups = useMemo(() => {
    const renderGroups = [];
    Object.entries(activeChecklist).forEach(([productName, group]) => {
      let primaryCount = 0;
      group.mainItems.forEach(item => {
        if (!item.parent_id && (item.type === 'checklist' || !item.type)) primaryCount += 1;
      });
      Object.values(group.subTemplates).forEach(items => {
        items.forEach(item => {
          if (!item.parent_id && (item.type === 'checklist' || !item.type)) primaryCount += 1;
        });
      });
      if (primaryCount > 0) renderGroups.push({ productName, group, primaryCount });
    });
    return renderGroups;
  }, [activeChecklist]);

  // Active search entries are built during the active/completed classification
  // pass above, avoiding a second traversal of every active checklist row.
  const normalizedChecklistSearch = checklistSearchQuery.trim().toLowerCase();
  const checklistSearchResults = useMemo(() => {
    if (!normalizedChecklistSearch) return [];
    const results = [];
    const seenIds = new Set();
    checklistSearchIndexData.forEach(entry => {
      if (seenIds.has(entry.item.id) || !entry.searchableText.includes(normalizedChecklistSearch)) return;
      seenIds.add(entry.item.id);
      results.push({ item: entry.item, productName: entry.productName });
    });
    return results;
  }, [checklistSearchIndexData, normalizedChecklistSearch]);

  // When checklist edits remove a navigated match, clear the stale cursor and
  // highlight. Keep focus in place when its row remains visible.
  useEffect(() => {
    if (!isOpen || isLoading || showTemplateBuilder || showRevisitPopup || showOtherPopup ||
        incompleteWarning || validationDialog || noChecklistWarning) return;

    if (focusedSearchId && !checklistSearchResults.some(({ item }) => item.id === focusedSearchId)) {
      setFocusedSearchId(null);
      setChecklistSearchIndex(-1);
      if (!needsInputNavigationIndex.activeIds.has(focusedSearchId)) {
        checklistSearchInputRef.current?.focus();
      }
    }

    if (focusedNeedsInputId && !needsInputPrimaryItems.some(item => item.id === focusedNeedsInputSourceIdRef.current)) {
      setFocusedNeedsInputId(null);
      // The summary can become disabled when its final missing answer is supplied.
      const stillRendered = Boolean(findRenderedChecklistItemElement([focusedNeedsInputId])?.getClientRects().length);
      if (!stillRendered) {
        (needsInputPrimaryCount > 0 ? needsInputSummaryRef.current : checklistSearchInputRef.current)?.focus();
      }
    }
  }, [isOpen, isLoading, showTemplateBuilder, showRevisitPopup, showOtherPopup,
    incompleteWarning, validationDialog, noChecklistWarning, focusedSearchId,
    checklistSearchResults, needsInputNavigationIndex, focusedNeedsInputId,
    needsInputPrimaryItems, needsInputPrimaryCount]);

  // A collapsed product, hierarchy, or Completed section can hide a navigated
  // row without a reliable blur event. Clear only a hidden result; do not take
  // focus away from a visible collapse button or another editor control.
  useEffect(() => {
    if (!isOpen || isLoading || showTemplateBuilder || showRevisitPopup || showOtherPopup ||
        incompleteWarning || validationDialog || noChecklistWarning) return;
    const hiddenSearch = focusedSearchId &&
      !findRenderedChecklistItemElement([focusedSearchId])?.getClientRects().length;
    const hiddenNeedsInput = focusedNeedsInputId &&
      !findRenderedChecklistItemElement([focusedNeedsInputId])?.getClientRects().length;
    if (!hiddenSearch && !hiddenNeedsInput) return;

    const activeElement = document.activeElement;
    const activeRow = activeElement?.closest?.("[data-sips-checklist-item-id]");
    const focusIsStranded = activeElement === document.body ||
      (activeRow && !activeRow.getClientRects().length);
    if (hiddenSearch) {
      setFocusedSearchId(null);
      setChecklistSearchIndex(-1);
    }
    if (hiddenNeedsInput) setFocusedNeedsInputId(null);
    if (focusIsStranded) {
      const destination = hiddenNeedsInput && needsInputPrimaryCount > 0
        ? needsInputSummaryRef.current
        : checklistSearchInputRef.current || checklistCloseButtonRef.current;
      destination?.focus();
    }
  }, [isOpen, isLoading, showTemplateBuilder, showRevisitPopup, showOtherPopup,
    incompleteWarning, validationDialog, noChecklistWarning, collapsedProducts,
    expandedItems, showCompletedItems, focusedSearchId, focusedNeedsInputId,
    needsInputPrimaryCount]);

  // Search typing and inline editor state cause frequent renders. Collapse-all
  // state should only be recomputed when the relevant hierarchy/state changes.
  const allDetailsCollapsed = useMemo(
    () => expandableChecklistIds.length > 0 && expandableChecklistIds.every(id => expandedItems[id] === false),
    [expandableChecklistIds, expandedItems]
  );
  const allProductsCollapsed = useMemo(
    () => activeProductNames.length > 0 && activeProductNames.every(productName => collapsedProducts[productName] === true),
    [activeProductNames, collapsedProducts]
  );

  if (isLoading) {
    // Previous checklist drafts may still exist while a retry runs. Do not
    // allow Escape or backdrop dismissal to bypass discard confirmation.
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none">
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!hasLoadedChecklist && loadError) {
    return (
      <Dialog open={isOpen} onOpenChange={() => {}}>
        <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] sm:max-w-lg [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Could not load SIP checklist</DialogTitle>
          </DialogHeader>
          <div ref={loadErrorAlertRef} role="alert" tabIndex={-1} aria-label="SIP checklist loading error" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
            <p>{loadError}</p>
            <p className="mt-2 text-xs">The checklist has not loaded. No items have been changed or saved. Retry to fetch the current Work Order.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Close</Button>
            <Button type="button" className="min-h-11" onClick={() => { if (!loadInFlightRef.current) { reloadSuccessFocusRequestRef.current = workOrder?.id; void loadData(); } }}>Retry loading checklist</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const toggleAllDetails = () => {
    const nextExpanded = { ...expandedItems };
    expandableChecklistIds.forEach(id => {
      nextExpanded[id] = allDetailsCollapsed;
    });
    setExpandedItems(nextExpanded);
  };
  const toggleAllProducts = () => {
    setCollapsedProducts(prev => {
      const nextCollapsed = { ...prev };
      activeProductNames.forEach(productName => {
        nextCollapsed[productName] = !allProductsCollapsed;
      });
      return nextCollapsed;
    });
  };
  const findRenderedChecklistItemElement = (candidateIds) => {
    const ids = candidateIds.filter(Boolean).map(String);
    for (const id of ids) {
      if (window.CSS?.escape) {
        const directMatch = document.querySelector(`[data-sips-checklist-item-id="${window.CSS.escape(id)}"]`);
        if (directMatch) return directMatch;
      }
    }
    // Fallback for browsers without CSS.escape. Keep the compatibility path
    // isolated so modern browsers avoid scanning every rendered checklist row.
    return Array.from(document.querySelectorAll("[data-sips-checklist-item-id]"))
      .find(element => ids.includes(element.dataset.sipsChecklistItemId)) || null;
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

    const { activeIds, completedIds, activeProductByItemId } = needsInputNavigationIndex;
    const target = needsInputPrimaryItems.find(item => activeIds.has(item.id)) || needsInputPrimaryItems[0];
    focusedNeedsInputSourceIdRef.current = target.id;
    const topLevelId = getTopLevelChecklistId(target);
    const isActiveTarget = activeIds.has(target.id);
    const scrollTargetId = isActiveTarget ? target.id : topLevelId;

    if (isActiveTarget) {
      const productName = activeProductByItemId.get(target.id);
      if (productName) {
        setCollapsedProducts(prev => ({ ...prev, [productName]: false }));
      }
      setExpandedItems(prev => ({ ...prev, [topLevelId]: true }));
    } else if (completedIds.has(target.id) || completedIds.has(topLevelId)) {
      setShowCompletedItems(true);
    }

    setFocusedNeedsInputId(scrollTargetId);
    scheduleNavigationFocus(() => {
      const targetElement = findRenderedChecklistItemElement([scrollTargetId]);
      if (!targetElement?.getClientRects().length) return;
      targetElement.focus({ preventScroll: true });
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
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

    scheduleNavigationFocus(() => {
      const targetElement = findRenderedChecklistItemElement([item.id, item.parent_id, topLevelId]);
      if (!targetElement?.getClientRects().length) return;
      targetElement.focus({ preventScroll: true });
      targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };
  const clearChecklistSearch = () => {
    cancelPendingNavigationFocus();
    setChecklistSearchQuery("");
    setChecklistSearchIndex(-1);
    setFocusedSearchId(null);
    checklistSearchInputRef.current?.focus();
  };
  const handleChecklistResultKeyDown = (e) => {
    if (e.key !== "Escape") return;
    if (!e.target?.hasAttribute?.("data-sips-checklist-item-id")) return;
    if (focusedSearchId && checklistSearchQuery) {
      e.preventDefault();
      clearChecklistSearch();
      return;
    }
    if (!focusedNeedsInputId) return;
    e.preventDefault();
    setFocusedNeedsInputId(null);
    needsInputSummaryRef.current?.focus();
  };
  const clearNavigationHighlightOutsideRow = (target) => {
    const targetRowId = target?.closest?.("[data-sips-checklist-item-id]")?.dataset?.sipsChecklistItemId || null;
    if (focusedSearchId && targetRowId !== String(focusedSearchId)) setFocusedSearchId(null);
    if (focusedNeedsInputId && targetRowId !== String(focusedNeedsInputId)) setFocusedNeedsInputId(null);
  };
  const handleChecklistResultBlurCapture = (e) => {
    const currentRow = e.target?.closest?.("[data-sips-checklist-item-id]");
    if (!currentRow) return;
    const nextRow = e.relatedTarget?.closest?.("[data-sips-checklist-item-id]");
    if (nextRow === currentRow) return;
    const currentRowId = currentRow.dataset.sipsChecklistItemId;
    if (focusedSearchId && currentRowId === String(focusedSearchId)) setFocusedSearchId(null);
    if (focusedNeedsInputId && currentRowId === String(focusedNeedsInputId)) setFocusedNeedsInputId(null);
  };
  const revisitDate = parseDateOnly(loadedRevisitDateSnapshot);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const revisitIsFuture = Boolean(revisitDate && revisitDate > today);
  const hasUnsubmittedDrafts = (
    (newItemInput.show && Boolean(newItemText.trim())) ||
    (showAddGeneralChecklist && Boolean(newGeneralChecklistText.trim())) ||
    (editingItemId !== null && editingItemText.trim() !== (checklistItemById.get(editingItemId)?.text || "").trim()) ||
    (editingProductName !== null && editingProductNameText.trim() !== editingProductName.trim()) ||
    Array.from(customStatusDraftsByItemIdRef.current.values()).some(value => Boolean(value?.trim()))
  );
  const hasUnsavedChecklistChanges = !isLoading && (
    checklistDirtyFromSnapshot || productsDirtyFromSnapshot || hasUnsubmittedDrafts
  );
  const hasPendingRevisitChoice = !isLoading &&
    failedRevisitWorkOrderIdRef.current === workOrder?.id &&
    failedRevisitSelectionRef.current !== undefined &&
    (failedRevisitSelectionRef.current || "") !== (loadedRevisitDateSnapshot || "");
  const hasUnsavedChanges = hasUnsavedChecklistChanges || hasPendingRevisitChoice;
  const getUnsubmittedDraftTarget = () => {
    if (newItemInput.show && newItemText.trim()) {
      return { kind: "new-item", itemId: newItemInput.parentId, productName: newItemInput.productName };
    }
    if (showAddGeneralChecklist && newGeneralChecklistText.trim()) return { kind: "general" };
    if (editingItemId !== null && editingItemText.trim() !== (checklistItemById.get(editingItemId)?.text || "").trim()) {
      return { kind: "edit-item", itemId: editingItemId };
    }
    if (editingProductName !== null && editingProductNameText.trim() !== editingProductName.trim()) {
      return { kind: "edit-product", productName: editingProductName };
    }
    const customItemId = Array.from(customStatusDraftsByItemIdRef.current.entries())
      .find(([, value]) => Boolean(value?.trim()))?.[0];
    return customItemId ? { kind: "custom", itemId: customItemId } : null;
  };
  const blockOnUnsubmittedDrafts = (action) => {
    if (!hasUnsubmittedDrafts) return false;
    unfinishedDraftTargetRef.current = getUnsubmittedDraftTarget();
    unfinishedEditsActionRef.current = action;
    setUnfinishedEditsWarning(action);
    return true;
  };
  const focusUnsubmittedDraft = () => {
    const target = unfinishedDraftTargetRef.current;
    unfinishedDraftTargetRef.current = null;
    if (!target || !isOpen || isLoading) return;
    const focusFallback = () => {
      const fallback = [checklistSearchInputRef.current, checklistCloseButtonRef.current]
        .find(element => element?.isConnected && !element.disabled && element.getClientRects().length);
      fallback?.focus();
    };
    const item = target.itemId ? checklistItemById.get(target.itemId) : null;
    if (target.itemId && !item) {
      focusFallback();
      return;
    }
    const productName = target.productName || item?.product_name;
    if (productName) setCollapsedProducts(prev => ({ ...prev, [productName]: false }));
    if (item) {
      const expand = {};
      let cursor = item;
      const visited = new Set();
      while (cursor && !visited.has(cursor.id)) {
        visited.add(cursor.id);
        expand[cursor.id] = true;
        cursor = checklistItemById.get(cursor.parent_id);
      }
      setExpandedItems(prev => ({ ...prev, ...expand }));
      if (needsInputNavigationIndex.completedIds.has(item.id)) setShowCompletedItems(true);
    }
    scheduleNavigationFocus(() => {
      if (target.kind === "custom") {
        if (!findRenderedChecklistItemElement([target.itemId])?.getClientRects().length) {
          focusFallback();
          return;
        }
        focusCustomDraftOnOpenRef.current = true;
        openOtherPopup(target.itemId);
        return;
      }
      const candidates = document.querySelectorAll('[data-sips-unsubmitted-draft="' + target.kind + '"]');
      const input = Array.from(candidates).find(node =>
        node.isConnected && !node.disabled && node.getClientRects().length
      );
      if (!input) {
        focusFallback();
        return;
      }
      input.focus({ preventScroll: true });
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const requestClose = () => {
    if (isSaving || saveInFlightRef.current) return;
    if (hasUnsavedChanges) {
      setDiscardWarning("close");
      return;
    }
    cancelPendingNavigationFocus();
    onClose();
  };
  const requestReloadLatest = () => {
    if (isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current) return;
    if (hasUnsavedChecklistChanges) {
      returnToReloadRef.current = true;
      setDiscardWarning("reload");
      return;
    }
    reloadSuccessFocusRequestRef.current = workOrder?.id;
    loadData();
  };
  const confirmDiscardChanges = () => {
    if (isSaving || saveInFlightRef.current || isLoading || loadInFlightRef.current) return;
    const action = discardWarning;
    returnToReloadRef.current = false;
    setDiscardWarning(null);
    cancelPendingNavigationFocus();
    if (action === "reload") {
      // Retain drafts through the request; only a verified replacement may
      // discard them. If loading fails, Retry is safe to attempt again.
      reloadSuccessFocusRequestRef.current = workOrder?.id;
      loadData();
    } else if (action === "close") {
      onClose();
    }
  };

  return (
    <>
      <Dialog open={isOpen && !showTemplateBuilder} onOpenChange={() => {}}>
        <DialogContent
          className="clay-card border-none w-[calc(100vw-1rem)] sm:w-full max-w-6xl max-h-[94vh] sm:max-h-[90vh] overflow-hidden flex flex-col p-3 sm:p-6 [&>button]:hidden"
          onPointerDownCapture={(e) => clearNavigationHighlightOutsideRow(e.target)}
        >
          <DialogHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <DialogTitle ref={reloadSuccessHeadingRef} tabIndex={-1} className="text-lg sm:text-xl font-bold flex items-center gap-2 flex-wrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 rounded-sm">
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
                    onClick={() => {
                      if (saveInFlightRef.current || loadInFlightRef.current || isSaving || isLoading) return;
                      cancelPendingNavigationFocus();
                      setShowTemplateBuilder(true);
                    }}
                    disabled={isSaving || isLoading || Boolean(loadError)}
                    className="w-full h-11 sm:w-auto sm:h-8"
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
              <button type="button"
                ref={needsInputSummaryRef}
                type="button"
                onClick={focusFirstNeedsInput}
                disabled={needsInputPrimaryCount === 0}
                className={`min-h-11 rounded-lg px-2 py-1 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 focus-visible:ring-offset-1 ${needsInputPrimaryCount > 0 ? "hover:bg-red-50 cursor-pointer" : "cursor-default"}`}
                title={needsInputPrimaryCount > 0 ? "Go to the first checklist item that still needs an approver or status" : "No checklist items need input"}
                aria-label={needsInputPrimaryCount > 0 ? `Needs input: ${needsInputPrimaryCount}. Go to the first checklist item that still needs input.` : "Needs input: 0"}
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
                    ref={checklistSearchInputRef}
                    value={checklistSearchQuery}
                    onChange={(e) => {
                      cancelPendingNavigationFocus();
                      setChecklistSearchQuery(e.target.value);
                      setChecklistSearchIndex(-1);
                      setFocusedSearchId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        navigateChecklistSearch(e.shiftKey ? -1 : 1);
                      } else if (e.key === "Escape" && checklistSearchQuery) {
                        e.preventDefault();
                        clearChecklistSearch();
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

          {loadError && (
            <div ref={loadErrorAlertRef} role="alert" tabIndex={-1} aria-label="SIP checklist loading error" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              <div className="font-medium">Checklist reload failed</div>
              <p className="mt-1 text-xs">{loadError}</p>
              <p className="mt-1 text-xs">The previous checklist and unsaved edits are preserved, but editing and saving are paused. If this job moved or was completed, close the checklist and refresh the SIPS board.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button type="button" variant="outline" className="min-h-11 border-red-300 bg-white text-red-800" onClick={requestReloadLatest} disabled={isLoading || isSaving}>Retry loading checklist</Button>
                <Button type="button" variant="outline" className="min-h-11 border-red-300 bg-white text-red-800" onClick={requestClose} disabled={isLoading || isSaving}>Close checklist</Button>
              </div>
              {hasUnsavedChanges && <p className="mt-2 text-xs">Closing will ask you to confirm before discarding unsaved edits.</p>}
            </div>
          )}

          {/* Checklist Items */}
          <div
            className="flex-1 overflow-y-auto space-y-3 pr-0.5"
            inert={isSaving || Boolean(loadError) ? "" : undefined}
            aria-busy={isSaving || Boolean(loadError)}
            onKeyDown={handleChecklistResultKeyDown}
            onBlurCapture={handleChecklistResultBlurCapture}
          >
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
                {activeProductRenderGroups.map(({ productName, group, primaryCount }) => (
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
                            data-sips-unsubmitted-draft="edit-product" value={editingProductNameText}
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
                            {primaryCount} open
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
                          data-sips-unsubmitted-draft="new-item" value={newItemText}
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
                        
                        const renderMeta = checklistRenderMetaById.get(rawItem.id);
                        if (!renderMeta) return null;
                        const { displayItem, isCompleted: isItemCompleted, attentionLabel } = renderMeta;
                        return (
                        <div data-sips-checklist-item-id={String(displayItem.id)} tabIndex={-1} key={displayItem.id} className={`clay-card p-3 ${isItemCompleted ? 'bg-green-100/70' : 'bg-white'} ${focusedNeedsInputId === displayItem.id ? 'ring-2 ring-red-400 ring-offset-2' : focusedSearchId === displayItem.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
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
                              <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') { setEditingItemId(null); } }} />
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
                            
                            {attentionLabel && (
                              <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                {attentionLabel}
                              </span>
                            )}

                            {/* Quick add buttons on hover */}
                            {isRegistered && (
                              <div className="basis-full sm:basis-auto flex justify-end sm:justify-start gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                <button
                                  type="button"
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
                                  type="button"
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
                                  openOtherPopup(displayItem.id);
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
                                {(dropdownOptionsByChecklistItemId.get(displayItem.id) || [])
                                  .map(dd => (
                                    <SelectItem key={dd.id} value={dd.name}>
                                      {dd.name} {dd.is_completed && '(Completed)'}
                                    </SelectItem>
                                  ))}
                                <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                              </SelectContent>
                            </Select>

                            {isRegistered && (
                              <div className="basis-full sm:basis-auto flex justify-end sm:justify-start">
                                <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(displayItem.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete checklist item ${displayItem.text || ""}`}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          {/* Expanded: Tasks and Details - expanded by default */}
                          {(expandedItems[displayItem.id] !== false) && (
                            <div className="ml-2 sm:ml-8 mt-2 space-y-2 border-l-2 border-gray-200 pl-2 sm:pl-3">
                              {/* Tasks under main item */}
                              {displayItem.tasks?.map(task => (
                              <div data-sips-checklist-item-id={String(task.id)} tabIndex={-1} key={task.id} className={`bg-orange-50 p-1 rounded border-l-2 border-orange-300 group ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                    <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                      <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                  <div className="basis-full sm:basis-auto flex flex-wrap items-center justify-end sm:justify-start gap-1">
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
                                </div>
                                {/* Subtasks */}
                                {(checklistChildrenByParentType.get(task.id)?.subtask || []).map(subtask => (
                                  <div data-sips-checklist-item-id={String(subtask.id)} tabIndex={-1} key={subtask.id} className={`ml-1 sm:ml-4 mt-0.5 flex flex-wrap sm:flex-nowrap items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/subtask ${focusedSearchId === subtask.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                      <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                        <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                  <div className="ml-1 sm:ml-4 mt-0.5 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-yellow-50 p-0.5 rounded">
                                    <Input
                                      data-sips-unsubmitted-draft="new-item" value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New subtask..."
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                              <div className="flex flex-wrap items-center justify-end sm:justify-start gap-2 bg-orange-50 p-2 rounded border-l-4 border-orange-400">
                                <Input
                                  data-sips-unsubmitted-draft="new-item" value={newItemText}
                                  onChange={(e) => setNewItemText(e.target.value)}
                                  placeholder="New task..."
                                  className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                                  <div className="flex flex-wrap items-center justify-end sm:justify-start gap-2">
                                    <Input
                                      data-sips-unsubmitted-draft="new-item" value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New detail..."
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                                const detailRenderMeta = checklistRenderMetaById.get(detail.id);
                                const isDetailCompleted = detailRenderMeta?.isCompleted || false;
                                const detailAttentionLabel = detailRenderMeta?.attentionLabel || null;
                                return (
                                <div data-sips-checklist-item-id={String(detail.id)} tabIndex={-1} key={detail.id} className={`p-2 rounded border group/detail ${isDetailCompleted ? 'bg-green-100/70' : 'bg-gray-50'} ${focusedNeedsInputId === detail.id ? 'ring-2 ring-red-400 ring-offset-1' : focusedSearchId === detail.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                    {editingItemId === detail.id ? (
                                      <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                        <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                    {detailAttentionLabel && (
                                      <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                        {detailAttentionLabel}
                                      </span>
                                    )}

                                    {/* Quick add task button for detail */}
                                    {isRegistered && (
                                      <div className="basis-full sm:basis-auto flex justify-end sm:justify-start gap-1">
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: displayItem.product_name || productName }); }}
                                          className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 md:opacity-0 md:group-hover/detail:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                          title="Add Task"
                                          aria-label={`Add task under ${detail.text || "detail"}`}
                                        >
                                          +Task
                                        </button>
                                      </div>
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
                                          openOtherPopup(detail.id);
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
                                        {(dropdownOptionsByChecklistItemId.get(detail.id) || [])
                                          .map(dd => (
                                            <SelectItem key={dd.id} value={dd.name}>
                                              {dd.name} {dd.is_completed && '(Completed)'}
                                            </SelectItem>
                                          ))}
                                        <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                      </SelectContent>
                                    </Select>

                                    {isRegistered && (
                                      <div className="basis-full sm:basis-auto flex justify-end sm:justify-start">
                                        <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete detail ${detail.text || ""}`}>
                                          <Trash2 className="w-3 h-3" />
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Inline add task for detail */}
                                  {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                    <div className="ml-1 sm:ml-4 mt-2 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-2 bg-orange-50 p-1.5 rounded">
                                      <Input
                                        data-sips-unsubmitted-draft="new-item" value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New task..."
                                        className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                                    <div className="ml-1 sm:ml-4 mt-1 space-y-0.5 border-l border-orange-200 pl-1.5">
                                      {detail.tasks.map(task => (
                                        <div data-sips-checklist-item-id={String(task.id)} tabIndex={-1} key={task.id} className={`bg-orange-50 p-0.5 rounded group/dtask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                              <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                                <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                            <div className="basis-full sm:basis-auto flex flex-wrap items-center justify-end sm:justify-start gap-1">
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
                                          </div>
                                          {/* Subtasks under detail task */}
                                          {(checklistChildrenByParentType.get(task.id)?.subtask || []).map(subtask => (
                                            <div data-sips-checklist-item-id={String(subtask.id)} tabIndex={-1} key={subtask.id} className={`ml-1 sm:ml-3 mt-0.5 flex flex-wrap sm:flex-nowrap items-center gap-1 bg-yellow-50 p-0.5 rounded text-xs group/dsub ${focusedSearchId === subtask.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                      <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                        <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                            <div className="ml-1 sm:ml-3 mt-0.5 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-yellow-50 p-0.5 rounded">
                                              <Input
                                                data-sips-unsubmitted-draft="new-item" value={newItemText}
                                                onChange={(e) => setNewItemText(e.target.value)}
                                                placeholder="New subtask..."
                                                className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                    <div key={stName} className="ml-0 sm:ml-4 mt-2 border-l-2 border-blue-300 pl-2 sm:pl-3">
                      <h4 className="text-sm font-semibold text-blue-700 mb-2">🔗 {stName}</h4>
                      <div className="space-y-2">
                        {stItems.map(rawItem => {
                          if (rawItem.parent_id && (rawItem.type === 'task' || rawItem.type === 'detail' || rawItem.type === 'subtask')) return null;
                          const renderMeta = checklistRenderMetaById.get(rawItem.id);
                          if (!renderMeta) return null;
                          const { displayItem: stDisplayItem, isCompleted: isStItemCompleted, attentionLabel } = renderMeta;
                          return (
                          <div data-sips-checklist-item-id={String(stDisplayItem.id)} tabIndex={-1} key={stDisplayItem.id} className={`clay-card p-2 ${isStItemCompleted ? 'bg-green-100/70' : 'bg-white'} ${focusedNeedsInputId === stDisplayItem.id ? 'ring-2 ring-red-400 ring-offset-2' : focusedSearchId === stDisplayItem.id ? 'ring-2 ring-blue-400 ring-offset-2' : ''}`}>
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
                                <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                  <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-sm flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                              {attentionLabel && (
                                <span className="text-[10px] font-medium rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 whitespace-nowrap">
                                  {attentionLabel}
                                </span>
                              )}

                              {/* Quick add buttons on hover for sub-templates */}
                              {isRegistered && (
                                <div className="basis-full sm:basis-auto flex justify-end sm:justify-start gap-1 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 transition-opacity">
                                  <button
                                    type="button"
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
                                    type="button"
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
                                    openOtherPopup(stDisplayItem.id);
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
                                  {(dropdownOptionsByChecklistItemId.get(stDisplayItem.id) || [])
                                    .map(dd => (
                                      <SelectItem key={dd.id} value={dd.name}>
                                        {dd.name} {dd.is_completed ? '(Completed)' : '(Continued)'}
                                      </SelectItem>
                                    ))}
                                  <SelectItem value="other" className="text-purple-600 font-medium">+ Other...</SelectItem>
                                </SelectContent>
                              </Select>

                              {isRegistered && (
                                <div className="basis-full sm:basis-auto flex justify-end sm:justify-start">
                                  <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(stDisplayItem.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500" aria-label={`Delete checklist item ${stDisplayItem.text || ""}`}>
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>

                            {/* Expanded content for sub-template items - expanded by default */}
                            {(expandedItems[stDisplayItem.id] !== false) && (
                              <div className="ml-2 sm:ml-6 mt-2 space-y-1 border-l-2 border-gray-200 pl-2">
                                {stDisplayItem.tasks?.map(task => (
                                  <div data-sips-checklist-item-id={String(task.id)} tabIndex={-1} key={task.id} className={`flex flex-wrap items-center gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400 group/sttask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                      <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                        <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                    <div className="basis-full sm:basis-auto flex flex-wrap items-center justify-end sm:justify-start gap-1">
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
                                  </div>
                                ))}
                                
                                {/* Inline add task for sub-template */}
                                {newItemInput.show && newItemInput.parentId === stDisplayItem.id && newItemInput.type === 'task' && (
                                  <div className="flex flex-wrap items-center justify-end sm:justify-start gap-2 bg-orange-50 p-1.5 rounded border-l-4 border-orange-400">
                                    <Input
                                      data-sips-unsubmitted-draft="new-item" value={newItemText}
                                      onChange={(e) => setNewItemText(e.target.value)}
                                      placeholder="New task..."
                                      className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                                  <div data-sips-checklist-item-id={String(detail.id)} tabIndex={-1} key={detail.id} className={`bg-gray-50 p-1.5 rounded text-xs group/stdetail ${focusedNeedsInputId === detail.id ? 'ring-2 ring-red-400 ring-offset-1' : focusedSearchId === detail.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
                                    <div className="flex flex-wrap items-center gap-1">
                                      <span className="px-1 py-0.5 rounded bg-purple-100 text-purple-700">Detail</span>
                                      {editingItemId === detail.id ? (
                                        <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                          <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                        <div className="basis-full sm:basis-auto flex justify-end sm:justify-start gap-1">
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); setNewItemInput({ show: true, parentId: detail.id, type: 'task', productName: stDisplayItem.product_name || productName }); }}
                                            className="h-11 md:h-7 px-2 md:px-1.5 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200 md:opacity-0 md:group-hover/stdetail:opacity-100 md:focus:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
                                            title="Add Task"
                                            aria-label={`Add task under ${detail.text || "detail"}`}
                                          >
                                            +Task
                                          </button>
                                          <Button variant="ghost" size="sm" onClick={() => deleteChecklistItem(detail.id)} className="h-11 w-11 md:h-7 md:w-7 p-0 text-red-500 md:opacity-0 md:group-hover/stdetail:opacity-100 md:focus:opacity-100" aria-label={`Delete detail ${detail.text || ""}`}>
                                            <Trash2 className="w-2.5 h-2.5" />
                                          </Button>
                                        </div>
                                      )}
                                    </div>
                                    {/* Inline add task for sub-template detail */}
                                    {newItemInput.show && newItemInput.parentId === detail.id && newItemInput.type === 'task' && (
                                      <div className="ml-1 sm:ml-4 mt-1 flex flex-wrap sm:flex-nowrap items-center justify-end sm:justify-start gap-1 bg-orange-50 p-1 rounded">
                                        <Input
                                          data-sips-unsubmitted-draft="new-item" value={newItemText}
                                          onChange={(e) => setNewItemText(e.target.value)}
                                          placeholder="New task..."
                                          className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                                      <div className="ml-1 sm:ml-4 mt-1 space-y-0.5">
                                        {detail.tasks.map(task => (
                                          <div data-sips-checklist-item-id={String(task.id)} tabIndex={-1} key={task.id} className={`flex flex-wrap sm:flex-nowrap items-center gap-1 bg-orange-50 p-0.5 rounded group/stdtask ${focusedSearchId === task.id ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}>
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
                                              <div className="flex-1 basis-full sm:basis-auto flex gap-1 min-w-0">
                                                <Input data-sips-unsubmitted-draft="edit-item" value={editingItemText} onChange={(e) => setEditingItemText(e.target.value)} className="h-11 md:h-7 text-xs flex-1 min-w-0" autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveEditItem(); if (e.key === 'Escape') setEditingItemId(null); }} />
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
                                    <div className="flex flex-wrap items-center justify-end sm:justify-start gap-1">
                                      <Input
                                        data-sips-unsubmitted-draft="new-item" value={newItemText}
                                        onChange={(e) => setNewItemText(e.target.value)}
                                        placeholder="New detail..."
                                        className="h-11 md:h-7 text-xs flex-1 min-w-0 basis-full sm:basis-auto"
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
                        dropdownOptionsByChecklistItemId={dropdownOptionsByChecklistItemId}
                        users={users}
                        isRegistered={isRegistered}
                        updateChecklistItem={updateChecklistItem}
                        applyChecklistStatus={applyChecklistStatus}
                        openOtherPopup={openOtherPopup}
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
            <div className="p-3 bg-gray-50 rounded-lg border mb-3" inert={isSaving ? "" : undefined}>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  data-sips-unsubmitted-draft="general" value={newGeneralChecklistText}
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
          {isSaving && (
            <div role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Saving SIP checklist… Editing is temporarily unavailable.
            </div>
          )}
          {saveError && (
            <div ref={saveErrorAlertRef} role="alert" tabIndex={-1} aria-label="SIP checklist save error" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
              <div className="font-medium">{saveOutcomeUncertain ? "SIP checklist save needs verification" : "SIP product checklist save blocked"}</div>
              <div className="mt-1 text-xs">{saveError}</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="text-xs text-red-700">{saveOutcomeUncertain ? "Save and Complete are paused until Reload latest confirms the server record. Local edits remain here until a successful reload." : "Reloading replaces local edits with the latest saved Work Order. Unsaved changes require confirmation."}</span>
                <Button ref={reloadLatestButtonRef} type="button" size="sm" variant="outline" onClick={requestReloadLatest} disabled={isLoading || isSaving} className="h-11 w-full shrink-0 border-red-300 bg-white text-red-800 sm:h-8 sm:w-auto">
                  {isLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                  Reload latest
                </Button>
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 sm:flex gap-2 sm:gap-3 pt-3 sm:pt-4 border-t">
            <Button ref={checklistCloseButtonRef} variant="outline" onClick={requestClose} disabled={isSaving} className="sm:flex-1 h-11 sm:h-10">
              Cancel
            </Button>
            {isRegistered && (
              <Button
                variant="outline"
                onClick={() => { if (!saveInFlightRef.current && !loadInFlightRef.current && !isSaving && !isLoading) setShowAddGeneralChecklist(true); }}
                disabled={isSaving || isLoading || Boolean(loadError)}
                className="sm:flex-1 h-11 sm:h-10"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Item
              </Button>
            )}
            {isRegistered && !loadedSipCompletedSnapshot && (
              <Button
                ref={completeButtonRef}
                onClick={handleCheckOff}
                disabled={isSaving || Boolean(loadError) || saveOutcomeUncertain}
                className="sm:flex-1 h-11 sm:h-10 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Complete
              </Button>
            )}
            <Button
              ref={saveRevisitButtonRef}
              onClick={handleSaveClick}
              disabled={isSaving || !isRegistered || Boolean(loadError) || saveOutcomeUncertain}
              className="sm:flex-1 h-11 sm:h-10 bg-blue-600 hover:bg-blue-700"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
              {isSaving ? "Saving…" : "Save & Revisit"}
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
        retryDate={pendingRevisitRetry}
        returnFocusRef={saveRevisitButtonRef}
        onSubmittedCloseAutoFocus={focusSaveFailureIfReady}
      />

      {/* Unsubmitted text must be applied or cancelled before any SIP save. */}
      <AlertDialog open={!!unfinishedEditsWarning} onOpenChange={(open) => { if (!open) setUnfinishedEditsWarning(null); }}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            if (!isOpen) return;
            event.preventDefault();
            unfinishedEditsActionRef.current = null;
            focusUnsubmittedDraft();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              Finish unfinished checklist text first
            </AlertDialogTitle>
            <AlertDialogDescription>
              A checklist item, product name, or custom status still has unfinished text. Add or apply the inline edit (or cancel it) before {unfinishedEditsWarning === "complete" ? "completing this SIP" : "saving and choosing a Revisit date"}. To clear an earlier custom-status draft, reopen Other for that row and erase the text. Nothing has been discarded.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setUnfinishedEditsWarning(null)} className="h-11 sm:h-9">Keep Editing</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Incomplete Warning */}
      <AlertDialog open={!!incompleteWarning} onOpenChange={() => setIncompleteWarning(null)}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            if (!isOpen) return;
            event.preventDefault();
            if (completeButtonRef.current?.isConnected && !completeButtonRef.current.disabled) {
              completeButtonRef.current.focus();
            }
          }}
        >
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
            <AlertDialogCancel className="h-11 sm:h-9">OK</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved changes warning */}
      <AlertDialog open={!!discardWarning} onOpenChange={(open) => { if (!open) setDiscardWarning(null); }}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            if (!returnToReloadRef.current) return;
            returnToReloadRef.current = false;
            event.preventDefault();
            const button = reloadLatestButtonRef.current;
            if (isOpen && button?.isConnected && !button.disabled && button.getClientRects().length) button.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-500" />
              {discardWarning === "reload" ? "Discard edits and reload latest?" : "Discard unsaved SIP changes?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {discardWarning === "reload"
                ? "Your unsaved checklist answers, items, product edits, and unfinished text will be lost. Reload latest replaces this view with the saved Work Order. A previously unconfirmed Revisit choice stays available for your next explicit Save & Revisit review if the server has not saved it. Keep Editing preserves everything here."
                : hasPendingRevisitChoice
                  ? "Your last Revisit choice has not been confirmed on the server. Closing will discard that choice, along with any unsaved checklist answers, assignments, items, products, or unfinished text. Keep Editing preserves them here."
                  : "Checklist answers, assignments, items, products, or unfinished text entered here have not been saved. Leaving now will discard them."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 sm:h-9">Keep Editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDiscardChanges}
              disabled={isSaving || isLoading}
              className="h-11 bg-red-600 hover:bg-red-700 sm:h-9"
            >
              {discardWarning === "reload" ? "Discard & Reload" : "Discard Changes"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Checklist item deletion */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            // Only confirmed deletion needs focus recovery. On Cancel,
            // preserve Radix's normal return-to-trigger behavior.
            if (!deleteFocusRecoveryRef.current) return;
            event.preventDefault();
            deleteFocusRecoveryRef.current = false;
            scheduleNavigationFocus(() => {
              // Search disappears when the last checklist row is deleted.
              const fallback = checklistSearchInputRef.current || checklistCloseButtonRef.current;
              if (fallback && !fallback.disabled) fallback.focus();
            });
          }}
        >
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
            <AlertDialogCancel className="h-11 sm:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteChecklistItem} className="h-11 bg-red-600 hover:bg-red-700 sm:h-9">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Validation guidance */}
      <AlertDialog open={!!validationDialog} onOpenChange={(open) => { if (!open) setValidationDialog(null); }}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            // Release only after the warning fully closes, never on an early OK
            // click: otherwise a rapid second attempt can replace this target.
            otherPopupValidationPendingRef.current = false;
            if (!isOpen || isLoading || staleValidationFocusRef.current) {
              event.preventDefault();
              validationFocusItemIdRef.current = null;
              otherPopupValidationReturnRef.current = null;
              return;
            }
            event.preventDefault();
            const itemId = validationFocusItemIdRef.current;
            validationFocusItemIdRef.current = null;
            // When validation came from the custom-status popup, its input or
            // option is the return target—not a checklist control behind it.
            const returnToOtherPopup = Boolean(itemId && showOtherPopup?.itemId === itemId);
            const popupTarget = returnToOtherPopup
              ? [otherPopupValidationReturnRef.current, customStatusInputRef.current]
                .find(target => target?.isConnected && !target.disabled &&
                  target.getClientRects().length)
              : null;
            otherPopupValidationReturnRef.current = null;
            if (popupTarget) {
              popupTarget.focus();
              return;
            }
            const targetRow = itemId ? findRenderedChecklistItemElement([itemId]) : null;
            const statusControl = targetRow?.querySelector('[aria-label^="Status for "]');
            const focusTarget = statusControl?.getClientRects().length && !statusControl.disabled
              ? statusControl
              : checklistSearchInputRef.current || checklistCloseButtonRef.current;
            if (focusTarget?.isConnected && !focusTarget.disabled) focusTarget.focus();
          }}
        >
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
            <AlertDialogAction onClick={() => setValidationDialog(null)} className="h-11 sm:h-9">OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* No Checklist Warning */}
      <AlertDialog open={!!noChecklistWarning} onOpenChange={() => setNoChecklistWarning(null)}>
        <AlertDialogContent
          className="clay-card border-none"
          onCloseAutoFocus={(event) => {
            if (!isOpen) return;
            event.preventDefault();
            if (completingWithoutChecklistRef.current) {
              completingWithoutChecklistRef.current = false;
              return;
            }
            if (completeButtonRef.current?.isConnected && !completeButtonRef.current.disabled) {
              completeButtonRef.current.focus();
            }
          }}
        >
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
            <AlertDialogCancel className="h-11 sm:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={proceedWithCheckOff} disabled={isSaving} className="h-11 bg-green-600 hover:bg-green-700 sm:h-9">
              {isSaving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Yes, Mark Complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Other Dropdown Popup */}
      <OtherDialog open={!!showOtherPopup} onOpenChange={(open) => { if (!open) dismissOtherPopup(); }}>
        <OtherDialogContent
          inert={isSaving ? "" : undefined}
          className="max-w-md clay-card border-none [&>button]:h-11 [&>button]:w-11 [&>button]:inline-flex [&>button]:items-center [&>button]:justify-center sm:[&>button]:h-9 sm:[&>button]:w-9"
          onOpenAutoFocus={(event) => {
            if (!focusCustomDraftOnOpenRef.current) return;
            focusCustomDraftOnOpenRef.current = false;
            const input = customStatusInputRef.current;
            if (input?.isConnected && !input.disabled) {
              event.preventDefault();
              input.focus();
            }
          }}
          onCloseAutoFocus={handleOtherPopupCloseAutoFocus}
        >
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
                    <button
                      type="button"
                      key={dd.id}
                      onClick={(event) => {
                        if (!showOtherPopup?.itemId || otherPopupValidationPendingRef.current || validationDialog) return;
                        otherPopupValidationReturnRef.current = event.currentTarget;
                        if (applyChecklistStatus(showOtherPopup.itemId, dd.name, { fromOtherPopup: true })) {
                          otherPopupValidationReturnRef.current = null;
                          otherPopupDismissedRef.current = true;
                          customStatusDraftsByItemIdRef.current.delete(showOtherPopup.itemId);
                          setCustomDropdownValue("");
                          setShowOtherPopup(null);
                        }
                      }}
                      className={`w-full min-h-11 p-3 border-b last:border-b-0 hover:bg-purple-50 cursor-pointer flex items-center gap-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 focus-visible:ring-inset ${dd.is_completed ? 'bg-green-50' : 'bg-yellow-50'}`}
                      aria-label={`Use ${dd.name} status, ${dd.is_completed ? 'Completed' : 'Continued'}`}
                    >
                      <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${dd.is_completed ? 'bg-green-500' : 'bg-yellow-500'}`}>
                        {dd.is_completed ? <CheckCircle2 className="w-4 h-4 text-white" /> : <List className="w-4 h-4 text-white" />}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="font-medium">{dd.name}</span>
                        <span className={`ml-2 text-xs px-1.5 py-0.5 rounded ${dd.is_completed ? 'bg-green-200 text-green-800' : 'bg-yellow-200 text-yellow-800'}`}>
                          {dd.is_completed ? 'Completed' : 'Continued'}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="text-sm font-medium mb-2 block">Or Enter Custom Value</Label>
              <div className="flex gap-2">
                <Input
                  ref={customStatusInputRef}
                  value={customDropdownValue}
                  onChange={(e) => updateCustomStatusDraft(e.target.value)}
                  placeholder="Type custom value..."
                  className="h-11 flex-1 min-w-0 sm:h-9"
                  onKeyDown={(e) => e.key === 'Enter' && showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)}
                />
                <Button 
                  onClick={() => showOtherPopup?.itemId && handleCreateCustomValue(showOtherPopup.itemId)} 
                  disabled={!customDropdownValue.trim()}
                  className="h-11 bg-purple-600 hover:bg-purple-700 sm:h-9"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Use
                </Button>
              </div>
            </div>
          </div>

          <OtherDialogFooter>
            <Button variant="outline" onClick={dismissOtherPopup} className="h-11 sm:h-9">
              Cancel
            </Button>
          </OtherDialogFooter>
        </OtherDialogContent>
      </OtherDialog>
    </>
  );
}