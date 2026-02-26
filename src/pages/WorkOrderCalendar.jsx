import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Loader2, CalendarDays, X } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth, isSameDay, parseISO } from "date-fns";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";

const STAGE_COLORS = {
  estimating: { bg: "#FFF9C4", text: "#92400E" },
  sales: { bg: "#B2DFDB", text: "#065F46" },
  permitting: { bg: "#FFE4D6", text: "#9A3412" },
  design: { bg: "#D4E9F7", text: "#1E40AF" },
  production: { bg: "#C8F4E9", text: "#065F46" },
  fabrication: { bg: "#FFD6E8", text: "#9D174D" },
  installation: { bg: "#E0D4F7", text: "#5B21B6" },
  completed: { bg: "#A5D6A7", text: "#14532D" }
};

const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation"
};

const parseLocalDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export default function WorkOrderCalendar() {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stageFilter, setStageFilter] = useState("all");
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);

  useEffect(() => {
    document.title = "Work Order Calendar - Workflow Manager";
    loadWorkOrders();
  }, []);

  const loadWorkOrders = async () => {
    setLoading(true);
    const wos = await base44.entities.WorkOrder.filter({ deleted: false, completed: false });
    setWorkOrders(wos || []);
    setLoading(false);
  };

  const filtered = workOrders.filter(wo => {
    if (!wo.due_date) return false;
    if (stageFilter !== "all" && wo.current_stage !== stageFilter) return false;
    return true;
  });

  // Build calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const weeks = [];
  let day = calStart;
  while (day <= calEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }

  const getWOsForDay = (date) =>
    filtered.filter(wo => {
      const d = parseLocalDate(wo.due_date);
      return d && isSameDay(d, date);
    });

  const today = new Date();

  return (
    <div className="p-4 sm:p-6 min-h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)' }}>
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-5">
          <div className="clay-card p-3 flex-shrink-0">
            <CalendarDays className="w-6 h-6 text-purple-600" />
          </div>
          <div className="flex-shrink-0">
            <h1 className="text-2xl font-bold text-gray-800">Work Order Calendar</h1>
            <p className="text-gray-500 text-sm">View work orders by due date</p>
          </div>

          <div className="flex-1" />

          {/* Stage Filter */}
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {Object.entries(STAGE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month Navigation */}
          <div className="flex items-center gap-2 clay-card px-3 py-1.5">
            <button onClick={() => setCurrentMonth(subMonths(currentMonth, 1))} className="p-1 hover:bg-purple-100 rounded-lg transition-colors">
              <ChevronLeft className="w-4 h-4 text-purple-700" />
            </button>
            <span className="font-semibold text-gray-800 min-w-[120px] text-center text-sm">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button onClick={() => setCurrentMonth(addMonths(currentMonth, 1))} className="p-1 hover:bg-purple-100 rounded-lg transition-colors">
              <ChevronRight className="w-4 h-4 text-purple-700" />
            </button>
            <button onClick={() => setCurrentMonth(new Date())} className="ml-1 text-xs text-purple-600 hover:underline font-medium">
              Today
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center flex-1 min-h-64">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : (
          <div className="clay-card overflow-hidden flex-1">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 bg-gray-50">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(90px, 1fr))` }}>
              {weeks.map((week, wi) => (
                <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0" style={{ minHeight: 90 }}>
                  {week.map((date, di) => {
                    const isToday = isSameDay(date, today);
                    const inMonth = isSameMonth(date, currentMonth);
                    const dayWOs = getWOsForDay(date);
                    return (
                      <div
                        key={di}
                        className={`p-1.5 border-r border-gray-100 last:border-r-0 ${!inMonth ? 'bg-gray-50/50' : 'bg-white'}`}
                        style={{ minHeight: 90 }}
                      >
                        <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                          isToday ? 'bg-purple-600 text-white' : inMonth ? 'text-gray-700' : 'text-gray-300'
                        }`}>
                          {format(date, "d")}
                        </div>
                        <div className="space-y-0.5 overflow-hidden" style={{ maxHeight: 70, overflowY: 'auto' }}>
                          {dayWOs.map(wo => {
                            const colors = STAGE_COLORS[wo.current_stage] || { bg: "#E5E7EB", text: "#374151" };
                            return (
                              <button
                                key={wo.id}
                                onClick={() => setSelectedWorkOrder(wo)}
                                className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate hover:opacity-80 transition-opacity"
                                style={{ background: colors.bg, color: colors.text }}
                                title={`${wo.title} — ${wo.client_name}`}
                              >
                                {wo.asap && <span className="text-red-600 font-bold mr-0.5">!</span>}
                                {wo.title || wo.client_name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(STAGE_LABELS).map(([stage, label]) => (
            <div key={stage} className="flex items-center gap-1 text-xs text-gray-600">
              <div className="w-2.5 h-2.5 rounded-sm" style={{ background: STAGE_COLORS[stage]?.bg }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Details Dialog */}
      {selectedWorkOrder && (
        <WorkOrderDetailsDialog
          isOpen={!!selectedWorkOrder}
          onClose={() => setSelectedWorkOrder(null)}
          workOrder={selectedWorkOrder}
          onUpdate={loadWorkOrders}
        />
      )}
    </div>
  );
}