import React, { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, Briefcase, User, Clipboard, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import PermitSpreadsheetRow from "./PermitSpreadsheetRow";
import PermitLineNotesSection from "./PermitLineNotesSection";
import InlineEditField from "./InlineEditField";
import LocalityPickerDialog from "./LocalityPickerDialog";

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
  onUpdateWorkOrderField,
  onWorkNotesChanged,
  currentUser,
  isRegistered,
  localities,
  users,
  taskDescriptions,
  today
}) {
  const [expanded, setExpanded] = useState(true);
  const [showLocalityPicker, setShowLocalityPicker] = useState(false);
  const wo = group.work_order;
  const hasLines = group.lines.length > 0;

  // Est/Inv # — prefer corbridge_invoice_number, else est_inv_at
  const estInvNumber = wo?.corbridge_invoice_number || wo?.est_inv_at || "";
  const estInvLink = wo?.corbridge_link || wo?.estimator_app_url || "";

  const saveWO = (field, value) => {
    if (wo && onUpdateWorkOrderField) onUpdateWorkOrderField(wo.id, field, value);
  };

  // Build user options for Assigned / PM
  const userOptions = (users || [])
    .map(u => u.full_name || u.email)
    .filter(Boolean)
    .sort();

  const taskDescOptions = (taskDescriptions || []).filter(Boolean);

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
          className="font-bold text-sm text-purple-900 hover:underline flex-shrink-0 min-w-0 max-w-[180px] truncate"
          onClick={(e) => { e.stopPropagation(); onOpenWorkOrder(group.work_order_id); }}
          title={wo?.client_name}
        >
          {wo?.client_name || "—"}
        </div>

        {/* Est/Inv # — editable text + external link */}
        <div className="flex items-center gap-1 text-[11px] flex-shrink-0" onClick={e => e.stopPropagation()}>
          <InlineEditField
            label="Est/Inv:"
            value={wo?.corbridge_invoice_number || wo?.est_inv_at || ""}
            placeholder="—"
            onSave={(v) => saveWO(wo?.corbridge_invoice_number !== undefined && wo?.corbridge_invoice_number !== "" ? 'corbridge_invoice_number' : 'est_inv_at', v)}
            disabled={!isRegistered}
            maxWidth={140}
          />
          {estInvLink && estInvNumber && (
            <a
              href={estInvLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-800"
              onClick={e => e.stopPropagation()}
              title="Open in Corebridge"
            >
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        {/* Job Description (from Sales Pipeline — wo.description) */}
        <InlineEditField
          icon={<Briefcase className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
          label="Job:"
          value={wo?.description || ""}
          placeholder="Add job description…"
          onSave={(v) => saveWO('description', v)}
          disabled={!isRegistered}
          maxWidth={420}
          textSizeClass="text-[13px]"
        />

        {/* Task Assigned */}
        <InlineEditField
          icon={<User className="w-3 h-3 text-gray-400" />}
          label="Assigned:"
          value={wo?.current_task_assigned_to || ""}
          placeholder="—"
          onSave={(v) => saveWO('current_task_assigned_to', v)}
          options={userOptions}
          disabled={!isRegistered}
          maxWidth={140}
        />

        {/* Project Manager */}
        <InlineEditField
          label="PM:"
          value={wo?.project_manager || ""}
          placeholder="—"
          onSave={(v) => saveWO('project_manager', v)}
          options={userOptions}
          disabled={!isRegistered}
          maxWidth={120}
        />

        {/* Task Description */}
        <InlineEditField
          icon={<Clipboard className="w-3 h-3 text-gray-400" />}
          value={wo?.current_task_description || ""}
          placeholder="Task…"
          onSave={(v) => saveWO('current_task_description', v)}
          options={taskDescOptions.length ? taskDescOptions : undefined}
          disabled={!isRegistered}
          maxWidth={200}
        />

        <div className="text-[10px] text-gray-400 flex-shrink-0 ml-auto">
          {hasLines ? `${group.lines.length} line${group.lines.length === 1 ? '' : 's'}` : 'No lines'}
        </div>
      </div>

      {/* EXPANDED BODY */}
      {expanded && (
        <div>
          {!hasLines ? (
            <div className="px-4 py-4 bg-gray-50/60 flex items-center gap-3">
              <span className="text-xs text-gray-500">Select a locality to apply its configured line items:</span>
              <Button
                onClick={() => setShowLocalityPicker(true)}
                disabled={!isRegistered}
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                <MapPin className="w-3.5 h-3.5" /> Select Locality…
              </Button>
            </div>
          ) : (
            <>
              <div className="divide-y">
                {group.lines.map(li => (
                  <PermitSpreadsheetRow
                    key={li.id}
                    lineItem={li}
                    onUpdateStep={onUpdateStep}
                    onUpdateField={onUpdateField}
                    onShowLocalityInfo={onShowLocalityInfo}
                    onDeleteLine={onDeleteLine}
                    isRegistered={isRegistered}
                    today={today}
                  />
                ))}
              </div>

              {/* Single shared notes section for the whole project — expanded by default */}
              {wo && (
                <PermitLineNotesSection
                  workOrder={wo}
                  officeLabel=""
                  currentUser={currentUser}
                  disabled={!isRegistered}
                  onUpdated={onWorkNotesChanged}
                />
              )}
            </>
          )}
        </div>
      )}

      {showLocalityPicker && (
        <LocalityPickerDialog
          isOpen={showLocalityPicker}
          onClose={() => setShowLocalityPicker(false)}
          localities={localities}
          onApply={(localityId, opts) => {
            onSelectLocalityForWorkOrder(group.work_order_id, localityId, opts);
          }}
        />
      )}
    </div>
  );
}