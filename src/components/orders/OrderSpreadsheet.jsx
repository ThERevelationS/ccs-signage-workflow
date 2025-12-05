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
import { format } from "date-fns";
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
  Save
} from "lucide-react";
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
import { NotificationTriggers } from "@/components/workflow/NotificationService";


const Order = base44.entities.Order;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

export default function OrderSpreadsheet({ workOrderFilter = null, compact = false, searchTerm = "", filterStatus = "all", onSaveStatusChange = null }) {
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
  
  const pendingChangesRef = useRef({}); // Track changes per order ID
  const originalOrdersRef = useRef({}); // Track original order data for comparison

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
          ? Order.filter({ work_order_id: workOrderFilter }, "row_number")
          : Order.list("row_number"),
        WorkOrder.filter({ completed: { $ne: true } }),
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

  const deleteOrder = async (orderId) => {
    await Order.delete(orderId);
    setOrders(orders.filter(o => o.id !== orderId));
  };

  const getFilteredWorkOrders = (searchTerm) => {
    if (!searchTerm) return workOrders.slice(0, 10);
    const lower = searchTerm.toLowerCase();
    const terms = lower.split(/\s+/).filter(t => t.length > 0);
    
    return workOrders.filter(wo => {
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
    if (order.status === "ordered" || order.status === "received") {
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
    <div className="overflow-x-auto">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 px-2">
        <div className="flex items-center gap-2">
          {isRegistered && (
            <Button
              onClick={addNewRow}
              size="sm"
              className="clay-button border-none text-gray-700 h-8"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, #D4E9F7 100%)' }}
            >
              <Plus className="w-4 h-4 mr-1" />
              New Order
            </Button>
          )}
  
        </div>
        <span className="text-xs text-gray-500">{filteredOrders.length} orders</span>
      </div>

      {/* Spreadsheet Table */}
      <table className="w-full border-collapse border rounded-lg" style={{ fontSize: compact ? '11px' : '12px', tableLayout: 'fixed' }}>
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
        <thead className="bg-gray-100 sticky top-0 z-10">
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
        <tbody className="max-h-[600px] overflow-y-auto">
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
              <td className="px-1 py-0.5 border-r relative">
                <div className="flex items-center gap-1 h-7 overflow-hidden">
                  {order.work_order_id && (
                    <LinkIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  )}
                  <Input
                    value={order.customer_name || ""}
                    onChange={(e) => {
                      updateOrder(order.id, "customer_name", e.target.value);
                      setCustomerSearch(e.target.value);
                      if (e.target.value.length > 0) {
                        setShowCustomerDropdown(order.id);
                      } else {
                        setShowCustomerDropdown(null);
                      }
                    }}
                    onFocus={(e) => {
                      if (e.target.value.length > 0) {
                        setCustomerSearch(e.target.value);
                        setShowCustomerDropdown(order.id);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(null), 200)}
                    className="h-7 text-xs border-0 bg-transparent px-1 w-full"
                    placeholder="Customer..."
                    disabled={!isRegistered}
                  />
                </div>
                {showCustomerDropdown === order.id && getFilteredWorkOrders(customerSearch).length > 0 && (
                  <div 
                    className="absolute left-0 top-full w-72 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto z-50"
                  >
                    {getFilteredWorkOrders(customerSearch).map(wo => (
                      <div
                        key={wo.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs border-b last:border-0"
                        onMouseDown={() => {
                          updateOrder(order.id, "customer_name", wo.client_name);
                          updateOrder(order.id, "work_order_id", wo.id);
                          setShowCustomerDropdown(null);
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
                      {order.date_needed ? format(new Date(order.date_needed), "MM/dd/yy") : "-"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={order.date_needed ? new Date(order.date_needed) : undefined}
                      onSelect={(date) => {
                        updateOrder(order.id, "date_needed", date ? format(date, "yyyy-MM-dd") : "");
                        setOpenDatePopover(null);
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
                      {order.date_ordered ? format(new Date(order.date_ordered), "MM/dd/yy") : "-"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                              mode="single"
                              selected={order.date_ordered ? new Date(order.date_ordered) : undefined}
                              onSelect={(date) => {
                                updateOrder(order.id, "date_ordered", date ? format(date, "yyyy-MM-dd") : "");
                                if (date) {
                                  updateOrder(order.id, "status", "ordered");
                                }
                                setOpenDatePopover(null);
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
                      {order.date_received ? format(new Date(order.date_received), "MM/dd/yy") : "-"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={order.date_received ? new Date(order.date_received) : undefined}
                      onSelect={async (date) => {
                        updateOrder(order.id, "date_received", date ? format(date, "yyyy-MM-dd") : "");
                        if (date) {
                          updateOrder(order.id, "status", "received");
                          // Trigger notification for order received
                          try {
                            const updatedOrder = { ...order, date_received: format(date, "yyyy-MM-dd"), status: "received" };
                            await NotificationTriggers.orderReceived(updatedOrder, currentUser?.full_name || currentUser?.email);
                          } catch (e) {
                            console.error("Error triggering order notification:", e);
                          }
                        }
                        setOpenDatePopover(null);
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
                    onClick={() => deleteOrder(order.id)}
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
}