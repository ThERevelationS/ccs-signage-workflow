import React, { useState, useEffect } from "react";
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
  Plus,
  Trash2,
  Save,
  Loader2,
  Package
} from "lucide-react";

const Order = base44.entities.Order;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

export default function WorkOrderOrders({ workOrderId, workOrderTitle, clientName }) {
  const { currentUser, isRegistered } = useAuth();
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showRequestorDropdown, setShowRequestorDropdown] = useState(null);

  useEffect(() => {
    loadData();
  }, [workOrderId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, usersData] = await Promise.all([
        Order.filter({ work_order_id: workOrderId }),
        AuthorizedEmail.list()
      ]);
      setOrders(ordersData.sort((a, b) => (a.row_number || 0) - (b.row_number || 0)));
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading orders:", error);
    }
    setIsLoading(false);
  };

  const addNewRow = async () => {
    if (!isRegistered) return;
    
    const maxRowNumber = orders.length > 0 
      ? Math.max(...orders.map(o => o.row_number || 0)) 
      : 0;
    
    const newOrder = await Order.create({
      customer_name: clientName || "",
      work_order_id: workOrderId,
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
      row_number: maxRowNumber + 1
    });
    
    setOrders([...orders, newOrder]);
  };

  const updateOrder = async (orderId, field, value) => {
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    
    const updatedOrders = [...orders];
    updatedOrders[orderIndex] = { ...updatedOrders[orderIndex], [field]: value };
    setOrders(updatedOrders);
    
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

  const getFilteredUsers = (searchTerm) => {
    if (!searchTerm) return users.slice(0, 10);
    const lower = searchTerm.toLowerCase();
    return users.filter(u => 
      u.full_name?.toLowerCase().includes(lower) ||
      u.email?.toLowerCase().includes(lower)
    ).slice(0, 10);
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

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-purple-600" />
          <span className="font-medium text-sm">{orders.length} Orders</span>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(pendingChanges).length > 0 && (
            <Button
              onClick={saveChanges}
              size="sm"
              disabled={isSaving}
              className="h-7 text-xs"
            >
              {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3 mr-1" />}
              Save
            </Button>
          )}
          {isRegistered && (
            <Button
              onClick={addNewRow}
              size="sm"
              variant="outline"
              className="h-7 text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Add Order
            </Button>
          )}
        </div>
      </div>

      {/* Compact Table */}
      {orders.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          No orders for this work order yet
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden text-xs">
          {/* Header */}
          <div className="flex bg-gray-100 border-b font-medium text-gray-700">
            <div className="w-24 px-2 py-1.5 border-r">Type</div>
            <div className="flex-1 px-2 py-1.5 border-r">Description</div>
            <div className="w-16 px-2 py-1.5 border-r">Qty</div>
            <div className="w-28 px-2 py-1.5 border-r">Requestor</div>
            <div className="w-24 px-2 py-1.5 border-r">Needed</div>
            <div className="w-24 px-2 py-1.5 border-r">Ordered</div>
            <div className="w-20 px-2 py-1.5 border-r">Vendor</div>
            <div className="w-24 px-2 py-1.5 border-r">Received</div>
            <div className="w-10 px-1 py-1.5"></div>
          </div>

          {/* Rows */}
          <div className="max-h-48 overflow-y-auto">
            {orders.map((order) => (
              <div key={order.id} className="flex border-b hover:bg-gray-50">
                {/* Type */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Select
                    value={order.request_type || "Other"}
                    onValueChange={(val) => updateOrder(order.id, "request_type", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-1">
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
                <div className="flex-1 px-1 py-0.5 border-r relative group">
                  <Input
                    value={order.description || ""}
                    onChange={(e) => updateOrder(order.id, "description", e.target.value)}
                    className="h-6 text-xs border-0 bg-transparent px-1 description-field"
                    placeholder="Description..."
                    disabled={!isRegistered}
                  />
                  {order.description && order.description.length > 30 && (
                    <div className="hidden group-hover:block absolute left-0 bottom-full mb-1 bg-gray-900 text-white text-xs p-3 rounded shadow-2xl z-[9999] min-w-[300px] max-w-[400px] whitespace-normal pointer-events-none border border-gray-700">
                      {order.description}
                    </div>
                  )}
                </div>

                {/* Qty */}
                <div className="w-16 px-1 py-0.5 border-r">
                  <Input
                    value={order.quantity || ""}
                    onChange={(e) => updateOrder(order.id, "quantity", e.target.value)}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    placeholder="Qty"
                    disabled={!isRegistered}
                  />
                </div>

                {/* Requestor */}
                <div className="w-28 px-1 py-0.5 border-r relative">
                  <div className="flex items-center gap-1">
                    {order.requestor_name && (
                      <div className={`w-4 h-4 rounded-full ${getRequestorColor(order.requestor_email)} text-white text-xs flex items-center justify-center flex-shrink-0`}>
                        {order.requestor_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <Input
                      value={order.requestor_name || ""}
                      onChange={(e) => updateOrder(order.id, "requestor_name", e.target.value)}
                      onFocus={() => setShowRequestorDropdown(order.id)}
                      onBlur={() => setTimeout(() => setShowRequestorDropdown(null), 200)}
                      className="h-6 text-xs border-0 bg-transparent px-0"
                      placeholder="..."
                      disabled={!isRegistered}
                    />
                  </div>
                  {showRequestorDropdown === order.id && (
                    <div className="absolute top-full left-0 w-48 bg-white border rounded-lg shadow-lg z-20 max-h-32 overflow-y-auto">
                      {getFilteredUsers(order.requestor_name).map(u => (
                        <div
                          key={u.id}
                          className="px-2 py-1 hover:bg-gray-100 cursor-pointer text-xs flex items-center gap-1"
                          onMouseDown={() => {
                            updateOrder(order.id, "requestor_name", u.full_name);
                            updateOrder(order.id, "requestor_email", u.email);
                            setShowRequestorDropdown(null);
                          }}
                        >
                          <div className={`w-4 h-4 rounded-full ${getRequestorColor(u.email)} text-white text-xs flex items-center justify-center`}>
                            {(u.full_name || "?").charAt(0).toUpperCase()}
                          </div>
                          {u.full_name}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Date Needed */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Input
                    type="date"
                    value={order.date_needed || ""}
                    onChange={(e) => updateOrder(order.id, "date_needed", e.target.value)}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    disabled={!isRegistered}
                  />
                </div>

                {/* Date Ordered */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Input
                    type="date"
                    value={order.date_ordered || ""}
                    onChange={(e) => {
                      updateOrder(order.id, "date_ordered", e.target.value);
                      if (e.target.value) updateOrder(order.id, "status", "ordered");
                    }}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    disabled={!isRegistered}
                  />
                </div>

                {/* Vendor */}
                <div className="w-20 px-1 py-0.5 border-r">
                  <Select
                    value={order.vendor || ""}
                    onValueChange={(val) => updateOrder(order.id, "vendor", val)}
                    disabled={!isRegistered}
                  >
                    <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-1">
                      <SelectValue placeholder="-" />
                    </SelectTrigger>
                    <SelectContent style={{ zIndex: 99999 }}>
                      {VENDORS.map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Received */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Input
                    type="date"
                    value={order.date_received || ""}
                    onChange={(e) => {
                      updateOrder(order.id, "date_received", e.target.value);
                      if (e.target.value) updateOrder(order.id, "status", "received");
                    }}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    disabled={!isRegistered}
                  />
                </div>

                {/* Delete */}
                <div className="w-10 px-1 py-0.5 flex items-center justify-center">
                  {isRegistered && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteOrder(order.id)}
                      className="h-5 w-5"
                    >
                      <Trash2 className="w-3 h-3 text-red-500" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}