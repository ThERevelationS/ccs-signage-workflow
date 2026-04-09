import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, differenceInDays } from "date-fns";
import { Info, MessageSquare } from "lucide-react";

const parseLocalDate = (dateString) => {
  if (!dateString) return undefined;
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export default function PermitSpreadsheetRow({
  lineItem,
  index,
  isFocused,
  onFocus,
  onUpdateStep,
  onUpdateField,
  onUpdateLocality,
  onShowLocalityInfo,
  onOpenWorkOrder,
  isRegistered,
  stepColumns,
  localities,
  officeTypes,
  today
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [editingRowName, setEditingRowName] = useState(false);
  const [rowNameVal, setRowNameVal] = useState(lineItem.row_name || "");
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal, setNotesVal] = useState(lineItem.notes || "");

  // Follow-up highlighting logic
  const getFollowupStyle = () => {
    if (isCompleted) return {};
    const followupDate = lineItem.next_followup_date;
    if (!followupDate || !today) return {};
    const fd = parseLocalDate(followupDate);
    const td = parseLocalDate(today);
    if (!fd || !td) return {};
    const diff = differenceInDays(fd, td);
    if (diff < -7) return { borderLeft: '4px solid #dc2626', backgroundColor: '#fef2f2' }; // very overdue - red
    if (diff < 0) return { borderLeft: '4px solid #f59e0b', backgroundColor: '#fffbeb' }; // overdue - amber
    if (diff <= 3) return { borderLeft: '4px solid #3b82f6', backgroundColor: '#eff6ff' }; // due soon - blue
    return {};
  };

  const isCompleted = !!lineItem.permit_received_date;

  const saveRowName = () => {
    onUpdateField(lineItem.id, "row_name", rowNameVal);
    setEditingRowName(false);
  };

  const followupStyle = getFollowupStyle();

  const saveNotes = () => {
    onUpdateField(lineItem.id, "notes", notesVal);
    setEditingNotes(false);
  };

  return (
    <React.Fragment>
      {isFocused && <tr><td colSpan={stepColumns.length + 7} className="h-2 bg-transparent border-none"></td></tr>}
      <tr
        className={`border-b transition-colors ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : 'hover:bg-gray-50'} ${isCompleted ? 'opacity-50 line-through' : ''}`}
        style={{ height: '42px', ...followupStyle }}
      >
        {/* Row Number */}
        <td className="px-0 py-0 border-r" style={{ width: '40px' }}>
          <button
            onClick={onFocus}
            className={`w-full h-full px-2 py-1.5 text-center font-bold text-xs transition-colors ${
              isFocused ? 'bg-purple-500 text-white' : 'text-white'
            }`}
            style={!isFocused ? { background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' } : undefined}
          >
            {index + 1}
          </button>
        </td>

        {/* Client / Work Order - clickable */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '140px', maxWidth: '160px' }}>
          <div
            className="text-xs font-medium truncate cursor-pointer hover:text-purple-700 hover:underline"
            onClick={() => onOpenWorkOrder && onOpenWorkOrder(lineItem.work_order_id)}
            title="Click to view work order details"
          >
            {lineItem.work_order_title || "—"}
          </div>
          <div className="text-[10px] text-gray-500 truncate">{lineItem.work_order_description || ""}</div>
        </td>

        {/* Row Name */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '100px', maxWidth: '120px' }}>
          {editingRowName ? (
            <Input
              value={rowNameVal}
              onChange={e => setRowNameVal(e.target.value)}
              onBlur={saveRowName}
              onKeyDown={e => { if (e.key === 'Enter') saveRowName(); if (e.key === 'Escape') setEditingRowName(false); }}
              autoFocus
              className="h-6 text-xs"
            />
          ) : (
            <span
              className="text-xs cursor-pointer hover:bg-gray-100 rounded px-0.5 block truncate"
              onClick={() => { if (isRegistered) { setRowNameVal(lineItem.row_name || ""); setEditingRowName(true); }}}
              title="Click to edit"
            >
              {lineItem.row_name || <span className="text-gray-400 italic">Row name...</span>}
            </span>
          )}
        </td>

        {/* Locality - inline select */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '130px', maxWidth: '150px' }}>
          <div className="flex items-center gap-1">
            <Select
              value={lineItem.locality_id || "none"}
              onValueChange={(val) => onUpdateLocality && onUpdateLocality(lineItem.id, val === "none" ? "" : val)}
              disabled={!isRegistered}
            >
              <SelectTrigger className="h-6 text-xs border-none shadow-none p-0 pl-0.5 hover:bg-gray-100 [&>svg]:w-3 [&>svg]:h-3">
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
                <Info className="w-3 h-3 text-blue-500" />
              </button>
            )}
          </div>
          {/* Office Type select */}
          <Select
            value={lineItem.office_type || "none"}
            onValueChange={(val) => onUpdateField(lineItem.id, "office_type", val === "none" ? "" : val)}
            disabled={!isRegistered}
          >
            <SelectTrigger className="h-5 text-[10px] border-none shadow-none p-0 pl-0.5 text-gray-500 hover:bg-gray-100 [&>svg]:w-2.5 [&>svg]:h-2.5">
              <SelectValue placeholder="Office type..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none"><span className="text-gray-400">None</span></SelectItem>
              {officeTypes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </td>

        {/* Assigned To */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '80px' }}>
          <span className="text-xs truncate block">{lineItem.assigned_to || "—"}</span>
        </td>

        {/* Notes */}
        <td className="px-1 py-1 border-r" style={{ minWidth: '90px', maxWidth: '120px' }}>
          {editingNotes ? (
            <Input
              value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              onBlur={saveNotes}
              onKeyDown={e => { if (e.key === 'Enter') saveNotes(); if (e.key === 'Escape') setEditingNotes(false); }}
              autoFocus
              className="h-6 text-xs"
              placeholder="Notes..."
            />
          ) : (
            <div
              className="text-xs cursor-pointer hover:bg-gray-100 rounded px-0.5 flex items-center gap-1 truncate"
              onClick={() => { if (isRegistered) { setNotesVal(lineItem.notes || ""); setEditingNotes(true); }}}
              title={lineItem.notes || "Click to add notes"}
            >
              {lineItem.notes ? (
                <span className="truncate">{lineItem.notes}</span>
              ) : (
                <span className="text-gray-400 flex items-center gap-0.5"><MessageSquare className="w-3 h-3" /></span>
              )}
            </div>
          )}
        </td>

        {/* Dynamic Step Columns */}
        {stepColumns.map(col => {
          const step = lineItem.steps?.find(s => s.id === col.id);
          if (!step) {
            return <td key={col.id} className="px-1 py-1 border-r text-center text-gray-300 text-xs">—</td>;
          }

          if (step.type === 'checkbox') {
            return (
              <td key={col.id} className="px-1 py-1 border-r text-center" style={{ minWidth: '50px' }}>
                <Checkbox
                  checked={step.checked || false}
                  onCheckedChange={(checked) => onUpdateStep(lineItem.id, step.id, { checked })}
                  disabled={!isRegistered}
                  className="h-4 w-4"
                />
              </td>
            );
          }

          if (step.type === 'submitted_date' || step.type === 'followup_date' || step.type === 'permit_received_date') {
            const dateVal = step.value;
            const popoverId = `step-${lineItem.id}-${step.id}`;
            const isFollowup = step.type === 'followup_date';
            const bgColor = isFollowup && dateVal ? '#fef9c3' : step.type === 'permit_received_date' && dateVal ? '#dcfce7' : 'transparent';

            return (
              <td key={col.id} className="px-1 py-1 border-r" style={{ minWidth: '85px', background: bgColor }}>
                <Popover
                  open={openDatePopover === popoverId}
                  onOpenChange={(open) => setOpenDatePopover(open ? popoverId : null)}
                >
                  <PopoverTrigger asChild disabled={!isRegistered}>
                    <button className={`h-7 w-full text-xs text-left px-0.5 hover:bg-gray-100 rounded font-medium ${isFollowup && dateVal ? 'text-amber-700' : step.type === 'permit_received_date' && dateVal ? 'text-green-700' : ''}`}>
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
              </td>
            );
          }

          // Text type
          return (
            <td key={col.id} className="px-1 py-1 border-r" style={{ minWidth: '80px' }}>
              <span className="text-xs block truncate">{step.value || "—"}</span>
            </td>
          );
        })}
      </tr>
      {isFocused && <tr><td colSpan={stepColumns.length + 7} className="h-2 bg-transparent border-none"></td></tr>}
    </React.Fragment>
  );
}