import React, { useState, useEffect, useRef, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, addWeeks, subWeeks,
  isSameMonth, isSameDay, isToday, addDays as add, parseISO
} from "date-fns";
import {
  ChevronLeft, ChevronRight, Plus, Settings, CalendarDays,
  LayoutGrid, List, Columns, AlignLeft, Loader2, RefreshCw, X, Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WorkOrderDetailsDialog from "@/components/workflow/WorkOrderDetailsDialog";
import CalendarEventForm from "@/components/calendar/CalendarEventForm";
import CalendarEventPopover from "@/components/calendar/CalendarEventPopover";
import AgendaView from "@/components/calendar/AgendaView";
import WeekView from "@/components/calendar/WeekView";
import DayView from "@/components/calendar/DayView";
import UserCalendarSettingsPanel from "@/components/calendar/UserCalendarSettingsPanel";

const STAGE_COLORS = {
  estimating: "#F59E0B", sales: "#10B981", permitting: "#F97316",
  design: "#3B82F6", production: "#06B6D4", fabrication: "#EC4899",
  installation: "#8B5CF6", completed: "#22C55E"
};

const STAGE_LABELS = {
  estimating: "Estimating", sales: "Sales", permitting: "Permitting",
  design: "Design", production: "Production", fabrication: "Fabrication",
  installation: "Installation", completed: "Completed"
};

const parseLocalDate = (str) => {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const VIEW_MODES = [
  { value: "month", label: "Month", icon: LayoutGrid },
  { value: "week", label: "Week", icon: Columns },
  { value: "day", label: "Day", icon: AlignLeft },
  { value: "agenda", label: "Agenda", icon: List },
];

export default function WorkOrderCalendar() {
  const { currentUser } = useAuth();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState("month");
  const [workOrders, setWorkOrders] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userSettings, setUserSettings] = useState(null);
  const [stageFilter, setStageFilter] = useState("all");

  // UI state
  const [selectedWO, setSelectedWO] = useState(null);
  const [showEventForm, setShowEventForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [defaultDate, setDefaultDate] = useState(null);
  const [popoverEvent, setPopoverEvent] = useState(null);
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const [showSettings, setShowSettings] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    document.title = "Calendar – Workflow Manager";
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const [wos, evs] = await Promise.all([
      base44.entities.WorkOrder.filter({ deleted: false, completed: false }),
      base44.entities.CalendarEvent.list("-start_datetime", 500),
    ]);
    setWorkOrders(wos || []);
    setCalendarEvents(evs || []);

    // Load user calendar settings
    if (currentUser?.email) {
      const settings = await base44.entities.UserCalendarSettings.filter({ user_email: currentUser.email });
      if (settings?.length > 0) {
        setUserSettings(settings[0]);
        if (settings[0].default_view) setViewMode(settings[0].default_view);
      }
    }
    setLoading(false);
  };

  // Build unified event list from all sources
  const allEvents = useCallback(() => {
    const events = [];
    const ss = userSettings;

    // Universal + personal calendar events
    calendarEvents.forEach(ev => {
      if (!ev.start_datetime) return;
      if (ev.is_universal && (ss?.show_universal !== false)) {
        events.push({ ...ev, _color: ev.color || "#7C3AED" });
      } else if (!ev.is_universal && ev.created_by === currentUser?.email && (ss?.show_personal !== false)) {
        events.push({ ...ev, _color: ev.color || "#9333EA" });
      }
    });

    // Work order due dates
    if (ss?.show_work_orders !== false) {
      workOrders.forEach(wo => {
        const allowedStages = ss?.work_order_stages?.length > 0 ? ss.work_order_stages : null;
        if (allowedStages && !allowedStages.includes(wo.current_stage)) return;
        if (stageFilter !== "all" && wo.current_stage !== stageFilter) return;

        if (wo.due_date) {
          const d = parseLocalDate(wo.due_date);
          if (d) {
            events.push({
              id: `wo-due-${wo.id}`,
              title: wo.title || wo.client_name,
              start_datetime: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 17, 0).toISOString(),
              end_datetime: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 18, 0).toISOString(),
              all_day: true,
              color: STAGE_COLORS[wo.current_stage] || "#6B7280",
              _color: STAGE_COLORS[wo.current_stage] || "#6B7280",
              _isWorkOrder: true,
              _stage: STAGE_LABELS[wo.current_stage] || wo.current_stage,
              _client: wo.client_name,
              _woId: wo.id,
              _woObj: wo,
              description: `${wo.client_name} · ${STAGE_LABELS[wo.current_stage] || wo.current_stage}`
            });
          }
        }

        // Site survey dates
        if (wo.site_survey_date && ss?.show_site_surveys !== false) {
          const d = parseLocalDate(wo.site_survey_date);
          if (d) {
            events.push({
              id: `wo-survey-${wo.id}`,
              title: `Survey: ${wo.title || wo.client_name}`,
              start_datetime: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0).toISOString(),
              all_day: false,
              color: "#D97706",
              _color: "#D97706",
              _isWorkOrder: true,
              _stage: "Site Survey",
              _client: wo.client_name,
              _woId: wo.id,
              _woObj: wo
            });
          }
        }

        // Install dates
        if (wo.project_install_date && ss?.show_installs !== false) {
          const d = parseLocalDate(wo.project_install_date);
          if (d) {
            events.push({
              id: `wo-install-${wo.id}`,
              title: `Install: ${wo.title || wo.client_name}`,
              start_datetime: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0).toISOString(),
              all_day: false,
              color: "#059669",
              _color: "#059669",
              _isWorkOrder: true,
              _stage: "Installation",
              _client: wo.client_name,
              _woId: wo.id,
              _woObj: wo
            });
          }
        }
      });
    }

    return events.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime));
  }, [calendarEvents, workOrders, userSettings, stageFilter, currentUser]);

  const events = allEvents();

  // Navigation
  const navigate = (dir) => {
    if (viewMode === "month") setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
    else if (viewMode === "week") setCurrentDate(dir > 0 ? addWeeks(currentDate, 1) : subWeeks(currentDate, 1));
    else if (viewMode === "day") setCurrentDate(dir > 0 ? addDays(currentDate, 1) : addDays(currentDate, -1));
    else if (viewMode === "agenda") setCurrentDate(dir > 0 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));
  };

  const getHeaderTitle = () => {
    if (viewMode === "month" || viewMode === "agenda") return format(currentDate, "MMMM yyyy");
    if (viewMode === "week") {
      const ws = startOfWeek(currentDate);
      const we = endOfWeek(currentDate);
      return `${format(ws, "MMM d")} – ${format(we, "MMM d, yyyy")}`;
    }
    if (viewMode === "day") return format(currentDate, "EEEE, MMMM d, yyyy");
    return "";
  };

  // Event click
  const handleEventClick = (ev, domEvent) => {
    if (ev._isWorkOrder && ev._woObj) {
      setSelectedWO(ev._woObj);
      return;
    }
    if (domEvent) {
      const rect = domEvent.currentTarget.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      const top = rect.bottom - (containerRect?.top || 0) + 8;
      const left = Math.min(rect.left - (containerRect?.left || 0), (containerRect?.width || 800) - 290);
      setPopoverPos({ top, left });
    }
    setPopoverEvent(ev);
  };

  // Day click
  const handleDayClick = (date) => {
    setDefaultDate(date);
    setEditingEvent(null);
    setShowEventForm(true);
  };

  // Month grid
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const weeks = [];
  let day = calStart;
  while (day <= calEnd) {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(day); day = addDays(day, 1); }
    weeks.push(week);
  }

  const getEventsForDay = (date) =>
    events.filter(ev => isSameDay(new Date(ev.start_datetime), date));

  const agendaEvents = events.filter(ev => new Date(ev.start_datetime) >= startOfMonth(currentDate));

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col relative"
      style={{ background: "linear-gradient(135deg, #F5F3FF 0%, #FFF9F5 100%)" }}
      onClick={() => setPopoverEvent(null)}
    >
      {/* ── Top Bar ── */}
      <div className="flex-shrink-0 px-4 py-3 flex flex-wrap items-center gap-2 border-b bg-white/80 backdrop-blur-sm">
        {/* Icon + title */}
        <div className="clay-card p-2 flex-shrink-0">
          <CalendarDays className="w-5 h-5 text-purple-600" />
        </div>
        <div className="flex-shrink-0">
          <h1 className="text-lg font-bold text-gray-800 leading-tight">Company Calendar</h1>
        </div>

        {/* Nav */}
        <div className="flex items-center gap-1 clay-card px-2 py-1 ml-2">
          <button onClick={() => navigate(-1)} className="p-1 hover:bg-purple-100 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-purple-700" />
          </button>
          <span className="font-semibold text-gray-800 min-w-[160px] text-center text-sm">
            {getHeaderTitle()}
          </span>
          <button onClick={() => navigate(1)} className="p-1 hover:bg-purple-100 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-purple-700" />
          </button>
          <button onClick={() => setCurrentDate(new Date())} className="ml-1 text-xs text-purple-600 hover:underline font-medium px-1">
            Today
          </button>
        </div>

        <div className="flex-1" />

        {/* Stage filter (month view) */}
        {viewMode === "month" && (
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {Object.entries(STAGE_LABELS).map(([v, l]) => (
                <SelectItem key={v} value={v}>{l}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* View mode switcher */}
        <div className="flex items-center gap-0.5 clay-card p-0.5">
          {VIEW_MODES.map(vm => (
            <button
              key={vm.value}
              onClick={() => setViewMode(vm.value)}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
              style={{
                background: viewMode === vm.value ? "linear-gradient(135deg, #E0D4F7, #D4E9F7)" : "transparent",
                color: viewMode === vm.value ? "#4C1D95" : "#6B7280"
              }}
            >
              <vm.icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{vm.label}</span>
            </button>
          ))}
        </div>

        {/* Settings + Add */}
        <button
          onClick={() => setShowSettings(s => !s)}
          className={`p-1.5 rounded-lg transition-colors ${showSettings ? "bg-purple-100" : "hover:bg-gray-100"}`}
          title="Calendar Settings"
        >
          <Settings className="w-4 h-4 text-gray-500" />
        </button>

        <Button
          size="sm"
          onClick={() => { setDefaultDate(currentDate); setEditingEvent(null); setShowEventForm(true); }}
          className="clay-button border-none gap-1 h-8"
          style={{ background: "linear-gradient(135deg, #E0D4F7 0%, #D4E9F7 100%)" }}
        >
          <Plus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline text-xs">Event</span>
        </Button>

        <button onClick={loadAll} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 text-gray-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Main Content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar area */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center flex-1">
              <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            </div>
          ) : (
            <>
              {/* Month View */}
              {viewMode === "month" && (
                <div className="flex flex-col flex-1 overflow-hidden">
                  {/* Day headers */}
                  <div className="grid grid-cols-7 border-b bg-white flex-shrink-0">
                    {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                      <div key={d} className="py-2 text-center text-xs font-semibold text-gray-500 bg-gray-50">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Weeks */}
                  <div className="flex-1 overflow-y-auto">
                    {weeks.map((week, wi) => (
                      <div key={wi} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0" style={{ minHeight: 100 }}>
                        {week.map((date, di) => {
                          const dayEvs = getEventsForDay(date);
                          const inMonth = isSameMonth(date, currentDate);
                          const _isToday = isToday(date);
                          return (
                            <div
                              key={di}
                              onClick={() => handleDayClick(date)}
                              className={`p-1.5 border-r border-gray-100 last:border-r-0 cursor-pointer group transition-colors ${
                                !inMonth ? "bg-gray-50/60" : "bg-white hover:bg-purple-50/30"
                              }`}
                              style={{ minHeight: 100 }}
                            >
                              {/* Date number */}
                              <div className={`text-xs font-bold mb-1 w-6 h-6 flex items-center justify-center rounded-full transition-colors ${
                                _isToday ? "bg-purple-600 text-white" :
                                inMonth ? "text-gray-700 group-hover:bg-purple-100" : "text-gray-300"
                              }`}>
                                {format(date, "d")}
                              </div>

                              {/* Events */}
                              <div className="space-y-0.5 overflow-hidden" style={{ maxHeight: 80 }}>
                                {dayEvs.slice(0, 4).map((ev, i) => (
                                  <button
                                    key={i}
                                    onClick={e => { e.stopPropagation(); handleEventClick(ev, e); }}
                                    className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium truncate hover:opacity-80 transition-all"
                                    style={{
                                      background: (ev._color || "#7C3AED") + "22",
                                      color: ev._color || "#7C3AED",
                                      borderLeft: `3px solid ${ev._color || "#7C3AED"}`
                                    }}
                                    title={ev.title}
                                  >
                                    {ev.title}
                                  </button>
                                ))}
                                {dayEvs.length > 4 && (
                                  <div className="text-[10px] text-gray-400 px-1 font-medium">
                                    +{dayEvs.length - 4} more
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>

                  {/* Legend */}
                  <div className="flex-shrink-0 px-4 py-2 border-t bg-white/80 flex flex-wrap gap-3">
                    {Object.entries(STAGE_LABELS).map(([stage, label]) => (
                      <div key={stage} className="flex items-center gap-1 text-xs text-gray-500">
                        <div className="w-2 h-2 rounded-sm" style={{ background: STAGE_COLORS[stage] }} />
                        {label}
                      </div>
                    ))}
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-sm" style={{ background: "#7C3AED" }} />
                      Event
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-sm" style={{ background: "#D97706" }} />
                      Survey
                    </div>
                    <div className="flex items-center gap-1 text-xs text-gray-500">
                      <div className="w-2 h-2 rounded-sm" style={{ background: "#059669" }} />
                      Install
                    </div>
                  </div>
                </div>
              )}

              {/* Week View */}
              {viewMode === "week" && (
                <WeekView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={(ev) => handleEventClick(ev, null)}
                  onDayClick={(d) => { setCurrentDate(d); setViewMode("day"); }}
                />
              )}

              {/* Day View */}
              {viewMode === "day" && (
                <DayView
                  currentDate={currentDate}
                  events={events}
                  onEventClick={(ev) => handleEventClick(ev, null)}
                />
              )}

              {/* Agenda View */}
              {viewMode === "agenda" && (
                <div className="flex-1 overflow-y-auto">
                  <AgendaView
                    events={agendaEvents}
                    onEventClick={(ev) => {
                      if (ev._isWorkOrder && ev._woObj) setSelectedWO(ev._woObj);
                      else setPopoverEvent(ev);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Settings Sidebar */}
        {showSettings && (
          <div className="w-72 flex-shrink-0 border-l bg-white overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-800">My Calendar Settings</h3>
                <button onClick={() => setShowSettings(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {currentUser?.email ? (
                <UserCalendarSettingsPanel
                  userEmail={currentUser.email}
                  onSettingsChange={(s) => { setUserSettings(s); loadAll(); }}
                />
              ) : (
                <p className="text-sm text-gray-500">Please log in to manage your calendar settings.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Event Popover */}
      {popoverEvent && (
        <CalendarEventPopover
          event={popoverEvent}
          onEdit={(ev) => { setEditingEvent(ev); setShowEventForm(true); setPopoverEvent(null); }}
          onClose={() => setPopoverEvent(null)}
          style={{ top: popoverPos.top, left: popoverPos.left }}
        />
      )}

      {/* Work Order Details */}
      {selectedWO && (
        <WorkOrderDetailsDialog
          isOpen={!!selectedWO}
          onClose={() => setSelectedWO(null)}
          workOrder={selectedWO}
          onUpdate={loadAll}
        />
      )}

      {/* Event Form */}
      <CalendarEventForm
        isOpen={showEventForm}
        onClose={() => { setShowEventForm(false); setEditingEvent(null); }}
        onSaved={loadAll}
        event={editingEvent}
        defaultDate={defaultDate}
      />
    </div>
  );
}