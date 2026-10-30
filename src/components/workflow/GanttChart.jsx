import React, { useLayoutEffect, useRef, useState } from "react";
import { format, differenceInDays, addDays, startOfWeek } from "date-fns";
import ProjectHealthBadge from "./ProjectHealthBadge";
import { buildWorkOrderSegments } from "./workOrderTimelineSegments";

// Panes narrower than this (portrait monitors, split view) switch to a shorter
// window that fills the available width instead of scrolling a fixed 1200px
// chart; very narrow panes fall back to a plain agenda list.
const WIDE_PANE_PX = 1000;
const NARROW_PANE_PX = 480;

export default function GanttChart({ workOrders, onWorkOrderClick }) {
  const containerRef = useRef(null);
  const [paneWidth, setPaneWidth] = useState(() => (typeof window === "undefined" ? 1200 : window.innerWidth));

  useLayoutEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width) setPaneWidth(width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const compact = paneWidth < WIDE_PANE_PX;
  const narrow = compact && paneWidth < NARROW_PANE_PX;
  const weeks = compact ? Math.max(3, Math.floor((paneWidth - 140) / 110)) : 8;
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

  const formatSegmentDates = (seg) => {
    const due = format(new Date(seg.due), "MMM d");
    if (!seg.start || seg.start === seg.due) return due;
    return `${format(new Date(seg.start), "MMM d")} – ${due}`;
  };

  if (narrow) {
    return (
      <div ref={containerRef} className="space-y-2">
        {workOrders.map((wo) => {
          const segments = buildWorkOrderSegments(wo).slice().sort(
            (a, b) => new Date(a.due).getTime() - new Date(b.due).getTime()
          );
          if (segments.length === 0) return null;
          return (
            <div key={wo.id} className="rounded-lg border border-gray-200 bg-white/60 p-2">
              <div
                className="flex items-center gap-1 cursor-pointer hover:bg-white/50 rounded px-1 transition-colors"
                onClick={() => onWorkOrderClick && onWorkOrderClick(wo)}
              >
                <div className="font-medium text-xs text-gray-800 truncate leading-tight flex-1">
                  {wo.client_name}
                </div>
                <ProjectHealthBadge workOrder={wo} size="sm" showTooltip={false} />
              </div>
              <div className="mt-1 space-y-0.5">
                {segments.map((seg) => (
                  <button type="button"
                    key={seg.id}
                    type="button"
                    className="w-full flex items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-white transition-colors"
                    onClick={() => onWorkOrderClick && onWorkOrderClick(seg.record)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ background: seg.color, border: "1px solid rgba(0,0,0,0.15)" }}
                    />
                    <span className="text-[10px] text-gray-700 truncate flex-1">{seg.label}</span>
                    <span className="text-[10px] text-gray-500 shrink-0">{formatSegmentDates(seg)}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="overflow-x-auto">
      <div className={compact ? "w-full" : "min-w-[1200px]"}>
        {/* Header */}
        <div className="flex border-b border-gray-200 pb-1 mb-2">
          <div className={`${compact ? "w-28" : "w-48"} font-semibold text-xs text-gray-700 pr-2`}>Work Order</div>
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
                <div className={`${compact ? "w-28" : "w-48"} pr-2`}>
                  <div
                    className="py-1 px-2 rounded-lg cursor-pointer hover:bg-white/50 transition-colors"
                    onClick={() => onWorkOrderClick && onWorkOrderClick(wo)}
                  >
                    <div className="flex items-center gap-1">
                      <div className="font-medium text-xs text-gray-800 truncate leading-tight flex-1">
                        {wo.client_name}
                      </div>
                      <ProjectHealthBadge workOrder={wo} size="sm" showTooltip={false} />
                    </div>
                    {wo.description && !compact && (
                      <div className="text-[10px] text-gray-500 truncate leading-tight">{wo.description}</div>
                    )}
                  </div>
                </div>
                <div className="flex-1 relative" style={{ height: `${Math.max(1, segments.length) * 20}px` }}>
                  <div className="absolute inset-0 flex flex-col gap-0.5">
                    {segments.map((seg) => {
                      const pos = getBarPosition(seg.start, seg.due);
                      const chartPx = Math.max(300, paneWidth - (compact ? 112 : 192));
                      const label = String(seg.label || "");
                      const fitsInside = ((parseFloat(pos.width) || 0) / 100) * chartPx >= label.length * 5.8 + 10;
                      const endPct = (parseFloat(pos.left) || 0) + (parseFloat(pos.width) || 0);
                      const labelAfterBar = !fitsInside && endPct < 80;
                      return (
                        <div
                          key={seg.id}
                          className="relative h-5 flex items-center"
                          style={seg.kind === "rider" ? { paddingLeft: "16px" } : undefined}
                        >
                          <div className="w-full h-px bg-gray-200" />
                          <div
                            className="absolute h-5 rounded-lg flex items-center justify-center transition-all duration-300 hover:opacity-80 cursor-pointer"
                            title={`${label} · ${formatSegmentDates(seg)}`}
                            style={{
                              ...pos,
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
                            {fitsInside && (
                              <span className="text-[10px] font-medium text-gray-700 px-1 truncate">
                                {label}
                              </span>
                            )}
                          </div>
                          {!fitsInside && (
                            <span
                              className="pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium text-gray-700"
                              style={labelAfterBar
                                ? { left: `calc(${pos.left} + ${pos.width} + 6px)` }
                                : { right: `calc(${100 - (parseFloat(pos.left) || 0)}% + 6px)` }}
                            >
                              {label}
                            </span>
                          )}
                        </div>
                      );
                    })}
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
