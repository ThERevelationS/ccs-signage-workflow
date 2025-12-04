import React, { useState, useEffect, useRef } from "react";
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
  Save,
  Calendar as CalendarIcon,
  Search,
  Link as LinkIcon,
  Loader2,
  Pencil,
  X,
  Check
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";


const Order = base44.entities.Order;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

export default function OrderSpreadsheet({ workOrderFilter = null, compact = false }) {
  const { currentUser, isRegistered } = useAuth();
  const [orders, setOrders] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingCell, setEditingCell] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(null);
  const [showRequestorDropdown, setShowRequestorDropdown] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
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

  useEffect(() => {
    loadData();
  }, [workOrderFilter]);

  const loadData = async () => {
    setIsLoading(true);
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
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setIsLoading(false);
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
  };

  const updateOrder = async (orderId, field, value) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    const updatedOrders = [...orders];
    updatedOrders[orderIndex] = { ...updatedOrders[orderIndex], [field]: value };
    setOrders(updatedOrders);
    
    // Track pending changes
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value }
    }));
  };

  const saveChanges = async () => {
    setIsSaving(true);
    try {
      const updates = Object.entries(pendingChanges);
      await Promise.all(
        updates.map(([orderId, changes]) => Order.update(orderId, changes))
      );
      setPendingChanges({});
    } catch (error) {
      console.error("Error saving changes:", error);
    }
    setIsSaving(false);
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
    if (order.status === "received") return "bg-green-50";
    if (order.status === "ordered") return "bg-blue-50";
    if (order.status === "cancelled") return "bg-gray-100";
    return "bg-white";
  };

  const getRequestorColor = (email) => {
    const colors = [
      "bg-blue-500", "bg-green-500", "bg-purple-500", "bg-orange-500",
      "bg-pink-500", "bg-teal-500", "bg-indigo-500", "bg-red-500"
    ];
    const index = email ? email.charCodeAt(0) % colors.length : 0;
    return colors[index];
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  const columnWidths = compact 
    ? { rowNum: "w-10", customer: "w-32", type: "w-24", desc: "w-40", qty: "w-16", requestor: "w-28", dates: "w-24", vendor: "w-20", actions: "w-12" }
    : { rowNum: "w-12", customer: "w-44", type: "w-28", desc: "w-64", qty: "w-20", requestor: "w-36", dates: "w-28", vendor: "w-24", actions: "w-16" };

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
          {Object.keys(pendingChanges).length > 0 && (
            <Button
              onClick={saveChanges}
              size="sm"
              disabled={isSaving}
              className="clay-button border-none text-gray-700 h-8"
              style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #FFD6E8 100%)' }}
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Save Changes
            </Button>
          )}
        </div>
        <span className="text-xs text-gray-500">{orders.length} orders</span>
      </div>

      {/* Spreadsheet Table */}
      <div className="border rounded-lg overflow-x-auto" style={{ fontSize: compact ? '11px' : '12px' }}>
        {/* Header Row */}
        <div className="flex bg-gray-100 border-b font-medium text-gray-700 sticky top-0 z-10 min-w-max">
          <div className={`${columnWidths.rowNum} px-2 py-2 border-r flex-shrink-0`}>#</div>
          <div className={`${columnWidths.customer} px-2 py-2 border-r flex-shrink-0`}>Customer Name</div>
          <div className={`${columnWidths.type} px-2 py-2 border-r flex-shrink-0 flex items-center gap-1`}>
            Request Type
            {isRegistered && (
              <button onClick={() => setEditingRequestTypes(true)} className="hover:bg-gray-200 rounded p-0.5">
                <Pencil className="w-3 h-3 text-gray-500" />
              </button>
            )}
          </div>
          <div className={`${columnWidths.desc} px-2 py-2 border-r flex-shrink-0`}>Description</div>
          <div className={`${columnWidths.qty} px-2 py-2 border-r flex-shrink-0`}>How Much?</div>
          <div className={`${columnWidths.requestor} px-2 py-2 border-r flex-shrink-0`}>Requestor</div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Date Needed</div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Ordered Date</div>
          <div className={`${columnWidths.vendor} px-2 py-2 border-r flex-shrink-0 flex items-center gap-1`}>
            Vendor
            {isRegistered && (
              <button onClick={() => setEditingVendors(true)} className="hover:bg-gray-200 rounded p-0.5">
                <Pencil className="w-3 h-3 text-gray-500" />
              </button>
            )}
          </div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Date Received</div>
          <div className={`${columnWidths.actions} px-2 py-2 flex-shrink-0`}></div>
        </div>

        {/* Data Rows */}
        <div className="max-h-[600px] overflow-y-auto min-w-max">
          {orders.map((order, index) => (
            <div 
              key={order.id} 
              className={`flex border-b hover:bg-gray-50 ${getRowColor(order)}`}
            >
              {/* Row Number */}
              <div className={`${columnWidths.rowNum} px-2 py-1.5 border-r text-gray-500 flex-shrink-0`}>
                {order.row_number || index + 1}
              </div>

              {/* Customer Name with Work Order Link */}
              <div className={`${columnWidths.customer} px-1 py-0.5 border-r flex-shrink-0 relative`}>
                <div className="flex items-center gap-1">
                  {order.work_order_id && (
                    <LinkIcon className="w-3 h-3 text-blue-500 flex-shrink-0" />
                  )}
                  <Input
                    value={order.customer_name || ""}
                    onChange={(e) => {
                      updateOrder(order.id, "customer_name", e.target.value);
                      setCustomerSearch(e.target.value);
                    }}
                    onFocus={(e) => {
                      const rect = e.target.getBoundingClientRect();
                      setDropdownPosition({ top: rect.bottom + 2, left: rect.left });
                      setShowCustomerDropdown(order.id);
                    }}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(null), 200)}
                    className="h-7 text-xs border-0 bg-transparent px-1 focus:ring-0"
                    placeholder="Customer..."
                    disabled={!isRegistered}
                  />
                </div>
                {showCustomerDropdown === order.id && (
                  <div 
                    className="fixed w-64 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" 
                    style={{ zIndex: 9999, top: dropdownPosition.top, left: dropdownPosition.left }}
                  >
                    {getFilteredWorkOrders(order.customer_name).map(wo => (
                      <div
                        key={wo.id}
                        className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-xs"
                        onMouseDown={() => {
                          updateOrder(order.id, "customer_name", wo.client_name);
                          updateOrder(order.id, "work_order_id", wo.id);
                          setShowCustomerDropdown(null);
                        }}
                      >
                        <div className="font-medium">{wo.client_name}</div>
                        <div className="text-gray-500">{wo.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Request Type */}
              <div className={`${columnWidths.type} px-1 py-0.5 border-r flex-shrink-0`}>
                <Select
                  value={order.request_type || "Other"}
                  onValueChange={(val) => updateOrder(order.id, "request_type", val)}
                  disabled={!isRegistered}
                >
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {requestTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Description */}
              <div className={`${columnWidths.desc} px-1 py-0.5 border-r flex-shrink-0`}>
                <Input
                  value={order.description || ""}
                  onChange={(e) => updateOrder(order.id, "description", e.target.value)}
                  className="h-7 text-xs border-0 bg-transparent px-1"
                  placeholder="Description..."
                  disabled={!isRegistered}
                />
              </div>

              {/* Quantity */}
              <div className={`${columnWidths.qty} px-1 py-0.5 border-r flex-shrink-0`}>
                <Input
                  value={order.quantity || ""}
                  onChange={(e) => updateOrder(order.id, "quantity", e.target.value)}
                  className="h-7 text-xs border-0 bg-transparent px-1"
                  placeholder="Qty"
                  disabled={!isRegistered}
                />
              </div>

              {/* Requestor */}
              <div className={`${columnWidths.requestor} px-1 py-0.5 border-r flex-shrink-0 relative`}>
                <div 
                  className="flex items-center gap-1 cursor-pointer h-7 hover:bg-gray-100 rounded px-1"
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
                  <span className="text-xs truncate">{order.requestor_name || "Select..."}</span>
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
              </div>

              {/* Date Needed */}
              <div className={`${columnWidths.dates} px-1 py-0.5 border-r flex-shrink-0`}>
                <Popover>
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_needed ? format(new Date(order.date_needed), "MM/dd/yy") : "-"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={order.date_needed ? new Date(order.date_needed) : undefined}
                      onSelect={(date) => updateOrder(order.id, "date_needed", date ? format(date, "yyyy-MM-dd") : "")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Ordered Date */}
              <div className={`${columnWidths.dates} px-1 py-0.5 border-r flex-shrink-0`}>
                <Popover>
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
                        if (date) updateOrder(order.id, "status", "ordered");
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Vendor */}
              <div className={`${columnWidths.vendor} px-1 py-0.5 border-r flex-shrink-0`}>
                <Select
                  value={order.vendor || ""}
                  onValueChange={(val) => updateOrder(order.id, "vendor", val)}
                  disabled={!isRegistered}
                >
                  <SelectTrigger className="h-7 text-xs border-0 bg-transparent">
                    <SelectValue placeholder="-" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map(v => (
                      <SelectItem key={v} value={v}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date Received */}
              <div className={`${columnWidths.dates} px-1 py-0.5 border-r flex-shrink-0`}>
                <Popover>
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className="h-7 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                      {order.date_received ? format(new Date(order.date_received), "MM/dd/yy") : "-"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={order.date_received ? new Date(order.date_received) : undefined}
                      onSelect={(date) => {
                        updateOrder(order.id, "date_received", date ? format(date, "yyyy-MM-dd") : "");
                        if (date) updateOrder(order.id, "status", "received");
                      }}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Actions */}
              <div className={`${columnWidths.actions} px-1 py-0.5 flex-shrink-0 flex items-center justify-center`}>
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
              </div>
            </div>
          ))}
        </div>
      </div>

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