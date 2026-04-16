import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { Info, MessageSquare, Trash2 } from "lucide-react";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const stepTypeIcon = (type) => {
  switch (type) {
    case 'checkbox': return '☑';
    case 'submitted_date': return '📅';
    case 'followup_date': return '🔔';
    case 'permit_received_date': return '✅';
    case 'text': return '📝';
    default: return '';
  }
};

// Office type color coding
const officeTypeColors = {
  "Zoning": { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  "Building": { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
  "Electrical Inspectors": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
};
const getTypeStyle = (t) => officeTypeColors[t] || { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };

export default function PermitSpreadsheetRow({
  lineItem,
  onUpdateStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onShowLocalityInfo,
  onDeleteLine,
  isRegistered,
  localities,
  today
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal] = useState(lineItem.notes || "");

  const isCompleted = !!lineItem.permit_received_date;
  const steps = lineItem.steps || [];

  // Follow-up highlighting
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
    if (onUpdateNotes) onUpdateNotes(lineItem.id, notesVal);
    else onUpdateField(lineItem.id, "notes", notesVal);
    setEditingNotes(false);
  };

  const typeStyle = getTypeStyle(lineItem.office_type);
  const followupStyle = getFollowupStyle();

  const colWidth = (type) => type === 'checkbox' ? 52 : 90;
  const totalStepsWidth = steps.reduce((sum, s) => sum + colWidth(s.type), 0);

  return (
    <div
      className={`group/line px-3 py-2 transition-colors ${isCompleted ? 'opacity-60 bg-gray-50/40' : 'hover:bg-gray-50/40'}`}
      style={followupStyle}
    >
      {/* MICRO HEADER — unique to this line */}
      <div className="flex items-center gap-3 mb-1.5" style={{ fontSize: '10px' }}>
        {/* Office type badge */}
        <div className="flex-shrink-0">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ backgroundColor: typeStyle.bg, color: typeStyle.text, border: `1px solid ${typeStyle.border}` }}
          >
            {lineItem.office_type || "—"}
          </span>
        </div>

        {/* Micro-header labels for this line's steps */}
        <div className="flex items-end flex-1 overflow-x-auto">
          <div className="w-[140px] flex-shrink-0 px-1 font-semibold text-gray-500 uppercase tracking-wide">Locality</div>
          <div className="w-[110px] flex-shrink-0 px-1 font-semibold text-gray-500 uppercase tracking-wide">Assigned</div>
          <div className="w-[130px] flex-shrink-0 px-1 font-semibold text-gray-500 uppercase tracking-wide">Notes</div>
          {steps.map(step => (
            <div
              key={step.id}
              className="flex-shrink-0 px-1 text-center font-semibold text-gray-500"
              style={{ width: `${colWidth(step.type)}px` }}
            >
              <div className="truncate text-[10px] leading-tight" title={step.name}>{step.name}</div>
              <div className="text-[9px] text-gray-400">{stepTypeIcon(step.type)}</div>
            </div>
          ))}
        </div>

        {isRegistered && onDeleteLine && (
          <button
            onClick={() => { if (confirm(`Delete this ${lineItem.office_type || ''} line?`)) onDeleteLine(lineItem.id); }}
            className="p-0.5 hover:bg-red-50 rounded opacity-0 group-hover/line:opacity-100 transition-opacity flex-shrink-0"
            title="Delete this line"
          >
            <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
          </button>
        )}
      </div>

      {/* DATA ROW */}
      <div className="flex items-center gap-3" style={{ fontSize: '12px' }}>
        {/* Spacer to align with office type badge */}
        <div className="flex-shrink-0 invisible">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full">{lineItem.office_type || "—"}</span>
        </div>

        <div className="flex items-center flex-1 overflow-x-auto">
          {/* Locality */}
          <div className="w-[140px] flex-shrink-0 px-1">
            <div className="flex items-center gap-0.5">
              <Select
                value={lineItem.locality_id || "none"}
                onValueChange={(val) => onUpdateLocality(lineItem.id, val === "none" ? "" : val)}
                disabled={!isRegistered}
              >
                <SelectTrigger className="h-6 text-[11px] border-none shadow-none p-0 pl-0.5 hover:bg-gray-100 [&>svg]:w-2.5 [&>svg]:h-2.5">
                  <SelectValue placeholder="None" />
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

          {/* Assigned */}
          <div className="w-[110px] flex-shrink-0 px-1">
            <Input
              value={lineItem.assigned_to || ""}
              onChange={e => onUpdateField(lineItem.id, "assigned_to", e.target.value)}
              disabled={!isRegistered}
              placeholder="—"
              className="h-6 text-[11px] border-none shadow-none p-0 pl-0.5 hover:bg-gray-100 focus:bg-white"
            />
          </div>

          {/* Notes — syncs to work order */}
          <div className="w-[130px] flex-shrink-0 px-1">
            {editingNotes ? (
              <Input
                value={notesVal}
                onChange={e => setNotesVal(e.target.value)}
                onBlur={saveNotes}
                onKeyDown={e => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditingNotes(false); }}
                autoFocus
                className="h-6 text-[11px]"
                placeholder="Notes..."
              />
            ) : (
              <div
                className="text-[11px] cursor-pointer hover:bg-gray-100 rounded px-1 h-6 flex items-center gap-1 truncate"
                onClick={() => { if (isRegistered) { setNotesVal(lineItem.notes || ""); setEditingNotes(true); } }}
                title={lineItem.notes ? `${lineItem.notes}\n(Notes sync to work order)` : "Click to add notes (syncs to work order)"}
              >
                {lineItem.notes ? (
                  <span className="truncate">{lineItem.notes}</span>
                ) : (
                  <MessageSquare className="w-3 h-3 text-gray-300" />
                )}
              </div>
            )}
          </div>

          {/* Step cells */}
          {steps.map(step => {
            if (step.type === 'checkbox') {
              return (
                <div key={step.id} className="flex-shrink-0 px-1 flex flex-col items-center" style={{ width: `${colWidth(step.type)}px` }}>
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
                <div key={step.id} className="flex-shrink-0 px-1" style={{ width: `${colWidth(step.type)}px`, background: bgColor }}>
                  <Popover
                    open={openDatePopover === popoverId}
                    onOpenChange={(open) => setOpenDatePopover(open ? popoverId : null)}
                  >
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className={`h-6 w-full text-[11px] text-center hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
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

            // text
            return (
              <div key={step.id} className="flex-shrink-0 px-1" style={{ width: `${colWidth(step.type)}px` }}>
                <Input
                  value={step.value || ""}
                  onChange={e => onUpdateStep(lineItem.id, step.id, { value: e.target.value })}
                  disabled={!isRegistered}
                  placeholder="—"
                  className="h-6 text-[11px] border-none shadow-none p-0 px-1 hover:bg-gray-100 focus:bg-white"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}