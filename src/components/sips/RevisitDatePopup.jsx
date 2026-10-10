import React, { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
 *   returnFocusRef – Save & Revisit button to refocus on cancellation only
 */
export default function RevisitDatePopup({ isOpen, onClose, onSave, currentDate, returnFocusRef }) {
  const parseDate = (ds) => {
    if (!ds) return undefined;
    try {
      const [y, m, d] = ds.split("-").map(Number);
      return new Date(y, m - 1, d);
    } catch { return undefined; }
  };

  const [selected, setSelected] = useState(() => {
    const parsed = parseDate(currentDate);
    return parsed && parsed > startOfDay(new Date()) ? parsed : undefined;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const restoreFocusAfterCancelRef = React.useRef(false);
  const today = startOfDay(new Date());
  const earliestRevisitDate = addDays(today, 1);

  // Reset whenever popup opens so it shows fresh state
  React.useEffect(() => {
    if (isOpen) {
      const parsed = parseDate(currentDate);
      setSelected(parsed && parsed > startOfDay(new Date()) ? parsed : undefined);
      setIsSubmitting(false);
      restoreFocusAfterCancelRef.current = false;
    }
  }, [isOpen, currentDate]);

  const submitDate = (date) => {
    if (isSubmitting) return;
    restoreFocusAfterCancelRef.current = false;
    setIsSubmitting(true);
    onSave(date ? format(date, "yyyy-MM-dd") : null);
  };

  const cancelDateSelection = () => {
    if (isSubmitting) return;
    restoreFocusAfterCancelRef.current = true;
    onClose();
  };

  const handleRevisitCloseAutoFocus = (event) => {
    if (!restoreFocusAfterCancelRef.current) return;
    restoreFocusAfterCancelRef.current = false;
    event.preventDefault();
    const returnTarget = returnFocusRef?.current;
    if (returnTarget?.isConnected && !returnTarget.disabled) returnTarget.focus();
  };

  const quickDates = [
    { label: "Tomorrow", days: 1 },
    { label: "1 week", days: 7 },
    { label: "2 weeks", days: 14 },
    { label: "30 days", days: 30 },
  ];

  const currentParsedDate = parseDate(currentDate);
  const currentDateIsFuture = currentParsedDate && currentParsedDate > today;

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        className="clay-card border-none w-[calc(100vw-1rem)] sm:w-full max-w-sm max-h-[94vh] overflow-y-auto p-4 sm:p-6 [&>button]:hidden"
        onCloseAutoFocus={handleRevisitCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <CalendarClock className="w-5 h-5 text-purple-600" aria-hidden="true" />
            When should this return to SIPs?
          </DialogTitle>
          <DialogDescription className="sr-only">
            Choose a future revisit date to move this Work Order to Revisit Later, or keep it in the active SIPs queue.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-purple-100 bg-purple-50 p-3 text-xs text-purple-900">
          A future revisit date moves this job to <strong>Revisit Later</strong>. It returns to the active SIPs queue when that date arrives, so this choice directly controls meeting workflow and sorting.
        </div>

        {currentParsedDate && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-white px-3 py-2 text-xs text-gray-600">
            <RotateCcw className="w-3.5 h-3.5 text-purple-600" aria-hidden="true" />
            Current revisit: <strong className="text-gray-800">{format(currentParsedDate, "MMM d, yyyy")}</strong>
            {!currentDateIsFuture && <span className="text-amber-700">— active now</span>}
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
                  className="h-11 sm:h-9"
                  aria-pressed={Boolean(isSelected)}
                  aria-label={`Choose ${option.label} as the revisit date: ${format(date, "MMMM d, yyyy")}`}
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
            disabled={{ before: earliestRevisitDate }}
            className="rounded-lg border mx-auto w-full max-w-[320px]"
          />
        </div>

        {selected && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm" aria-live="polite">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" aria-hidden="true" />
            <span className="text-green-800">Return to active SIPs on <strong>{format(selected, "MMM d, yyyy")}</strong></span>
          </div>
        )}

        <div className="space-y-2 pt-1">
          <Button
            onClick={() => submitDate(selected)}
            disabled={!selected || selected < earliestRevisitDate || isSubmitting}
            className="w-full h-11 sm:h-10 bg-blue-600 hover:bg-blue-700"
          >
            Save with Revisit Date
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => submitDate(null)}
            disabled={isSubmitting}
            className="w-full h-11 sm:h-10"
          >
            {currentDate ? "Clear Revisit & Keep Active" : "Keep in Active Queue (No Revisit)"}
          </Button>
          <Button type="button" variant="ghost" onClick={cancelDateSelection} disabled={isSubmitting} className="w-full h-11 sm:h-9 text-gray-500">
            Cancel — Don’t Save Yet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}