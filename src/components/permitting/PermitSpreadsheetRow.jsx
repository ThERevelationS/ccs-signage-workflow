import React, { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { Info, Pencil } from "lucide-react";

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
  onShowLocalityInfo,
  isRegistered,
  stepColumns
}) {
  const [openDatePopover, setOpenDatePopover] = useState(null);
  const [editingRowName, setEditingRowName] = useState(false);
  const [rowNameVal, setRowNameVal] = useState(lineItem.row_name || "");

  const isCompleted = !!lineItem.permit_received_date;

  const saveRowName = () => {
    onUpdateField(lineItem.id, "row_name", rowNameVal);
    setEditingRowName(false);
  };

  return (
    <React.Fragment>
      {isFocused && <tr><td colSpan={stepColumns.length + 6} className="h-2 bg-transparent border-none"></td></tr>}
      <tr
        className={`border-b transition-colors ${isFocused ? 'ring-2 ring-purple-400 ring-inset bg-purple-50/50' : 'hover:bg-gray-50'} ${isCompleted ? 'opacity-50 line-through' : ''}`}
        style={{ height: '42px' }}
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

        {/* Client / Work Order */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '140px', maxWidth: '160px' }}>
          <div className="text-xs font-medium truncate">{lineItem.work_order_title || "—"}</div>
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

        {/* Locality */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '120px', maxWidth: '140px' }}>
          <div className="flex items-center gap-1">
            <span className="text-xs truncate flex-1">{lineItem.locality_name || <span className="text-gray-400">—</span>}</span>
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
          {lineItem.office_type && (
            <div className="text-[10px] text-gray-500">{lineItem.office_type}</div>
          )}
        </td>

        {/* Assigned To */}
        <td className="px-1.5 py-1 border-r" style={{ minWidth: '80px' }}>
          <span className="text-xs truncate block">{lineItem.assigned_to || "—"}</span>
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
      {isFocused && <tr><td colSpan={stepColumns.length + 6} className="h-2 bg-transparent border-none"></td></tr>}
    </React.Fragment>
  );
}