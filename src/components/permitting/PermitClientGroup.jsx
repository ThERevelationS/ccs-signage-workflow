import React, { useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import PermitSpreadsheetRow from "./PermitSpreadsheetRow";

export default function PermitClientGroup({
  group,
  onUpdateStep,
  onUpdateField,
  onUpdateNotes,
  onUpdateLocality,
  onOpenWorkOrder,
  onShowLocalityInfo,
  onDeleteLine,
  onAddLine,
  isRegistered,
  stepColumns,
  localities,
  officeTypes,
  today
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingType, setAddingType] = useState(false);

  const handleAddOfficeTypeLine = async (officeType) => {
    await onAddLine({
      work_order_id: group.work_order_id,
      work_order_title: group.work_order_title,
      work_order_description: group.work_order_description,
      row_name: "",
      office_type: officeType,
      status: "active",
      steps: [],
      priority: 0
    });
    setAddingType(false);
  };

  // Which office types don't have a line yet
  const existingTypes = new Set(group.lines.map(li => li.office_type));
  const missingTypes = officeTypes.filter(t => !existingTypes.has(t));

  return (
    <div className="border-b-2 border-gray-300">
      {/* Client Header Row */}
      <div
        className="flex items-center bg-gradient-to-r from-purple-50 to-white border-b cursor-pointer hover:bg-purple-100/50 transition-colors"
        style={{ minHeight: '36px' }}
      >
        <div
          className="px-2 py-1.5 flex items-center gap-2 flex-shrink-0"
          style={{ width: '150px' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown className="w-3 h-3 text-purple-600" /> : <ChevronRight className="w-3 h-3 text-purple-600" />}
          <span
            className="text-xs font-bold text-purple-800 truncate cursor-pointer hover:underline"
            onClick={(e) => { e.stopPropagation(); onOpenWorkOrder(group.work_order_id); }}
            title="Click to view work order"
          >
            {group.work_order_title || "—"}
          </span>
        </div>
        <div className="flex-1 px-2 py-1">
          <span className="text-[10px] text-gray-500 truncate block">{group.work_order_description || ""}</span>
        </div>
        <div className="px-2 flex items-center gap-1">
          <span className="text-[10px] text-gray-400">{group.lines.length} lines</span>
          {isRegistered && missingTypes.length > 0 && (
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => { e.stopPropagation(); setAddingType(!addingType); }}
                title="Add office type line"
              >
                <Plus className="w-3 h-3 text-purple-600" />
              </Button>
              {addingType && (
                <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-20 min-w-[140px]">
                  {missingTypes.map(type => (
                    <button
                      key={type}
                      onClick={(e) => { e.stopPropagation(); handleAddOfficeTypeLine(type); }}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-purple-50 border-b last:border-0"
                    >
                      {type}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sub-rows per office type */}
      {expanded && group.lines.map(li => (
        <PermitSpreadsheetRow
          key={li.id}
          lineItem={li}
          isSubRow
          onUpdateStep={onUpdateStep}
          onUpdateField={onUpdateField}
          onUpdateNotes={onUpdateNotes}
          onUpdateLocality={onUpdateLocality}
          onOpenWorkOrder={onOpenWorkOrder}
          onShowLocalityInfo={onShowLocalityInfo}
          onDeleteLine={onDeleteLine}
          isRegistered={isRegistered}
          stepColumns={stepColumns}
          localities={localities}
          officeTypes={officeTypes}
          today={today}
        />
      ))}
    </div>
  );
}