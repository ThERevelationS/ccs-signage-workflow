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
  Loader2
} from "lucide-react";

const Order = base44.entities.Order;
const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

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
      request_type: "Other",
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
    return workOrders.filter(wo => 
      wo.client_name?.toLowerCase().includes(lower) ||
      wo.title?.toLowerCase().includes(lower)
    ).slice(0, 10);
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
              Add Row
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
      <div className="border rounded-lg overflow-hidden" style={{ fontSize: compact ? '11px' : '12px' }}>
        {/* Header Row */}
        <div className="flex bg-gray-100 border-b font-medium text-gray-700 sticky top-0 z-10">
          <div className={`${columnWidths.rowNum} px-2 py-2 border-r flex-shrink-0`}>#</div>
          <div className={`${columnWidths.customer} px-2 py-2 border-r flex-shrink-0`}>Customer Name</div>
          <div className={`${columnWidths.type} px-2 py-2 border-r flex-shrink-0`}>Request Type</div>
          <div className={`${columnWidths.desc} px-2 py-2 border-r flex-shrink-0`}>Description</div>
          <div className={`${columnWidths.qty} px-2 py-2 border-r flex-shrink-0`}>How Much?</div>
          <div className={`${columnWidths.requestor} px-2 py-2 border-r flex-shrink-0`}>Requestor</div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Date Needed</div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Ordered Date</div>
          <div className={`${columnWidths.vendor} px-2 py-2 border-r flex-shrink-0`}>Vendor</div>
          <div className={`${columnWidths.dates} px-2 py-2 border-r flex-shrink-0`}>Date Received</div>
          <div className={`${columnWidths.actions} px-2 py-2 flex-shrink-0`}></div>
        </div>

        {/* Data Rows */}
        <div className="max-h-[600px] overflow-y-auto">
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
                    onFocus={() => setShowCustomerDropdown(order.id)}
                    onBlur={() => setTimeout(() => setShowCustomerDropdown(null), 200)}
                    className="h-7 text-xs border-0 bg-transparent px-1 focus:ring-0"
                    placeholder="Customer..."
                    disabled={!isRegistered}
                  />
                </div>
                {showCustomerDropdown === order.id && (
                  <div className="absolute top-full left-0 w-64 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
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
                    {REQUEST_TYPES.map(t => (
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
                <div className="flex items-center gap-1">
                  {order.requestor_name && (
                    <div className={`w-5 h-5 rounded-full ${getRequestorColor(order.requestor_email)} text-white text-xs flex items-center justify-center flex-shrink-0`}>
                      {order.requestor_name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <Input
                    value={order.requestor_name || ""}
                    onChange={(e) => updateOrder(order.id, "requestor_name", e.target.value)}
                    onFocus={() => setShowRequestorDropdown(order.id)}
                    onBlur={() => setTimeout(() => setShowRequestorDropdown(null), 200)}
                    className="h-7 text-xs border-0 bg-transparent px-1"
                    placeholder="Requestor..."
                    disabled={!isRegistered}
                  />
                </div>
                {showRequestorDropdown === order.id && (
                  <div className="absolute top-full left-0 w-56 bg-white border rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                    {getFilteredUsers(order.requestor_name).map(u => (
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
                    {VENDORS.map(v => (
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
    </div>
  );
}