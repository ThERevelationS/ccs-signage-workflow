import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, X } from "lucide-react";
import { format } from "date-fns";

/**
 * Small popup shown when saving a checklist that lets the user optionally set
 * or update a "date to revisit" for the project.
 *
 * Props:
 *   isOpen       – boolean
 *   onClose      – () => void  (cancel, don't save revisit date)
 *   onSave       – (dateString | null) => void  (save with or without date)
 *   currentDate  – existing sip_revisit_date value (yyyy-MM-dd string or null)
 */
export default function RevisitDatePopup({ isOpen, onClose, onSave, currentDate }) {
  const parseDate = (ds) => {
    if (!ds) return undefined;
    try {
      const [y, m, d] = ds.split("-").map(Number);
      return new Date(y, m - 1, d);
    } catch { return undefined; }
  };

  const [selected, setSelected] = useState(() => parseDate(currentDate));

  // Reset whenever popup opens so it shows fresh state
  React.useEffect(() => {
    if (isOpen) setSelected(parseDate(currentDate));
  }, [isOpen, currentDate]);

  const handleSave = () => {
    const ds = selected ? format(selected, "yyyy-MM-dd") : null;
    onSave(ds);
  };

  const handleClear = () => {
    setSelected(undefined);
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="clay-card border-none max-w-xs [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="w-5 h-5 text-purple-600" />
            Date to Revisit
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-gray-500 -mt-2 mb-2">
          Optionally set a future date to bring this project back to the top of the active list.
        </p>

        <Calendar
          mode="single"
          selected={selected}
          onSelect={setSelected}
          className="rounded-lg border"
        />

        {selected && (
          <div className="flex items-center justify-between mt-1 bg-purple-50 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-purple-700 font-medium">
              Revisit: {format(selected, "MMM d, yyyy")}
            </span>
            <button onClick={handleClear} className="text-gray-400 hover:text-red-500 ml-2">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" onClick={onClose} className="flex-1 h-9 text-sm">
            Cancel
          </Button>
          <Button onClick={handleSave} className="flex-1 h-9 text-sm bg-blue-600 hover:bg-blue-700">
            Save{selected ? "" : " (no date)"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}