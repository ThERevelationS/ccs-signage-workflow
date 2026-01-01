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
import {
  Plus,
  Trash2,
  Save,
  Loader2,
  Package,
  Pencil,
  X,
  Expand,
  ExternalLink,
  Check
} from "lucide-react";

const Order = base44.entities.Order;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

// Helper to parse date string as local date (not UTC)
const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const DEFAULT_REQUEST_TYPES = ["Substrate", "Vinyl", "Supplies", "Other"];
const DEFAULT_VENDORS = ["Grimco", "Glantz", "JDS", "Kost", "Stock", "Other"];

export default function WorkOrderOrders({ workOrderId, workOrderTitle, clientName }) {
  const { currentUser, isRegistered } = useAuth();
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingChanges, setPendingChanges] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showRequestorDropdown, setShowRequestorDropdown] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [expandedDescription, setExpandedDescription] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [clearDateConfirm, setClearDateConfirm] = useState(null);
  const [editingRequestTypes, setEditingRequestTypes] = useState(false);
  const [editingVendors, setEditingVendors] = useState(false);
  const [newRequestType, setNewRequestType] = useState("");
  const [newVendor, setNewVendor] = useState("");
  
  const [requestTypes, setRequestTypes] = useState(() => {
    const saved = localStorage.getItem('orderRequestTypes');
    return saved ? JSON.parse(saved) : DEFAULT_REQUEST_TYPES;
  });
  const [vendors, setVendors] = useState(() => {
    const saved = localStorage.getItem('orderVendors');
    return saved ? JSON.parse(saved) : DEFAULT_VENDORS;
  });

  useEffect(() => {
    loadData();
  }, [workOrderId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ordersData, usersData] = await Promise.all([
        Order.filter({ work_order_id: workOrderId, deleted: { $ne: true } }),
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
      request_type: requestTypes[0] || "Other",
      description: "",
      quantity: "",
      requestor_email: currentUser?.email || "",
      requestor_name: currentUser?.full_name || "",
      vendor: "",
      status: "pending",
      row_number: maxRowNumber + 1
    });
    
    setOrders([...orders, newOrder]);
  };

  const updateOrder = (orderId, field, value) => {
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
        updates.map(([orderId, changes]) => {
          // Filter out undefined values and ensure date fields are valid strings
          const cleanedChanges = {};
          Object.entries(changes).forEach(([key, value]) => {
            if (value !== undefined) {
              // For date fields, ensure they are valid strings or skip empty/null
              if (['date_needed', 'date_ordered', 'date_received'].includes(key)) {
                if (value === "" || value === null) {
                  // Skip empty dates - don't include in update
                  return;
                } else if (value instanceof Date) {
                  // Convert Date objects to string format
                  cleanedChanges[key] = format(value, "yyyy-MM-dd");
                } else if (typeof value === 'string' && value.trim()) {
                  cleanedChanges[key] = value;
                }
                // Skip if not a valid value
              } else {
                cleanedChanges[key] = value;
              }
            }
          });
          
          // Only update if there are actual changes
          if (Object.keys(cleanedChanges).length > 0) {
            return Order.update(orderId, cleanedChanges);
          }
          return Promise.resolve();
        })
      );
      setPendingChanges({});
    } catch (error) {
      console.error("Error saving changes:", error);
    }
    setIsSaving(false);
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

      {/* Table */}
      {orders.length === 0 ? (
        <div className="text-center py-6 text-gray-400 text-sm">
          No orders for this work order yet
        </div>
      ) : (
        <div className="border rounded-lg overflow-visible text-xs">
          {/* Header */}
          <div className="flex bg-gray-100 border-b font-medium text-gray-700">
            <div className="w-8 px-1 py-1.5 border-r text-center">#</div>
            <div className="w-24 px-2 py-1.5 border-r">
              <div className="flex items-center gap-1">
                Type
                {isRegistered && (
                  <button onClick={() => setEditingRequestTypes(true)} className="hover:bg-gray-200 rounded p-0.5">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 px-2 py-1.5 border-r">Description</div>
            <div className="w-14 px-2 py-1.5 border-r">Qty</div>
            <div className="w-24 px-2 py-1.5 border-r">Requestor</div>
            <div className="w-24 px-2 py-1.5 border-r">Needed</div>
            <div className="w-24 px-2 py-1.5 border-r">Ordered</div>
            <div className="w-20 px-2 py-1.5 border-r">
              <div className="flex items-center gap-1">
                Vendor
                {isRegistered && (
                  <button onClick={() => setEditingVendors(true)} className="hover:bg-gray-200 rounded p-0.5">
                    <Pencil className="w-3 h-3 text-gray-500" />
                  </button>
                )}
              </div>
            </div>
            <div className="w-24 px-2 py-1.5 border-r">Received</div>
            <div className="w-8 px-1 py-1.5"></div>
          </div>

          {/* Rows */}
          <div className="max-h-64 overflow-y-auto">
            {orders.map((order, index) => (
              <div 
                key={order.id} 
                className={`flex border-b hover:bg-gray-50 ${getRowColor(order)}`}
                style={getRowStyle(order)}
              >
                {/* Row Number */}
                <div className="w-8 px-1 py-0.5 border-r text-center text-gray-500">
                  {order.row_number || index + 1}
                </div>

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
                      {requestTypes.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Description */}
                <div className="flex-1 px-1 py-0.5 border-r">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div 
                          className="h-6 text-xs flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded px-1 overflow-hidden"
                          onClick={() => setExpandedDescription(order.id)}
                        >
                          <span className="truncate">{order.description || "Description..."}</span>
                          {order.description && order.description.length > 20 && (
                            <Expand className="w-3 h-3 text-gray-400 flex-shrink-0" />
                          )}
                        </div>
                      </TooltipTrigger>
                      {order.description && order.description.length > 20 && (
                        <TooltipContent side="bottom" className="max-w-sm">
                          <p className="text-xs whitespace-pre-wrap">{renderWithLinks(order.description)}</p>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                </div>

                {/* Qty */}
                <div className="w-14 px-1 py-0.5 border-r">
                  <Input
                    value={order.quantity || ""}
                    onChange={(e) => updateOrder(order.id, "quantity", e.target.value)}
                    className="h-6 text-xs border-0 bg-transparent px-1"
                    placeholder="-"
                    disabled={!isRegistered}
                  />
                </div>

                {/* Requestor */}
                <div className="w-24 px-1 py-0.5 border-r relative">
                  <div 
                    className="flex items-center gap-1 cursor-pointer h-6 hover:bg-gray-100 rounded px-1 overflow-hidden"
                    onClick={(e) => {
                      if (!isRegistered) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      setDropdownPosition({ top: rect.bottom + 2, left: rect.left });
                      setShowRequestorDropdown(order.id);
                    }}
                  >
                    {order.requestor_name && (
                      <div className={`w-4 h-4 rounded-full ${getRequestorColor(order.requestor_email)} text-white text-xs flex items-center justify-center flex-shrink-0`}>
                        {order.requestor_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className="text-xs truncate">{order.requestor_name ? order.requestor_name.split(' ')[0] : "-"}</span>
                  </div>
                  {showRequestorDropdown === order.id && (
                    <div 
                      className="fixed w-56 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto" 
                      style={{ zIndex: 99999, top: dropdownPosition.top, left: dropdownPosition.left }}
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
                <div className="w-24 px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `needed-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `needed-${order.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                        {order.date_needed ? format(parseLocalDate(order.date_needed), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={5}>
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
                        onSelect={async (date) => {
                          const dateStr = date ? format(date, "yyyy-MM-dd") : "";
                          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_needed: dateStr } : o));
                          setPendingChanges(prev => ({ ...prev, [order.id]: { ...prev[order.id], date_needed: dateStr } }));
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Date Ordered */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `ordered-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `ordered-${order.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                        {order.date_ordered ? format(parseLocalDate(order.date_ordered), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={5}>
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
                          const dateStr = date ? format(date, "yyyy-MM-dd") : "";
                          const newStatus = date ? "ordered" : "pending";
                          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_ordered: dateStr, status: newStatus } : o));
                          setPendingChanges(prev => ({ ...prev, [order.id]: { ...prev[order.id], date_ordered: dateStr, status: newStatus } }));
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
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
                      {vendors.map(v => (
                        <SelectItem key={v} value={v}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Received */}
                <div className="w-24 px-1 py-0.5 border-r">
                  <Popover open={openDatePopover === `received-${order.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `received-${order.id}` : null)}>
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded flex items-center">
                        {order.date_received ? format(parseLocalDate(order.date_received), "MM/dd/yy") : "-"}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start" side="bottom" sideOffset={5}>
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
                          const dateStr = date ? format(date, "yyyy-MM-dd") : "";
                          const newStatus = date ? "received" : (order.date_ordered ? "ordered" : "pending");
                          setOrders(prev => prev.map(o => o.id === order.id ? { ...o, date_received: dateStr, status: newStatus } : o));
                          setPendingChanges(prev => ({ ...prev, [order.id]: { ...prev[order.id], date_received: dateStr, status: newStatus } }));
                          setOpenDatePopover(null);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Delete */}
                <div className="w-8 px-1 py-0.5 flex items-center justify-center">
                  {isRegistered && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteConfirm(order)}
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
                <div key={type} className="flex items-center justify-between p-2 bg-gray-50 rounded">
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
                <div key={vendor} className="flex items-center justify-between p-2 bg-gray-50 rounded">
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Order?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this order?
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
                  const { orderId, field } = clearDateConfirm;
                  const order = orders.find(o => o.id === orderId);
                  let newStatus = "pending";
                  if (field === 'date_received' && order?.date_ordered) {
                    newStatus = "ordered";
                  } else if (field === 'date_ordered' && order?.date_received) {
                    newStatus = "received";
                  }
                  
                  // Clear date locally and update status
                  setOrders(prev => prev.map(o => o.id === orderId ? { ...o, [field]: "", status: newStatus } : o));
                  // For clearing dates, update directly to the API
                  Order.update(orderId, { status: newStatus }).catch(err => console.error("Error updating status:", err));
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
    </div>
  );
}