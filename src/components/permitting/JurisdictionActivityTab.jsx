import React from "react";
import { format } from "date-fns";
import { Sparkles, User, FileText, Plus, Pencil, Trash2, Clock } from "lucide-react";

const ACTION_CONFIG = {
  ai_refresh: { icon: Sparkles, color: "text-purple-600", bg: "bg-purple-50 border-purple-200", label: "AI Refresh" },
  manual_edit: { icon: Pencil, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", label: "Manual Edit" },
  document_added: { icon: Plus, color: "text-green-600", bg: "bg-green-50 border-green-200", label: "Document Added" },
  document_removed: { icon: Trash2, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Document Removed" },
  created: { icon: Plus, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200", label: "Created" },
};

function ActivityEntry({ entry }) {
  const cfg = ACTION_CONFIG[entry.action] || ACTION_CONFIG.manual_edit;
  const Icon = cfg.icon;

  return (
    <div className={`flex gap-3 p-3 rounded-lg border ${cfg.bg}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white border ${cfg.bg}`}>
        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          <span className="text-[10px] text-gray-400 flex items-center gap-1 flex-shrink-0">
            <Clock className="w-3 h-3" />
            {entry.timestamp ? format(new Date(entry.timestamp), "MMM d, yyyy h:mm a") : "Unknown time"}
          </span>
        </div>
        <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{entry.description}</p>
        {entry.user && (
          <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
            <User className="w-3 h-3" /> {entry.user}
          </p>
        )}
        {entry.changes && Object.keys(entry.changes).length > 0 && (
          <details className="mt-1.5">
            <summary className="text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">View changes</summary>
            <div className="mt-1 space-y-0.5">
              {Object.entries(entry.changes).map(([field, val]) => (
                <div key={field} className="text-[10px] text-gray-500 bg-white rounded px-2 py-0.5 border border-gray-100">
                  <span className="font-medium text-gray-600">{field}:</span> {String(val).slice(0, 80)}{String(val).length > 80 ? "…" : ""}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}

export default function JurisdictionActivityTab({ jurisdiction }) {
  const log = [...(jurisdiction.activity_log || [])].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  if (log.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center px-6">
        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
          <Clock className="w-6 h-6 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-600">No activity yet</p>
        <p className="text-xs text-gray-400 mt-1">Changes to this jurisdiction will appear here.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <p className="text-xs text-gray-500 mb-3">{log.length} event{log.length !== 1 ? "s" : ""} recorded</p>
      {log.map((entry, i) => (
        <ActivityEntry key={entry.id || i} entry={entry} />
      ))}
    </div>
  );
}