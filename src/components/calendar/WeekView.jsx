import React from "react";
import { format, isSameDay, isToday, addDays, startOfWeek } from "date-fns";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getEventTop(event) {
  const d = new Date(event.start_datetime);
  return (d.getHours() * 60 + d.getMinutes()) / 1440 * 100;
}

function getEventHeight(event) {
  const start = new Date(event.start_datetime);
  const end = event.end_datetime ? new Date(event.end_datetime) : new Date(start.getTime() + 60 * 60 * 1000);
  const mins = (end - start) / 60000;
  return Math.max(mins / 1440 * 100, 2);
}

export default function WeekView({ currentDate, events, onEventClick, onDayClick }) {
  const weekStart = startOfWeek(currentDate);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();
  const now = new Date();
  const nowTop = (now.getHours() * 60 + now.getMinutes()) / 1440 * 100;

  const HOUR_HEIGHT = 60; // px per hour
  const TOTAL_HEIGHT = 24 * HOUR_HEIGHT;

  const getEventsForDay = (date) =>
    events.filter(ev => {
      const d = new Date(ev.start_datetime);
      return isSameDay(d, date);
    });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-8 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="w-14" />
        {days.map((day, i) => (
          <div
            key={i}
            onClick={() => onDayClick?.(day)}
            className="py-2 text-center cursor-pointer hover:bg-purple-50 transition-colors"
          >
            <p className="text-xs text-gray-500">{format(day, "EEE").toUpperCase()}</p>
            <div className={`w-8 h-8 mx-auto flex items-center justify-center rounded-full font-bold text-sm mt-0.5 ${
              isToday(day) ? "bg-purple-600 text-white" : "text-gray-800 hover:bg-gray-100"
            }`}>
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-8 relative" style={{ height: TOTAL_HEIGHT }}>
          {/* Time labels */}
          <div className="w-14 flex-shrink-0">
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_HEIGHT }} className="relative pr-2">
                {h > 0 && (
                  <span className="absolute -top-2.5 right-2 text-xs text-gray-400 select-none">
                    {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day, di) => {
            const dayEvents = getEventsForDay(day);
            const allDayEvents = dayEvents.filter(e => e.all_day);
            const timedEvents = dayEvents.filter(e => !e.all_day);
            return (
              <div key={di} className="relative border-l border-gray-100">
                {/* Hour lines */}
                {HOURS.map(h => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-t border-gray-100" />
                ))}

                {/* Today indicator */}
                {isToday(day) && (
                  <div
                    className="absolute left-0 right-0 flex items-center z-10 pointer-events-none"
                    style={{ top: `${nowTop}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0 -ml-1" />
                    <div className="flex-1 h-px bg-red-500" />
                  </div>
                )}

                {/* Timed events */}
                {timedEvents.map((ev, ei) => {
                  const top = getEventTop(ev);
                  const height = getEventHeight(ev);
                  return (
                    <button
                      key={ei}
                      onClick={() => onEventClick?.(ev)}
                      className="absolute left-1 right-1 rounded-md px-1.5 py-0.5 text-xs font-medium overflow-hidden hover:opacity-90 transition-opacity text-white shadow-sm z-20"
                      style={{
                        top: `${top}%`,
                        height: `${height}%`,
                        minHeight: 20,
                        background: ev.color || ev._color || "#7C3AED"
                      }}
                      title={ev.title}
                    >
                      <div className="truncate leading-tight">{ev.title}</div>
                    </button>
                  );
                })}

                {/* All-day events (shown at top as small banners) */}
                {allDayEvents.map((ev, ei) => (
                  <button
                    key={`allday-${ei}`}
                    onClick={() => onEventClick?.(ev)}
                    className="absolute left-0.5 right-0.5 rounded text-xs px-1 py-0.5 text-white z-30"
                    style={{ top: 2 + ei * 20, background: ev.color || ev._color || "#7C3AED" }}
                    title={ev.title}
                  >
                    <span className="truncate">{ev.title}</span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}