import React, { useState, useEffect, useRef, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Loader2, Link as LinkIcon } from "lucide-react";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import * as XLSX from "xlsx";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const WorkOrder = base44.entities.WorkOrder;
const AuthorizedEmail = base44.entities.AuthorizedEmail;

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const FinancialsSpreadsheet = React.forwardRef(({ 
  searchTerm = "", 
  filterStatus = "all", 
  activeColumnPreset = null, 
  customFilters = [],
  startMonth = new Date(),
  monthCount = 4,
  filterPM = "all",
  filterEstimator = "all"
}, ref) => {
  const { currentUser, isRegistered } = useAuth();
  const [workOrders, setWorkOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [readError, setReadError] = useState("");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [pendingChanges, setPendingChanges] = useState({});
  const debounceTimers = useRef({});

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
    setReadError("");
    try {
      const [orders, usersData] = await Promise.all([
        loadAllEntityRows({
          entity: WorkOrder,
          query: { is_rider: false, completed: false, deleted: { $ne: true } },
          sort: "created_date",
          label: "Financial spreadsheet Work Orders",
        }),
        AuthorizedEmail.list()
      ]);
      setWorkOrders(orders.sort((a, b) => {
        // Sort by install date first
        if (a.project_install_date && b.project_install_date) {
          return a.project_install_date.localeCompare(b.project_install_date);
        }
        if (a.project_install_date) return -1;
        if (b.project_install_date) return 1;
        return (b.created_date || "").localeCompare(a.created_date || "");
      }));
      setUsers(usersData);
    } catch (error) {
      console.error("Error loading work orders:", error);
      setWorkOrders([]);
      setReadError(error?.message || "Financial spreadsheet Work Orders could not be verified completely.");
    }
    setIsLoading(false);
  };

  const updateWorkOrder = (orderId, field, value) => {
    setWorkOrders(prev => prev.map(wo => wo.id === orderId ? { ...wo, [field]: value } : wo));
    
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: { ...prev[orderId], [field]: value }
    }));

    if (debounceTimers.current[orderId]) {
      clearTimeout(debounceTimers.current[orderId]);
    }

    debounceTimers.current[orderId] = setTimeout(async () => {
      try {
        const changes = pendingChanges[orderId] || { [field]: value };
        await WorkOrder.update(orderId, changes);
        setPendingChanges(prev => {
          const updated = { ...prev };
          delete updated[orderId];
          return updated;
        });
        delete debounceTimers.current[orderId];
      } catch (error) {
        if (!error.message?.includes('not found')) {
          console.error("Error updating work order:", error);
        }
        delete debounceTimers.current[orderId];
        setPendingChanges(prev => {
          const updated = { ...prev };
          delete updated[orderId];
          return updated;
        });
      }
    }, 1000);
  };

  const applyCustomFilter = (wo, conditions) => {
    if (!conditions || conditions.length === 0) return true;
    
    return conditions.every(condition => {
      const fieldValue = wo[condition.field];
      const condValue = condition.value;
      
      switch (condition.operator) {
        case "equals":
          return fieldValue == condValue;
        case "contains":
          return fieldValue?.toString().toLowerCase().includes(condValue.toLowerCase());
        case "greater_than":
          return parseFloat(fieldValue) > parseFloat(condValue);
        case "less_than":
          return parseFloat(fieldValue) < parseFloat(condValue);
        case "not_empty":
          return fieldValue != null && fieldValue !== "";
        case "empty":
          return fieldValue == null || fieldValue === "";
        default:
          return true;
      }
    });
  };

  const filteredWorkOrders = workOrders.filter(wo => {
    if (filterStatus !== "all" && !filterStatus.startsWith("custom_")) {
      if (wo.sales_status !== filterStatus) return false;
    }
    
    if (filterStatus.startsWith("custom_")) {
      const filterId = filterStatus.replace("custom_", "");
      const customFilter = customFilters.find(f => f.id === filterId);
      if (customFilter && !applyCustomFilter(wo, customFilter.conditions)) {
        return false;
      }
    }
    
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      const searchable = [wo.title, wo.client_name, wo.contact_name, wo.sales_rep].filter(Boolean).join(' ').toLowerCase();
      if (!searchable.includes(search)) return false;
    }
    
    // Project Manager filter
    if (filterPM !== "all" && wo.project_manager !== filterPM) return false;
    
    // Estimator filter
    if (filterEstimator && filterEstimator !== "all" && wo.estimator !== filterEstimator) return false;
    
    return true;
  });

  // Generate month columns
  const monthColumns = useMemo(() => {
    const months = [];
    for (let i = 0; i < monthCount; i++) {
      const date = new Date(startMonth);
      date.setMonth(date.getMonth() + i);
      months.push({
        key: `month_${i}`,
        label: date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        year: date.getFullYear(),
        month: date.getMonth(),
        fullLabel: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      });
    }
    return months;
  }, [startMonth, monthCount]);

  // Calculate which month column an amount should go in
  const getMonthForInstallDate = (installDate) => {
    if (!installDate) return null;
    const date = parseLocalDate(installDate);
    if (!date) return null;
    
    for (let i = 0; i < monthColumns.length; i++) {
      const col = monthColumns[i];
      if (date.getFullYear() === col.year && date.getMonth() === col.month) {
        return i;
      }
    }
    return null;
  };

  // Calculate totals
  const totals = useMemo(() => {
    const monthTotals = monthColumns.map(() => 0);
    let grandTotal = 0;

    filteredWorkOrders.forEach(wo => {
      const amount = wo.estimate_amount || 0;
      grandTotal += amount;
      
      const monthIndex = getMonthForInstallDate(wo.project_install_date);
      if (monthIndex !== null) {
        monthTotals[monthIndex] += amount;
      }
    });

    return { monthTotals, grandTotal };
  }, [filteredWorkOrders, monthColumns]);

  const isColumnVisible = (columnId) => {
    if (!activeColumnPreset?.column_settings) return true;
    const setting = activeColumnPreset.column_settings.find(c => c.id === columnId);
    return setting?.visible !== false;
  };

  const formatCurrency = (value) => {
    if (!value && value !== 0) return "-";
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const exportToExcel = async () => {
    const exportData = filteredWorkOrders.map(wo => {
      const monthIndex = getMonthForInstallDate(wo.project_install_date);
      const row = {
        "Customer": wo.client_name || "",
        "Order Number": wo.corbridge_invoice_number || wo.est_inv_at || "",
        "Description": wo.title || "",
        "Amount": wo.estimate_amount || 0,
        "Production Inhouse/Outsource": wo.production_type || "",
        "Install Date": wo.project_install_date || "",
        "Project Manager": wo.project_manager || ""
      };
      
      monthColumns.forEach((col, i) => {
        row[col.fullLabel] = monthIndex === i ? (wo.estimate_amount || 0) : 0;
      });
      
      return row;
    });

    // Add totals row
    const totalsRow = {
      "Customer": "TOTALS",
      "Order Number": "",
      "Description": "",
      "Amount": totals.grandTotal,
      "Production Inhouse/Outsource": "",
      "Install Date": "",
      "Project Manager": ""
    };
    monthColumns.forEach((col, i) => {
      totalsRow[col.fullLabel] = totals.monthTotals[i];
    });
    exportData.push(totalsRow);

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Financials");
    XLSX.writeFile(wb, `financials_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
  };

  React.useImperativeHandle(ref, () => ({
    exportToExcel
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (readError) {
    return (
      <div className="p-6 text-center">
        <div className="text-sm font-bold text-red-700">Financial spreadsheet data could not be verified.</div>
        <div className="mt-1 text-xs text-red-600">{readError}</div>
        <Button variant="outline" size="sm" className="mt-3" onClick={loadWorkOrders}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="overflow-visible">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border rounded-lg" style={{ fontSize: '10px', tableLayout: 'auto' }}>
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr className="border-b">
              {isColumnVisible("client_name") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '120px' }}>Customer Name</th>}
              {isColumnVisible("est_inv_at") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Order Number</th>}
              {isColumnVisible("title") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '200px' }}>Order Description</th>}
              {isColumnVisible("estimate_amount") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Amount</th>}
              <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '120px' }}>Production Inhouse or Outsource</th>
              {isColumnVisible("project_install_date") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Proj./Actual Install Date</th>}
              {isColumnVisible("project_manager") && <th className="px-1 py-1 border-r text-left font-medium text-gray-700 text-xs" style={{ minWidth: '100px' }}>Project Manager</th>}
              {monthColumns.map(col => (
                <th 
                  key={col.key} 
                  className="px-1 py-1 border-r text-center font-medium text-gray-700 text-xs bg-blue-50"
                  style={{ minWidth: '80px' }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredWorkOrders.map((wo) => {
              const monthIndex = getMonthForInstallDate(wo.project_install_date);
              
              return (
                <tr key={wo.id} className="border-b hover:bg-gray-50">
                  {isColumnVisible("client_name") && (
                    <td className="px-1 py-0.5 border-r">
                      <button
                        onClick={() => setSelectedWorkOrder(wo)}
                        className="h-6 w-full text-xs text-left px-1 hover:bg-blue-50 rounded flex items-center gap-1 text-blue-600"
                      >
                        <LinkIcon className="w-3 h-3 flex-shrink-0" />
                        <span className="truncate">{wo.client_name || "Unnamed"}</span>
                      </button>
                    </td>
                  )}

                  {isColumnVisible("est_inv_at") && (
                    <td className="px-1 py-0.5 border-r">
                      <span className="text-xs">{wo.corbridge_invoice_number || wo.est_inv_at || "-"}</span>
                    </td>
                  )}

                  {isColumnVisible("title") && (
                    <td className="px-1 py-0.5 border-r">
                      <button
                        onClick={() => setSelectedWorkOrder(wo)}
                        className="h-6 w-full text-xs text-left px-1 hover:bg-blue-50 rounded truncate text-blue-600"
                      >
                        {wo.title || "View Details"}
                      </button>
                    </td>
                  )}

                  {isColumnVisible("estimate_amount") && (
                    <td className="px-1 py-0.5 border-r">
                      <div className="relative flex items-center">
                        <span className="absolute left-1 text-xs text-gray-500">$</span>
                        <Input
                          type="number"
                          value={wo.estimate_amount || ""}
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9.]/g, '');
                            updateWorkOrder(wo.id, "estimate_amount", parseFloat(val) || 0);
                          }}
                          className="h-6 text-xs border-0 bg-transparent pl-3 pr-1"
                          placeholder="0"
                          disabled={!isRegistered}
                        />
                      </div>
                    </td>
                  )}

                  <td className="px-1 py-0.5 border-r">
                    <Select
                      value={wo.production_type || ""}
                      onValueChange={(val) => updateWorkOrder(wo.id, "production_type", val)}
                      disabled={!isRegistered}
                    >
                      <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inhouse">Inhouse</SelectItem>
                        <SelectItem value="outsource">Outsource</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>

                  {isColumnVisible("project_install_date") && (
                    <td className="px-1 py-0.5 border-r">
                      <Popover open={openDatePopover === `install-${wo.id}`} onOpenChange={(open) => setOpenDatePopover(open ? `install-${wo.id}` : null)}>
                        <PopoverTrigger asChild disabled={!isRegistered}>
                          <button className="h-6 w-full text-xs text-left px-1 hover:bg-gray-100 rounded">
                            {wo.project_install_date ? format(parseLocalDate(wo.project_install_date), "M/d/yyyy") : "-"}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={parseLocalDate(wo.project_install_date)}
                            onSelect={(date) => {
                              updateWorkOrder(wo.id, "project_install_date", date ? format(date, "yyyy-MM-dd") : "");
                              setOpenDatePopover(null);
                            }}
                          />
                        </PopoverContent>
                      </Popover>
                    </td>
                  )}

                  {isColumnVisible("project_manager") && (
                    <td className="px-1 py-0.5 border-r">
                      <Select
                        value={wo.project_manager || ""}
                        onValueChange={(val) => updateWorkOrder(wo.id, "project_manager", val)}
                        disabled={!isRegistered}
                      >
                        <SelectTrigger className="h-6 text-xs border-0 bg-transparent p-0 px-1">
                          <SelectValue placeholder="-" />
                        </SelectTrigger>
                        <SelectContent>
                          {users.filter(u => u.sales_roles?.includes("PM")).map(u => (
                            <SelectItem key={u.email} value={u.full_name}>{u.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  )}

                  {monthColumns.map((col, i) => (
                    <td 
                      key={col.key} 
                      className={`px-1 py-0.5 border-r text-center text-xs ${monthIndex === i ? 'bg-green-50 font-medium' : ''}`}
                    >
                      {monthIndex === i ? formatCurrency(wo.estimate_amount) : "-"}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>

          {/* Totals Footer - Sticky */}
          <tfoot className="bg-gray-200 sticky bottom-0 z-10">
            <tr className="border-t-2 border-gray-400 font-bold">
              <td colSpan={isColumnVisible("client_name") ? 1 : 0} className="px-2 py-2 text-xs"></td>
              {isColumnVisible("est_inv_at") && <td className="px-2 py-2 text-xs"></td>}
              {isColumnVisible("title") && <td className="px-2 py-2 text-xs"></td>}
              {isColumnVisible("estimate_amount") && (
                <td className="px-2 py-2 text-xs border-r">
                  {formatCurrency(totals.grandTotal)}
                </td>
              )}
              <td className="px-2 py-2 text-xs"></td>
              {isColumnVisible("project_install_date") && <td className="px-2 py-2 text-xs"></td>}
              {isColumnVisible("project_manager") && <td className="px-2 py-2 text-xs"></td>}
              {monthColumns.map((col, i) => (
                <td 
                  key={col.key} 
                  className="px-2 py-2 text-center text-xs bg-blue-100"
                >
                  {formatCurrency(totals.monthTotals[i])}
                </td>
              ))}
            </tr>
            <tr className="bg-gray-100">
              <td colSpan={7 + monthColumns.length} className="px-2 py-1 text-xs text-right">
                Grand Total: <span className="font-bold">{formatCurrency(totals.grandTotal)}</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-2 text-xs text-gray-500 text-right">
        {filteredWorkOrders.length} projects
      </div>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders()}
        />
      )}
    </div>
  );
});

export default FinancialsSpreadsheet;