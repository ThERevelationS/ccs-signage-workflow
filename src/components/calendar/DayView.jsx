import React from "react";
import { format, isSameDay, isToday } from "date-fns";
import { Clock, MapPin } from "lucide-react";

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const HOUR_HEIGHT = 64;

function getEventTop(event) {
  const d = new Date(event.start_datetime);
  return (d.getHours() * 60 + d.getMinutes()) / 1440 * (24 * HOUR_HEIGHT);
}

function getEventHeight(event) {
  const start = new Date(event.start_datetime);
  const end = event.end_datetime ? new Date(event.end_datetime) : new Date(start.getTime() + 60 * 60 * 1000);
  const mins = (end - start) / 60000;
  return Math.max(mins / 60 * HOUR_HEIGHT, 24);
}

export default function DayView({ currentDate, events, onEventClick }) {
  const dayEvents = events.filter(ev => isSameDay(new Date(ev.start_datetime), currentDate));
  const allDayEvents = dayEvents.filter(e => e.all_day);
  const timedEvents = dayEvents.filter(e => !e.all_day);
  const now = new Date();
  const nowTop = isToday(currentDate) ? (now.getHours() * 60 + now.getMinutes()) / 1440 * (24 * HOUR_HEIGHT) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-white">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white`}
            style={{ background: isToday(currentDate) ? "linear-gradient(135deg, #7C3AED, #5B21B6)" : "linear-gradient(135deg, #6B7280, #4B5563)" }}
          >
            <span className="text-xs font-bold leading-none">{format(currentDate, "MMM").toUpperCase()}</span>
            <span className="text-sm font-bold leading-none">{format(currentDate, "d")}</span>
          </div>
          <div>
            <p className="font-bold text-gray-900">{format(currentDate, "EEEE")}</p>
            <p className="text-sm text-gray-500">{format(currentDate, "MMMM d, yyyy")}</p>
          </div>
          <div className="ml-auto text-sm text-gray-500">
            {dayEvents.length} event{dayEvents.length !== 1 ? "s" : ""}
          </div>
        </div>

        {/* All day events */}
        {allDayEvents.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {allDayEvents.map((ev, i) => (
              <button
                key={i}
                onClick={() => onEventClick?.(ev)}
                className="px-2 py-1 rounded-lg text-xs text-white font-medium hover:opacity-80"
                style={{ background: ev.color || ev._color || "#7C3AED" }}
              >
                {ev.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Time grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="relative" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour lines + labels */}
          {HOURS.map(h => (
            <div key={h} className="flex border-t border-gray-100" style={{ height: HOUR_HEIGHT }}>
              <div className="w-14 flex-shrink-0 pr-2 text-right">
                {h > 0 && (
                  <span className="text-xs text-gray-400 relative -top-2.5">
                    {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}
                  </span>
                )}
              </div>
              <div className="flex-1" />
            </div>
          ))}

          {/* Now line */}
          {nowTop !== null && (
            <div className="absolute left-14 right-0 flex items-center z-10 pointer-events-none" style={{ top: nowTop }}>
              <div className="w-2 h-2 rounded-full bg-red-500 -ml-1 flex-shrink-0" />
              <div className="flex-1 h-px bg-red-400" />
            </div>
          )}

          {/* Events */}
          {timedEvents.map((ev, i) => {
            const top = getEventTop(ev);
            const height = getEventHeight(ev);
            const start = new Date(ev.start_datetime);
            const end = ev.end_datetime ? new Date(ev.end_datetime) : null;
            return (
              <button
                key={i}
                onClick={() => onEventClick?.(ev)}
                className="absolute left-16 right-3 rounded-xl px-3 py-2 text-left text-white shadow-md hover:opacity-90 transition-all hover:shadow-lg z-20"
                style={{
                  top,
                  height: Math.max(height, 32),
                  background: `linear-gradient(135deg, ${ev.color || ev._color || "#7C3AED"}, ${ev.color || ev._color || "#5B21B6"}CC)`
                }}
              >
                <p className="font-semibold text-sm leading-tight truncate">{ev.title}</p>
                {height > 40 && (
                  <div className="flex flex-wrap gap-2 mt-0.5">
                    <span className="text-xs opacity-90 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {format(start, "h:mm a")}{end && ` – ${format(end, "h:mm a")}`}
                    </span>
                    {ev.location && (
                      <span className="text-xs opacity-90 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5" />
                        {ev.location}
                      </span>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}