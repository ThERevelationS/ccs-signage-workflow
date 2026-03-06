import React from "react";
import { format, isSameDay, isToday, isTomorrow } from "date-fns";
import { Clock, MapPin, Users } from "lucide-react";

function getDateLabel(date) {
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  return format(date, "EEEE, MMMM d");
}

export default function AgendaView({ events, onEventClick }) {
  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <span className="text-4xl mb-3">📅</span>
        <p className="text-lg font-medium">No upcoming events</p>
        <p className="text-sm mt-1">Click a date or use the + button to create one</p>
      </div>
    );
  }

  // Group by date
  const groups = {};
  events.forEach(ev => {
    const d = new Date(ev.start_datetime);
    const key = format(d, "yyyy-MM-dd");
    if (!groups[key]) groups[key] = { date: d, events: [] };
    groups[key].events.push(ev);
  });

  const sortedKeys = Object.keys(groups).sort();

  return (
    <div className="space-y-6 p-4">
      {sortedKeys.map(key => {
        const { date, events: dayEvents } = groups[key];
        return (
          <div key={key}>
            {/* Date header */}
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl flex flex-col items-center justify-center text-white flex-shrink-0"
                style={{ background: isToday(date) ? "linear-gradient(135deg, #7C3AED, #5B21B6)" : "linear-gradient(135deg, #6B7280, #4B5563)" }}
              >
                <span className="text-xs font-bold leading-none">{format(date, "MMM").toUpperCase()}</span>
                <span className="text-sm font-bold leading-none">{format(date, "d")}</span>
              </div>
              <div>
                <p className="font-semibold text-gray-800">{getDateLabel(date)}</p>
                <p className="text-xs text-gray-500">{format(date, "EEEE")}</p>
              </div>
            </div>

            {/* Events for this day */}
            <div className="ml-13 space-y-2 pl-4 border-l-2 border-gray-100 ml-5">
              {dayEvents.map((ev, i) => {
                const start = new Date(ev.start_datetime);
                const end = ev.end_datetime ? new Date(ev.end_datetime) : null;
                return (
                  <button
                    key={i}
                    onClick={() => onEventClick?.(ev)}
                    className="w-full text-left p-3 rounded-xl border hover:shadow-md transition-all group"
                    style={{
                      borderLeftColor: ev.color || ev._color || "#7C3AED",
                      borderLeftWidth: 4,
                      background: "white"
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-800 text-sm truncate group-hover:text-purple-700 transition-colors">
                          {ev.title}
                        </p>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {!ev.all_day && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Clock className="w-3 h-3" />
                              {format(start, "h:mm a")}
                              {end && ` – ${format(end, "h:mm a")}`}
                            </span>
                          )}
                          {ev.all_day && (
                            <span className="text-xs text-gray-500">All day</span>
                          )}
                          {ev.location && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <MapPin className="w-3 h-3" />
                              {ev.location}
                            </span>
                          )}
                          {ev.assigned_to?.length > 0 && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Users className="w-3 h-3" />
                              {ev.assigned_to.slice(0, 2).join(", ")}
                              {ev.assigned_to.length > 2 && ` +${ev.assigned_to.length - 2}`}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                        style={{ background: (ev.color || "#7C3AED") + "22", color: ev.color || "#7C3AED" }}
                      >
                        {ev._isWorkOrder ? ev._stage : (ev.event_type || "event")}
                      </span>
                    </div>
                    {ev.description && (
                      <p className="text-xs text-gray-400 mt-1.5 line-clamp-2">{ev.description}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}