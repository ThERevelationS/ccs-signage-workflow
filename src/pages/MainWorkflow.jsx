import { useState, useEffect, useMemo } from "react";
import PullToRefresh from "@/components/mobile/PullToRefresh";

import { Button } from "@/components/ui/button";
import { SelectItem } from "@/components/ui/select";
import MobileSelect from "@/components/mobile/MobileSelect";
import { ArrowUpDown } from "lucide-react";
import GanttChart from "../components/workflow/GanttChart";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import { useAllWorkOrders, refreshAllWorkOrders, useBoardFeedMeta } from "@/lib/workOrderCache";
import { hasAnyTimelineSegment, earliestSegmentDue } from "@/components/workflow/workOrderTimelineSegments";
import AttentionFeed from "@/components/workflow/AttentionFeed";

const stageOrder = ['estimating', 'sales', 'permitting', 'design', 'production', 'fabrication', 'installation'];

export default function MainWorkflow() {
  const { data: allWorkOrders, isLoading, error: workOrdersError } = useAllWorkOrders();
  const boardMeta = useBoardFeedMeta("WorkOrder");
  const readError = workOrdersError?.message || (workOrdersError ? "Main Workflow Work Orders could not be verified completely." : "");
  const [sortBy, setSortBy] = useState("due_date");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const workOrders = useMemo(() => {
    // Only active jobs belong on the Main Workflow board — exclude anything
    // completed, closed (completed stage), lost, or soft-deleted. Also exclude
    // jobs whose current task places them out of active production: prospect
    // initiation, completed sale, lost (including "Lost - We took too long"),
    // and closed sections ("Closed - ...").
    const EXCLUDED_TASK_PATTERN = /^Prospect Initiation|^Completed Sale|^Lost$|^Lost -|^Closed -/i;
    const activeOrders = (allWorkOrders || []).filter(
      wo => !wo.completed && !wo.deleted && wo.current_stage !== "completed" && wo.sales_status !== "lost"
        && !EXCLUDED_TASK_PATTERN.test(wo.current_task_description || "")
    );

    // Separate parent work orders and riders. A work order is a rider if its
    // `is_rider` property is true; otherwise it is a parent.
    const parents = activeOrders.filter(wo => !wo.is_rider);
    const riders = activeOrders.filter(wo => wo.is_rider);

    // Attach riders to their parent work orders, then keep only jobs that
    // have at least one dated portion (whole-job due date, rider, task, or
    // Sales Pipeline milestone). Jobs with no assigned due date are hidden.
    return parents.map(parent => ({
      ...parent,
      riders: riders.filter(rider => rider.parent_work_order_id === parent.id)
    })).filter(wo => hasAnyTimelineSegment(wo));
  }, [allWorkOrders]);

  const handleWorkOrderClick = (wo) => {
    setSelectedWorkOrder(wo);
    setIsDialogOpen(true);
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setTimeout(() => setSelectedWorkOrder(null), 300);
  };

  useEffect(() => {
    document.title = "Main Workflow - Workflow Manager";
  }, []);

  // Deep link: /MainWorkflow?wo=<id> opens that work order's detail dialog.
  useEffect(() => {
    const woId = new URLSearchParams(window.location.search).get("wo");
    if (!woId || !allWorkOrders) return;
    const found = (allWorkOrders || []).find((w) => w.id === woId);
    if (found) {
      setSelectedWorkOrder(found);
      setIsDialogOpen(true);
    }
  }, [allWorkOrders]);

  const getSortedWorkOrders = () => {
    const sorted = [...workOrders];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        break;
      case "due_date":
        sorted.sort((a, b) => earliestSegmentDue(a) - earliestSegmentDue(b));
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
    <PullToRefresh onRefresh={() => refreshAllWorkOrders()}>
    <div className="min-h-screen p-4">
      <div className="w-full max-w-[95vw] mx-auto">
        <div className="flex justify-end items-center gap-2 mb-2">
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-gray-500" />
              <MobileSelect
                value={sortBy}
                onValueChange={setSortBy}
                title="Sort by"
                triggerClassName="w-28 h-8 clay-button border-none text-xs"
              >
                <SelectItem value="due_date">Due Date</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="stage">Stage</SelectItem>
              </MobileSelect>
            </div>
          </div>
        </div>
        <AttentionFeed />
        {readError && workOrders.length > 0 && (
          <div className="mb-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Workflow refresh could not be verified completely. Showing the last verified timeline until the next successful refresh.
          </div>
        )}
        {boardMeta?.truncated && (
          <div className="mb-2 px-3 py-2 rounded border border-amber-200 bg-amber-50 text-xs text-amber-800">
            Showing the first {boardMeta.count} work orders — the board feed hit its row cap, so some jobs may be missing from this view.
          </div>
        )}
        <div className="clay-card p-4">
          {isLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">Loading timeline...</p>
            </div>
          ) : readError && workOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-red-700 font-semibold">Workflow data could not be verified.</p>
              <p className="text-red-600 text-sm mt-2">{readError}</p>
              <Button variant="outline" className="mt-3" onClick={() => refreshAllWorkOrders()}>Retry</Button>
            </div>
          ) : workOrders.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-500 text-lg">No dated job portions available</p>
              <p className="text-gray-400 text-sm mt-2">Add due dates to tasks, riders, or sales milestones to see them here</p>
            </div>
          ) : (
            <GanttChart workOrders={getSortedWorkOrders()} onWorkOrderClick={handleWorkOrderClick} />
          )}
        </div>
      </div>

      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={isDialogOpen}
          onClose={handleDialogClose}
          workOrder={selectedWorkOrder}
          onUpdate={() => refreshAllWorkOrders()}
        />
      )}
    </div>
    </PullToRefresh>
  );
}