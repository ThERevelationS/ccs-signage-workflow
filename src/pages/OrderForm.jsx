import React, { useState, useEffect, useRef } from "react";
import { useAuth } from "@/components/auth/EmailGate";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  ClipboardList,
  Filter,
  Search,
  Plus,
  Upload,
  Download,
  FileText,
  Edit,
  Trash2,
  Eye
} from "lucide-react";
import { format } from "date-fns";
import OrderSpreadsheet from "@/components/orders/OrderSpreadsheet";
import CustomerInfoForm from "@/components/orders/CustomerInfoForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";

export default function OrderForm() {
  const { currentUser, isRegistered, promptForEmail } = useAuth();
  const [activeTab, setActiveTab] = useState("customer-forms");
  
  // Customer Forms state
  const [customerForms, setCustomerForms] = useState([]);
  const [loadingForms, setLoadingForms] = useState(true);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [editingForm, setEditingForm] = useState(null);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [filterFormStatus, setFilterFormStatus] = useState("all");
  const [deleteFormId, setDeleteFormId] = useState(null);
  
  // Material Orders state
  const [filterStatus, setFilterStatus] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterLoaded, setFilterLoaded] = useState(false);
  const spreadsheetRef = useRef(null);

  useEffect(() => {
    loadCustomerForms();
  }, []);

  // Load saved filter preference from user data
  useEffect(() => {
    const loadSavedFilter = async () => {
      if (currentUser?.email) {
        try {
          const me = await base44.auth.me();
          if (me?.order_form_filter) {
            setFilterStatus(me.order_form_filter);
          }
        } catch (e) {
          // User might not have this field yet
        }
      }
      setFilterLoaded(true);
    };
    loadSavedFilter();
  }, [currentUser?.email]);

  const loadCustomerForms = async () => {
    setLoadingForms(true);
    try {
      const forms = await base44.entities.CustomerInfo.list("-created_date");
      setCustomerForms(forms);
    } catch (error) {
      console.error("Error loading customer forms:", error);
    }
    setLoadingForms(false);
  };

  // Save filter preference when it changes
  const handleFilterChange = async (value) => {
    setFilterStatus(value);
    if (currentUser?.email) {
      try {
        await base44.auth.updateMe({ order_form_filter: value });
      } catch (e) {
        console.error("Error saving filter preference:", e);
      }
    }
  };

  const handleCreateForm = () => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    setEditingForm(null);
    setShowCustomerForm(true);
  };

  const handleEditForm = (form) => {
    if (!isRegistered) {
      promptForEmail();
      return;
    }
    setEditingForm(form);
    setShowCustomerForm(true);
  };

  const handleDeleteForm = async () => {
    if (!deleteFormId) return;
    try {
      await base44.entities.CustomerInfo.delete(deleteFormId);
      loadCustomerForms();
    } catch (error) {
      console.error("Error deleting form:", error);
    }
    setDeleteFormId(null);
  };

  const filteredCustomerForms = customerForms.filter(form => {
    const matchesSearch = !searchCustomer || 
      form.customer_name?.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      form.representative?.toLowerCase().includes(searchCustomer.toLowerCase()) ||
      form.address?.toLowerCase().includes(searchCustomer.toLowerCase());
    
    const matchesStatus = filterFormStatus === "all" || form.status === filterFormStatus;
    
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen p-4 sm:p-6">
      <div className="w-full max-w-[95%] lg:max-w-[90%] xl:max-w-[85%] mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="clay-card p-3">
            <ClipboardList className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Order Form</h1>
            <p className="text-gray-600 text-sm">Manage customer information and material orders</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="clay-card mb-4">
            <TabsTrigger value="customer-forms" className="data-[state=active]:bg-purple-100">
              <FileText className="w-4 h-4 mr-2" />
              Customer Information Forms
            </TabsTrigger>
            <TabsTrigger value="material-orders" className="data-[state=active]:bg-purple-100">
              <ClipboardList className="w-4 h-4 mr-2" />
              Material Orders
            </TabsTrigger>
          </TabsList>

          {/* Customer Information Forms Tab */}
          <TabsContent value="customer-forms">
            <div className="clay-card p-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search customers..."
                      value={searchCustomer}
                      onChange={(e) => setSearchCustomer(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                  <Select value={filterFormStatus} onValueChange={setFilterFormStatus}>
                    <SelectTrigger className="w-36">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Forms</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="on_hold">On Hold</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {isRegistered && (
                  <Button
                    onClick={handleCreateForm}
                    className="clay-button border-none text-gray-800"
                    style={{ background: 'linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)' }}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    New Customer Form
                  </Button>
                )}
              </div>

              {/* Forms List */}
              {loadingForms ? (
                <div className="text-center py-8 text-gray-500">Loading forms...</div>
              ) : filteredCustomerForms.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {searchCustomer || filterFormStatus !== "all" 
                    ? "No forms match your search criteria" 
                    : "No customer forms yet. Click 'New Customer Form' to create one."}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-3 py-2 font-semibold">Customer</th>
                        <th className="text-left px-3 py-2 font-semibold">Representative</th>
                        <th className="text-left px-3 py-2 font-semibold">Address</th>
                        <th className="text-left px-3 py-2 font-semibold">Phone</th>
                        <th className="text-left px-3 py-2 font-semibold">Initial Contact</th>
                        <th className="text-left px-3 py-2 font-semibold">Status</th>
                        <th className="text-center px-3 py-2 font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCustomerForms.map((form) => (
                        <tr 
                          key={form.id} 
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => handleEditForm(form)}
                        >
                          <td className="px-3 py-2 font-medium">{form.customer_name}</td>
                          <td className="px-3 py-2">{form.representative || "-"}</td>
                          <td className="px-3 py-2">{form.address || "-"}</td>
                          <td className="px-3 py-2">{form.contact_phone || "-"}</td>
                          <td className="px-3 py-2">
                            {form.initial_contact_date 
                              ? format(new Date(form.initial_contact_date + "T00:00:00"), "MMM d, yyyy")
                              : "-"}
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              form.status === 'active' ? 'bg-green-100 text-green-800' :
                              form.status === 'completed' ? 'bg-blue-100 text-blue-800' :
                              form.status === 'on_hold' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {form.status || 'active'}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEditForm(form);
                                }}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {isRegistered && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-red-600 hover:text-red-700"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteFormId(form.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Material Orders Tab */}
          <TabsContent value="material-orders">
            <div className="clay-card p-4">
              {/* Toolbar */}
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <Input
                      placeholder="Search orders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 w-64"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={handleFilterChange}>
                    <SelectTrigger className="w-36">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="ordered">Ordered</SelectItem>
                      <SelectItem value="received">Received</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  {isRegistered && (
                    <Button 
                      onClick={() => spreadsheetRef.current?.addNewRow()}
                      size="sm" 
                      className="h-8 px-3"
                      variant="ghost"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Add
                    </Button>
                  )}
                  
                  {isRegistered && (
                    <Button 
                      onClick={() => spreadsheetRef.current?.importFromExcel()}
                      size="sm" 
                      className="h-8 px-3"
                      variant="ghost"
                    >
                      <Upload className="w-4 h-4 mr-1" />
                      Import
                    </Button>
                  )}

                  <Button 
                    onClick={() => spreadsheetRef.current?.exportToExcel()}
                    size="sm" 
                    className="h-8 px-3"
                    variant="ghost"
                  >
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </div>

              {/* Spreadsheet */}
              <OrderSpreadsheet 
                ref={spreadsheetRef}
                searchTerm={searchTerm} 
                filterStatus={filterStatus}
                showButtonsInline={false}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Customer Info Form Dialog */}
      <CustomerInfoForm
        isOpen={showCustomerForm}
        onClose={() => {
          setShowCustomerForm(false);
          setEditingForm(null);
        }}
        existingForm={editingForm}
        onSave={loadCustomerForms}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteFormId} onOpenChange={() => setDeleteFormId(null)}>
        <AlertDialogContent className="clay-card border-none">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Customer Form?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this customer information form? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="clay-button">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteForm}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}