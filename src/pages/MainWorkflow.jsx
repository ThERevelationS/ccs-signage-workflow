import React, { useState, useEffect } from "react";
import { WorkOrder } from "@/entities/WorkOrder";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Maximize2, Minimize2, RefreshCw, ArrowUpDown } from "lucide-react";
import GanttChart from "../components/workflow/GanttChart";

const stageOrder = ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation'];

export default function MainWorkflow() {
  const [workOrders, setWorkOrders] = useState([]);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sortBy, setSortBy] = useState("due_date");

  useEffect(() => {
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setIsLoading(true);
    const allWorkOrders = await WorkOrder.filter({ completed: false }, "-priority");
    const withDates = allWorkOrders.filter(wo => wo.start_date && wo.due_date);
    
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
    setIsLoading(false);
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

  const toggleFullScreen = () => {
    if (!isFullScreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullScreen(!isFullScreen);
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-[1600px] mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-4xl font-bold text-gray-800 mb-2">Main Workflow</h1>
            <p className="text-gray-600">Visual timeline of all active work orders</p>
          </div>
          <div className="flex gap-3 items-center">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-gray-500" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-32 h-9 clay-button border-none text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="clay-card border-none">
                  <SelectItem value="due_date">Due Date</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="stage">Stage</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={loadWorkOrders}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #D4E9F7 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              onClick={toggleFullScreen}
              className="clay-button border-none text-gray-800"
              style={{ background: 'linear-gradient(135deg, #C8F4E9 0%, rgba(255,255,255,0.9) 100%)' }}
            >
              {isFullScreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
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
            <GanttChart workOrders={getSortedWorkOrders()} />
          )}
        </div>
      </div>
    </div>
  );
}