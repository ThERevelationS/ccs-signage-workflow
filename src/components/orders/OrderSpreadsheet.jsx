import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { orderSaveRecoveryAction } from "@/components/orders/orderSaveRecoveryAction.mjs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { staffEntities } from "@/components/staff/staffEntities";
import { isFleetCoolingDown } from "@/components/fleet/fleetInvoke";
import { fetchAllWorkOrders } from "@/lib/workOrderCache";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  try {
    // Handle yyyy-MM-dd format
    if (typeof dateString === 'string' && dateString.includes('-')) {
      const [year, month, day] = dateString.split('-').map(Number);
      if (year && month && day) {
        return new Date(year, month - 1, day);
      }
    }
    // Try parsing as regular date
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      return date;
    }
    return undefined;
  } catch {
    return undefined;
  }
};

// Local yyyy-MM-dd for due checks and same-day quick actions.
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Safe format date for display
const safeFormatDate = (dateString, formatStr) => {
  const date = parseLocalDate(dateString);
  if (!date) return "-";
  try {
    return format(date, formatStr);
  } catch {
    return "-";
  }
};
import {
  Plus,
  Trash2,
  Link as LinkIcon,
  Loader2,
  Pencil,
  X,
  Expand,
  ExternalLink,
  Save,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Archive,
  ShoppingCart,
  PackageCheck,
  AlertTriangle
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel
} from "@/components/ui/alert-dialog";
import { NotificationTriggers } from "@/components/workflow/NotificationService";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import { CellContextMenu, useCellHistoryTracker } from "@/components/shared/CellContextMenu";
import OrderMobileCards from "@/components/orders/OrderMobileCards";
import OrderMobileDetail from "@/components/orders/OrderMobileDetail";
import OrderDuplicateReview from "@/components/orders/OrderDuplicateReview";
import OrderLinkedCustomerReview from "@/components/orders/OrderLinkedCustomerReview";
import { filterOrderCustomerJobs, verifyActiveOrderCustomerJob, orderCustomerJobSubtitle } from "@/components/orders/orderCustomerJobPicker.mjs";
import { isStaleVerifiedOrderCustomerBlur } from "@/components/orders/orderCustomerBlurSafety.mjs";
import { shouldUnlinkOrderJobForTypedCustomer, orderAfterTypedCustomerName, pendingAfterManualCustomerBlur } from "@/components/orders/orderCustomerAssociationSafety.mjs";
import { orderHistoryLayout } from "@/components/orders/orderHistoryLayout";
import { remainingOrderPendingAfterImmediateSave } from "@/components/orders/orderImmediatePending.mjs";
import { pushSavedOrdersToSmartsheet, pullOrdersFromSmartsheet, summarizeSavedOrderSync } from "@/components/orders/orderSaveSync";
import { durablePendingOrderIds } from "@/components/orders/orderSyncReconnect.mjs";
import { ORDER_SAVE_SYNC_BATCH_LIMIT, OrderSaveSyncBatchLimitError, orderSaveSyncBatchMessage } from "@/components/orders/orderSaveSyncBatch.mjs";
import { verifyUncertainOrderSyncReadback } from "@/components/orders/orderUncertainSyncReadback.mjs";
import { canClearCompletedOrderSyncTarget } from "@/components/orders/orderSyncCompletionSafety.mjs";
import { canCommitOrderReload } from "@/components/orders/orderReloadSafety.mjs";
import { canUseOrderExport } from "@/shared/orderExportAccess.mjs";
import { effectiveOrderStatus, isFulfilledOrder, orderMatchesReceivedFilter, orderStatusAfterOrderedDateChange } from "@/shared/smartsheetOrderReceivedState.mjs";
import { orderDueState } from "@/shared/orderDueState.mjs";
import { ColumnHeaderContextMenu, useColumnSorting } from "@/components/shared/ColumnHeaderContextMenu";
import { useMultiImport } from "@/components/shared/MultiImportContext";

import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  createOrderWithRecovery,
  replaceOrderFieldsIfUnchanged,
  softDeleteOrderFromLoadedSnapshot,
} from "@/components/orders/orderPersistence";


const Order = staffEntities.Order;
const WorkOrder = staffEntities.WorkOrder;
const AuthorizedEmail = staffEntities.AuthorizedEmail;
const GlobalSettings = staffEntities.GlobalSettings;

const ORDER_REQUEST_TYPES_SETTING_KEY = "orderRequestTypes";
const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];

function normalizeOrderRequestTypes(values) {
  const source = Array.isArray(values) ? values : [];
  const seen = new Set();
  const normalized = [];
  for (const value of source) {
    const label = String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(label);
    if (normalized.length >= 100) break;
  }
  return normalized;
}
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];
const ORDER_AUX_RELOAD_MS = 5 * 60 * 1000;
const ORDER_FOCUS_RELOAD_THROTTLE_MS = 15 * 1000;

