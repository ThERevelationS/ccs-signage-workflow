import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { Info, Trash2 } from "lucide-react";

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

// Office type color coding — supports multiple types via array
const officeTypeColors = {
  "Zoning": { bg: '#FEF3C7', text: '#92400E', border: '#F59E0B' },
  "Building": { bg: '#DBEAFE', text: '#1E40AF', border: '#3B82F6' },
  "Electrical Inspectors": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
  "Electrical": { bg: '#FCE7F3', text: '#9D174D', border: '#EC4899' },
};
const getTypeStyle = (t) => officeTypeColors[t] || { bg: '#F3F4F6', text: '#374151', border: '#9CA3AF' };

// Normalize lineItem's office types to array
const getOfficeTypes = (lineItem) => {
  if (Array.isArray(lineItem?.office_types) && lineItem.office_types.length) return lineItem.office_types;
  if (lineItem?.office_type) return [lineItem.office_type];
  return [];
};

// Dynamic column width — checkboxes compact, date/text scale with label
const getColWidth = (step) => {
  const name = step?.name || "";
  if (step.type === 'checkbox') {
    return Math.max(64, Math.min(200, name.length * 7.5 + 20));
  }
  return Math.max(100, Math.min(220, name.length * 7.5 + 30));
};

export default function PermitSpreadsheetRow({
  lineItem,
  onUpdateStep,
  onUpdateField,
  onShowLocalityInfo,
  onDeleteLine,
  isRegistered,
  today
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);

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

  const officeTypes = getOfficeTypes(lineItem);
  const followupStyle = getFollowupStyle();
  const localityLabel = lineItem.locality_name || "—";

  return (
    <div
      className={`group/line px-3 py-2 transition-colors ${isCompleted ? 'opacity-60 bg-gray-50/40' : 'hover:bg-gray-50/40'}`}
      style={followupStyle}
    >
      {/* MICRO HEADER — office-type badges + column labels */}
      <div className="flex items-start gap-3 mb-1.5" style={{ fontSize: '12px' }}>
        {/* Office type badges (possibly multiple) */}
        <div className="flex-shrink-0 pt-0.5 flex flex-wrap gap-1 max-w-[130px]">
          {officeTypes.length === 0 ? (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: '#F3F4F6', color: '#374151', border: '1px solid #9CA3AF' }}
            >—</span>
          ) : officeTypes.map((t, i) => {
            const st = getTypeStyle(t);
            return (
              <span
                key={`${t}-${i}`}
                className="text-[10px] font-bold px-2 py-0.5 rounded-full leading-tight text-center"
                style={{ backgroundColor: st.bg, color: st.text, border: `1px solid ${st.border}`, maxWidth: '120px', whiteSpace: 'normal' }}
              >
                {t}
              </span>
            );
          })}
        </div>

        <div className="flex items-end flex-1 overflow-x-auto">
          <div className="w-[200px] flex-shrink-0 px-1 font-semibold text-gray-500 uppercase tracking-wide text-[11px]">Office / Locality</div>
          {steps.map(step => (
            <div
              key={step.id}
              className="flex-shrink-0 px-1 text-center font-semibold text-gray-500"
              style={{ width: `${getColWidth(step)}px` }}
            >
              <div className="text-[12px] leading-tight whitespace-normal break-words" title={step.name}>{step.name}</div>
              <div className="text-[10px] text-gray-400">{stepTypeIcon(step.type)}</div>
            </div>
          ))}
        </div>

        {isRegistered && onDeleteLine && (
          <button
            onClick={() => { if (confirm(`Delete this line?`)) onDeleteLine(lineItem.id); }}
            className="p-0.5 hover:bg-red-50 rounded opacity-0 group-hover/line:opacity-100 transition-opacity flex-shrink-0"
            title="Delete this line"
          >
            <Trash2 className="w-3 h-3 text-red-400 hover:text-red-600" />
          </button>
        )}
      </div>

      {/* DATA ROW */}
      <div className="flex items-center gap-3" style={{ fontSize: '13px' }}>
        {/* Spacer to align with office type badge column */}
        <div className="flex-shrink-0 invisible" style={{ width: '130px' }}>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full">—</span>
        </div>

        <div className="flex items-center flex-1 overflow-x-auto">
          {/* Office / Locality — static text + large info button */}
          <div className="w-[200px] flex-shrink-0 px-1">
            <div className="flex items-center gap-1.5">
              <span
                className="truncate font-medium text-gray-800 text-[13px]"
                title={localityLabel}
              >
                {localityLabel}
              </span>
              {lineItem.locality_id && (
                <button
                  onClick={() => onShowLocalityInfo(lineItem.locality_id)}
                  className="h-6 w-6 flex items-center justify-center rounded-md bg-blue-50 hover:bg-blue-100 border border-blue-200 flex-shrink-0"
                  title="View locality info"
                >
                  <Info className="w-4 h-4 text-blue-600" />
                </button>
              )}
            </div>
          </div>

          {/* Step cells */}
          {steps.map(step => {
            const w = getColWidth(step);
            // If this step is tied to a checkbox and that checkbox is checked, dim it to show "completed via tie"
            const tiedStep = step.tied_to_step_id ? steps.find(s => s.id === step.tied_to_step_id) : null;
            const tiedComplete = tiedStep?.checked;
            if (step.type === 'checkbox') {
              return (
                <div key={step.id} className="flex-shrink-0 px-1 flex flex-col items-center" style={{ width: `${w}px` }}>
                  <Checkbox
                    checked={step.checked || false}
                    onCheckedChange={(checked) => onUpdateStep(lineItem.id, step.id, { checked })}
                    disabled={!isRegistered}
                    className="h-4 w-4"
                  />
                  {step.checked && step.checked_date && (
                    <span className="text-[9px] text-green-600 mt-0.5">{step.checked_date.slice(5)}</span>
                  )}
                </div>
              );
            }

            if (step.type === 'submitted_date' || step.type === 'followup_date' || step.type === 'permit_received_date') {
              const dateVal = step.value;
              const popoverId = `step-${lineItem.id}-${step.id}`;
              const isFollowup = step.type === 'followup_date';
              const bgColor = tiedComplete ? '#f3f4f6' : isFollowup && dateVal ? '#fef9c3' : step.type === 'permit_received_date' && dateVal ? '#dcfce7' : 'transparent';

              return (
                <div key={step.id} className={`flex-shrink-0 px-1 ${tiedComplete ? 'opacity-60' : ''}`} style={{ width: `${w}px`, background: bgColor }}>
                  <Popover
                    open={openDatePopover === popoverId}
                    onOpenChange={(open) => setOpenDatePopover(open ? popoverId : null)}
                  >
                    <PopoverTrigger asChild disabled={!isRegistered}>
                      <button className={`h-7 w-full text-[13px] text-center hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
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
              <div key={step.id} className={`flex-shrink-0 px-1 ${tiedComplete ? 'opacity-60 bg-gray-100' : ''}`} style={{ width: `${w}px` }}>
                <Input
                  value={step.value || ""}
                  onChange={e => onUpdateStep(lineItem.id, step.id, { value: e.target.value })}
                  disabled={!isRegistered}
                  placeholder="…"
                  className="h-7 text-[13px] border-none shadow-none p-0 px-1 hover:bg-gray-100 focus:bg-white placeholder:text-gray-300"
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}