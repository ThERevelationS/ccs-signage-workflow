import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { History, Trash2, Loader2, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

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
  isRegistered
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
      <button
        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowHistory(true);
        }}
      >
        <History className="w-4 h-4 text-blue-600" />
        View Cell History
      </button>
      {isRegistered && (
        <button
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

export function CellHistoryDialog({ isOpen, onClose, entityType, entityId, fieldName, fieldLabel, currentValue }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, entityType, entityId, fieldName]);

  const loadHistory = async () => {
    setIsLoading(true);
    try {
      const records = await CellHistory.filter({
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName
      }, "-created_date", 50);
      setHistory(records);
    } catch (error) {
      console.error("Error loading cell history:", error);
      setHistory([]);
    }
    setIsLoading(false);
  };

  const formatValue = (value) => {
    if (value === null || value === undefined || value === "") return "(empty)";
    return String(value);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">
            History: {fieldLabel || fieldName}
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-gray-500 text-sm">
              No changes recorded
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((entry) => (
                <div key={entry.id} className="text-xs border-b pb-2">
                  <div className="flex justify-between text-gray-500 mb-1">
                    <span>{entry.changed_by_name || entry.changed_by_email || "Unknown"}</span>
                    <span>{format(new Date(entry.created_date), "M/d/yy h:mm a")}</span>
                  </div>
                  <div>
                    <span className="text-red-600 line-through">{formatValue(entry.old_value)}</span>
                    <span className="mx-2">→</span>
                    <span className="text-green-600">{formatValue(entry.new_value)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook to track cell changes and save to history
export function useCellHistoryTracker(entityType, currentUser) {
  const trackChange = async (entityId, fieldName, oldValue, newValue) => {
    // Don't track if values are the same
    if (String(oldValue || "") === String(newValue || "")) return;

    try {
      await CellHistory.create({
        entity_type: entityType,
        entity_id: entityId,
        field_name: fieldName,
        old_value: String(oldValue || ""),
        new_value: String(newValue || ""),
        changed_by_email: currentUser?.email || "",
        changed_by_name: currentUser?.full_name || currentUser?.email || ""
      });
    } catch (error) {
      console.error("Error tracking cell change:", error);
    }
  };

  return { trackChange };
}

export default CellContextMenu;