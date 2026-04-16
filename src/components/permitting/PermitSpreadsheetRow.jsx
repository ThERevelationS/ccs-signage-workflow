import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { Info, MessageSquare, Trash2 } from "lucide-react";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function PermitSpreadsheetRow({
  lineItem,
  isSubRow,
  onUpdateStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onShowLocalityInfo,
  onOpenWorkOrder,
  onDeleteLine,
  isRegistered,
  stepColumns,
  localities,
  officeTypes,
  today
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal] = useState(lineItem.notes || "");

  const isCompleted = !!lineItem.permit_received_date;

  // Follow-up highlighting logic
  const getFollowupStyle = () => {
    if (isCompleted) return {};
    const followupDate = lineItem.next_followup_date;
    if (!followupDate || !today) return {};
    const fd = parseLocalDate(followupDate);
    const td = parseLocalDate(today);
    if (!fd || !td) return {};
    const diff = differenceInDays(fd, td);
    if (diff < -7) return { borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' };
    if (diff < 0) return { borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' };
    if (diff <= 3) return { borderLeft: '4px solid #3b82f6', backgroundColor: '#eff6ff' };
    return {};
  };

  const saveNotes = () => {
    if (onUpdateNotes) {
      onUpdateNotes(lineItem.id, notesVal);
    } else {
      onUpdateField(lineItem.id, "notes", notesVal);
    }
    setEditingNotes(false);
  };

  const followupStyle = getFollowupStyle();

  // Office type color coding
  const officeTypeColors = {
    "Zoning": { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
    "Building": { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
    "Electrical Inspectors": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
  };
  const typeStyle = officeTypeColors[lineItem.office_type] || { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };

  return (
    <div
      className={`flex items-center border-b transition-colors ${isCompleted ? 'opacity-50' : 'hover:bg-gray-50/50'}`}
      style={{ minHeight: '38px', fontSize: '12px', ...followupStyle }}
    >
      {/* Office Type Label (replaces client column for sub-rows) */}
      <div className="px-2 py-1 flex-shrink-0 flex items-center gap-1" style={{ width: '150px' }}>
        <div className="pl-4 flex items-center gap-1 flex-1 min-w-0">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full truncate"
            style={{ backgroundColor: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
          >
            {lineItem.office_type || "—"}
          </span>
          {isRegistered && onDeleteLine && (
            <button
              onClick={() => { if (confirm(`Delete this ${lineItem.office_type || ''} line?`)) onDeleteLine(lineItem.id); }}
              className="p-0.5 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              title="Delete this line"
            >
              <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
            </button>
          )}
        </div>
      </div>

      {/* Office Type Select (change) */}
      <div className="px-1 py-1 flex-shrink-0" style={{ width: '90px' }}>
        <Select
          value={lineItem.office_type || "none"}
          onValueChange={(val) => onUpdateField(lineItem.id, "office_type", val === "none" ? "" : val)}
          disabled={!isRegistered}
        >
          <SelectTrigger className="h-6 text-[10px] border-none shadow-none p-0 pl-0.5 text-gray-600 hover:bg-gray-100 [&>svg]:w-2.5 [&>svg]:h-2.5">
            <SelectValue placeholder="Type..." />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none"><span className="text-gray-400">None</span></SelectItem>
            {officeTypes.map(t => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Locality */}
      <div className="px-1 py-1 flex-shrink-0" style={{ width: '120px' }}>
        <div className="flex items-center gap-0.5">
          <Select
            value={lineItem.locality_id || "none"}
            onValueChange={(val) => onUpdateLocality(lineItem.id, val === "none" ? "" : val)}
            disabled={!isRegistered}
          >
            <SelectTrigger className="h-6 text-[10px] border-none shadow-none p-0 pl-0.5 hover:bg-gray-100 [&>svg]:w-2.5 [&>svg]:h-2.5">
              <SelectValue placeholder="Select..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none"><span className="text-gray-400">None</span></SelectItem>
              {localities.map(l => (
                <SelectItem key={l.id} value={l.id}>{l.name}{l.state ? ` (${l.state})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {lineItem.locality_id && (
            <button
              onClick={() => onShowLocalityInfo(lineItem.locality_id)}
              className="p-0.5 hover:bg-blue-100 rounded flex-shrink-0"
              title="View locality info"
            >
              <Info className="w-2.5 h-2.5 text-blue-500" />
            </button>
          )}
        </div>
      </div>

      {/* Assigned To */}
      <div className="px-1 py-1 flex-shrink-0" style={{ width: '80px' }}>
        <span className="text-[11px] truncate block text-gray-600">{lineItem.assigned_to || "—"}</span>
      </div>

      {/* Notes - syncs to work order */}
      <div className="px-1 py-1 flex-shrink-0" style={{ width: '100px' }}>
        {editingNotes ? (
          <Input
            value={notesVal}
            onChange={e => setNotesVal(e.target.value)}
            onBlur={saveNotes}
            onKeyDown={e => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditingNotes(false); }}
            autoFocus
            className="h-6 text-[11px]"
            placeholder="Notes → syncs to WO..."
          />
        ) : (
          <div
            className="text-[11px] cursor-pointer hover:bg-gray-100 rounded px-0.5 flex items-center gap-0.5 truncate"
            onClick={() => { if (isRegistered) { setNotesVal(lineItem.notes || ""); setEditingNotes(true); }}}
            title={lineItem.notes ? `${lineItem.notes}\n(Notes sync to work order)` : "Click to add notes (syncs to work order)"}
          >
            {lineItem.notes ? (
              <span className="truncate">{lineItem.notes}</span>
            ) : (
              <span className="text-gray-400 flex items-center gap-0.5"><MessageSquare className="w-2.5 h-2.5" /></span>
            )}
          </div>
        )}
      </div>

      {/* Dynamic Step Columns */}
      {stepColumns.map(col => {
        const step = lineItem.steps?.find(s => s.id === col.id);
        if (!step) {
          return <div key={col.id} className="px-1 py-1 text-center text-gray-300 text-[11px] flex-shrink-0" style={{ width: col.type === 'checkbox' ? '50px' : '85px' }}>—</div>;
        }

        if (step.type === 'checkbox') {
          return (
            <div key={col.id} className="px-1 py-1 text-center flex-shrink-0 flex flex-col items-center" style={{ width: '50px' }}>
              <Checkbox
                checked={step.checked || false}
                onCheckedChange={(checked) => onUpdateStep(lineItem.id, step.id, { checked })}
                disabled={!isRegistered}
                className="h-4 w-4"
              />
              {step.checked && step.checked_date && (
                <span className="text-[8px] text-green-600 mt-0.5">{step.checked_date.slice(5)}</span>
              )}
            </div>
          );
        }

        if (step.type === 'submitted_date' || step.type === 'followup_date' || step.type === 'permit_received_date') {
          const dateVal = step.value;
          const popoverId = `step-${lineItem.id}-${step.id}`;
          const isFollowup = step.type === 'followup_date';
          const bgColor = isFollowup && dateVal ? '#fef9c3' : step.type === 'permit_received_date' && dateVal ? '#dcfce7' : 'transparent';

          return (
            <div key={col.id} className="px-1 py-1 flex-shrink-0" style={{ width: '85px', background: bgColor }}>
              <Popover
                open={openDatePopover === popoverId}
                onOpenChange={(open) => setOpenDatePopover(open ? popoverId : null)}
              >
                <PopoverTrigger asChild disabled={!isRegistered}>
                  <button className={`h-6 w-full text-[11px] text-left px-0.5 hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
                    {dateVal ? (() => { const d = parseLocalDate(dateVal); return d && !isNaN(d) ? format(d, "MM/dd/yy") : "—"; })() : "—"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={parseLocalDate(dateVal)}
                    onSelect={(date) => {
                      const newVal = date ? format(date, "yyyy-MM-dd") : "";
                      onUpdateStep(lineItem.id, step.id, { value: newVal });
                      setOpenDatePopover(null);
                    }}
                  />
                  {dateVal && (
                    <div className="p-2 border-t">
                      <button
                        onClick={() => { onUpdateStep(lineItem.id, step.id, { value: "" }); setOpenDatePopover(null); }}
                        className="text-xs text-red-500 hover:underline w-full text-center"
                      >
                        Clear date
                      </button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          );
        }

        // Text type
        return (
          <div key={col.id} className="px-1 py-1 flex-shrink-0" style={{ width: '85px' }}>
            <span className="text-[11px] block truncate text-gray-600">{step.value || "—"}</span>
          </div>
        );
      })}
    </div>
  );
}