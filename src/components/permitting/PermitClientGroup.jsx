import React, { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Briefcase, User, Clipboard } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PermitSpreadsheetRow from "./PermitSpreadsheetRow";

export default function PermitClientGroup({
  group,
  onUpdateStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onSelectLocalityForWorkOrder,
  onOpenWorkOrder,
  onShowLocalityInfo,
  onDeleteLine,
  isRegistered,
  localities,
  users,
  today
}) {
  const [expanded, setExpanded] = useState(true);
  const wo = group.work_order;
  const hasLines = group.lines.length > 0;

  // Build "Est/Inv #" display: prefer corbridge_invoice_number, else est_inv_at
  const estInvNumber = wo?.corbridge_invoice_number || wo?.est_inv_at || "";
  const estInvLink = wo?.corbridge_link || wo?.estimator_app_url || "";

  return (
    <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
      {/* CLIENT INFO HEADER ROW */}
      <div
        className="bg-gradient-to-r from-purple-50 to-white border-b px-3 py-2 cursor-pointer hover:from-purple-100 transition-colors flex items-center gap-3"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-purple-600 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-purple-600 flex-shrink-0" />}

        {/* Name */}
        <div
          className="font-bold text-sm text-purple-900 hover:underline flex-shrink-0 min-w-0 max-w-[200px] truncate"
          onClick={(e) => { e.stopPropagation(); onOpenWorkOrder(group.work_order_id); }}
          title={wo?.client_name}
        >
          {wo?.client_name || "—"}
        </div>

        {/* Est/Inv # Link */}
        {estInvNumber && (
          <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
            <span className="text-gray-500">Est/Inv:</span>
            {estInvLink ? (
              <a
                href={estInvLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline font-medium flex items-center gap-0.5"
                onClick={e => e.stopPropagation()}
              >
                {estInvNumber}
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            ) : (
              <span className="font-medium text-gray-700">{estInvNumber}</span>
            )}
          </div>
        )}

        {/* Job Description */}
        <div className="flex items-center gap-1 text-[11px] flex-1 min-w-0">
          <Briefcase className="w-3 h-3 text-gray-400 flex-shrink-0" />
          <span className="text-gray-500">Job:</span>
          <span className="text-gray-700 truncate" title={wo?.description}>{wo?.description || wo?.title || "—"}</span>
        </div>

        {/* Task Assigned */}
        <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
          <User className="w-3 h-3 text-gray-400" />
          <span className="text-gray-500">Assigned:</span>
          <span className="text-gray-700 font-medium">{wo?.current_task_assigned_to || wo?.assigned_to || "—"}</span>
        </div>

        {/* Project Manager */}
        <div className="flex items-center gap-1 text-[11px] flex-shrink-0">
          <span className="text-gray-500">PM:</span>
          <span className="text-gray-700 font-medium">{wo?.project_manager || "—"}</span>
        </div>

        {/* Task Description */}
        <div className="flex items-center gap-1 text-[11px] flex-shrink-0 max-w-[200px]">
          <Clipboard className="w-3 h-3 text-gray-400" />
          <span className="text-gray-700 truncate" title={wo?.current_task_description}>{wo?.current_task_description || "—"}</span>
        </div>

        <div className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">
          {hasLines ? `${group.lines.length} line${group.lines.length === 1 ? '' : 's'}` : 'No lines'}
        </div>
      </div>

      {/* EXPANDED BODY */}
      {expanded && (
        <div>
          {!hasLines ? (
            // No lines yet — show locality selector to apply settings-driven lines
            <div className="px-4 py-4 bg-gray-50/60 flex items-center gap-3">
              <span className="text-xs text-gray-500">Select a locality to apply its configured line items:</span>
              <div className="max-w-xs">
                <Select
                  value=""
                  onValueChange={(val) => val && onSelectLocalityForWorkOrder(group.work_order_id, val)}
                  disabled={!isRegistered}
                >
                  <SelectTrigger className="h-7 text-xs w-56">
                    <SelectValue placeholder="Select locality..." />
                  </SelectTrigger>
                  <SelectContent>
                    {localities.length === 0 && (
                      <div className="px-2 py-1 text-xs text-gray-400">No localities configured</div>
                    )}
                    {localities.map(l => {
                      const officeCount = l.offices?.length || (l.workflow_steps?.length > 0 ? 1 : 0);
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {l.name}{l.state ? ` (${l.state})` : ''}
                          {officeCount > 0 && <span className="text-[10px] text-gray-400 ml-1">· {officeCount} office{officeCount === 1 ? '' : 's'}</span>}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            // Has lines — render each line with its own micro-header
            <div className="divide-y">
              {group.lines.map(li => (
                <PermitSpreadsheetRow
                  key={li.id}
                  lineItem={li}
                  onUpdateStep={onUpdateStep}
                  onUpdateField={onUpdateField}
                  onUpdateNotes={onUpdateNotes}
                  onUpdateLocality={onUpdateLocality}
                  onShowLocalityInfo={onShowLocalityInfo}
                  onDeleteLine={onDeleteLine}
                  isRegistered={isRegistered}
                  localities={localities}
                  today={today}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}