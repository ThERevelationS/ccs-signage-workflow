import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

const WorkOrder = base44.entities.WorkOrder;
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowUpDown } from "lucide-react";
import GanttChart from "../components/workflow/GanttChart";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const stageOrder = ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation'];

export default function MainWorkflow() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("due_date");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

  useEffect(() => {
    document.title = "Main Workflow - Workflow Manager";
  }, []);

  useEffect(() => {
    loadWorkOrders(true);
    const interval = setInterval(() => loadWorkOrders(false), 10000);
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  const loadWorkOrders = async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    // Use list with limit instead of filter to avoid timeout
    const allWorkOrders = await WorkOrder.list("-updated_date", 500);
    const activeOrders = allWorkOrders.filter(wo => !wo.completed && !wo.deleted);
    // Show work orders with at least a due_date (start_date is optional - will default to created_date)
    const withDates = activeOrders.filter(wo => wo.due_date);
    
    // Separate parent work orders and riders
    // A work order is considered a rider if its `is_rider` property is true.
    // Otherwise, it's considered a parent.
    const parents = withDates.filter(wo => !wo.is_rider);
    const riders = withDates.filter(wo => wo.is_rider);
    
    // Attach riders to their parent work orders
    const groupedWorkOrders = parents.map(parent => ({
      ...parent,
      riders: riders.filter(rider => rider.parent_work_order_id === parent.id)
    }));
    
    setWorkOrders(groupedWorkOrders);
    if (showLoading) setIsLoading(false);
  };

  const getSortedWorkOrders = () => {
    const sorted = [...workOrders];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "due_date":
        sorted.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
        break;
      case "stage":
        sorted.sort((a, b) => stageOrder.indexOf(a.current_stage) - stageOrder.indexOf(b.current_stage));
        break;
      default:
        break;
    }
    return sorted;
  };

  return (
    <div className="min-h-screen p-4">
      <div className="w-full max-w-[95vw] mx-auto">
        <div className="flex justify-end items-center gap-2 mb-2">
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-500" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-28 h-8 clay-button border-none text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="clay-card border-none">
                  <SelectItem value="due_date">Due Date</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="clay-card p-4">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading timeline...</p>
            </div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No work orders with dates available</p>
              <p className="text-gray-400 text-sm mt-2">Add start and due dates to work orders to see them here</p>
            </div>
          ) : (
            <GanttChart workOrders={getSortedWorkOrders()} onWorkOrderClick={setSelectedWorkOrder} />
          )}
        </div>
      </div>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={true}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={() => loadWorkOrders(false)}
        />
      )}
    </div>
  );
}