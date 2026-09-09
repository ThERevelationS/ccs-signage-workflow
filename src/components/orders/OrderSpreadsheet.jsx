import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
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
  ArrowDown
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
import { ColumnHeaderContextMenu, useColumnSorting } from "@/components/shared/ColumnHeaderContextMenu";
import { useMultiImport } from "@/components/shared/MultiImportContext";
import { importOrders as importOrdersFn } from "@/functions/importOrders";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import {
  replaceOrderFieldsIfUnchanged,
  softDeleteOrderFromLoadedSnapshot,
} from "@/components/orders/orderPersistence";


const Order = base44.entities.Order;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

const OrderSpreadsheet = React.forwardRef(({ workOrderFilter = null, compact = false, searchTerm = "", filterStatus = "all", onSaveStatusChange = null, showButtonsInline = true }, ref) => {
  const { currentUser, isRegistered } = useAuth();
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
  const [saveError, setSaveError] = useState("");
  const [lastSaved, setLastSaved] = useState(null);
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
  const [showRequestorDropdown, setShowRequestorDropdown] = useState(null);

  const [editingRequestTypes, setEditingRequestTypes] = useState(false);
  const [editingVendors, setEditingVendors] = useState(false);
  const [requestTypes, setRequestTypes] = useState(() => {
    const saved = localStorage.getItem('orderRequestTypes');
    return saved ? JSON.parse(saved) : DEFAULT_REQUEST_TYPES;
  });
  const [vendors, setVendors] = useState(() => {
    const saved = localStorage.getItem('orderVendors');
    return saved ? JSON.parse(saved) : DEFAULT_VENDORS;
  });
  const [newRequestType, setNewRequestType] = useState("");
  const [newVendor, setNewVendor] = useState("");
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [expandedDescription, setExpandedDescription] = useState(null);
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
  const originalOrdersRef = useRef({}); // Track original order data for comparison
  const saveInFlightRef = useRef(false);
  const addInFlightRef = useRef(false);
  const deleteInFlightRef = useRef(false);
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

  // Auto-save every 5 seconds if there are unsaved changes
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
      onSaveStatusChange({ hasUnsavedChanges, isSaving, lastSaved });
    }
  }, [hasUnsavedChanges, isSaving, lastSaved]);

  const loadData = async (showLoading = true) => {
    if (showLoading && orders.length === 0) setIsLoading(true);
    setReadError("");
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
        loadAllEntityRows({
          entity: WorkOrder,
          query: { completed: { $ne: true }, deleted: { $ne: true } },
          sort: "created_date",
          label: "Order Spreadsheet Work Orders",
        }),
        AuthorizedEmail.list()
      ]);
      setOrders(ordersData);
      setWorkOrders(workOrdersData);
      setUsers(usersData);
      // Store original data for comparison
      ordersData.forEach(order => {
        originalOrdersRef.current[order.id] = { ...order };
      });
    } catch (error) {
      console.error("Error loading data:", error);
      setReadError(error?.message || "Orders could not be verified completely.");
    }
    setIsLoading(false);
  };

  const saveAllChanges = async () => {
    if (saveInFlightRef.current) return;
    const changes = Object.fromEntries(
      Object.entries(pendingChangesRef.current).map(([orderId, updates]) => [orderId, { ...updates }])
    );
    if (Object.keys(changes).length === 0) return;

    saveInFlightRef.current = true;
    setIsSaving(true);
    setSaveError("");
    let savedRows = 0;
    try {
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
          nextFields: cleanedUpdates,
          label: `Order ${baseline.row_number || orderId} save`,
        });
        savedRows += 1;

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
  };

  // Expose save function to parent
  const manualSave = () => {
    saveAllChanges();
  };

  const addNewRow = async () => {
    if (!isRegistered || addInFlightRef.current) return;
    addInFlightRef.current = true;
    setSaveError("");
    try {
      const maxRowNumber = orders.length > 0
        ? Math.max(...orders.map(o => o.row_number || 0))
        : 0;

      const newOrder = await Order.create({
        customer_name: "",
        request_type: requestTypes[0] || "Other",
        description: "",
        quantity: "",
        requestor_email: currentUser?.email || "",
        requestor_name: currentUser?.full_name || "",
        vendor: "",
        status: "pending",
        row_number: maxRowNumber + 1,
        work_order_id: workOrderFilter || ""
      });

      setOrders((current) => [...current, newOrder]);
      originalOrdersRef.current[newOrder.id] = { ...newOrder };

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
    const currentOrder = orders.find(o => o.id === orderId);
    if (!currentOrder) return;
    const oldValue = currentOrder[field];

    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...order, [field]: value }
      : order));

    if (!skipHistory && oldValue !== value) {
      trackChange(orderId, field, oldValue, value);
    }

    pendingChangesRef.current[orderId] = {
      ...pendingChangesRef.current[orderId],
      [field]: value
    };
    setHasUnsavedChanges(true);
  };

  const persistImmediateOrderFields = async (orderId, nextFields, label) => {
    const baseline = originalOrdersRef.current[orderId];
    if (!baseline?.id) throw new Error(`${label} is missing its loaded Order baseline. Reload before saving.`);
    const saved = await replaceOrderFieldsIfUnchanged({
      entity: Order,
      order: baseline,
      nextFields,
      label,
    });
    originalOrdersRef.current[orderId] = { ...saved };

    const latestPending = { ...(pendingChangesRef.current[orderId] || {}) };
    for (const [field, value] of Object.entries(nextFields)) {
      if (Object.is(latestPending[field], value)) delete latestPending[field];
    }
    if (Object.keys(latestPending).length > 0) pendingChangesRef.current[orderId] = latestPending;
    else delete pendingChangesRef.current[orderId];

    setOrders((current) => current.map((order) => order.id === orderId
      ? { ...saved, ...(pendingChangesRef.current[orderId] || {}) }
      : order));
    setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
    return saved;
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const deleteOrder = async (order) => {
    setDeleteConfirm(order);
  };

  const confirmDelete = async () => {
    const target = deleteConfirm;
    if (!target || deleteInFlightRef.current) return;
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
      setOrders((current) => current.filter(o => o.id !== target.id));
      delete pendingChangesRef.current[target.id];
      delete originalOrdersRef.current[target.id];
      setHasUnsavedChanges(Object.keys(pendingChangesRef.current).length > 0);
      setDeleteConfirm(null);
    } catch (error) {
      console.error("Could not delete Order safely:", error);
      setSaveError(error?.message || "This Order changed in another session. Reload before deleting it.");
      setDeleteConfirm(null);
    } finally {
      deleteInFlightRef.current = false;
    }
  };

  const getFilteredWorkOrders = React.useCallback((searchTerm) => {
    // Filter out riders - only show main work orders (no riders)
    const mainWorkOrders = workOrders.filter(wo => !wo.is_rider);

    if (!searchTerm) return mainWorkOrders.slice(0, 10);
    const lower = searchTerm.toLowerCase();
    const terms = lower.split(/\s+/).filter(t => t.length > 0);

    return mainWorkOrders.filter(wo => {
      const searchable = [
        wo.client_name,
        wo.title,
        wo.description
      ].filter(Boolean).join(' ').toLowerCase();

      return terms.every(term => searchable.includes(term));
    }).slice(0, 10);
  }, [workOrders]);

  const saveRequestTypes = (types) => {
    setRequestTypes(types);
    localStorage.setItem('orderRequestTypes', JSON.stringify(types));
  };

  const saveVendors = (vendorList) => {
    setVendors(vendorList);
    localStorage.setItem('orderVendors', JSON.stringify(vendorList));
  };

  const addRequestType = () => {
    if (newRequestType.trim() && !requestTypes.includes(newRequestType.trim())) {
      saveRequestTypes([...requestTypes, newRequestType.trim()]);
      setNewRequestType("");
    }
  };

  const removeRequestType = (type) => {
    saveRequestTypes(requestTypes.filter(t => t !== type));
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
    if (order.status === "received") return "bg-green-100";
    if (order.status === "ordered") return "bg-green-50";
    if (order.status === "cancelled") return "bg-gray-100";
    return "bg-white";
  };

  const getRowStyle = (order) => {
    if (order.status === "received") {
      return { textDecoration: "line-through", textDecorationColor: "#1F2937", textDecorationThickness: "2px" };
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
    setExportProgress({ show: true, progress: 0 });
    
    const exportData = filteredOrders.map(order => ({
      "Customer": order.customer_name || "",
      "Type": order.request_type || "",
      "Description": order.description || "",
      "How much?": order.quantity || "",
      "Requestor": order.requestor_name || "",
      "Date Needed (Requester fills out this column)": order.date_needed || "",
      "Ordered Date (Carl Fills out this column)": order.date_ordered || "",
      "Vendor (Anyone can fill out this column)": order.vendor || "",
      "Date Recieved (Anyone can fill out this column)": order.date_received || ""
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

    const importId = startMultiImport(file.name);
    const processingTimeout = setTimeout(() => {
      updateImport(importId, { message: 'Processing rows on server...' });
    }, 1500);

    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(btoa(e.target.result));
        reader.onerror = reject;
        reader.readAsBinaryString(file);
      });
      const res = await importOrdersFn({ fileData, workOrderFilter: workOrderFilter || '' });
      clearTimeout(processingTimeout);
      const result = res.data;
      finishImport(importId, `${result.created} created, ${result.updated} updated${result.skipped ? `, ${result.skipped} unchanged` : ''}`);
      await loadData(false);
    } catch (err) {
      clearTimeout(processingTimeout);
      console.error("Import failed:", err);
      finishImport(importId, 'Import failed. Please try again.', true);
    }
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    exportToExcel,
    importFromExcel: () => fileInputRef.current?.click(),
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
  const filteredOrders = useMemo(() => {
    let result = orders.filter(order => {
      if (filterStatus !== "all" && order.status !== filterStatus) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const searchable = [
          order.customer_name,
          order.description,
          order.requestor_name,
          order.vendor,
          order.request_type
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

    if (sortConfig.key) {
      const key = sortConfig.key;
      const isDateField = key.includes('date');
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      
      return result.sort((a, b) => {
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
      });
    }

    return result.sort((a, b) => {
      const statusOrder = { pending: 0, cancelled: 1, ordered: 2, received: 3 };
      const aOrder = statusOrder[a.status] ?? 0;
      const bOrder = statusOrder[b.status] ?? 0;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return (a.row_number || 0) - (b.row_number || 0);
    });
  }, [orders, filterStatus, searchTerm, sortConfig]);

  // Virtual scrolling setup
  const tableContainerRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: filteredOrders.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 32,
    overscan: 15,
  });

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

  // Mobile card view
  if (isMobile) {
    return (
      <OrderMobileCards
        orders={filteredOrders}
        onOpenDetails={(order) => alert(`Order: ${order.description}`)}
      />
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

      {/* Spreadsheet Table */}
      <div ref={tableContainerRef} className="overflow-auto" style={{ height: 'calc(100vh - 300px)' }}>
      <table className="w-full border-collapse border rounded-lg" style={{ fontSize: compact ? '11px' : '12px', tableLayout: 'fixed', overflow: 'visible' }}>
        <colgroup>
          <col style={{ width: '32px' }} />
          <col style={{ width: compact ? '12%' : '18%', minWidth: '140px' }} />
          <col style={{ width: compact ? '8%' : '8%', minWidth: '80px' }} />
          <col style={{ width: compact ? '20%' : '25%', minWidth: '180px' }} />
          <col style={{ width: '5%', minWidth: '40px' }} />
          <col style={{ width: '8%', minWidth: '60px' }} />
          <col style={{ width: '8%', minWidth: '70px' }} />
          <col style={{ width: '8%', minWidth: '70px' }} />
          <col style={{ width: compact ? '7%' : '8%', minWidth: '60px' }} />
          <col style={{ width: '8%', minWidth: '70px' }} />
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
                {isRegistered && (
                  <button onClick={(e) => { e.stopPropagation(); setEditingRequestTypes(true); }} className="hover:bg-gray-300 rounded p-0.5">
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
                  <button onClick={(e) => { e.stopPropagation(); setEditingVendors(true); }} className="hover:bg-gray-300 rounded p-0.5">
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
            const index = virtualRow.index;
            const order = filteredOrders[index];
            const isFocused = focusedRowId === order.id;
            return (
            <React.Fragment key={order.id}>
              {isFocused && <tr><td colSpan="11" className="h-3 bg-transparent border-none"></td></tr>}
              <tr 
                className={`border-b hover:bg-gray-50 ${getRowColor(order)} ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : ''}`}
                style={getRowStyle(order)}
              >
              {/* Row Number - Clickable Focus Button */}
              <td className="px-0 py-0 border-r">
                <button
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
                className="px-1 py-0.5 border-r relative" 
                style={{ overflow: 'visible' }}
                onContextMenu={(e) => handleContextMenu(e, order, "customer_name", "Customer Name", order.customer_name)}
              >
                <div className="flex items-center gap-1 h-7">
                <Input
                  value={order.customer_name || ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, customer_name: val } : o));
                    setCustomerSearch(val);
                    // Show dropdown for work order suggestions if there's text
                    if (val.length > 1) {
                      setShowCustomerDropdown(order.id);
                    } else {
                      setShowCustomerDropdown(null);
                    }
                  }}
                  onBlur={() => {
                    const currentOrder = orders.find(o => o.id === order.id);
                    if (currentOrder && currentOrder.customer_name !== originalOrdersRef.current[order.id]?.customer_name) {
                      pendingChangesRef.current[order.id] = {
                        ...pendingChangesRef.current[order.id],
                        customer_name: currentOrder.customer_name
                      };
                      setHasUnsavedChanges(true);
                    }
                    setTimeout(() => {
                      setShowCustomerDropdown(null);
                    }, 200);
                  }}
                  onFocus={(e) => {
                    if (e.target.value.length > 1) {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(order.id);
                    }
                  }}
                  className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                  placeholder="Customer..."
                  disabled={!isRegistered}
                />
                {order.work_order_id && (
                  <button
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
                {showCustomerDropdown === order.id && getFilteredWorkOrders(customerSearch).length > 0 && (
                  <div 
                    className="absolute left-0 top-full w-72 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto"
                    style={{ zIndex: 9999 }}
                  >
                    {getFilteredWorkOrders(customerSearch).map(wo => (
                      <div
                        key={wo.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs border-b last:border-0"
                        onMouseDown={() => {
                          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, customer_name: wo.client_name, work_order_id: wo.id } : o));
                          pendingChangesRef.current[order.id] = {
                            ...pendingChangesRef.current[order.id],
                            customer_name: wo.client_name,
                            work_order_id: wo.id
                          };
                          setHasUnsavedChanges(true);
                          setShowCustomerDropdown(null);
                          setEditingCustomerName(null);
                        }}
                      >
                        <div className="font-medium text-gray-800">{wo.client_name}</div>
                        <div className="text-gray-500 truncate">{wo.title}</div>
                      </div>
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
                  disabled={!isRegistered}
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
                  disabled={!isRegistered}
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
                    if (!isRegistered) return;
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
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {safeFormatDate(order.date_needed, "MM/dd/yy")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {order.date_needed && (
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
                      onSelect={(date) => {
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
                          updateOrder(order.id, "date_needed", format(date, "yyyy-MM-dd"));
                        } else {
                          updateOrder(order.id, "date_needed", "");
                        }
                        setOpenDatePopover(null);
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
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {safeFormatDate(order.date_ordered, "MM/dd/yy")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {order.date_ordered && (
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
                                  // Update state immediately
                                  setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_ordered: dateStr, status: "ordered" } : o));
                                  // Save immediately
                                  await Order.update(order.id, { date_ordered: dateStr, status: "ordered" });
                                } else {
                                  setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_ordered: "" } : o));
                                  await Order.update(order.id, { date_ordered: "" });
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
                  disabled={!isRegistered}
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
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {safeFormatDate(order.date_received, "MM/dd/yy")}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    {order.date_received && (
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
                                  // Update state immediately
                                  setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_received: dateStr, status: "received" } : o));
                                  // Save immediately
                                  await Order.update(order.id, { date_received: dateStr, status: "received" });
                                } else {
                                  setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_received: "" } : o));
                                  await Order.update(order.id, { date_received: "" });
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
            <DialogTitle>Edit Request Types</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={newRequestType}
                onChange={(e) => setNewRequestType(e.target.value)}
                placeholder="New request type..."
                onKeyDown={(e) => e.key === 'Enter' && addRequestType()}
              />
              <Button onClick={addRequestType} size="icon" className="shrink-0">
                <Plus className="w-4 h-4" />
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
                      <button 
                        onClick={() => {
                          if (index === 0) return;
                          const items = [...requestTypes];
                          [items[index - 1], items[index]] = [items[index], items[index - 1]];
                          saveRequestTypes(items);
                        }}
                        disabled={index === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>
                      </button>
                      <button 
                        onClick={() => {
                          if (index === requestTypes.length - 1) return;
                          const items = [...requestTypes];
                          [items[index], items[index + 1]] = [items[index + 1], items[index]];
                          saveRequestTypes(items);
                        }}
                        disabled={index === requestTypes.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                      </button>
                    </div>
                    <span className="text-sm">{type}</span>
                  </div>
                  <button onClick={() => removeRequestType(type)} className="text-red-500 hover:text-red-700">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <Button onClick={() => setEditingRequestTypes(false)} className="w-full">
              <Save className="w-4 h-4 mr-2" />
              Save & Close
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
                  disabled={!isRegistered}
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
            <AlertDialogAction onClick={confirmDelete} className="bg-red-600 text-white">
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
                  updateOrder(clearDateConfirm.orderId, clearDateConfirm.field, "");
                  // If clearing date_received, update status back to ordered or pending
                  if (clearDateConfirm.field === 'date_received') {
                    const order = orders.find(o => o.id === clearDateConfirm.orderId);
                    if (order?.date_ordered) {
                      updateOrder(clearDateConfirm.orderId, "status", "ordered");
                    } else {
                      updateOrder(clearDateConfirm.orderId, "status", "pending");
                    }
                  }
                  await saveAllChanges();
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
                      <button 
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
                      <button 
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
                  <button onClick={() => removeVendor(vendor)} className="text-red-500 hover:text-red-700">
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