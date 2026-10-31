import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const FOLLOW_UP_OUTCOMES = [
  "Connected / Spoke with customer",
  "Left voicemail",
  "Sent email",
  "Sent text message",
  "No response",
  "Customer requested later follow-up",
  "Quote revision requested",
  "Waiting on customer / third party",
  "Other",
];

export default function SalesFollowUpCompleteDialog({ workOrder, error = "", onClose, onConfirm }) {
  const [outcome, setOutcome] = useState("");
  const [details, setDetails] = useState("");
  const [nextFollowUpDate, setNextFollowUpDate] = useState("");
  const [leaveUnscheduled, setLeaveUnscheduled] = useState(false);
  const [nextAction, setNextAction] = useState("");

  useEffect(() => {
    setOutcome("");
    setDetails("");
    setNextFollowUpDate("");
    setLeaveUnscheduled(false);
    setNextAction(workOrder?.current_task_description || "");
  }, [workOrder?.id]);

  const todayStamp = format(new Date(), "yyyy-MM-dd");
  const finalOutcome = useMemo(() => {
    const base = outcome.trim();
    const note = details.trim();
    if (!base) return "";
    if (!note) return base;
    return `${base}: ${note}`;
  }, [outcome, details]);

  if (!workOrder) return null;

  const nextDateIsValid = !nextFollowUpDate || nextFollowUpDate >= todayStamp;
  const nextStepChosen = Boolean(nextFollowUpDate) || leaveUnscheduled;
  const canConfirm = Boolean(finalOutcome) && nextDateIsValid && nextStepChosen;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="w-[95vw] max-w-lg">
        <DialogHeader>
          <DialogTitle>Complete Sales Follow-up</DialogTitle>
          <p className="text-sm text-gray-500">
            Record what happened for {workOrder.client_name || "this opportunity"}. You can schedule the next follow-up now or leave it unscheduled.
          </p>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Outcome <span className="text-red-600">*</span></Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger><SelectValue placeholder="What happened?" /></SelectTrigger>
              <SelectContent>
                {FOLLOW_UP_OUTCOMES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Outcome details <span className="text-xs font-normal text-gray-400">optional</span></Label>
            <Input value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Short note, e.g. waiting on revised artwork" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Next follow-up</Label>
              <CcsDateField
                min={todayStamp}
                value={nextFollowUpDate}
                onChange={(event) => {
                  setNextFollowUpDate(event.target.value);
                  setLeaveUnscheduled(false);
                }}
              />
              <div className="flex items-center gap-1.5 overflow-x-auto overscroll-x-contain pb-0.5" aria-label="Choose the next follow-up date or explicitly leave it unscheduled">
                {[1, 3, 7, 14].map((days) => {
                  const date = new Date();
                  date.setHours(0, 0, 0, 0);
                  date.setDate(date.getDate() + days);
                  const stamp = format(date, "yyyy-MM-dd");
                  return <button type="button" key={days} type="button" onClick={() => { setNextFollowUpDate(stamp); setLeaveUnscheduled(false); }} className="h-11 shrink-0 rounded-full border border-gray-200 px-3 text-[11px] font-medium text-gray-600 hover:bg-gray-50 sm:h-7">+{days}d</button>;
                })}
                <button
                  type="button"
                  onClick={() => { setNextFollowUpDate(""); setLeaveUnscheduled(true); }}
                  className={leaveUnscheduled
                    ? "h-11 shrink-0 rounded-full border border-amber-400 bg-amber-100 px-3 text-[11px] font-semibold text-amber-900 sm:h-7"
                    : "h-11 shrink-0 rounded-full border border-gray-200 px-3 text-[11px] font-semibold text-gray-500 hover:bg-gray-50 sm:h-7"}
                >
                  Leave unscheduled
                </button>
              </div>
              {!nextDateIsValid && <p className="text-xs text-red-600">Next follow-up cannot be in the past.</p>}
              {nextDateIsValid && !nextStepChosen && <p className="text-xs font-medium text-amber-700">Choose a next date or explicitly select Leave unscheduled.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Next action</Label>
              <Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="What happens next?" />
            </div>
          </div>

          {leaveUnscheduled && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You chose to leave this follow-up unscheduled. If there is also no task deadline, this opportunity will appear in the No Next Action queue.
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => onClose?.()}>Cancel</Button>
          <Button
            type="button"
            className="h-11 sm:h-9"
            disabled={!canConfirm}
            onClick={() => onConfirm?.({ outcome: finalOutcome, nextFollowUpDate, nextAction: nextAction.trim() })}
          >
            Complete Follow-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
