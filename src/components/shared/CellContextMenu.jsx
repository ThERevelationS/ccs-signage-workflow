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

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  const [showHistory, setShowHistory] = useState(false);

  return (
    <>
      <div
        ref={menuRef}
        className="fixed bg-white border rounded-lg shadow-xl py-1 z-[9999] min-w-[160px]"
        style={{ top: position.y, left: position.x }}
      >
        <button
          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
          onClick={() => {
            setShowHistory(true);
          }}
        >
          <History className="w-4 h-4 text-blue-600" />
          View Cell History
        </button>
        {isRegistered && (
          <button
            className="w-full px-3 py-2 text-left text-sm hover:bg-red-50 text-red-600 flex items-center gap-2"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            <Trash2 className="w-4 h-4" />
            Clear Cell
          </button>
        )}
      </div>

      {showHistory && (
        <CellHistoryDialog
          isOpen={showHistory}
          onClose={() => {
            setShowHistory(false);
            onClose();
          }}
          entityType={entityType}
          entityId={entityId}
          fieldName={fieldName}
          fieldLabel={fieldLabel}
          currentValue={currentValue}
        />
      )}
    </>
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
      <DialogContent className="clay-card border-none max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-600" />
            Cell History: {fieldLabel || fieldName}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <History className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p>No change history for this cell</p>
              <p className="text-xs mt-2">Current value: {formatValue(currentValue)}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Current Value */}
              <div className="p-3 rounded-lg bg-green-50 border border-green-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-green-700">Current Value</span>
                </div>
                <p className="text-sm text-green-800 font-medium break-words">
                  {formatValue(currentValue)}
                </p>
              </div>

              {/* History entries */}
              {history.map((entry, index) => (
                <div key={entry.id} className="p-3 rounded-lg bg-gray-50 border">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-gray-600">
                      {entry.changed_by_name || entry.changed_by_email || "Unknown User"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(entry.created_date), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 rounded bg-red-50 border border-red-100">
                      <span className="text-xs text-red-600 font-medium block mb-1">Before</span>
                      <p className="text-xs text-red-800 break-words">{formatValue(entry.old_value)}</p>
                    </div>
                    <div className="p-2 rounded bg-green-50 border border-green-100">
                      <span className="text-xs text-green-600 font-medium block mb-1">After</span>
                      <p className="text-xs text-green-800 break-words">{formatValue(entry.new_value)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="pt-3 border-t">
          <Button onClick={onClose} className="w-full">
            Close
          </Button>
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