import React, { useState, useEffect, useRef, useCallback } from "react";
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
import { format, parseISO } from "date-fns";

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};
import {
  Plus,
  Trash2,
  Calendar as CalendarIcon,
  Search,
  Link as LinkIcon,
  Loader2,
  Pencil,
  X,
  Check,
  Expand,
  ExternalLink,
  Save,
  Download,
  Upload
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
  DialogTitle,
  DialogDescription
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


const Order = base44.entities.Order;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

const OrderSpreadsheet = React.forwardRef(({ workOrderFilter = null, compact = false, searchTerm = "", filterStatus = "all", onSaveStatusChange = null, showButtonsInline = true }, ref) => {
  const { currentUser, isRegistered } = useAuth();
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCell, setEditingCell] = useState(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);

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
  const [importProgress, setImportProgress] = useState({ show: false, current: 0, total: 0 });
  const [exportProgress, setExportProgress] = useState({ show: false, progress: 0 });
  const [clearDateConfirm, setClearDateConfirm] = useState(null);
  
  const pendingChangesRef = useRef({}); // Track changes per order ID
  const originalOrdersRef = useRef({}); // Track original order data for comparison
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
    try {
      const [ordersData, workOrdersData, usersData] = await Promise.all([
        workOrderFilter 
          ? Order.filter({ work_order_id: workOrderFilter, deleted: { $ne: true } }, "row_number")
          : Order.filter({ deleted: { $ne: true } }, "row_number"),
        WorkOrder.filter({ completed: { $ne: true }, deleted: { $ne: true } }),
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
    }
    setIsLoading(false);
  };

  const saveAllChanges = async () => {
    const changes = pendingChangesRef.current;
    if (Object.keys(changes).length === 0) return;
    
    setIsSaving(true);
    try {
      const savePromises = Object.entries(changes).map(async ([orderId, updates]) => {
        await Order.update(orderId, updates);
        // Trigger notifications for significant changes
        const order = orders.find(o => o.id === orderId);
        if (order && updates.date_ordered && !originalOrdersRef.current[orderId]?.date_ordered) {
          await NotificationTriggers.orderOrdered({ ...order, ...updates }, currentUser?.full_name || currentUser?.email);
        }
        if (order && updates.date_received && !originalOrdersRef.current[orderId]?.date_received) {
          await NotificationTriggers.orderReceived({ ...order, ...updates }, currentUser?.full_name || currentUser?.email);
        }
        // Update original reference
        originalOrdersRef.current[orderId] = { ...originalOrdersRef.current[orderId], ...updates };
      });
      
      await Promise.all(savePromises);
      pendingChangesRef.current = {};
      setHasUnsavedChanges(false);
      setLastSaved(new Date());
    } catch (error) {
      console.error("Error saving orders:", error);
    }
    setIsSaving(false);
  };

  // Expose save function to parent
  const manualSave = () => {
    saveAllChanges();
  };

  const addNewRow = async () => {
    if (!isRegistered) return;
    
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
      date_needed: "",
      date_ordered: "",
      vendor: "",
      date_received: "",
      status: "pending",
      row_number: maxRowNumber + 1,
      work_order_id: workOrderFilter || ""
    });
    
    setOrders([...orders, newOrder]);
    originalOrdersRef.current[newOrder.id] = { ...newOrder };
    
    // Trigger notification for new order
    try {
      await NotificationTriggers.orderCreated(newOrder, currentUser?.full_name || currentUser?.email);
    } catch (e) {
      console.error("Error triggering order notification:", e);
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

  const updateOrder = (orderId, field, value) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;

    const updatedOrders = [...orders];
    updatedOrders[orderIndex] = { ...updatedOrders[orderIndex], [field]: value };
    setOrders(updatedOrders);

    // Track changes for batch save
    pendingChangesRef.current[orderId] = {
      ...pendingChangesRef.current[orderId],
      [field]: value
    };
    setHasUnsavedChanges(true);
  };

  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const deleteOrder = async (order) => {
    setDeleteConfirm(order);
  };

  const confirmDelete = async () => {
    await Order.update(deleteConfirm.id, {
      deleted: true,
      deleted_at: new Date().toISOString(),
      deleted_by: currentUser?.email || "unknown"
    });
    setOrders(orders.filter(o => o.id !== deleteConfirm.id));
    setDeleteConfirm(null);
  };

  const getFilteredWorkOrders = (searchTerm) => {
    // Filter out riders - only show main work orders
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
  };

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

    const reader = new FileReader();
    reader.onload = async (event) => {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array" });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const maxRowNumber = orders.length > 0 
        ? Math.max(...orders.map(o => o.row_number || 0)) 
        : 0;

      setImportProgress({ show: true, current: 0, total: jsonData.length });

      // Track existing orders to avoid duplicates
      const existingOrders = new Set(
        orders.map(o => `${o.customer_name}|${o.description}|${o.request_type}`.toLowerCase())
      );

      let importedCount = 0;

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        // Skip empty rows
        if (!row["Customer"] && !row["Description"]) {
          setImportProgress({ show: true, current: i + 1, total: jsonData.length });
          continue;
        }

        // Check for duplicates
        const uniqueKey = `${row["Customer"] || ""}|${row["Description"] || ""}|${row["Type"] || ""}`.toLowerCase();
        if (existingOrders.has(uniqueKey)) {
          setImportProgress({ show: true, current: i + 1, total: jsonData.length });
          continue;
        }

        const dateReceived = row["Date Recieved (Anyone can fill out this column)"] || "";
        const dateOrdered = row["Ordered Date (Carl Fills out this column)"] || "";
        
        // Determine status based on dates
        let status = "pending";
        if (dateReceived) {
          status = "received";
        } else if (dateOrdered) {
          status = "ordered";
        }

        // Create order with import flag to suppress notifications
        await Order.create({
          customer_name: row["Customer"] || "",
          request_type: row["Type"] || requestTypes[0] || "Other",
          description: row["Description"] || "",
          quantity: row["How much?"] || "",
          requestor_email: currentUser?.email || "",
          requestor_name: row["Requestor"] || currentUser?.full_name || "",
          date_needed: row["Date Needed (Requester fills out this column)"] || "",
          date_ordered: dateOrdered,
          vendor: row["Vendor (Anyone can fill out this column)"] || "",
          date_received: dateReceived,
          status: status,
          row_number: maxRowNumber + importedCount + 1,
          work_order_id: workOrderFilter || "",
          is_import: true // Flag to suppress email notifications
        });
        
        existingOrders.add(uniqueKey);
        importedCount++;
        setImportProgress({ show: true, current: i + 1, total: jsonData.length });
      }

      await loadData();
      setTimeout(() => setImportProgress({ show: false, current: 0, total: 0 }), 1500);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  React.useImperativeHandle(ref, () => ({
    addNewRow,
    exportToExcel,
    fileInputRef
  }));

  // Filter orders based on search term and status
  const filteredOrders = orders.filter(order => {
    // Status filter
    if (filterStatus !== "all" && order.status !== filterStatus) {
      return false;
    }
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchable = [
        order.customer_name,
        order.description,
        order.requestor_name,
        order.vendor,
        order.request_type
      ].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(search)) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    // Sort: pending first, then ordered/received at bottom
    const statusOrder = { pending: 0, cancelled: 1, ordered: 2, received: 3 };
    const aOrder = statusOrder[a.status] ?? 0;
    const bOrder = statusOrder[b.status] ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    // Within same status, sort by row_number
    return (a.row_number || 0) - (b.row_number || 0);
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="overflow-visible">
      {/* Import/Export Progress */}
      {importProgress.show && (
        <div className="mb-3 px-2">
          <div className="clay-card p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Importing...</span>
              <span className="text-xs text-gray-500">{importProgress.current} / {importProgress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full transition-all" style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}></div>
            </div>
          </div>
        </div>
      )}
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
          <tr className="border-b">
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">#</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Customer Name</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">
              <div className="flex items-center gap-1">
                Request Type
                {isRegistered && (
                  <button onClick={() => setEditingRequestTypes(true)} className="hover:bg-gray-200 rounded p-0.5">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Description</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Qty</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Requestor</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Needed</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Ordered</th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">
              <div className="flex items-center gap-1">
                Vendor
                {isRegistered && (
                  <button onClick={() => setEditingVendors(true)} className="hover:bg-gray-200 rounded p-0.5">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </th>
            <th className="px-2 py-2 border-r text-left font-medium text-gray-700">Received</th>
            <th className="px-2 py-2 text-left font-medium text-gray-700"></th>
          </tr>
        </thead>

        {/* Data Rows */}
        <tbody>
          {filteredOrders.map((order, index) => (
            <tr 
              key={order.id} 
              className={`border-b hover:bg-gray-50 ${getRowColor(order)}`}
              style={getRowStyle(order)}
            >
              {/* Row Number */}
              <td className="px-2 py-1.5 border-r text-gray-500">
                {order.row_number || index + 1}
              </td>

              {/* Customer Name with Work Order Link */}
              <td className="px-1 py-0.5 border-r relative" style={{ overflow: 'visible' }}>
                {order.customer_name && editingCustomerName !== order.id ? (
                  // Locked state - show customer name with edit button and clickable to open work order
                  <div className="flex items-center gap-1 h-7">
                    {order.work_order_id ? (
                      <button
                        onClick={() => {
                          const wo = workOrders.find(w => w.id === order.work_order_id);
                          if (wo) setSelectedWorkOrder(wo);
                        }}
                        className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 text-left"
                      >
                        <LinkIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{order.customer_name}</span>
                      </button>
                    ) : (
                      <span className="text-xs truncate flex-1">{order.customer_name}</span>
                    )}
                    {isRegistered && (
                      <button
                        onClick={() => setEditingCustomerName(order.id)}
                        className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                      >
                        <Pencil className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                ) : (
                  // Editing state - show input with dropdown
                  <div className="flex items-center gap-1 h-7">
                    <Input
                      value={order.customer_name || ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setOrders(prev => prev.map(o => o.id === order.id ? { ...o, customer_name: val } : o));
                        setCustomerSearch(val);
                        if (val.length > 0) {
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
                          if (order.customer_name) {
                            setEditingCustomerName(null);
                          }
                        }, 200);
                      }}
                      onFocus={(e) => {
                        if (e.target.value.length > 0) {
                          setCustomerSearch(e.target.value);
                          setShowCustomerDropdown(order.id);
                        }
                      }}
                      className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                      placeholder="Customer..."
                      disabled={!isRegistered}
                      autoFocus={editingCustomerName === order.id}
                    />
                    {editingCustomerName === order.id && (
                      <button
                        onClick={() => setEditingCustomerName(null)}
                        className="p-0.5 hover:bg-gray-200 rounded flex-shrink-0"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    )}
                  </div>
                )}
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
              <td className="px-1 py-0.5 border-r">
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
              <td className="px-1 py-0.5 border-r">
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
              <td className="px-1 py-0.5 border-r">
                <Input
                  value={order.quantity || ""}
                  onChange={(e) => updateOrder(order.id, "quantity", e.target.value)}
                  className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                  placeholder="-"
                  disabled={!isRegistered}
                />
              </td>

              {/* Requestor */}
              <td className="px-1 py-0.5 border-r relative">
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
              <td className="px-1 py-0.5 border-r">
                <Popover open={openDatePopover === `needed-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `needed-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_needed ? format(parseLocalDate(order.date_needed), "MM/dd/yy") : "-"}
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
              <td className="px-1 py-0.5 border-r">
                <Popover open={openDatePopover === `ordered-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordered-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_ordered ? format(parseLocalDate(order.date_ordered), "MM/dd/yy") : "-"}
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
                                  updateOrder(order.id, "date_ordered", format(date, "yyyy-MM-dd"));
                                  updateOrder(order.id, "status", "ordered");
                                } else {
                                  updateOrder(order.id, "date_ordered", "");
                                }
                                setOpenDatePopover(null);
                                await saveAllChanges();
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
              <td className="px-1 py-0.5 border-r">
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
              <td className="px-1 py-0.5 border-r">
                <Popover open={openDatePopover === `received-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `received-${order.id}` : null)}>
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_received ? format(parseLocalDate(order.date_received), "MM/dd/yy") : "-"}
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
                                  updateOrder(order.id, "date_received", format(date, "yyyy-MM-dd"));
                                  updateOrder(order.id, "status", "received");
                                } else {
                                  updateOrder(order.id, "date_received", "");
                                }
                                setOpenDatePopover(null);
                                await saveAllChanges();
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
          ))}
        </tbody>
      </table>

      {/* Edit Request Types Dialog */}
      <Dialog open={editingRequestTypes} onOpenChange={setEditingRequestTypes}>
        <DialogContent className="clay-card border-none max-w-sm">
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
          </div>
        </DialogContent>
      </Dialog>

      {/* Expanded Description Dialog */}
      <Dialog open={expandedDescription !== null} onOpenChange={() => setExpandedDescription(null)}>
        <DialogContent className="clay-card border-none max-w-lg">
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

      {/* Edit Vendors Dialog */}
      <Dialog open={editingVendors} onOpenChange={setEditingVendors}>
        <DialogContent className="clay-card border-none max-w-sm">
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
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default OrderSpreadsheet;