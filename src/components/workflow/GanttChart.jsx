import React from "react";
import { format, differenceInDays, addDays, startOfWeek } from "date-fns";
import ProjectHealthBadge from "./ProjectHealthBadge";

const stageColors = {
  estimating: "#FFF9C4",
  sales: "#B2DFDB",
  permitting: "#FFE4D6",
  design: "#D4E9F7", 
  production: "#C8F4E9",
  fabrication: "#FFD6E8",
  installation: "#E0D4F7"
};

const stageNames = {
  estimating: "Estimating",
  sales: "Sales",
  permitting: "Permitting",
  design: "Design",
  production: "Production",
  fabrication: "Fabrication",
  installation: "Installation"
};

export default function GanttChart({ workOrders, onWorkOrderClick }) {
  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weeks = 8;
  const daysToShow = weeks * 7;

  const dateHeaders = [];
  for (let i = 0; i < weeks; i++) {
    const weekDate = addDays(weekStart, i * 7);
    dateHeaders.push(weekDate);
  }

  const getBarPosition = (startDate, dueDate) => {
    if (!startDate || !dueDate) return { left: 0, width: 0 };
    
    const start = new Date(startDate);
    const end = new Date(dueDate);
    const daysFromStart = differenceInDays(start, weekStart);
    const duration = differenceInDays(end, start);
    
    // Calculate left position based on days from week start
    // If the bar starts before the visible week, clamp left to 0
    const left = (daysFromStart / daysToShow) * 100;
    
    // Calculate width based on duration
    const width = (duration / daysToShow) * 100;
    
    return { left: `${Math.max(0, left)}%`, width: `${Math.max(2, width)}%` }; // Ensure min width of 2% for visibility
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[1200px]">
        {/* Header */}
        <div className="flex border-b border-gray-200 pb-1 mb-2">
          <div className="w-48 font-semibold text-xs text-gray-700 pr-2">Work Order</div>
          <div className="flex-1 flex">
            {dateHeaders.map((date, i) => (
              <div key={i} className="flex-1 text-center text-[10px]">
                <div className="font-medium text-gray-600">
                  {format(date, "MMM d")}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Gantt Rows */}
        {workOrders.map((wo) => (
          <div key={wo.id} className="mb-1">
            <div className="flex items-center">
              <div className="w-48 pr-2">
                <div 
                  className="py-1 px-2 rounded-lg cursor-pointer hover:bg-white/50 transition-colors"
                  onClick={() => onWorkOrderClick && onWorkOrderClick(wo)}
                >
                  <div className="flex items-center gap-1">
                    <div className="font-medium text-xs text-gray-800 truncate leading-tight flex-1">
                      {wo.title}
                    </div>
                    <ProjectHealthBadge workOrder={wo} size="sm" showTooltip={false} />
                  </div>
                  <div className="text-[10px] text-gray-500 truncate leading-tight">{wo.client_name}</div>
                </div>
              </div>
              <div className="flex-1 relative" style={{ height: wo.riders && wo.riders.length > 0 ? `${(wo.riders.length + 1) * 20}px` : '24px' }}>
                <div className="absolute inset-0 flex flex-col gap-0.5">
                  {/* Parent work order bar */}
                  <div className="relative h-5 flex items-center">
                    <div className="w-full h-px bg-gray-200" />
                    {wo.due_date && (
                      <div
                        className="absolute h-5 rounded-lg flex items-center justify-center transition-all duration-300 hover:opacity-80 cursor-pointer"
                        style={{
                          ...getBarPosition(wo.start_date || wo.created_date, wo.due_date),
                          background: `linear-gradient(135deg, ${stageColors[wo.current_stage]}ee 0%, ${stageColors[wo.current_stage]}aa 100%)`,
                          boxShadow: '1px 1px 3px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.5)'
                        }}
                        onClick={() => onWorkOrderClick && onWorkOrderClick(wo)}
                      >
                        <span className="text-[9px] font-medium text-gray-700 px-1 truncate">
                          {stageNames[wo.current_stage]}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Rider bars */}
                  {wo.riders && wo.riders.map((rider, index) => (
                    <div key={rider.id} className="relative h-4 flex items-center pl-4">
                      <div className="w-full h-px bg-gray-200" />
                      {rider.due_date && (
                        <div
                          className="absolute h-4 rounded-md flex items-center justify-center transition-all duration-300 hover:opacity-80 cursor-pointer"
                          style={{
                            ...getBarPosition(rider.start_date || rider.created_date, rider.due_date),
                            background: `linear-gradient(135deg, ${stageColors[rider.rider_stage || rider.current_stage]}dd 0%, ${stageColors[rider.rider_stage || rider.current_stage]}88 100%)`,
                            boxShadow: '1px 1px 2px rgba(0,0,0,0.1)',
                            border: '1px dashed rgba(124, 58, 237, 0.3)'
                          }}
                          onClick={() => onWorkOrderClick && onWorkOrderClick(rider)}
                        >
                          <span className="text-[8px] font-medium text-gray-700 px-1 truncate">
                            {stageNames[rider.rider_stage || rider.current_stage]}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}