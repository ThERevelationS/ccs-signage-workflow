import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarClock, CheckCircle2, RotateCcw } from "lucide-react";
import { addDays, format, startOfDay } from "date-fns";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = startOfDay(new Date());

  // Reset whenever popup opens so it shows fresh state
  React.useEffect(() => {
    if (isOpen) {
      setSelected(parseDate(currentDate));
      setIsSubmitting(false);
    }
  }, [isOpen, currentDate]);

  const submitDate = (date) => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    onSave(date ? format(date, "yyyy-MM-dd") : null);
  };

  const quickDates = [
    { label: "Tomorrow", days: 1 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "30 days", days: 30 },
  ];

  const currentParsedDate = parseDate(currentDate);

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="clay-card border-none w-[calc(100vw-1rem)] sm:w-full max-w-sm max-h-[94vh] overflow-y-auto p-4 sm:p-6 [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarClock className="w-5 h-5 text-purple-600" />
            When should this return to SIPs?
          </DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
          A future revisit date moves this job to <strong>Revisit Later</strong>. It returns to the active SIPs queue when that date arrives, so this choice directly controls meeting workflow and sorting.
        </div>

        {currentParsedDate && (
          <div className="flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs text-gray-600">
            <RotateCcw className="w-3.5 h-3.5 text-purple-600" />
            Current revisit: <strong className="text-gray-800">{format(currentParsedDate, "MMM d, yyyy")}</strong>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-gray-700 mb-2">Quick choices</div>
          <div className="grid grid-cols-2 gap-2">
            {quickDates.map(option => {
              const date = addDays(today, option.days);
              const isSelected = selected && format(selected, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
              return (
                <Button
                  key={option.days}
                  type="button"
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelected(date)}
                  disabled={isSubmitting}
                  className="h-9"
                >
                  {option.label}
                </Button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-medium text-gray-700 mb-2">Or choose a date</div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            disabled={{ before: today }}
            className="rounded-lg border mx-auto"
          />
        </div>

        {selected && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span className="text-green-800">Return to active SIPs on <strong>{format(selected, "MMM d, yyyy")}</strong></span>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <Button
            onClick={() => submitDate(selected)}
            disabled={!selected || isSubmitting}
            className="w-full h-10 bg-blue-600 hover:bg-blue-700"
          >
            Save with Revisit Date
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submitDate(null)}
            disabled={isSubmitting}
            className="w-full h-10"
          >
            {currentDate ? "Clear Revisit & Keep Active" : "Keep in Active Queue (No Revisit)"}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting} className="w-full h-9 text-gray-500">
            Cancel — Don’t Save Yet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}