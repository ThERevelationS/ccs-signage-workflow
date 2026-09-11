import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";

const todayText = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const parseDate = value => new Date(`${value}T12:00:00`);
const dateText = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatDay = value => new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(parseDate(value));

export default function FleetMaintenanceCalendar({ tasks = [], equipment = [], search = "", onOpenSchedule }) {
  const [forecastDays, setForecastDays] = useState(30);
  const [monthDate, setMonthDate] = useState(() => {
    const now = parseDate(todayText());
    return new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0);
  });
  const names = useMemo(() => Object.fromEntries(equipment.map(item => [item.id, item.name])), [equipment]);
  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(task => [task.title, task.description, task.frequency, task.status, names[task.equipment_id]].some(value => String(value || "").toLowerCase().includes(q)));
  }, [tasks, search, names]);
  const allEvents = useMemo(() => buildEvents(filteredTasks, names, 365), [filteredTasks, names]);
  const forecastEvents = useMemo(() => {
    const start = todayText();
    const end = addDays(start, forecastDays);
    return allEvents.filter(event => event.date >= start && event.date <= end);
  }, [allEvents, forecastDays]);
  const calendarDays = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const eventsByDate = useMemo(() => {
    const map = new Map();
    for (const event of allEvents) {
      const rows = map.get(event.date) || [];
      rows.push(event);
      map.set(event.date, rows);
    }
    return map;
  }, [allEvents]);

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(monthDate);

  return (
    <div className="space-y-5">
      <div className="grid xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)] gap-5">
        <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div><h2 className="font-semibold text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><CalendarDays className="w-4 h-4 text-indigo-500" />Maintenance Calendar</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Confirmed due dates plus future recurring projections based on the same cadence rules used by Fleet completion.</p></div>
            <div className="flex items-center gap-1"><button onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1, 12, 0, 0))} className="p-2 rounded-lg border border-gray-200 dark:border-slate-700" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button><div className="min-w-36 text-center font-semibold text-sm text-gray-900 dark:text-slate-100">{monthLabel}</div><button onClick={() => setMonthDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1, 12, 0, 0))} className="p-2 rounded-lg border border-gray-200 dark:border-slate-700" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button></div>
          </div>
          <div className="p-2 sm:p-4">
            <div className="grid grid-cols-7 text-center text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">{["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(day => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7 border-l border-t border-gray-100 dark:border-slate-800">{calendarDays.map(day => {
              const dayEvents = eventsByDate.get(day.text) || [];
              const inMonth = day.date.getMonth() === monthDate.getMonth();
              const isToday = day.text === todayText();
              return <div key={day.text} className={`min-h-24 sm:min-h-32 border-r border-b border-gray-100 dark:border-slate-800 p-1 sm:p-2 ${inMonth ? "bg-white dark:bg-slate-900" : "bg-gray-50/70 dark:bg-slate-950/40"}`}><div className={`w-6 h-6 text-xs rounded-full inline-flex items-center justify-center ${isToday ? "bg-indigo-600 text-white font-bold" : inMonth ? "text-gray-700 dark:text-slate-300" : "text-gray-300 dark:text-slate-600"}`}>{day.date.getDate()}</div><div className="mt-1 space-y-1">{dayEvents.slice(0, 3).map(event => <button key={event.key} onClick={() => onOpenSchedule(event.task)} title={`${event.equipmentName}: ${event.title}`} className={`w-full text-left rounded px-1.5 py-1 text-[10px] sm:text-[11px] leading-tight truncate ${eventClass(event.status)}`}>{event.title}</button>)}{dayEvents.length > 3 && <div className="text-[10px] text-gray-400 px-1">+{dayEvents.length - 3} more</div>}</div></div>;
            })}</div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 text-xs text-gray-500 dark:text-slate-400"><Legend status="overdue" label="Overdue" /><Legend status="due_soon" label="Due soon / active" /><Legend status="future" label="Future" /><Legend status="completed" label="Completed" /></div>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white dark:bg-slate-900 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-800"><h2 className="font-semibold text-gray-900 dark:text-slate-100 inline-flex items-center gap-2"><Clock3 className="w-4 h-4 text-indigo-500" />Maintenance Forecast</h2><p className="text-xs text-gray-500 dark:text-slate-400 mt-1">Upcoming confirmed and projected maintenance.</p><div className="inline-flex mt-3 rounded-lg bg-gray-100 dark:bg-slate-800 p-1">{[30,60,90].map(days => <button key={days} onClick={() => setForecastDays(days)} className={`px-3 py-1.5 rounded-md text-xs font-semibold ${forecastDays === days ? "bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm" : "text-gray-500 dark:text-slate-400"}`}>{days} days</button>)}</div></div>
          <div className="max-h-[680px] overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">{forecastEvents.map(event => <button key={event.key} onClick={() => onOpenSchedule(event.task)} className="w-full text-left p-3 hover:bg-gray-50 dark:hover:bg-slate-800/40"><div className="flex items-start gap-3"><span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${dotClass(event.status)}`} /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="font-medium text-sm text-gray-900 dark:text-slate-100 truncate">{event.title}</div><div className="text-xs text-gray-400 whitespace-nowrap">{formatDay(event.date)}</div></div><div className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 truncate">{event.equipmentName} · {event.projected ? "Projected recurrence" : event.label}</div></div></div></button>)}{forecastEvents.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No maintenance falls within the next {forecastDays} days.</div>}</div>
        </section>
      </div>
      <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20 px-4 py-3 text-xs text-blue-800 dark:text-blue-200">Projected recurring dates are planning-only. Overdue or in-progress schedules are not projected forward until their current work is resolved, because the production completion action determines the next authoritative due date.</div>
    </div>
  );
}

function buildEvents(tasks, names, maxFutureDays) {
  const today = todayText();
  const dueSoonEnd = addDays(today, 14);
  const futureEnd = addDays(today, maxFutureDays);
  const events = [];
  for (const task of tasks) {
    if (!task.start_date) continue;
    const baseStatus = classify(task, task.start_date, today, dueSoonEnd);
    events.push(makeEvent(task, task.start_date, baseStatus, names, false, "Current schedule"));
    if (task.type !== "recurring" || task.status !== "pending" || task.start_date < today) continue;
    let cursor = nextDate(task.start_date, task);
    let guard = 0;
    while (cursor && cursor <= futureEnd && guard < 500) {
      events.push(makeEvent(task, cursor, cursor <= dueSoonEnd ? "due_soon" : "future", names, true, "Projected recurrence"));
      const next = nextDate(cursor, task);
      if (!next || next <= cursor) break;
      cursor = next;
      guard += 1;
    }
  }
  return events.sort((a, b) => a.date.localeCompare(b.date) || a.equipmentName.localeCompare(b.equipmentName) || a.title.localeCompare(b.title));
}
function classify(task, date, today, dueSoonEnd) {
  if (task.status === "completed") return "completed";
  if (task.status === "overdue" || (task.status === "pending" && date < today)) return "overdue";
  if (task.status === "in_progress") return "due_soon";
  if (date >= today && date <= dueSoonEnd) return "due_soon";
  return "future";
}
function makeEvent(task, date, status, names, projected, label) { return { key: `${task.id}:${date}:${projected ? "p" : "c"}`, task, date, status, projected, label, title: task.title, equipmentName: names[task.equipment_id] || "Unresolved equipment" }; }
function nextDate(value, task) {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  switch (task.frequency) {
    case "daily": date.setUTCDate(date.getUTCDate() + 1); break;
    case "weekly": date.setUTCDate(date.getUTCDate() + 7); break;
    case "bi_weekly": date.setUTCDate(date.getUTCDate() + 14); break;
    case "monthly": date.setUTCMonth(date.getUTCMonth() + 1); break;
    case "bi_monthly": date.setUTCMonth(date.getUTCMonth() + 2); break;
    case "quarterly": date.setUTCMonth(date.getUTCMonth() + 3); break;
    case "every_6_months": date.setUTCMonth(date.getUTCMonth() + 6); break;
    case "annually": date.setUTCFullYear(date.getUTCFullYear() + 1); break;
    case "custom": {
      const amount = Math.max(1, Math.floor(Number(task.custom_frequency_value || 1)));
      if (task.custom_frequency_unit === "days") date.setUTCDate(date.getUTCDate() + amount);
      else if (task.custom_frequency_unit === "weeks") date.setUTCDate(date.getUTCDate() + amount * 7);
      else if (task.custom_frequency_unit === "years") date.setUTCFullYear(date.getUTCFullYear() + amount);
      else date.setUTCMonth(date.getUTCMonth() + amount);
      break;
    }
    default: date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return date.toISOString().slice(0, 10);
}
function addDays(value, days) { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function buildCalendarDays(monthDate) {
  const first = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12, 0, 0);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => { const date = new Date(start); date.setDate(start.getDate() + index); return { date, text: dateText(date) }; });
}
function eventClass(status) { return ({ overdue: "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200", due_soon: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200", future: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200", completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200" })[status] || "bg-gray-100 text-gray-700"; }
function dotClass(status) { return ({ overdue: "bg-red-500", due_soon: "bg-amber-500", future: "bg-blue-500", completed: "bg-emerald-500" })[status] || "bg-gray-400"; }
function Legend({ status, label }) { return <span className="inline-flex items-center gap-1.5"><span className={`w-2.5 h-2.5 rounded-full ${dotClass(status)}`} />{label}</span>; }
