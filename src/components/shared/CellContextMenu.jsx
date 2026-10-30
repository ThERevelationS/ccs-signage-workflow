import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { History, Trash2, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import FieldHistoryDialog from '@/components/shared/FieldHistoryDialog';

const CellHistory = base44.entities.CellHistory;

export function CellContextMenu({ 
  position, 
  onClose, 
  entityType, 
  entityId, 
  fieldName, 
  fieldLabel,
  currentValue,
  onClear,
  isRegistered,
  actions = []
}) {
  const menuRef = useRef(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (showHistory) return; // Don't close if history dialog is open
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose, showHistory]);

  if (showHistory) {
    return (
      <CellHistoryDialog
        isOpen={true}
        onClose={onClose}
        entityType={entityType}
        entityId={entityId}
        fieldName={fieldName}
        fieldLabel={fieldLabel}
        currentValue={currentValue}
      />
    );
  }

  return (
    <div
      ref={menuRef}
      className="fixed bg-white border rounded-lg shadow-xl py-1 z-[9999] min-w-[160px]"
      style={{ top: position.y, left: position.x }}
    >
      {(Array.isArray(actions) ? actions : []).map((action, index) => (
        <button type="button"
          key={index}
          disabled={action.disabled}
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 disabled:opacity-40"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            action.onSelect?.();
            onClose();
          }}
        >
          {action.icon || <History className="w-4 h-4 text-gray-400" />}
          {action.label}
        </button>
      ))}
      <button type="button"
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowHistory(true);
        }}
      >
        <History className="w-4 h-4 text-blue-600" />
        Field History
      </button>
      {isRegistered && (
        <button type="button"
          className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
            onClose();
          }}
        >
          <Trash2 className="w-4 h-4" />
          Clear Cell
        </button>
      )}
    </div>
  );
}

export function CellHistoryDialog(props) { return <FieldHistoryDialog {...props}/>; }

// Hook to track cell changes and save to history
export function useCellHistoryTracker() {
  // Field audit now belongs to the verified server save, never an optimistic keystroke.
  return { trackChange: async () => {} };
}

export default CellContextMenu;