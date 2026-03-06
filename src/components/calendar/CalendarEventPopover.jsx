import React from "react";
import { format, parseISO } from "date-fns";
import { MapPin, Users, Clock, Edit, X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const EVENT_TYPE_LABELS = {
  company: "Company Event", install: "Installation", survey: "Site Survey",
  meeting: "Meeting", deadline: "Deadline", holiday: "Holiday",
  personal: "Personal", other: "Other"
};

export default function CalendarEventPopover({ event, onEdit, onClose, style }) {
  if (!event) return null;

  const start = event.start_datetime ? new Date(event.start_datetime) : null;
  const end = event.end_datetime ? new Date(event.end_datetime) : null;
  const isWorkOrder = !!event._isWorkOrder;

  return (
    <div
      className="absolute z-50 w-72 clay-card border border-gray-200 p-4 shadow-2xl"
      style={style}
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: event.color || event._color || "#7C3AED" }} />
          <h3 className="font-semibold text-gray-900 text-sm truncate">{event.title}</h3>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Type badge */}
      <div className="mb-3">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: (event.color || "#7C3AED") + "22", color: event.color || "#7C3AED" }}>
          {isWorkOrder ? event._stage : (EVENT_TYPE_LABELS[event.event_type] || "Event")}
        </span>
        {event.is_universal && !isWorkOrder && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">
            Company-Wide
          </span>
        )}
      </div>

      {/* Time */}
      {start && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" />
          {event.all_day ? (
            <span>{format(start, "MMMM d, yyyy")} — All Day</span>
          ) : (
            <span>
              {format(start, "MMM d, h:mm a")}
              {end && ` – ${format(end, "h:mm a")}`}
            </span>
          )}
        </div>
      )}

      {/* Location */}
      {event.location && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{event.location}</span>
        </div>
      )}

      {/* Assigned to */}
      {event.assigned_to?.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
          <Users className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">{event.assigned_to.join(", ")}</span>
        </div>
      )}

      {/* Client (work orders) */}
      {isWorkOrder && event._client && (
        <div className="text-sm text-gray-600 mb-2">
          <span className="font-medium">Client:</span> {event._client}
        </div>
      )}

      {/* Description */}
      {event.description && (
        <p className="text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100 line-clamp-3">
          {event.description}
        </p>
      )}

      {/* External source badge */}
      {event.external_source && event.external_source !== "manual" && (
        <div className="mt-2 text-xs text-gray-400 flex items-center gap-1">
          <ExternalLink className="w-3 h-3" />
          Synced from {event.external_source === "outlook" ? "Outlook" : "Google Calendar"}
        </div>
      )}

      {/* Edit button */}
      {!isWorkOrder && onEdit && (
        <Button
          size="sm"
          variant="outline"
          className="w-full mt-3"
          onClick={() => { onEdit(event); onClose(); }}
        >
          <Edit className="w-3.5 h-3.5 mr-1" />
          Edit Event
        </Button>
      )}
    </div>
  );
}