const OrderSpreadsheet = React.forwardRef(({ workOrderFilter = null, compact = false, searchTerm = "", filterStatus = "all", focusOrderId = "", onSaveStatusChange = null, showButtonsInline = true, canOrderExport = false }, ref) => {
  const { currentUser, sessionToken, isRegistered } = useAuth();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [editingCell, setEditingCell] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [lastSyncDirection, setLastSyncDirection] = useState("");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [linkedNameReview, setLinkedNameReview] = useState({ count: 0, items: [] });
  const [lastSaved, setLastSaved] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [focusedRowId, setFocusedRowId] = useState(null);
  const [focusedRowIndex, setFocusedRowIndex] = useState(null);
  const [headerContextMenu, setHeaderContextMenu] = useState(null);

  // Use the column sorting hook with user-specific storage
  const { 
    sortConfig, 
    handleSort: handleColumnSort, 
    handleCustomSort, 
    clearSort,
    applySortAndFilter 
  } = useColumnSorting('orderForm', currentUser?.email);

  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(null);
  const activeCustomerPickerRef = useRef(null);
  const customerSelectionInFlightRef = useRef(false);
  const verifiedCustomerSelectionRef = useRef(new Map()); // Ignore old typed-name blur after verified job selection.
  const manuallyUnlinkedCustomerOrderIdsRef = useRef(new Set()); // Stage unlink with the name on blur, never midway through typing.
  const [checkingCustomerJobId, setCheckingCustomerJobId] = useState(null);
  const [showRequestorDropdown, setShowRequestorDropdown] = useState(null);

  // Only an actual outside interaction, leaving the picker with the keyboard,
  // Escape, or choosing a job closes it; no delayed blur timer can race focus.
  useEffect(() => {
    if (!showCustomerDropdown) return;
    const closeOnOutsidePointer = (event) => {
      if (!activeCustomerPickerRef.current?.contains(event.target)) {
        setShowCustomerDropdown(null);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [showCustomerDropdown]);

  const [editingRequestTypes, setEditingRequestTypes] = useState(false);
  const [editingVendors, setEditingVendors] = useState(false);
  const [requestTypes, setRequestTypes] = useState(DEFAULT_REQUEST_TYPES);
  const [requestTypeSetting, setRequestTypeSetting] = useState(null);
  const [requestTypesSaving, setRequestTypesSaving] = useState(false);
  const [requestTypesError, setRequestTypesError] = useState("");
  const [vendors, setVendors] = useState(() => {
    const saved = localStorage.getItem('orderVendors');
    return saved ? JSON.parse(saved) : DEFAULT_VENDORS;
  });
  const [receiptOptions, setReceiptOptions] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('orderReceiptOptions') || '[]');
      return ['In Stock', ...saved.filter(option => typeof option === 'string' && option.trim() && option.toLowerCase() !== 'in stock')];
    } catch { return ['In Stock']; }
  });
  const [newReceiptOption, setNewReceiptOption] = useState('');
  const [newRequestType, setNewRequestType] = useState("");
  const [newVendor, setNewVendor] = useState("");

  useEffect(() => {
    let active = true;
    const loadRequestTypes = async () => {
      try {
        const rows = await GlobalSettings.filter({ setting_key: ORDER_REQUEST_TYPES_SETTING_KEY });
        if (!active) return;
        if (!Array.isArray(rows)) throw new Error("Order item-type settings did not return a record list.");
        if (rows.length > 1) {
          throw new Error(`Order item types have ${rows.length} shared settings records. Ask an admin to resolve the duplicate settings.`);
        }
        const setting = rows[0] || null;
        setRequestTypeSetting(setting);
        const sharedTypes = normalizeOrderRequestTypes(setting?.setting_value?.items);
        if (sharedTypes.length) {
          setRequestTypes(sharedTypes);
          return;
        }

        // Preserve an admin's old browser-only list as a one-time migration
        // seed. It is not shared until that admin saves a change through the
        // verified Base44 + Smartsheet path below.
        if (currentUser?.role === "admin") {
          try {
            const legacyTypes = normalizeOrderRequestTypes(JSON.parse(localStorage.getItem('orderRequestTypes') || '[]'));
            if (legacyTypes.length) {
              setRequestTypes(legacyTypes);
              return;
            }
          } catch { /* ignore malformed legacy browser storage */ }
        }
        setRequestTypes(DEFAULT_REQUEST_TYPES);
      } catch (error) {
        if (!active) return;
        setRequestTypesError(error?.message || "Order item types could not be loaded.");
        setRequestTypes(DEFAULT_REQUEST_TYPES);
      }
    };
    loadRequestTypes();
    return () => { active = false; };
  }, [currentUser?.role]);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [expandedDescription, setExpandedDescription] = useState(null);
  const [mobileDetailOrderId, setMobileDetailOrderId] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [validationError, setValidationError] = useState(null);
  const [editingCustomerName, setEditingCustomerName] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const { startImport: startMultiImport, updateImport, finishImport } = useMultiImport();
  const [clearDateConfirm, setClearDateConfirm] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const { trackChange } = useCellHistoryTracker("Order", currentUser);
  const pendingChangesRef = useRef({}); // Track changes per order ID
  const pendingSyncIdsRef = useRef(new Set()); // Saved locally but not yet confirmed in Smartsheet
  const pendingSyncVersionRef = useRef(new Map()); // Prevent an older sync from clearing a newer local save
  const orderSyncBatchLimitRef = useRef(ORDER_SAVE_SYNC_BATCH_LIMIT); // A verified lower server limit applies to the next click.
  const originalOrdersRef = useRef({}); // Track original order data for comparison
  const saveInFlightRef = useRef(false);
  const syncInFlightRef = useRef(false);
  const manualPullInFlightRef = useRef(false);
  const orderLoadGenerationRef = useRef(0);
  const loadInFlightRef = useRef(false); // Background loads may never stack; explicit loads may overlap.
  const lastLoadStartedAtRef = useRef(0);
  const cachedWorkOrdersRef = useRef(null);
  const cachedUsersRef = useRef(null);
  const lastAuxLoadAtRef = useRef(0); // Last successful WorkOrder + authorized-user read.
  const orderLocalEditGenerationRef = useRef(0); // Fence reads begun before a local edit/save.
  const customerNameDraftOrderRef = useRef(null); // Typing does not enter pendingChanges until blur.
  const [customerDraftActive, setCustomerDraftActive] = useState(false);
  const dateNeededSaveInFlightRef = useRef(false);
  const addInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
  const importInFlightRef = useRef(false);
  const fileInputRef = useRef(null);

  // Helper to render text with clickable links
  const renderWithLinks = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline inline-flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            {part.length > 40 ? part.substring(0, 40) + '...' : part}
            <ExternalLink className="w-3 h-3" />
          </a>
        );
      }
      return part;
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(false), 60000); // Reduced frequency
    return () => clearInterval(interval);
  }, [workOrderFilter]);

  const markOrderNeedsSync = useCallback((orderId) => {
    const id = String(orderId || '').trim();
    if (!id) return;
    orderLocalEditGenerationRef.current += 1;
    pendingSyncIdsRef.current.add(id);
    pendingSyncVersionRef.current.set(id, (pendingSyncVersionRef.current.get(id) || 0) + 1);
    setPendingSyncCount(pendingSyncIdsRef.current.size);
    setSyncMessage('');
  }, []);

  const clearSyncedOrderIds = useCallback((syncTargets) => {
    for (const target of syncTargets || []) {
      const id = String(target?.id || '').trim();
      // An edit typed while the remote request was in flight has not yet
      // acquired a durable sync version. Never clear its pending queue marker
      // before the next Base44 autosave marks the newer version.
      if (!canClearCompletedOrderSyncTarget({
        target, currentVersion: pendingSyncVersionRef.current.get(id),
        pendingFields: pendingChangesRef.current[id] || {},
      })) continue;
      pendingSyncIdsRef.current.delete(id);
      pendingSyncVersionRef.current.delete(id);
    }
    setPendingSyncCount(pendingSyncIdsRef.current.size);
  }, []);

  // Auto-save every 5 seconds if there are unsaved changes. Auto-save writes
  // Base44 only; the explicit Save & Sync button pushes those saved row IDs.
  useEffect(() => {
    const interval = setInterval(() => {
      if (hasUnsavedChanges && Object.keys(pendingChangesRef.current).length > 0) {
        saveAllChanges();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [hasUnsavedChanges]);

  // Notify parent of save status
  useEffect(() => {
    if (onSaveStatusChange) {
      onSaveStatusChange({
        hasUnsavedChanges, customerDraftActive, isSaving, lastSaved, isLoading,
        isSyncing, isPulling, lastSyncDirection, pendingSyncCount, lastSynced, syncMessage, saveError, readError,
      });
    }
  }, [hasUnsavedChanges, customerDraftActive, isSaving, lastSaved, isLoading, isSyncing, isPulling, lastSyncDirection, pendingSyncCount, lastSynced, syncMessage, saveError, readError, onSaveStatusChange]);

  const hasActiveOrderEdits = () => Boolean(
    customerNameDraftOrderRef.current || customerSelectionInFlightRef.current ||
    saveInFlightRef.current || dateNeededSaveInFlightRef.current ||
    Object.keys(pendingChangesRef.current).length > 0
  );

  const loadData = async (showLoading = true, { manualPullReload = false, importReload = false } = {}) => {
    // Only an import's own final read may refresh during an active import.
    // Timers/focus refreshes and older reads must not replace imported records
    // or rebuild their durable pending-SMARTSHEET marker queue from stale data.
    if ((manualPullInFlightRef.current && !manualPullReload) ||
        (importInFlightRef.current && !importReload) || hasActiveOrderEdits()) return false;
    // Quiet background reloads (timers, focus/visibility/online) must never
    // stack: while one is still paging entity rows another must not start or
    // slow retrying pages multiply into a read avalanche. Explicit loads
    // (loading spinner, manual pull, import, Retry) still run and may overlap;
    // the generation fence below still discards stale commits.
    const explicitLoad = showLoading || manualPullReload || importReload;
    if (!explicitLoad && loadInFlightRef.current) return false;
    const ownsLoadSlot = !loadInFlightRef.current;
    if (ownsLoadSlot) loadInFlightRef.current = true;
    lastLoadStartedAtRef.current = Date.now();
    const requestGeneration = ++orderLoadGenerationRef.current;
    const startedEditGeneration = orderLocalEditGenerationRef.current;
    if (showLoading && orders.length === 0) setIsLoading(true);
    // Work Orders and authorized users change rarely; re-paging thousands of
    // WorkOrder rows on every background reload is what tripped the entity
    // read limit. Re-read them on explicit loads or once they are stale.
    const reloadAux = explicitLoad ||
      !lastAuxLoadAtRef.current || Date.now() - lastAuxLoadAtRef.current > ORDER_AUX_RELOAD_MS;
    // Keep an unverified-read error visible until a complete current reload
    // succeeds. Starting a retry must not make the toolbar Sync actionable.
    try {
      const [ordersData, workOrdersData, usersData] = await Promise.all([
        loadAllEntityRows({
          entity: Order,
          query: workOrderFilter
            ? { work_order_id: workOrderFilter, deleted: { $ne: true } }
            : { deleted: { $ne: true } },
          sort: "row_number",
          label: workOrderFilter ? "Work Order purchasing orders" : "Order Spreadsheet orders",
        }),
        reloadAux
          ? fetchAllWorkOrders({ preferSnapshot: true }).then((rows) =>
            (rows || []).filter((wo) => wo.completed !== true && wo.deleted !== true))
          : Promise.resolve(cachedWorkOrdersRef.current || []),
        reloadAux
          ? loadAllEntityRows({ entity: AuthorizedEmail, sort: null, label: "Order Spreadsheet authorized users" })
          : Promise.resolve(cachedUsersRef.current || [])
      ]);
      // A manual Sync or a newer refresh can start while these reads are
      // in flight. Never let the older response replace the newer snapshot.
      if (!canCommitOrderReload({
        requestGeneration,
        latestGeneration: orderLoadGenerationRef.current,
        manualPullInFlight: manualPullInFlightRef.current,
        manualPullReload,
        importInFlight: importInFlightRef.current,
        importReload,
        startedEditGeneration,
        latestEditGeneration: orderLocalEditGenerationRef.current,
        localEditInProgress: hasActiveOrderEdits(),
      })) return false;
      if (reloadAux) {
        cachedWorkOrdersRef.current = workOrdersData;
        cachedUsersRef.current = usersData;
        lastAuxLoadAtRef.current = Date.now();
      }
      setOrders(ordersData);
      setWorkOrders(workOrdersData);
      setUsers(usersData);
      const durablePendingIds = new Set(durablePendingOrderIds(ordersData));
      for (const orderId of [...pendingSyncVersionRef.current.keys()]) {
        if (!durablePendingIds.has(orderId)) pendingSyncVersionRef.current.delete(orderId);
      }
      for (const orderId of durablePendingIds) {
        if (!pendingSyncVersionRef.current.has(orderId)) pendingSyncVersionRef.current.set(orderId, 0);
      }
      // A reload/reopen is authoritative: rebuild the Retry Sync queue from the
      // durable Base44 marker instead of trusting stale in-memory browser state.
      pendingSyncIdsRef.current = durablePendingIds;
      setPendingSyncCount(durablePendingIds.size);
      setReadError("");
      // Store original data for comparison
      ordersData.forEach(order => {
        originalOrdersRef.current[order.id] = { ...order };
      });
      setIsLoading(false);
      return true;
    } catch (error) {
      // Errors from invalidated requests must not hide a successful newer load.
      if (!canCommitOrderReload({
        requestGeneration,
        latestGeneration: orderLoadGenerationRef.current,
        manualPullInFlight: manualPullInFlightRef.current,
        manualPullReload,
        importInFlight: importInFlightRef.current,
        importReload,
        startedEditGeneration,
        latestEditGeneration: orderLocalEditGenerationRef.current,
        localEditInProgress: hasActiveOrderEdits(),
      })) return false;
      console.error("Error loading data:", error);
      setReadError(error?.message || "Orders could not be verified completely.");
      setIsLoading(false);
      return false;
    } finally {
      if (ownsLoadSlot) loadInFlightRef.current = false;
    }
  };

  // Rapid focus/visibility churn must not each start a multi-page read; one
  // quiet reload per window is enough while a load ran moments ago.
  useEffect(() => {
    const refreshAuthoritativeOrders = () => {
      if (Date.now() - lastLoadStartedAtRef.current < ORDER_FOCUS_RELOAD_THROTTLE_MS) return;
      loadData(false);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadStartedAtRef.current < ORDER_FOCUS_RELOAD_THROTTLE_MS) return;
      loadData(false);
    };
    window.addEventListener('online', refreshAuthoritativeOrders);
    window.addEventListener('focus', refreshAuthoritativeOrders);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('online', refreshAuthoritativeOrders);
      window.removeEventListener('focus', refreshAuthoritativeOrders);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [workOrderFilter]);

  useEffect(() => {
    if (pendingSyncCount <= 0) return undefined;
    // While durable Order markers are pending, reconcile them frequently so a
    // refreshed/reopened tab learns promptly which rows the backend completed.
    const interval = setInterval(() => loadData(false), 30000);
    return () => clearInterval(interval);
  }, [pendingSyncCount, workOrderFilter]);

  const saveAllChanges = async () => {
    if (saveInFlightRef.current || dateNeededSaveInFlightRef.current) return { complete: false, savedIds: [], busy: true };
    const changes = Object.fromEntries(
      Object.entries(pendingChangesRef.current).map(([orderId, updates]) => [orderId, { ...updates }])
    );
    if (Object.keys(changes).length === 0) return { complete: true, savedIds: [] };

    saveInFlightRef.current = true;
    let savedRows = 0;
    const savedIds = [];
    let complete = false;
    try {
      // UI updates belong inside the lock's finally protection too.
      setIsSaving(true);
      setSaveError("");
      for (const [orderId, updates] of Object.entries(changes)) {
        const cleanedUpdates = Object.fromEntries(
          Object.entries(updates).filter(([, value]) => value !== undefined)
        );
        if (Object.keys(cleanedUpdates).length === 0) continue;

        const baseline = originalOrdersRef.current[orderId];
        if (!baseline?.id) {
          throw new Error("The loaded Order baseline is missing. Reload Orders before saving.");
        }

        const saved = await replaceOrderFieldsIfUnchanged({
          entity: Order,
          order: baseline,
          nextFields: { ...cleanedUpdates, smartsheet_pending_local_sync: true },
          label: `Order ${baseline.row_number || orderId} save`,
        });
        savedRows += 1;
        savedIds.push(orderId);
        markOrderNeedsSync(orderId);

        originalOrdersRef.current[orderId] = { ...saved };
        const latestPending = { ...(pendingChangesRef.current[orderId] || {}) };
        for (const [field, value] of Object.entries(cleanedUpdates)) {
          if (Object.is(latestPending[field], value)) delete latestPending[field];
        }
        if (Object.keys(latestPending).length > 0) pendingChangesRef.current[orderId] = latestPending;
        else delete pendingChangesRef.current[orderId];

        setOrders((current) => current.map((order) => order.id === orderId
          ? { ...saved, ...(pendingChangesRef.current[orderId] || {}) }
          : order));

        try {
          if (cleanedUpdates.date_ordered && !baseline.date_ordered) {
            await NotificationTriggers.orderOrdered(saved, currentUser?.full_name || currentUser?.email);
          }
          if (cleanedUpdates.date_received && !baseline.date_received) {
            await NotificationTriggers.orderReceived(saved, currentUser?.full_name || currentUser?.email);
          }
        } catch (notificationError) {
          console.error("Order saved but its notification could not be sent:", notificationError);
        }
      }

      const stillPending = Object.keys(pendingChangesRef.current).length > 0;
      setHasUnsavedChanges(stillPending);
      if (!stillPending) setLastSaved(new Date());
      complete = !stillPending;
    } catch (error) {
      console.error("Error saving orders safely:", error);
      const remaining = Object.keys(pendingChangesRef.current).length;
      setHasUnsavedChanges(remaining > 0);
      setSaveError(
        `${savedRows} Order row${savedRows === 1 ? " was" : "s were"} saved before the save stopped. ` +
        `${error?.message || "An Order changed in another session. Reload before retrying."}`
      );
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
    }
    return { complete, savedIds };
  };

  const saveAndSync = async () => {
    if (readError || syncInFlightRef.current || saveInFlightRef.current || dateNeededSaveInFlightRef.current) return false;
    if (customerNameDraftOrderRef.current || customerSelectionInFlightRef.current) {
      setSaveError('Finish editing the customer name or selecting an active job before Save & Sync. Your draft has not been submitted.');
      return false;
    }
    // Reserve the full Save & Sync operation before the first await. Without this,
    // two rapid clicks can both pass the guard when there are no unsaved Base44
    // fields, then both push the same durable pending Orders after the await yields.
    syncInFlightRef.current = true;
    // Cover save preparation too: the Smartsheet try/finally below begins
    // only after the Base44 save and pending-ID snapshot. An unexpected
    // exception in either must not strand the same-browser sync lock.
    try {
    setSaveError('');
    setSyncMessage('');

    const saveResult = await saveAllChanges();
    if (!saveResult?.complete) {
      syncInFlightRef.current = false;
      return false;
    }

    // Keep unsubmitted Orders in the durable queue. One click handles one
    // bounded batch; the next click continues from the remaining pending IDs.
    const syncTargets = [...pendingSyncIdsRef.current].map((id) => ({
      id,
      version: pendingSyncVersionRef.current.get(id) || 0,
    })).slice(0, orderSyncBatchLimitRef.current);
    const orderIds = syncTargets.map(({ id }) => id);
    if (orderIds.length === 0) {
      syncInFlightRef.current = false;
      setSyncMessage('No new Order changes need Smartsheet sync.');
      return true;
    }

    try {
      setIsSyncing(true);
      // A previous response can be lost after Base44 has already confirmed
      // some rows. Re-read the EXACT requested permanent IDs before Retry
      // Sync; do not re-submit stale, already completed Orders alongside the
      // genuinely pending ones (which would reject the whole backend batch).
      const preflight = await verifyUncertainOrderSyncReadback(orderIds, (ids) =>
        loadAllEntityRows({
          entity: Order, query: { id: { $in: ids } }, sort: "id",
          pageSize: Math.min(500, Math.max(20, ids.length)),
          maxRows: Math.max(1000, ids.length + 500),
          label: "Order Form Save & Sync pending-only permanent-ID preflight",
        }),
      );
      // New edits made while the read was in flight must be saved first; the
      // backend independently verifies each durable pending marker too.
      if (Object.keys(pendingChangesRef.current).length ||
          syncTargets.some(({ id, version }) => pendingSyncVersionRef.current.has(id) &&
            pendingSyncVersionRef.current.get(id) !== version)) {
        throw new Error('New Order edits need saving before Retry Sync. No Smartsheet rows were submitted.');
      }
      const pendingOrderIds = preflight.pendingIds;
      // An empty pending set is acknowledged locally; this helper performs
      // no network request when no Order IDs remain to be pushed.
      const result = await pushSavedOrdersToSmartsheet({ sessionToken, orderIds: pendingOrderIds });
      const summary = summarizeSavedOrderSync(result, { expectedOrderCount: pendingOrderIds.length });
      if (!summary.ok) throw new Error(summary.message);
      // The backend's success is scoped to its completed revision. A second
      // browser can save a newer revision while that response is in transit.
      // Verify exact permanent IDs again before clearing any local queue flag.
      const postflight = await verifyUncertainOrderSyncReadback(orderIds, (ids) =>
        loadAllEntityRows({
          entity: Order, query: { id: { $in: ids } }, sort: "id",
          pageSize: Math.min(500, Math.max(20, ids.length)),
          maxRows: Math.max(1000, ids.length + 500),
          label: "Order Form post-sync current-revision confirmation",
        }),
      );
      if (postflight.pendingIds.length) {
        throw new Error(`${postflight.pendingIds.length} Order${postflight.pendingIds.length === 1 ? '' : 's'} changed in another session or still await verified sync. Keep the newer changes queued for Retry Sync.`);
      }
      clearSyncedOrderIds(syncTargets);
      const safelySyncedIds = new Set(syncTargets
        .filter(({ id, version }) => pendingSyncVersionRef.current.get(id) === undefined || pendingSyncVersionRef.current.get(id) === version)
        .filter(({ id }) => !pendingSyncIdsRef.current.has(id))
        .map(({ id }) => String(id)));
      for (const orderId of safelySyncedIds) {
        const baseline = originalOrdersRef.current[orderId];
        if (baseline) originalOrdersRef.current[orderId] = { ...baseline, smartsheet_pending_local_sync: false };
      }
      setOrders((current) => current.map((order) => safelySyncedIds.has(String(order.id))
        ? { ...order, smartsheet_pending_local_sync: false }
        : order));
      setLastSynced(new Date());
      setLastSyncDirection('push');
      setSyncMessage(orderSaveSyncBatchMessage(summary.message, pendingSyncIdsRef.current.size));
      return true;
    } catch (error) {
      // The typed error is accepted only from a verified pre-write limit
      // rejection. Learn a stricter setting for the NEXT user click; never replay.
      if (error instanceof OrderSaveSyncBatchLimitError) {
        orderSyncBatchLimitRef.current = error.limit;
        setSaveError(`Saved in Base44, but Smartsheet sync needs attention: ${error.message}`);
        return false;
      }
      // The request can lose its response after Smartsheet and Base44 have already
      // committed successfully. Re-read durable Order markers before telling the
      // user to retry so an acknowledged-on-server sync is not pushed again.
      let partialResultMessage = '';
      try {
        // The visible spreadsheet excludes soft-deleted Orders and may be
        // filtered. A missing row in that view is NOT proof it was synced.
        // Independently read back every exact requested permanent ID before
        // interpreting a cleared local queue marker as a successful push.
        const exact = await verifyUncertainOrderSyncReadback(orderIds, (ids) =>
          loadAllEntityRows({
            entity: Order, query: { id: { $in: ids } }, sort: "id",
            pageSize: Math.min(500, Math.max(20, ids.length)),
            maxRows: Math.max(1000, ids.length + 500),
            label: "Order Form uncertain Save & Sync permanent-ID read-back",
          }),
        );
        const verificationLoaded = await loadData(false);
        if (!verificationLoaded) throw new Error('Authoritative Order verification reload failed.');
        // Preserve pending IDs even if the visible list omitted them. Do not
        // remove newer local edits or infer completion from list membership.
        for (const id of exact.pendingIds) {
          pendingSyncIdsRef.current.add(id);
          if (!pendingSyncVersionRef.current.has(id)) {
            pendingSyncVersionRef.current.set(id, syncTargets.find(target => target.id === id)?.version ?? 0);
          }
        }
        setPendingSyncCount(pendingSyncIdsRef.current.size);
        const unresolvedTargets = syncTargets.filter(({ id }) => pendingSyncIdsRef.current.has(id));
        if (unresolvedTargets.length === 0) {
          setLastSynced(new Date());
          setSyncMessage(orderSaveSyncBatchMessage('Saved changes are synchronized.', pendingSyncIdsRef.current.size));
          return true;
        }
        const completedCount = syncTargets.length - unresolvedTargets.length;
        if (completedCount > 0) {
          partialResultMessage = `${completedCount} Order${completedCount === 1 ? '' : 's'} synced successfully; ${pendingSyncIdsRef.current.size} remain queued for Retry Sync. `;
          setLastSynced(new Date());
        }
      } catch (verificationError) {
        console.error("Could not verify uncertain Order sync:", verificationError);
      }
      setSaveError(`Saved in Base44, but Smartsheet sync needs attention: ${partialResultMessage}${error?.message || 'Sync could not be verified.'}`);
      return false;
    } finally {
      syncInFlightRef.current = false;
      setIsSyncing(false);
    }
    } catch (error) {
      // Unexpected preparation or cleanup failures are not proof of a
      // completed remote sync. Keep both local queues for safe review.
      console.error('Order Save & Sync was interrupted unexpectedly:', error);
      setSaveError(`Order Save & Sync stopped unexpectedly: ${error?.message || 'unknown error'}. Reload Orders and review pending changes before retrying.`);
      return false;
    } finally {
      syncInFlightRef.current = false;
    }
  };

  const handleCustomerResolutionApplied = async saved => {
    // Only authoritative Base44 reload may refresh the persistent Save & Sync
    // queue after an administrator's exact-ID customer-link decision.
    const reloaded = await loadData(true);
    const current = originalOrdersRef.current[saved?.order_id];
    if (!reloaded || !current || current.smartsheet_pending_local_sync !== true ||
        String(current.customer_name ?? '') !== String(saved.customer_name ?? '') ||
        String(current.work_order_id ?? '') !== '' ||
        String(current.smartsheet_sheet_id ?? '') !== String(saved.sheet_id ?? '') ||
        String(current.smartsheet_row_id ?? '') !== String(saved.row_id ?? '')) {
      setSaveError('The customer decision may be saved, but the current Order reload was not verified. Reload Orders; do not apply the decision again.');
      throw new Error('Authoritative Order reload was not verified. Reload before trying anything else.');
    }
    setLinkedNameReview({ count: 0, items: [] });
    setSaveError('');
    setSyncMessage('Smartsheet customer adopted and old job unlinked in Base44. This Order is queued for Save & Sync.');
  };

  const pullFromSmartsheet = async () => {
    if (readError || !isRegistered || syncInFlightRef.current || saveInFlightRef.current ||
        dateNeededSaveInFlightRef.current || addInFlightRef.current ||
        deleteInFlightRef.current || importInFlightRef.current) return false;
    // A focused customer name is not pendingChanges until blur. Do not let a
    // stale toolbar mode pull Smartsheet over that protected local draft.
    if (customerNameDraftOrderRef.current || customerSelectionInFlightRef.current) {
      setSaveError('Finish editing the customer name or selecting an active job before checking Smartsheet. No remote pull was started.');
      return false;
    }
    // Never mix a manual remote pull with local unsaved edits or the durable
    // outbound queue. Those changes must use Save & Sync first.
    if (Object.keys(pendingChangesRef.current).length || pendingSyncIdsRef.current.size) {
      setSaveError('Local Order changes are waiting. Use Save & Sync before pulling Smartsheet updates.');
      return false;
    }
    syncInFlightRef.current = true;
    manualPullInFlightRef.current = true;
    // Invalidate any focus/timer refresh started before this pull.
    orderLoadGenerationRef.current += 1;
    setIsSyncing(true);
    setIsPulling(true);
    setSaveError('');
    setSyncMessage('');
    try {
      const pull = await pullOrdersFromSmartsheet({ sessionToken });
      const reloaded = await loadData(false, { manualPullReload: true });
      if (!reloaded) throw new Error('Smartsheet was checked but the updated Orders could not be reloaded safely.');
      setLastSynced(new Date());
      setLastSyncDirection('pull');
      const count = pull.updated;
      setLinkedNameReview({ count: pull.linkedCustomerNameReviewCount, items: pull.linkedCustomerNameReviewItems });
      setSyncMessage(pull.linkedCustomerNameReviewCount > 0
        ? `Smartsheet updated ${count} other Order${count === 1 ? '' : 's'}; ${pull.linkedCustomerNameReviewCount} linked customer name${pull.linkedCustomerNameReviewCount === 1 ? '' : 's'} held for review.`
        : pull.needsReview
          ? `Smartsheet pull updated ${count} Order${count === 1 ? '' : 's'}, but some links or records need admin review.`
        : count > 0
          ? `Pulled ${count} updated Order${count === 1 ? '' : 's'} from Smartsheet.`
          : 'Smartsheet checked. No linked Order changes found.');
      if (pull.needsReview) {
        setSaveError(pull.linkedCustomerNameReviewCount > 0
          ? `Smartsheet customer names differ from ${pull.linkedCustomerNameReviewCount} linked Order job${pull.linkedCustomerNameReviewCount === 1 ? '' : 's'}. Those Orders and their remote rows were preserved without updating. Review Smartsheet row ID${pull.linkedCustomerNameReviewRowIds.length === 1 ? '' : 's'}: ${pull.linkedCustomerNameReviewRowIds.join(', ') || 'see sync results'} before changing the link.`
          : 'Smartsheet pull needs review. Confirm unresolved Order links in Admin → Smartsheet → Review links.');
      }
      return !pull.needsReview;
    } catch (error) {
      setSaveError(`Smartsheet pull needs attention: ${error?.message || 'Could not verify remote Order changes.'}`);
      return false;
    } finally {
      manualPullInFlightRef.current = false;
      syncInFlightRef.current = false;
      setIsPulling(false);
      setIsSyncing(false);
    }
  };

  // Existing internal/manual callers still save Base44 only. The page-level
  // user button calls saveAndSync so explicit Save has deterministic sync semantics.
  const manualSave = () => {
    saveAllChanges();
  };

  const addNewRow = async () => {
    // A manual pull owns its ref before React renders the disabled Add button.
    if (!isRegistered || readError || addInFlightRef.current || manualPullInFlightRef.current || isPulling) return;
    addInFlightRef.current = true;
    setSaveError("");
    try {
      const maxRowNumber = orders.length > 0
        ? Math.max(...orders.map(o => o.row_number || 0))
        : 0;

      const newOrderData = {
        customer_name: "",
        request_type: requestTypes[0] || "Other",
        description: "",
        quantity: "",
        requestor_email: currentUser?.email || "",
        requestor_name: currentUser?.full_name || "",
        vendor: "",
        status: "pending",
        row_number: maxRowNumber + 1,
        work_order_id: workOrderFilter || "",
        smartsheet_pending_local_sync: true
      };
      const { record: newOrder } = await createOrderWithRecovery({
        entity: Order,
        data: newOrderData,
        readCandidates: () => loadAllEntityRows({
          entity: Order,
          query: {
            row_number: newOrderData.row_number,
            work_order_id: newOrderData.work_order_id,
            deleted: { $ne: true },
          },
          sort: "created_date",
          label: "Order Spreadsheet create recovery",
        }),
        label: "Order Spreadsheet new row",
      });

      setOrders((current) => current.some((order) => order.id === newOrder.id) ? current : [...current, newOrder]);
      originalOrdersRef.current[newOrder.id] = { ...newOrder };
      markOrderNeedsSync(newOrder.id);

      try {
        await NotificationTriggers.orderCreated(newOrder, currentUser?.full_name || currentUser?.email);
      } catch (e) {
        console.error("Error triggering order notification:", e);
      }
    } catch (error) {
      console.error("Error creating Order:", error);
      setSaveError(error?.message || "The Order could not be created.");
    } finally {
      addInFlightRef.current = false;
    }
  };

  const validateOrderForDateNeeded = (order) => {
    const missingFields = [];
    if (!order.customer_name) missingFields.push("Customer Name");
    if (!order.request_type) missingFields.push("Request Type");
    if (!order.description) missingFields.push("Description");
    if (!order.quantity) missingFields.push("Quantity");
    if (!order.requestor_name) missingFields.push("Requestor");
    return missingFields;
  };

  const validateOrderForReceived = (order) => {
    const missingFields = [];
    if (!order.customer_name) missingFields.push("Customer Name");
    if (!order.request_type) missingFields.push("Request Type");
    if (!order.description) missingFields.push("Description");
    if (!order.quantity) missingFields.push("Quantity");
    if (!order.requestor_name) missingFields.push("Requestor");
    if (!order.date_needed) missingFields.push("Date Needed");
    if (!order.date_ordered) missingFields.push("Date Ordered");
    if (!order.vendor) missingFields.push("Vendor");
    return missingFields;
  };

  const updateOrder = (orderId, field, value, skipHistory = false) => {
    // A pull reserves this ref synchronously, before React can render isPulling.
    // All inline editors (including requestor, quantity and description) must
    // respect that same-tick reservation before changing Order state.
    if (manualPullInFlightRef.current || isPulling) {
      setSaveError('Wait for the Smartsheet pull to finish before editing Orders.');
      return;
    }
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) return;
    orderLocalEditGenerationRef.current += 1;
    const oldValue = currentOrder[field];
    // A context-menu Clear can follow typing before blur. The visible row
    // may already be unlinked, but its durable Base44 link still needs clearing.
    const unlinkCustomerJob = field === 'customer_name' &&
      (shouldUnlinkOrderJobForTypedCustomer(currentOrder, value) ||
        manuallyUnlinkedCustomerOrderIdsRef.current.has(orderId));
    if (unlinkCustomerJob) {
      verifiedCustomerSelectionRef.current.delete(orderId);
      manuallyUnlinkedCustomerOrderIdsRef.current.delete(orderId);
    }

    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...order, [field]: value, ...(unlinkCustomerJob ? { work_order_id: '' } : {}) }
      : order));

    if (!skipHistory && oldValue !== value) {
      trackChange(orderId, field, oldValue, value);
    }

    // Editing a field back to its loaded baseline value cancels that pending
    // field instead of queueing a no-op write and an empty Smartsheet sync.
    const nextPending = {
      ...pendingChangesRef.current[orderId],
      [field]: value,
      ...(unlinkCustomerJob ? { work_order_id: '' } : {}),
    };
    const baseline = originalOrdersRef.current[orderId];
    if (baseline?.id) {
      const empty = (v) => v === null || v === undefined || v === '';
      for (const [key, pendingValue] of Object.entries(nextPending)) {
        const base = baseline[key];
        if ((empty(pendingValue) && empty(base)) || Object.is(pendingValue, base)) delete nextPending[key];
      }
    }
    if (Object.keys(nextPending).length > 0) pendingChangesRef.current[orderId] = nextPending;
    else delete pendingChangesRef.current[orderId];
    setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
  };

  const persistImmediateOrderFields = async (orderId, nextFields, label, { supersedePendingFields = [] } = {}) => {
    // Date/receipt writes bypass updateOrder, so fence their Base44 writes too.
    if (manualPullInFlightRef.current || isPulling) throw new Error('Wait for the Smartsheet pull to finish before editing Orders.');
    const pendingAtStart = { ...(pendingChangesRef.current[orderId] || {}) };
    const baseline = originalOrdersRef.current[orderId];
    if (!baseline?.id) throw new Error(`${label} is missing its loaded Order baseline. Reload before saving.`);
    const saved = await replaceOrderFieldsIfUnchanged({
      entity: Order,
      order: baseline,
      nextFields: { ...nextFields, smartsheet_pending_local_sync: true },
      label,
    });
    originalOrdersRef.current[orderId] = { ...saved };
    markOrderNeedsSync(orderId);

    const latestPending = remainingOrderPendingAfterImmediateSave(
      pendingChangesRef.current[orderId] || {}, pendingAtStart, nextFields, supersedePendingFields
    );
    if (Object.keys(latestPending).length > 0) pendingChangesRef.current[orderId] = latestPending;
    else delete pendingChangesRef.current[orderId];

    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...saved, ...(pendingChangesRef.current[orderId] || {}) }
      : order));
    setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
    return saved;
  };

  // Date Needed is one verified write of its ISO value and text companion.
  const persistDateNeeded = async (orderId, nextDate, label) => {
    if (dateNeededSaveInFlightRef.current || saveInFlightRef.current) {
      throw new Error('An Order save is already running. Retry Date Needed when it finishes.');
    }
    if (manualPullInFlightRef.current || isPulling) {
      throw new Error('Wait for the Smartsheet pull to finish before editing Orders.');
    }
    const before = originalOrdersRef.current[orderId];
    dateNeededSaveInFlightRef.current = true;
    setIsSaving(true);
    try {
      const saved = await persistImmediateOrderFields(
        orderId, { date_needed: nextDate, date_needed_option: '' }, label,
        { supersedePendingFields: ['date_needed', 'date_needed_option'] }
      );
      if (before?.date_needed !== nextDate) {
        void trackChange(orderId, 'date_needed', before?.date_needed, nextDate);
      }
      if (before?.date_needed_option) {
        void trackChange(orderId, 'date_needed_option', before.date_needed_option, '');
      }
      if (Object.keys(pendingChangesRef.current).length === 0) setLastSaved(new Date());
      return saved;
    } finally {
      dateNeededSaveInFlightRef.current = false;
      setIsSaving(false);
    }
  };

  // Quick actions write the same verified fields as the date pickers.
  const markOrderOrdered = async (order) => {
    if (!order?.id || isFulfilledOrder(order) || effectiveOrderStatus(order) === 'cancelled') {
      return { ok: false, fields: ["Only an open Order can be marked ordered"] };
    }
    const today = localDateStr();
    await persistImmediateOrderFields(
      order.id,
      { date_ordered: today, date_ordered_option: "", status: orderStatusAfterOrderedDateChange(order, today) },
      "Mark ordered today"
    );
    return { ok: true };
  };

  const markOrderReceived = async (order) => {
    if (!order?.id || isFulfilledOrder(order) || effectiveOrderStatus(order) === 'cancelled') {
      return { ok: false, fields: ["Only an open Order can be marked received"] };
    }
    const missingFields = validateOrderForReceived(order);
    if (missingFields.length > 0) return { ok: false, fields: missingFields };
    const today = localDateStr();
    if (order.date_ordered && order.date_ordered > today) {
      return { ok: false, fields: ["Date received cannot be before date ordered"] };
    }
    if (order.date_needed && order.date_needed > today) {
      return { ok: false, fields: ["Date received cannot be before date needed"] };
    }
    await persistImmediateOrderFields(
      order.id,
      { date_received: today, receipt_option: "", status: "received" },
      "Mark received today"
    );
    return { ok: true };
  };

  const runQuickOrderAction = async (order, kind) => {
    try {
      setSaveError("");
      const result = kind === "ordered" ? await markOrderOrdered(order) : await markOrderReceived(order);
      if (!result.ok) {
        setValidationError({
          orderId: order.id,
          fields: result.fields || ["Unable to update this Order"],
          type: kind === "received" ? "date_received" : "date_ordered",
        });
      }
    } catch (error) {
      setSaveError(error?.message || "This Order changed in another session. Reload before retrying.");
    }
  };

  const orderContextActions = (order) => {
    if (!order || !isRegistered || isPulling || isFulfilledOrder(order) ||
        effectiveOrderStatus(order) === 'cancelled') return [];
    const actions = [];
    if (!order.date_ordered) {
      actions.push({
        label: "Mark Ordered",
        icon: <ShoppingCart className="w-4 h-4 text-blue-600" />,
        onSelect: () => void runQuickOrderAction(order, "ordered"),
      });
    }
    actions.push({
      label: "Mark Received",
      icon: <PackageCheck className="w-4 h-4 text-green-600" />,
      onSelect: () => void runQuickOrderAction(order, "received"),
    });
    return actions;
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [duplicateReviewOrderId, setDuplicateReviewOrderId] = useState(null);
  const [duplicateReviewBusy, setDuplicateReviewBusy] = useState(false);

  const deleteOrder = async (order) => {
    setDeleteConfirm(order);
  };

  // Shared post-delete cleanup for the grid delete and duplicate review.
  // Drops the row from every local edit/sync ledger so nothing tries to
  // write a trashed Order again.
  const removeOrdersFromState = (ids) => {
    const idSet = new Set(ids);
    orderLocalEditGenerationRef.current += 1;
    setOrders((current) => current.filter(o => !idSet.has(o.id)));
    for (const id of ids) {
      delete pendingChangesRef.current[id];
      delete originalOrdersRef.current[id];
      verifiedCustomerSelectionRef.current.delete(id);
      manuallyUnlinkedCustomerOrderIdsRef.current.delete(id);
      pendingSyncIdsRef.current.delete(id);
      pendingSyncVersionRef.current.delete(id);
    }
    setPendingSyncCount(pendingSyncIdsRef.current.size);
    setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
  };

  const confirmDelete = async () => {
    const target = deleteConfirm;
    // A stale confirmation dialog must never delete during a just-started pull.
    if (!target || deleteInFlightRef.current || manualPullInFlightRef.current || isPulling) return;
    const baseline = originalOrdersRef.current[target.id] || target;
    deleteInFlightRef.current = true;
    setSaveError("");
    try {
      await softDeleteOrderFromLoadedSnapshot({
        entity: Order,
        order: baseline,
        deletedBy: currentUser?.email || "unknown",
        label: "Order Spreadsheet delete",
      });
      removeOrdersFromState([target.id]);
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Could not delete Order safely:", error);
      setSaveError(error?.message || "This Order changed in another session. Reload before deleting it.");
      setDeleteConfirm(null);
    } finally {
      deleteInFlightRef.current = false;
    }
  };

  // Duplicate review: keeping one Order trashes the rest of its group via the
  // same guarded soft-delete as the grid (tombstones preserved; Smartsheet
  // rows and links are never touched automatically). Fails closed like the
  // single delete while a pull is in flight.
  const handleDuplicateKeep = async (keepOrder) => {
    const group = duplicateGroupsById.get(keepOrder.id) || [];
    const others = group.filter(o => o.id !== keepOrder.id && !o.deleted);
    if (!others.length || duplicateReviewBusy || deleteInFlightRef.current || manualPullInFlightRef.current || isPulling) return;
    deleteInFlightRef.current = true;
    setDuplicateReviewBusy(true);
    setSaveError("");
    try {
      for (const other of others) {
        const baseline = originalOrdersRef.current[other.id] || other;
        await softDeleteOrderFromLoadedSnapshot({
          entity: Order,
          order: baseline,
          deletedBy: currentUser?.email || "unknown",
          label: "Order duplicate review keep",
        });
        removeOrdersFromState([other.id]);
      }
      setDuplicateReviewOrderId(null);
    } catch (error) {
      console.error("Could not resolve duplicate Orders safely:", error);
      throw new Error(error?.message || "A duplicate Order changed in another session. Reload before retrying.");
    } finally {
      deleteInFlightRef.current = false;
      setDuplicateReviewBusy(false);
    }
  };

  // Verified "not duplicates" decision: Base44-only field, no pending-sync
  // marker, so the record does not queue a Smartsheet write for a review
  // annotation.
  const handleDuplicateNotDuplicates = async () => {
    const group = (duplicateGroupsById.get(duplicateReviewOrderId) || []).filter(o => !o.deleted);
    if (!group.length || duplicateReviewBusy || manualPullInFlightRef.current || isPulling) return;
    setDuplicateReviewBusy(true);
    setSaveError("");
    try {
      for (const member of group) {
        const baseline = originalOrdersRef.current[member.id] || member;
        await replaceOrderFieldsIfUnchanged({
          entity: Order,
          order: baseline,
          nextFields: { duplicate_review_status: 'not_duplicate' },
          fullVersion: true,
          label: "Order duplicate review",
        });
        originalOrdersRef.current[member.id] = { ...baseline, duplicate_review_status: 'not_duplicate' };
        setOrders((current) => current.map(o => o.id === member.id ? { ...o, duplicate_review_status: 'not_duplicate' } : o));
      }
      setDuplicateReviewOrderId(null);
    } catch (error) {
      console.error("Could not record the duplicate review decision:", error);
      throw new Error(error?.message || "A duplicate Order changed in another session. Reload before retrying.");
    } finally {
      setDuplicateReviewBusy(false);
    }
  };

  const getFilteredWorkOrders = React.useCallback(
    (searchTerm) => filterOrderCustomerJobs(workOrders, searchTerm),
    [workOrders]
  );

  const saveRequestTypes = async (types) => {
    if (currentUser?.role !== "admin") {
      setRequestTypesError("Admin access is required to change Order item types.");
      return false;
    }
    const normalized = normalizeOrderRequestTypes(types);
    if (!normalized.length) {
      setRequestTypesError("Keep at least one Order item type.");
      return false;
    }
    if (!sessionToken) {
      setRequestTypesError("Your Sign Shop session expired. Sign in again before changing Order item types.");
      return false;
    }

    setRequestTypesSaving(true);
    setRequestTypesError("");
    try {
      const response = await base44.functions.invoke("smartsheetSyncAction", {
        action: "order_request_types_save",
        session_token: sessionToken,
        request_types: normalized,
        expected_setting_id: requestTypeSetting?.id || "",
        expected_setting_updated_date: requestTypeSetting?.updated_date || "",
      });
      const data = response?.data || response;
      if (!data?.success) throw new Error(data?.error || "Order item types could not be saved.");
      const verifiedTypes = normalizeOrderRequestTypes(data?.request_types);
      if (!verifiedTypes.length) throw new Error("The saved Order item-type list could not be verified.");
      setRequestTypes(verifiedTypes);
      setRequestTypeSetting(data?.setting || null);
      localStorage.removeItem('orderRequestTypes');
      return true;
    } catch (error) {
      setRequestTypesError(
        error?.response?.data?.error ||
        error?.data?.error ||
        error?.message ||
        "Order item types could not be saved to Base44 and Smartsheet safely."
      );
      return false;
    } finally {
      setRequestTypesSaving(false);
    }
  };

  const saveVendors = (vendorList) => {
    setVendors(vendorList);
    localStorage.setItem('orderVendors', JSON.stringify(vendorList));
  };

  const addRequestType = async () => {
    const label = String(newRequestType || "").trim().replace(/\s+/g, " ").slice(0, 120);
    if (!label) return;
    if (requestTypes.some((type) => type.toLowerCase() === label.toLowerCase())) {
      setRequestTypesError(`"${label}" is already in the Order item-type list.`);
      return;
    }
    if (await saveRequestTypes([...requestTypes, label])) setNewRequestType("");
  };

  const removeRequestType = async (type) => {
    if (requestTypes.length <= 1) {
      setRequestTypesError("Keep at least one Order item type.");
      return;
    }
    await saveRequestTypes(requestTypes.filter(t => t !== type));
  };

  const addVendor = () => {
    if (newVendor.trim() && !vendors.includes(newVendor.trim())) {
      saveVendors([...vendors, newVendor.trim()]);
      setNewVendor("");
    }
  };

  const removeVendor = (vendor) => {
    saveVendors(vendors.filter(v => v !== vendor));
  };



  const getFilteredUsers = (searchTerm) => {
    if (!searchTerm) return users.slice(0, 10);
    const lower = searchTerm.toLowerCase();
    return users.filter(u => 
      u.full_name?.toLowerCase().includes(lower) ||
      u.email?.toLowerCase().includes(lower)
    ).slice(0, 10);
  };

  const getRowColor = (order) => {
    if (effectiveOrderStatus(order) === "received") return "bg-green-100";
    if (effectiveOrderStatus(order) === "ordered") return "bg-green-50";
    if (order.status === "cancelled") return "bg-gray-100";
    return "bg-white";
  };

  const getRowStyle = (order) => {
    if (isFulfilledOrder(order)) {
      return { textDecoration: "line-through", textDecorationColor: "#9CA3AF", textDecorationThickness: "1.5px" };
    }
    return {};
  };

  const getRequestorColor = (email) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500"
    ];
    const index = email ? email.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  const exportToExcel = async () => {
    if (readError) return; // Never export an unverified/partially loaded Order list.
    if (!canOrderExport || !canUseOrderExport(currentUser)) {
      setSaveError("Order Form export is available only to admins explicitly assigned this permission.");
      return;
    }
    setExportProgress({ show: true, progress: 0 });
    
    const exportData = filteredOrders.map(order => ({
      "Customer": order.customer_name || "",
      "Type": order.request_type || "",
      "Description": order.description || "",
      "How much?": order.quantity || "",
      "Requestor": order.requestor_name || "",
      "Date Needed (Requester fills out this column)": order.date_needed_option || order.date_needed || "",
      "Ordered Date (Carl Fills out this column)": order.date_ordered_option || order.date_ordered || "",
      "Vendor (Anyone can fill out this column)": order.vendor || "",
      "Date Recieved (Anyone can fill out this column)": order.receipt_option || order.date_received || ""
    }));

    await new Promise(resolve => setTimeout(resolve, 300));
    setExportProgress({ show: true, progress: 50 });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `orders_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    
    setExportProgress({ show: true, progress: 100 });
    setTimeout(() => setExportProgress({ show: false, progress: 0 }), 1000);
  };

  const importFromExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    // A file selection can finish in the same tick that manual Sync begins.
    // Reject it before FileReader, import progress or any backend invocation.
    if (importInFlightRef.current || manualPullInFlightRef.current || isPulling) return;
    importInFlightRef.current = true;
    // Invalidate any refresh already reading an older pre-import snapshot.
    // This also fences its error branch if its request fails after import.
    orderLoadGenerationRef.current += 1;

    const importId = startMultiImport(file.name);
    const processingTimeout = setTimeout(() => {
      updateImport(importId, { message: 'Processing rows on server...' });
    }, 1500);
    let importRequestStarted = false;

    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(btoa(e.target.result));
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      });
      importRequestStarted = true;
      const res = await base44.functions.invoke("importOrders", { fileData, workOrderFilter: workOrderFilter || '', session_token: sessionToken });
      const result = res?.data;
      // Do not announce an import success based on a missing/malformed or
      // incomplete acknowledgment; the server may already have written rows.
      const counts = ['created', 'updated', 'skipped', 'conflicts', 'errors', 'total'];
      if (!counts.every(key => Number.isSafeInteger(result?.[key]) && result[key] >= 0) ||
          result.created + result.updated + result.skipped + result.conflicts + result.errors !== result.total) {
        throw new Error('The Order import result was not complete or verifiable.');
      }
      const conflictCount = result.conflicts;
      const errorCount = result.errors;
      const hasIssues = conflictCount > 0 || errorCount > 0;
      const issueDetails = Array.isArray(result.issues) ? result.issues
        .filter(issue => Number.isSafeInteger(issue?.row) && issue.row > 0 &&
          typeof issue.message === 'string' && issue.message.trim())
        .slice(0, 3)
        .map(issue => `Import row ${issue.row}: ${issue.message.slice(0, 300)}`)
        .join(' ') : '';
      const summary = [
        `${result.created} created`,
        `${result.updated} updated`,
        ...(result.skipped ? [`${result.skipped} unchanged`] : []),
        ...(conflictCount ? [`${conflictCount} import conflict${conflictCount === 1 ? '' : 's'}`] : []),
        ...(errorCount ? [`${errorCount} failed`] : []),
      ].join(', ');
      // The import runs on the server and may finish while the browser still
      // has protected edits or an invalidated reload. Keep the result uncertain
      // until an authoritative complete Order snapshot is visible locally.
      const verifiedReload = await loadData(false, { importReload: true });
      if (!verifiedReload) {
        const warning = `${summary}. Import processing returned, but Orders could not be reloaded safely. Review protected edits and reload Orders before importing again; some rows may already be saved.`;
        setSaveError(warning);
        finishImport(importId, warning, true);
        return;
      }
      finishImport(
        importId,
        hasIssues ? `${summary}. Conflicted rows were not overwritten; review Orders before retrying them. ${issueDetails}`.trim() : summary,
        hasIssues,
      );
    } catch (err) {
      console.error('Order import could not be verified:', err);
      const warning = importRequestStarted
        ? 'Order import acknowledgment or reload could not be verified. Some rows may already have been saved. Reload and review Orders before importing again.'
        : 'The Excel file could not be read. No Order import request was sent.';
      setSaveError(warning);
      finishImport(importId, warning, true);
    } finally {
      clearTimeout(processingTimeout);
      importInFlightRef.current = false;
    }
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    saveAndSync,
    pullFromSmartsheet,
    exportToExcel,
    refreshOrders: () => loadData(false),
    importFromExcel: () => {
      if (manualPullInFlightRef.current || isPulling || importInFlightRef.current) return;
      fileInputRef.current?.click();
    },
    canImportExport: () => {
      // Check if user has import/export permission
      const user = users.find(u => u.email?.toLowerCase() === currentUser?.email?.toLowerCase());
      return user?.can_import_export === true || currentUser?.role === "admin";
    }
  }));

  const handleSort = useCallback((key) => {
    const newDirection = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    handleColumnSort(key, newDirection);
  }, [sortConfig, handleColumnSort]);

  const getSortIcon = useCallback((key) => {
    if (sortConfig.key !== key) return <ArrowUpDown className="w-3 h-3 text-gray-400" />;
    return sortConfig.direction === 'asc' 
      ? <ArrowUp className="w-3 h-3 text-blue-600" />
      : <ArrowDown className="w-3 h-3 text-blue-600" />;
  }, [sortConfig]);

  const handleHeaderContextMenu = (e, fieldName, fieldLabel) => {
    e.preventDefault();
    e.stopPropagation();
    setHeaderContextMenu({
      x: e.clientX,
      y: e.clientY,
      fieldName,
      fieldLabel
    });
  };

  // Memoized filtered and sorted orders with optimized sorting
  const todayStr = useMemo(() => localDateStr(), []);

  const workOrdersById = useMemo(
    () => new Map(workOrders.map(workOrder => [workOrder.id, workOrder])),
    [workOrders]
  );

  // Open Orders sharing the same customer, description, and vendor are almost
  // always accidental re-entries. Flag them without blocking any save.
  const { duplicateOrderIds, duplicateGroupSizes, duplicateGroupsById } = useMemo(() => {
    const groups = new Map();
    for (const order of orders) {
      if (order.deleted || isFulfilledOrder(order) || effectiveOrderStatus(order) === 'cancelled') continue;
      // A verified "not duplicates" review decision stops flagging the Order.
      if (order.duplicate_review_status === 'not_duplicate') continue;
      const parts = ['customer_name', 'description', 'vendor']
        .map(field => String(order[field] ?? '').trim().toLowerCase());
      if (parts.some(part => !part)) continue;
      const key = parts.join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(order);
    }
    const ids = new Set();
    const sizes = new Map();
    const byId = new Map();
    for (const groupOrders of groups.values()) {
      if (groupOrders.length > 1) {
        groupOrders.forEach(order => {
          ids.add(order.id);
          sizes.set(order.id, groupOrders.length);
          byId.set(order.id, groupOrders);
        });
      }
    }
    return { duplicateOrderIds: ids, duplicateGroupSizes: sizes, duplicateGroupsById: byId };
  }, [orders]);

  const duplicateReviewGroup = (duplicateGroupsById.get(duplicateReviewOrderId) || []).filter(o => !o.deleted);

  const overdueCount = useMemo(
    () => orders.filter(order => orderDueState(order, todayStr) === "overdue").length,
    [orders, todayStr]
  );

  const filteredOrders = useMemo(() => {
    let result = orders.filter(order => {
      if (!orderMatchesReceivedFilter(order, filterStatus)) return false;
      if (filterStatus === "overdue" && orderDueState(order, todayStr) !== "overdue") return false;
      if (filterStatus === "duplicates" && !duplicateOrderIds.has(order.id)) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const linkedJob = workOrdersById.get(order.work_order_id);
        const searchable = [
          order.customer_name,
          order.description,
          order.requestor_name,
          order.requestor_email,
          order.vendor,
          order.request_type,
          linkedJob?.title,
          linkedJob?.client_name,
          linkedJob?.est_inv_at
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(search)) return false;
      }
      return true;
    });

    // Apply custom filter from column sorting
    if (sortConfig.customFilter && sortConfig.customFilter.filterType !== 'all') {
      const filter = sortConfig.customFilter;
      
      if (filter.filterType === 'selected' && filter.selectedValues?.length > 0) {
        result = result.filter(item => {
          const value = item[sortConfig.key];
          return value != null && filter.selectedValues.includes(String(value));
        });
      }
      
      if (filter.filterType === 'range' && filter.dateRange) {
        const { from, to } = filter.dateRange;
        result = result.filter(item => {
          const value = item[sortConfig.key];
          if (!value) return false;
          const date = new Date(value);
          if (isNaN(date.getTime())) return false;
          if (from && date < new Date(from)) return false;
          if (to && date > new Date(to)) return false;
          return true;
        });
      }
      
      if (filter.filterType === 'range' && filter.numberRange) {
        const { from, to } = filter.numberRange;
        result = result.filter(item => {
          const value = parseFloat(item[sortConfig.key]);
          if (isNaN(value)) return false;
          if (from !== null && value < from) return false;
          if (to !== null && value > to) return false;
          return true;
        });
      }
    }

    // Always separate received items (those with date_received) to the bottom.
    const withReceivedFlag = result.map(o => ({ ...o, _hasReceived: isFulfilledOrder(o) }));
    const notReceived = withReceivedFlag.filter(o => !o._hasReceived);
    const received = withReceivedFlag.filter(o => o._hasReceived);

    if (sortConfig.key) {
      const key = sortConfig.key;
      const isDateField = key.includes('date');
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      
      const sortFn = (a, b) => {
        let aVal = a[key] ?? '';
        let bVal = b[key] ?? '';

        if (isDateField) {
          aVal = aVal ? new Date(aVal).getTime() : 0;
          bVal = bVal ? new Date(bVal).getTime() : 0;
        } else {
          aVal = String(aVal).toLowerCase();
          bVal = String(bVal).toLowerCase();
        }

        return aVal < bVal ? -dir : aVal > bVal ? dir : 0;
      };
      notReceived.sort(sortFn);
      received.sort(sortFn);
      return [...notReceived, ...received];
    }

    const statusOrder = { pending: 0, cancelled: 1, ordered: 2, received: 3 };
    const defaultSortFn = (a, b) => {
      const aOrder = statusOrder[effectiveOrderStatus(a)] ?? 0;
      const bOrder = statusOrder[effectiveOrderStatus(b)] ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.row_number || 0) - (b.row_number || 0);
    };
    notReceived.sort(defaultSortFn);
    received.sort(defaultSortFn);
    return [...notReceived, ...received];
  }, [orders, filterStatus, searchTerm, sortConfig, todayStr, workOrdersById, duplicateOrderIds]);

  const historyLayout = useMemo(() => orderHistoryLayout(filteredOrders, filterStatus), [filteredOrders, filterStatus]);

  // Virtual scrolling setup
  const tableContainerRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: historyLayout.virtualCount,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: (index) => index === historyLayout.historyVirtualIndex ? 36 : 32,
    overscan: 15,
  });

  // Deep link: /OrderForm?order=<id> focuses the row on desktop or opens the
  // mobile detail dialog. Retries until the Order finishes loading.
  const deepLinkAppliedRef = useRef('');
  useEffect(() => {
    if (!focusOrderId || deepLinkAppliedRef.current === focusOrderId || !orders.length) return;
    const order = orders.find(o => o.id === focusOrderId);
    if (!order) return;
    deepLinkAppliedRef.current = focusOrderId;
    if (isMobile) {
      setMobileDetailOrderId(order.id);
      return;
    }
    const orderIndex = filteredOrders.findIndex(o => o.id === focusOrderId);
    if (orderIndex < 0) return;
    const virtualIndex = historyLayout.historyVirtualIndex !== null && orderIndex >= historyLayout.historyVirtualIndex
      ? orderIndex + 1 : orderIndex;
    rowVirtualizer.scrollToIndex(virtualIndex, { align: 'center' });
    setFocusedRowId(order.id);
  }, [focusOrderId, orders, filteredOrders, isMobile, historyLayout, rowVirtualizer]);

  const handleContextMenu = (e, order, fieldName, fieldLabel, currentValue) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      order,
      fieldName,
      fieldLabel,
      currentValue
    });
  };

  const clearCell = (orderId, fieldName) => {
    // Context-menu Clear applies the same companion-field and derived-status
    // rules as the dedicated Clear Date dialogs, staged as one pending save.
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    if (fieldName === 'request_type' || fieldName === 'description') {
      setSaveError(`${fieldName === 'request_type' ? 'Request Type' : 'Description'} is required for every Order and cannot be cleared.`);
      return;
    }
    if (fieldName === 'date_received') {
      updateOrder(orderId, 'receipt_option', '');
      updateOrder(orderId, 'date_received', '');
      updateOrder(orderId, 'status', order.date_ordered ? 'ordered' : 'pending');
      return;
    }
    if (fieldName === 'date_ordered') {
      updateOrder(orderId, 'date_ordered_option', '');
      updateOrder(orderId, 'date_ordered', '');
      updateOrder(orderId, 'status', orderStatusAfterOrderedDateChange(order, ''));
      return;
    }
    if (fieldName === 'date_needed') {
      updateOrder(orderId, 'date_needed_option', '');
      updateOrder(orderId, 'date_needed', '');
      return;
    }
    if (fieldName === 'requestor_name') {
      updateOrder(orderId, 'requestor_email', '');
      updateOrder(orderId, 'requestor_name', '');
      return;
    }
    updateOrder(orderId, fieldName, "");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (readError) {
    return (
      <div className="text-center p-8">
        <div className="text-sm font-bold text-red-700">Orders could not be verified completely.</div>
        <div className="mt-1 text-xs text-red-600">{readError}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => loadData(true)}>Retry</Button>
      </div>
    );
  }

  const saveRecovery = orderSaveRecoveryAction({
    saveError,
    readError,
    hasProtectedDrafts: hasUnsavedChanges || hasActiveOrderEdits(),
    busy: isLoading || isSaving || isSyncing,
  });

  // Mobile card view
  if (isMobile) {
    return (
      <>
        <OrderLinkedCustomerReview count={linkedNameReview.count} items={linkedNameReview.items}
          orders={orders} workOrders={workOrders}
          isAdmin={currentUser?.role === 'admin'} sessionToken={sessionToken}
          canResolve={!readError && !hasActiveOrderEdits() && !pendingSyncIdsRef.current.size && !isSaving && !isSyncing}
          onResolutionApplied={handleCustomerResolutionApplied} />
        <OrderMobileCards
          orders={filteredOrders}
          separateHistory={historyLayout.split}
          openCount={historyLayout.openCount}
          onOpenDetails={(order) => setMobileDetailOrderId(order.id)}
        />
        {mobileDetailOrderId && (
          <OrderMobileDetail
            order={orders.find(o => o.id === mobileDetailOrderId)}
            workOrder={workOrdersById.get(orders.find(o => o.id === mobileDetailOrderId)?.work_order_id) || null}
            vendors={vendors}
            requestTypes={requestTypes}
            onUpdate={updateOrder}
            onMarkOrdered={markOrderOrdered}
            onMarkReceived={markOrderReceived}
            busy={isSaving || isPulling || isSyncing}
            isRegistered={isRegistered}
            onClose={() => setMobileDetailOrderId(null)}
          />
        )}
      </>
    );
  }

  return (
    <div 
      className="overflow-visible" 
      tabIndex={0}
      onKeyDown={(e) => {
        if (focusedRowIndex !== null && filteredOrders.length > 0) {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            const newIndex = Math.min(focusedRowIndex + 1, filteredOrders.length - 1);
            setFocusedRowIndex(newIndex);
            setFocusedRowId(filteredOrders[newIndex].id);
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const newIndex = Math.max(focusedRowIndex - 1, 0);
            setFocusedRowIndex(newIndex);
            setFocusedRowId(filteredOrders[newIndex].id);
          } else if (e.key === 'Escape') {
            setFocusedRowId(null);
            setFocusedRowIndex(null);
          }
        }
      }}
      onClick={() => { contextMenu && setContextMenu(null); headerContextMenu && setHeaderContextMenu(null); }}
    >
      <OrderLinkedCustomerReview count={linkedNameReview.count} items={linkedNameReview.items}
        orders={orders} workOrders={workOrders}
        isAdmin={currentUser?.role === 'admin'} sessionToken={sessionToken}
        canResolve={!readError && !hasActiveOrderEdits() && !pendingSyncIdsRef.current.size && !isSaving && !isSyncing}
        onResolutionApplied={handleCustomerResolutionApplied} />
      {saveError && (
        <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex flex-wrap items-center justify-between gap-2">
          <span className="min-w-0 flex-1 break-words">{saveError}</span>
          {saveRecovery?.kind === 'protected_edits' ? (
            <span className="w-full font-medium">{saveRecovery.guidance}</span>
          ) : saveRecovery ? (
            <Button
              type="button" variant="outline" size="sm"
              disabled={saveRecovery.disabled}
              onClick={() => saveRecovery.kind === 'retry_sync' ? saveAndSync() : loadData(true)}
              className="h-7 shrink-0 border-red-300 bg-white text-red-800"
            >
              {saveRecovery.label}
            </Button>
          ) : null}
        </div>
      )}
      {syncMessage && !saveError && (
        <div className="mb-3 rounded-md border border-green-200 bg-green-50 p-2 text-xs text-green-800">
          {syncMessage}
        </div>
      )}

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls"
        onChange={importFromExcel}
        className="hidden"
      />

      {/* Import/Export Progress - handled globally by ImportProgressContext */}
      {exportProgress.show && (
        <div className="mb-3 px-2">
          <div className="clay-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Exporting...</span>
              <span className="text-xs text-gray-500">{exportProgress.progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-green-600 h-2 rounded-full transition-all" style={{ width: `${exportProgress.progress}%` }}></div>
            </div>
          </div>
        </div>
      )}

      {/* Force strikethrough on all child elements (inputs, selects, buttons) for received rows */}
      <style>{`
        .order-received-row td,
        .order-received-row td input,
        .order-received-row td select,
        .order-received-row td button,
        .order-received-row td span,
        .order-received-row td div {
          text-decoration: line-through !important;
          text-decoration-color: #9CA3AF !important;
          text-decoration-thickness: 1.5px !important;
          opacity: 0.75;
        }
        .order-spreadsheet th { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      `}</style>

      {/* Compact counts and a shortcut, without adding a separate dashboard-style banner. */}
      {(historyLayout.split || overdueCount > 0) && (
        <div className="mb-1 flex min-h-8 items-center justify-between gap-2 px-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-3">
            {historyLayout.split && (
              <span className="inline-flex items-center gap-1.5" aria-label={`${historyLayout.openCount} open orders`}>
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" aria-hidden="true" />
                Open <span className="font-semibold tabular-nums text-slate-700">{historyLayout.openCount}</span>
              </span>
            )}
            {overdueCount > 0 && (
              <span className="inline-flex items-center gap-1.5 text-red-600" aria-label={`${overdueCount} overdue orders`}>
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" aria-hidden="true" />
                Overdue <span className="font-semibold tabular-nums">{overdueCount}</span>
              </span>
            )}
          </span>
          {historyLayout.receivedCount > 0 && (
            <button type="button"
              className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
              onClick={() => rowVirtualizer.scrollToIndex(historyLayout.historyVirtualIndex, { align: 'start' })}
              aria-label={`Jump to received history, ${historyLayout.receivedCount} orders`}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              History <span className="font-semibold tabular-nums">{historyLayout.receivedCount}</span>
              <ArrowDown className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}

      {/* Spreadsheet Table */}
      <div ref={tableContainerRef} className="overflow-y-auto overflow-x-hidden ccs-scrollbar-hidden" style={{ height: 'calc(100vh - 300px)' }}>
      <table className="w-full border-collapse border rounded-lg order-spreadsheet" style={{ fontSize: compact ? '11px' : '12px', tableLayout: 'fixed', width: '100%' }}>
        <colgroup>
          <col style={{ width: '32px' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '38%' }} />
          <col style={{ width: '4%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '7%' }} />
          <col style={{ width: '32px' }} />
        </colgroup>
        {/* Header Row */}
        <thead className="bg-gray-100">
          <tr className="border-b sticky top-0 z-10 bg-gray-100">
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">#</th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'customer_name' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('customer_name')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'customer_name', 'Customer Name')}
            >
              <div className="flex items-center gap-1">Customer Name {getSortIcon('customer_name')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'request_type' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('request_type')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'request_type', 'Request Type')}
            >
              <div className="flex items-center gap-1">
                Request Type {getSortIcon('request_type')}
                {currentUser?.role === "admin" && (
                  <button type="button"
                    onClick={(e) => { e.stopPropagation(); setRequestTypesError(""); setEditingRequestTypes(true); }}
                    className="hover:bg-gray-300 rounded p-0.5"
                    aria-label="Manage Order item types"
                    title="Manage Order item types"
                  >
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'description' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('description')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'description', 'Description')}
            >
              <div className="flex items-center gap-1">Description {getSortIcon('description')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'quantity' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('quantity')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'quantity', 'Quantity')}
            >
              <div className="flex items-center gap-1">Qty {getSortIcon('quantity')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'requestor_name' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('requestor_name')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'requestor_name', 'Requestor')}
            >
              <div className="flex items-center gap-1">Requestor {getSortIcon('requestor_name')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_needed' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('date_needed')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'date_needed', 'Date Needed')}
            >
              <div className="flex items-center gap-1">Needed {getSortIcon('date_needed')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_ordered' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('date_ordered')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'date_ordered', 'Date Ordered')}
            >
              <div className="flex items-center gap-1">Ordered {getSortIcon('date_ordered')}</div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'vendor' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('vendor')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'vendor', 'Vendor')}
            >
              <div className="flex items-center gap-1">
                Vendor {getSortIcon('vendor')}
                {isRegistered && (
                  <button type="button" onClick={(e) => { e.stopPropagation(); setEditingVendors(true); }} className="hover:bg-gray-300 rounded p-0.5">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </th>
            <th 
              className={`px-2 py-2 border-r text-left font-medium text-gray-700 cursor-pointer hover:bg-gray-200 ${sortConfig.key === 'date_received' ? 'bg-blue-100' : ''}`} 
              onClick={() => handleSort('date_received')}
              onContextMenu={(e) => handleHeaderContextMenu(e, 'date_received', 'Date Received')}
            >
              <div className="flex items-center gap-1">Received {getSortIcon('date_received')}</div>
            </th>
            <th className="px-2 py-2 text-left font-medium text-gray-700"></th>
          </tr>
        </thead>

        {/* Data Rows */}
        <tbody>
          {/* Top spacer for virtual scroll */}
          <tr style={{ height: `${rowVirtualizer.getVirtualItems()[0]?.start || 0}px` }}>
            <td colSpan={11} />
          </tr>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            if (virtualRow.index === historyLayout.historyVirtualIndex) {
              return (
                <tr key="received-history-heading" className="border-t-2 border-slate-300 bg-slate-100/80" style={{ height: '36px' }}>
                  <td colSpan={11} className="px-3 py-1.5">
                    <div role="heading" aria-level={2} aria-label={`Received history, ${historyLayout.receivedCount} orders`}
                      className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>History</span>
                      <span className="rounded-full bg-white px-1.5 py-0.5 text-[11px] tabular-nums text-slate-500">{historyLayout.receivedCount}</span>
                      <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
                    </div>
                  </td>
                </tr>
              );
            }
            const index = historyLayout.orderIndexAtVirtual(virtualRow.index);
            const order = filteredOrders[index];
            const isFocused = focusedRowId === order.id;
            return (
            <React.Fragment key={order.id}>
              {isFocused && <tr><td colSpan="11" className="h-3 bg-transparent border-none"></td></tr>}
              <tr 
                className={`border-b hover:bg-gray-50 ${getRowColor(order)} ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''} ${isFulfilledOrder(order) ? 'order-received-row' : ''}`}
                style={getRowStyle(order)}
              >
              {/* Row Number - Clickable Focus Button */}
              <td className="px-0 py-0 border-r">
                <button type="button"
                  onClick={() => {
                    if (isFocused) {
                      setFocusedRowId(null);
                      setFocusedRowIndex(null);
                    } else {
                      setFocusedRowId(order.id);
                      setFocusedRowIndex(index);
                    }
                  }}
                  className={`w-full h-full px-2 py-1.5 text-center font-medium transition-colors ${
                    isFocused 
                      ? 'bg-purple-500 text-white' 
                      : 'text-gray-500 hover:bg-purple-100 hover:text-purple-700'
                  }`}
                >
                  {index + 1}
                </button>
              </td>

              {/* Customer Name with Work Order Link */}
              <td
                ref={showCustomerDropdown === order.id ? activeCustomerPickerRef : null}
                className="px-1 py-0.5 border-r relative"
                style={{ overflow: 'visible' }}
                onBlur={(event) => {
                  // A scrollbar click inside the dropdown can blur the input
                  // with relatedTarget=null. Outside pointerdown handles that
                  // case; do not mistake it for leaving the picker.
                  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) {
                    setShowCustomerDropdown(current => current === order.id ? null : current);
                  }
                }}
                onContextMenu={(e) => handleContextMenu(e, order, "customer_name", "Customer Name", order.customer_name)}
              >
                <div className="flex items-center gap-1 h-7">
                <Input
                  value={order.customer_name || ""}
                  onChange={(e) => {
                    // Customer typing bypasses updateOrder until blur, so it
                    // needs its own pull fence. Check the ref before the UI
                    // state update to close the same-tick pull/edit race.
                    if (manualPullInFlightRef.current || isPulling) {
                      setSaveError('Wait for the Smartsheet pull to finish before editing the customer.');
                      return;
                    }
                    const val = e.target.value;
                    // An intentional new keystroke supersedes the previous
                    // selection; only a delayed blur without new typing is stale.
                    verifiedCustomerSelectionRef.current.delete(order.id);
                    if (shouldUnlinkOrderJobForTypedCustomer(order, val)) {
                      manuallyUnlinkedCustomerOrderIdsRef.current.add(order.id);
                    }
                    customerNameDraftOrderRef.current = order.id;
                    setCustomerDraftActive(true);
                    orderLocalEditGenerationRef.current += 1;
                    setOrders(prev => prev.map(o => o.id === order.id ? orderAfterTypedCustomerName(o, val) : o));
                    setCustomerSearch(val);
                    setShowCustomerDropdown(order.id);
                  }}
                  onBlur={(event) => {
                    // Use the actual departing input value, not an older
                    // React render captured by a delayed refresh/click.
                    const customerName = event.currentTarget.value;
                    const staleSelectedName = isStaleVerifiedOrderCustomerBlur({
                      selection: verifiedCustomerSelectionRef.current.get(order.id),
                      blurValue: customerName,
                    });
                    if (!staleSelectedName) {
                      const unlinkedJob = manuallyUnlinkedCustomerOrderIdsRef.current.has(order.id);
                      const pending = pendingAfterManualCustomerBlur({
                        baseline: originalOrdersRef.current[order.id],
                        pending: pendingChangesRef.current[order.id],
                        customerName,
                        unlinkJob: unlinkedJob,
                      });
                      if (Object.keys(pending).length > 0) {
                        pendingChangesRef.current[order.id] = pending;
                        setHasUnsavedChanges(true);
                      } else {
                        delete pendingChangesRef.current[order.id];
                        setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
                      }
                      manuallyUnlinkedCustomerOrderIdsRef.current.delete(order.id);
                    }
                    if (customerNameDraftOrderRef.current === order.id) customerNameDraftOrderRef.current = null;
                    setCustomerDraftActive(Boolean(customerNameDraftOrderRef.current || customerSelectionInFlightRef.current));
                  }}
                  onFocus={(e) => {
                    if (manualPullInFlightRef.current || isPulling) return;
                    customerNameDraftOrderRef.current = order.id;
                    setCustomerDraftActive(true);
                    orderLocalEditGenerationRef.current += 1;
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(order.id);
                  }}
                  onClick={(event) => {
                    if (manualPullInFlightRef.current || isPulling) return;
                    setCustomerSearch(event.currentTarget.value);
                    setShowCustomerDropdown(order.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setShowCustomerDropdown(null);
                    }
                  }}
                  className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                  placeholder="Customer..."
                  title={order.work_order_id ? "Typing a different customer name unlinks the current job. Choose an active job to link it again." : "Choose an active job to associate this Order."}
                  disabled={!isRegistered || isPulling}
                />
                {order.work_order_id && (
                  <button type="button"
                    onClick={() => {
                      const wo = workOrders.find(w => w.id === order.work_order_id);
                      if (wo) setSelectedWorkOrder(wo);
                    }}
                    className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                    title="View linked work order"
                  >
                    <LinkIcon className="w-3 h-3 text-blue-500" />
                  </button>
                )}
              </div>
                {showCustomerDropdown === order.id && (
                  <div
                    role="group"
                    aria-label="Active jobs"
                    className="absolute left-0 top-full w-72 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    style={{ zIndex: 9999 }}
                  >
                    {getFilteredWorkOrders(customerSearch).length === 0 ? (
                      <p className="px-3 py-3 text-xs text-gray-500">No active jobs match.</p>
                    ) : getFilteredWorkOrders(customerSearch).map(wo => (
                      <button
                        key={wo.id}
                        type="button"
                        className="block w-full px-3 py-2 text-left hover:bg-gray-100 focus-visible:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 text-xs border-b last:border-0"
                        disabled={checkingCustomerJobId !== null || isPulling}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={async () => {
                          if (manualPullInFlightRef.current || isPulling || customerSelectionInFlightRef.current) return;
                          customerSelectionInFlightRef.current = true;
                          setCustomerDraftActive(true);
                          const selectionEditGeneration = ++orderLocalEditGenerationRef.current;
                          setCheckingCustomerJobId(wo.id);
                          try {
                            // A job may have been closed since the latest 60-second refresh.
                            // Never link a stale suggestion without a fresh read.
                            const { latest, eligible } = await verifyActiveOrderCustomerJob(WorkOrder, wo.id);
                            // A newer edit during this async verification must
                            // never be replaced by an older customer/job choice.
                            if (orderLocalEditGenerationRef.current !== selectionEditGeneration) {
                              setSaveError("The Order changed while this job was checked. Review the customer and select the job again.");
                              return;
                            }
                            if (!eligible) {
                              if (latest?.id === wo.id) {
                                setWorkOrders(prev => prev.map(w => w.id === latest.id ? latest : w));
                              }
                              setSaveError("This job is no longer active. Choose another active job.");
                              return;
                            }
                            setSaveError("");
                            setOrders(prev => prev.map(o => o.id === order.id ? {
                              ...o, customer_name: latest.client_name, work_order_id: latest.id
                            } : o));
                            pendingChangesRef.current[order.id] = {
                              ...pendingChangesRef.current[order.id],
                              customer_name: latest.client_name,
                              work_order_id: latest.id
                            };
                            setHasUnsavedChanges(true);
                            manuallyUnlinkedCustomerOrderIdsRef.current.delete(order.id);
                            verifiedCustomerSelectionRef.current.set(order.id, {
                              customerName: latest.client_name,
                              workOrderId: latest.id,
                            });
                            // Picker clicks preserve input focus, so blur may
                            // never fire. The verified association is now queued
                            // for autosave; release just this draft latch.
                            if (customerNameDraftOrderRef.current === order.id) {
                              customerNameDraftOrderRef.current = null;
                            }
                            setShowCustomerDropdown(null);
                            setEditingCustomerName(null);
                          } catch (error) {
                            setSaveError(error?.message || "Could not verify this job is active. Try again.");
                          } finally {
                            customerSelectionInFlightRef.current = false;
                            setCustomerDraftActive(Boolean(customerNameDraftOrderRef.current));
                            setCheckingCustomerJobId(null);
                          }
                        }}
                      >
                        <span className="block font-medium text-gray-800">{wo.client_name}</span>
                        <span className="block text-gray-500 truncate">{checkingCustomerJobId === wo.id ? "Checking active job…" : orderCustomerJobSubtitle(wo)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </td>

              {/* Request Type */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "request_type", "Request Type", order.request_type)}
              >
                <Select
                  value={order.request_type || "Other"}
                  onValueChange={(val) => updateOrder(order.id, "request_type", val)}
                  disabled={!isRegistered || isPulling}
                >
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requestTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>

              {/* Description */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "description", "Description", order.description)}
              >
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div 
                        className="h-7 text-xs flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded px-1 overflow-hidden"
                        onClick={() => setExpandedDescription(order.id)}
                      >
                        {duplicateOrderIds.has(order.id) && (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setDuplicateReviewOrderId(order.id); }}
                            title={`Possible duplicate — ${duplicateGroupSizes.get(order.id)} open orders share this customer, description, and vendor. Click to compare.`}
                            aria-label="Review possible duplicate order"
                            className="flex-shrink-0 rounded hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber-400"
                          >
                            <AlertTriangle className="w-3 h-3 text-amber-500" />
                          </button>
                        )}
                        <span className="truncate">{order.description || "Description..."}</span>
                        {order.description && order.description.length > 30 && (
                          <Expand className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        )}
                      </div>
                    </TooltipTrigger>
                    {order.description && order.description.length > 30 && (
                      <TooltipContent side="bottom" className="max-w-sm">
                        <p className="text-xs whitespace-pre-wrap">{renderWithLinks(order.description)}</p>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </td>

              {/* Quantity */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "quantity", "Quantity", order.quantity)}
              >
                <Input
                  value={order.quantity || ""}
                  onChange={(e) => updateOrder(order.id, "quantity", e.target.value)}
                  className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                  placeholder="-"
                  disabled={!isRegistered || isPulling}
                />
              </td>

              {/* Requestor */}
              <td 
                className="px-1 py-0.5 border-r relative"
                onContextMenu={(e) => handleContextMenu(e, order, "requestor_name", "Requestor", order.requestor_name)}
              >
                <div 
                  className="flex items-center gap-1 cursor-pointer h-7 hover:bg-gray-100 rounded px-1 overflow-hidden"
                  onClick={(e) => {
                    if (!isRegistered || manualPullInFlightRef.current || isPulling) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDropdownPosition({ top: rect.bottom + 2, left: rect.left });
                    setShowRequestorDropdown(order.id);
                  }}
                >
                  {order.requestor_name && (
                    <div className={`w-5 h-5 rounded-full ${getRequestorColor(order.requestor_email)} text-white text-xs flex items-center justify-center flex-shrink-0`}>
                      {order.requestor_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="text-xs truncate">{order.requestor_name ? order.requestor_name.split(' ')[0] : "-"}</span>
                </div>
                {showRequestorDropdown === order.id && (
                  <div 
                    className="fixed w-56 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" 
                    style={{ zIndex: 9999, top: dropdownPosition.top, left: dropdownPosition.left }}
                  >
                    {users.map(u => (
                      <div
                        key={u.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs flex items-center gap-2"
                        onMouseDown={() => {
                          if (manualPullInFlightRef.current || isPulling) return;
                          updateOrder(order.id, "requestor_name", u.full_name);
                          updateOrder(order.id, "requestor_email", u.email);
                          setShowRequestorDropdown(null);
                        }}
                      >
                        <div className={`w-5 h-5 rounded-full ${getRequestorColor(u.email)} text-white text-xs flex items-center justify-center`}>
                          {(u.full_name || u.email || "?").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium">{u.full_name}</div>
                          <div className="text-gray-500">{u.email}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </td>

              {/* Date Needed */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "date_needed", "Date Needed", order.date_needed)}
              >
                <Popover open={openDatePopover === `needed-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `needed-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered || isPulling}>
                    <button type="button" className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      <span className="truncate">{order.date_needed_option || safeFormatDate(order.date_needed, "MM/dd/yy")}</span>
                      {orderDueState(order, todayStr) === "overdue" && (
                        <span className="ml-auto inline-flex shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>
                      )}
                      {orderDueState(order, todayStr) === "due_soon" && (
                        <span className="ml-auto inline-flex shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">Due soon</span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {(order.date_needed || order.date_needed_option) && (
                      <div className="p-2 border-b">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => {
                            setClearDateConfirm({ orderId: order.id, field: 'date_needed' });
                            setOpenDatePopover(null);
                          }}
                        >
                          Clear Date
                        </Button>
                      </div>
                    )}
                    <Calendar
                      mode="single"
                      selected={parseLocalDate(order.date_needed)}
                      onSelect={async (date) => {
                        if (date) {
                          const missingFields = validateOrderForDateNeeded(order);
                          if (missingFields.length > 0) {
                            setValidationError({ orderId: order.id, fields: missingFields, type: 'date_needed' });
                            setOpenDatePopover(null);
                            return;
                          }
                          // Prevent selecting dates in the past
                          const today = new Date();
                          today.setHours(0, 0, 0, 0);
                          if (date < today) {
                            setValidationError({ orderId: order.id, fields: ["Date needed cannot be in the past"], type: 'date_needed' });
                            setOpenDatePopover(null);
                            return;
                          }
                        }
                        try {
                          setSaveError('');
                          await persistDateNeeded(
                            order.id, date ? format(date, 'yyyy-MM-dd') : '',
                            date ? 'Set Date Needed' : 'Clear Date Needed'
                          );
                          setOpenDatePopover(null);
                        } catch (error) {
                          setSaveError(error?.message || 'Date Needed was not saved. Reload before retrying.');
                        }
                      }}
                      disabled={(date) => {
                        const today = new Date();
                        today.setHours(0, 0, 0, 0);
                        return date < today;
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </td>

              {/* Ordered Date */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "date_ordered", "Date Ordered", order.date_ordered)}
              >
                <Popover open={openDatePopover === `ordered-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordered-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered || isPulling}>
                    <button type="button" className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_ordered_option || safeFormatDate(order.date_ordered, "MM/dd/yy")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {(order.date_ordered || order.date_ordered_option) && (
                      <div className="p-2 border-b">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => {
                            setClearDateConfirm({ orderId: order.id, field: 'date_ordered' });
                            setOpenDatePopover(null);
                          }}
                        >
                          Clear Date
                        </Button>
                      </div>
                    )}
                    <Calendar
                              mode="single"
                              selected={parseLocalDate(order.date_ordered)}
                              onSelect={async (date) => {
                                if (date) {
                                  // Check if ordered date is in the future
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);
                                  if (date > today) {
                                    setValidationError({ orderId: order.id, fields: ["Date ordered cannot be in the future"], type: 'date_ordered' });
                                    setOpenDatePopover(null);
                                    return;
                                  }
                                  const dateStr = format(date, "yyyy-MM-dd");
                                  try {
                                    setSaveError("");
                                    await persistImmediateOrderFields(
                                      order.id,
                                      { date_ordered: dateStr, date_ordered_option: "", status: orderStatusAfterOrderedDateChange(order, dateStr) },
                                      "Order date ordered"
                                    );
                                  } catch (error) {
                                    console.error("Could not save Order date ordered safely:", error);
                                    setSaveError(error?.message || "This Order changed in another session. Reload before changing Date Ordered.");
                                  }
                                } else {
                                  try {
                                    setSaveError("");
                                    await persistImmediateOrderFields(
                                      order.id,
                                      { date_ordered: "", date_ordered_option: "", status: orderStatusAfterOrderedDateChange(order, "") },
                                      "Order date ordered clear"
                                    );
                                  } catch (error) {
                                    console.error("Could not clear Order date ordered safely:", error);
                                    setSaveError(error?.message || "This Order changed in another session. Reload before clearing Date Ordered.");
                                  }
                                }
                                setOpenDatePopover(null);
                              }}
                              disabled={(date) => {
                                const today = new Date();
                                today.setHours(0, 0, 0, 0);
                                // Only disable future dates
                                return date > today;
                              }}
                            />
                  </PopoverContent>
                </Popover>
              </td>

              {/* Vendor */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "vendor", "Vendor", order.vendor)}
              >
                <Select
                  value={order.vendor || ""}
                  onValueChange={(val) => updateOrder(order.id, "vendor", val)}
                  disabled={!isRegistered || isPulling}
                >
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent w-full">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>

              {/* Date Received */}
              <td 
                className="px-1 py-0.5 border-r"
                onContextMenu={(e) => handleContextMenu(e, order, "date_received", "Date Received", order.date_received)}
              >
                <Popover open={openDatePopover === `received-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `received-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered || isPulling}>
                    <button type="button" className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.receipt_option || safeFormatDate(order.date_received, "MM/dd/yy")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {(order.date_received || order.receipt_option) && (
                      <div className="p-2 border-b">
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full text-xs"
                          onClick={() => {
                            setClearDateConfirm({ orderId: order.id, field: 'date_received' });
                            setOpenDatePopover(null);
                          }}
                        >
                          Clear Date
                        </Button>
                      </div>
                    )}
                    <div className="max-w-[310px] space-y-2 border-b p-3">
                      <p className="text-xs font-semibold text-gray-700">Choose an option or a date</p>
                      <div className="flex flex-wrap gap-1.5">
                        {receiptOptions.map((option) => (
                          <Button key={option} type="button" size="sm"
                            variant={order.receipt_option === option ? 'default' : 'outline'} disabled={isSaving || isPulling}
                            onClick={async () => {
                              try {
                                setSaveError('');
                                await persistImmediateOrderFields(order.id, {
                                  date_received: '', receipt_option: option,
                                  status: 'received',
                                }, 'Order received option');
                                setOpenDatePopover(null);
                              } catch (error) {
                                setSaveError(error?.message || 'The receipt option could not be saved. Reload before retrying.');
                              }
                            }}>{option}</Button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        <Input value={newReceiptOption} maxLength={120} placeholder="Add another option"
                          aria-label="New receipt option" className="h-9 text-xs"
                          onChange={(event) => setNewReceiptOption(event.target.value)} />
                        <Button type="button" size="sm" variant="outline"
                          disabled={!newReceiptOption.trim() || receiptOptions.some(option => option.toLowerCase() === newReceiptOption.trim().toLowerCase())}
                          onClick={() => {
                            const option = newReceiptOption.trim();
                            if (!option || receiptOptions.some(existing => existing.toLowerCase() === option.toLowerCase())) return;
                            const next = [...receiptOptions, option];
                            setReceiptOptions(next);
                            localStorage.setItem('orderReceiptOptions', JSON.stringify(next));
                            setNewReceiptOption('');
                          }}>Add</Button>
                      </div>
                      <p className="text-xs text-gray-500">Any selected option counts as received, just like a received date.</p>
                    </div>
                    <Calendar
                              mode="single"
                              selected={parseLocalDate(order.date_received)}
                              onSelect={async (date) => {
                                if (date) {
                                  // Validate all fields before marking as received
                                  const missingFields = validateOrderForReceived(order);
                                  if (missingFields.length > 0) {
                                    setValidationError({ orderId: order.id, fields: missingFields });
                                    setOpenDatePopover(null);
                                    return;
                                  }
                                  // Prevent received date from being before ordered date or needed date
                                  if (order.date_ordered && date < parseLocalDate(order.date_ordered)) {
                                    setValidationError({ orderId: order.id, fields: ["Date received cannot be before date ordered"], type: 'date_received' });
                                    setOpenDatePopover(null);
                                    return;
                                  }
                                  if (order.date_needed && date < parseLocalDate(order.date_needed)) {
                                    setValidationError({ orderId: order.id, fields: ["Date received cannot be before date needed"], type: 'date_received' });
                                    setOpenDatePopover(null);
                                    return;
                                  }
                                  const dateStr = format(date, "yyyy-MM-dd");
                                  try {
                                    setSaveError("");
                                    await persistImmediateOrderFields(
                                      order.id,
                                      { date_received: dateStr, receipt_option: '', status: "received" },
                                      "Order date received"
                                    );
                                  } catch (error) {
                                    console.error("Could not save Order date received safely:", error);
                                    setSaveError(error?.message || "This Order changed in another session. Reload before changing Date Received.");
                                  }
                                } else {
                                  try {
                                    setSaveError("");
                                    await persistImmediateOrderFields(
                                      order.id,
                                      { date_received: "", receipt_option: '', status: order.date_ordered ? 'ordered' : 'pending' },
                                      "Order date received clear"
                                    );
                                  } catch (error) {
                                    console.error("Could not clear Order date received safely:", error);
                                    setSaveError(error?.message || "This Order changed in another session. Reload before clearing Date Received.");
                                  }
                                }
                                setOpenDatePopover(null);
                              }}
                              disabled={(date) => {
                                if (order.date_ordered) {
                                  const orderedDate = parseLocalDate(order.date_ordered);
                                  return date < orderedDate;
                                }
                                return false;
                              }}
                            />
                  </PopoverContent>
                </Popover>
              </td>

              {/* Actions */}
              <td className="px-1 py-0.5 text-center">
                {isRegistered && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteOrder(order)}
                    disabled={isPulling}
                    className="h-6 w-6"
                  >
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </Button>
                )}
              </td>
            </tr>
              {isFocused && <tr><td colSpan="11" className="h-3 bg-transparent border-none"></td></tr>}
            </React.Fragment>
          );
          })}
          {/* Bottom spacer for virtual scroll */}
          <tr style={{ height: `${rowVirtualizer.getTotalSize() - (rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1]?.end || 0)}px` }}>
            <td colSpan={11} />
          </tr>
        </tbody>
      </table>
      </div>

      {/* Edit Request Types Dialog */}
      <Dialog open={editingRequestTypes} onOpenChange={setEditingRequestTypes}>
        <DialogContent className="clay-card border-none max-w-sm [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Manage Order Item Types</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              Admin-only. Changes save immediately to the shared Order Form list and the Smartsheet Request Type dropdown.
            </p>
            {requestTypesError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
                {requestTypesError}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                value={newRequestType}
                onChange={(e) => setNewRequestType(e.target.value)}
                placeholder="New item type..."
                onKeyDown={(e) => e.key === 'Enter' && !requestTypesSaving && addRequestType()}
                disabled={requestTypesSaving}
              />
              <Button onClick={addRequestType} size="icon" className="shrink-0" disabled={requestTypesSaving}>
                {requestTypesSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {requestTypes.map((type, index) => (
                <div
                  key={type}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button type="button" 
                        onClick={() => {
                          if (index === 0) return;
                          const items = [...requestTypes];
                          [items[index - 1], items[index]] = [items[index], items[index - 1]];
                          saveRequestTypes(items);
                        }}
                        disabled={index === 0 || requestTypesSaving}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button type="button" 
                        onClick={() => {
                          if (index === requestTypes.length - 1) return;
                          const items = [...requestTypes];
                          [items[index], items[index + 1]] = [items[index + 1], items[index]];
                          saveRequestTypes(items);
                        }}
                        disabled={index === requestTypes.length - 1 || requestTypesSaving}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                    <span className="text-sm">{type}</span>
                  </div>
                  <button type="button"
                    onClick={() => removeRequestType(type)}
                    disabled={requestTypesSaving || requestTypes.length <= 1}
                    className="text-red-500 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label={`Remove ${type}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button onClick={() => setEditingRequestTypes(false)} className="w-full" disabled={requestTypesSaving}>
              {requestTypesSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {requestTypesSaving ? "Saving…" : "Close"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded Description Dialog */}
      <Dialog open={expandedDescription !== null} onOpenChange={() => setExpandedDescription(null)}>
        <DialogContent className="clay-card border-none max-w-lg [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Description</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {expandedDescription && (
              <>
                <textarea
                  value={orders.find(o => o.id === expandedDescription)?.description || ""}
                  onChange={(e) => updateOrder(expandedDescription, "description", e.target.value)}
                  className="w-full min-h-[150px] p-3 text-sm border rounded-lg resize-y"
                  placeholder="Enter description..."
                  disabled={!isRegistered || isPulling}
                />
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium mb-1">Preview with links:</div>
                  <div className="whitespace-pre-wrap">
                    {renderWithLinks(orders.find(o => o.id === expandedDescription)?.description || "")}
                  </div>
                </div>
                <Button onClick={() => setExpandedDescription(null)} className="w-full">
                  <Save className="w-4 h-4 mr-2" />
                  Save & Close
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Validation Error Dialog */}
      <AlertDialog open={!!validationError} onOpenChange={() => setValidationError(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-orange-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              {validationError?.type === 'date_needed' 
                ? 'Cannot Set Date Needed' 
                : validationError?.type === 'date_ordered'
                ? 'Cannot Set Date Ordered'
                : 'Cannot Mark as Received'}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              <p className="mb-3">
                {validationError?.type === 'date_needed' 
                  ? 'Please fill out the following fields before setting the date needed:' 
                  : validationError?.type === 'date_received' || validationError?.type === 'date_ordered'
                  ? 'Date validation error:'
                  : 'Please fill out the following fields before marking this order as received:'}
              </p>
              <ul className="list-disc list-inside space-y-1 text-gray-700">
                {validationError?.fields.map((field, i) => (
                  <li key={i} className="font-medium">{field}</li>
                ))}
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="clay-button border-none" style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}>
              Got it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Work Order Details Dialog */}
      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => {
            loadData(false);
          }}
        />
      )}

      {/* Duplicate Order Review */}
      {duplicateReviewGroup.length > 1 && (
        <OrderDuplicateReview
          orders={duplicateReviewGroup}
          workOrdersById={workOrdersById}
          onKeepOrder={handleDuplicateKeep}
          onNotDuplicates={handleDuplicateNotDuplicates}
          busy={duplicateReviewBusy || isPulling}
          onClose={() => setDuplicateReviewOrderId(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order for "{deleteConfirm?.customer_name}"?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> This action moves the item to the Order Trash. Only admins can permanently delete or recover items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={isPulling || deleteInFlightRef.current} className="bg-red-600 text-white">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Date Confirmation Dialog */}
      <AlertDialog open={!!clearDateConfirm} onOpenChange={() => setClearDateConfirm(null)}>
        <AlertDialogContent className="clay-card border-none max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Clear Date?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to clear this date?
              <br /><br />
              <span className="font-medium text-orange-600">Note:</span> Email automations may be resent if this field is filled out again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={async () => {
                if (clearDateConfirm) {
                  if (clearDateConfirm.field === 'date_received') {
                    const order = orders.find(o => o.id === clearDateConfirm.orderId);
                    try {
                      setSaveError('');
                      await persistImmediateOrderFields(order.id, {
                        date_received: '', receipt_option: '',
                        status: order.date_ordered ? 'ordered' : 'pending',
                      }, 'Clear received value');
                    } catch (error) {
                      setSaveError(error?.message || 'Could not clear the received value. Reload before retrying.');
                    }
                  } else if (clearDateConfirm.field === 'date_ordered') {
                    const order = orders.find(o => o.id === clearDateConfirm.orderId);
                    try {
                      if (!order?.id) throw new Error('The Order is no longer loaded. Reload before clearing its date.');
                      setSaveError('');
                      // Clear the date, companion option and derived status in
                      // one concurrency-checked write, just like calendar edits.
                      await persistImmediateOrderFields(order.id, {
                        date_ordered: '', date_ordered_option: '',
                        status: orderStatusAfterOrderedDateChange(order, ''),
                      }, 'Clear ordered date');
                    } catch (error) {
                      setSaveError(error?.message || 'Could not clear Date Ordered. Reload before retrying.');
                    }
                  } else if (clearDateConfirm.field === 'date_needed') {
                    try {
                      setSaveError('');
                      await persistDateNeeded(clearDateConfirm.orderId, '', 'Clear Date Needed');
                    } catch (error) {
                      setSaveError(error?.message || 'Date Needed was not cleared. Reload before retrying.');
                    }
                  }
                }
                setClearDateConfirm(null);
              }}
              className="bg-red-600 text-white"
            >
              Clear Date
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Context Menu */}
      {contextMenu && (
        <CellContextMenu
          position={{ x: contextMenu.x, y: contextMenu.y }}
          onClose={() => setContextMenu(null)}
          actions={orderContextActions(contextMenu.order)}
          entityType="Order"
          entityId={contextMenu.order.id}
          fieldName={contextMenu.fieldName}
          fieldLabel={contextMenu.fieldLabel}
          currentValue={contextMenu.currentValue}
          onClear={() => clearCell(contextMenu.order.id, contextMenu.fieldName)}
          isRegistered={isRegistered}
        />
      )}

      {/* Header Context Menu */}
      {headerContextMenu && (
        <ColumnHeaderContextMenu
          position={{ x: headerContextMenu.x, y: headerContextMenu.y }}
          onClose={() => setHeaderContextMenu(null)}
          fieldName={headerContextMenu.fieldName}
          fieldLabel={headerContextMenu.fieldLabel}
          onSort={(key, dir) => handleColumnSort(key, dir)}
          onCustomSort={handleCustomSort}
          onClearSort={clearSort}
          currentSortKey={sortConfig.key}
          currentSortDirection={sortConfig.direction}
          allValues={orders}
        />
      )}

      {/* Edit Vendors Dialog */}
      <Dialog open={editingVendors} onOpenChange={setEditingVendors}>
        <DialogContent className="clay-card border-none max-w-sm [&>button]:hidden">
          <DialogHeader>
            <DialogTitle>Edit Vendors</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newVendor}
                onChange={(e) => setNewVendor(e.target.value)}
                placeholder="New vendor..."
                onKeyDown={(e) => e.key === 'Enter' && addVendor()}
              />
              <Button onClick={addVendor} size="icon" className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {vendors.map((vendor, index) => (
                <div
                  key={vendor}
                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                >
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button type="button" 
                        onClick={() => {
                          if (index === 0) return;
                          const items = [...vendors];
                          [items[index - 1], items[index]] = [items[index], items[index - 1]];
                          saveVendors(items);
                        }}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button type="button" 
                        onClick={() => {
                          if (index === vendors.length - 1) return;
                          const items = [...vendors];
                          [items[index], items[index + 1]] = [items[index + 1], items[index]];
                          saveVendors(items);
                        }}
                        disabled={index === vendors.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                    <span className="text-sm">{vendor}</span>
                  </div>
                  <button type="button" onClick={() => removeVendor(vendor)} className="text-red-500 hover:text-red-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button onClick={() => setEditingVendors(false)} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save & Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default OrderSpreadsheet;