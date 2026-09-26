import React from "react";
import { format, differenceInDays, addDays, startOfWeek } from "date-fns";
import ProjectHealthBadge from "./ProjectHealthBadge";
import { buildWorkOrderSegments } from "./workOrderTimelineSegments";

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

    const left = (daysFromStart / daysToShow) * 100;
    const width = (duration / daysToShow) * 100;

    return { left: `${Math.max(0, left)}%`, width: `${Math.max(2, width)}%` };
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

        {/* Gantt Rows — one bar per dated portion of the job */}
        {workOrders.map((wo) => {
          const segments = buildWorkOrderSegments(wo);
          if (segments.length === 0) return null;
          return (
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
                <div className="flex-1 relative" style={{ height: `${Math.max(1, segments.length) * 20}px` }}>
                  <div className="absolute inset-0 flex flex-col gap-0.5">
                    {segments.map((seg) => (
                      <div
                        key={seg.id}
                        className="relative h-5 flex items-center"
                        style={seg.kind === "rider" ? { paddingLeft: "16px" } : undefined}
                      >
                        <div className="w-full h-px bg-gray-200" />
                        <div
                          className="absolute h-5 rounded-lg flex items-center justify-center transition-all duration-300 hover:opacity-80 cursor-pointer"
                          style={{
                            ...getBarPosition(seg.start, seg.due),
                            background: `linear-gradient(135deg, ${seg.color}ee 0%, ${seg.color}aa 100%)`,
                            boxShadow: "1px 1px 3px rgba(0,0,0,0.1), inset 1px 1px 2px rgba(255,255,255,0.5)",
                            ...(seg.kind === "rider"
                              ? { border: "1px dashed rgba(124, 58, 237, 0.3)" }
                              : {}),
                            ...(seg.kind === "milestone"
                              ? { border: "1px solid rgba(0,0,0,0.15)" }
                              : {}),
                          }}
                          onClick={() => onWorkOrderClick && onWorkOrderClick(seg.record)}
                        >
                          <span className="text-[9px] font-medium text-gray-700 px-1 truncate">
                            {seg.label}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}