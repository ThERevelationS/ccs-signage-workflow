import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const LOST_REASONS = [
  "Price / Budget",
  "Competitor",
  "Project Cancelled",
  "Timing / Delayed",
  "No Response",
  "Scope Changed",
  "Not a Fit",
  "CCS Response Time",
  "Other",
];

export default function SalesStatusTransitionDialog({ transition, onClose, onConfirm }) {
  const [lostReason, setLostReason] = useState("");
  const [otherReason, setOtherReason] = useState("");

  useEffect(() => {
    setLostReason(transition?.workOrder?.lost_reason || "");
    setOtherReason("");
  }, [transition?.workOrder?.id, transition?.nextStatus]);

  if (!transition) return null;

  const { workOrder, nextStatus } = transition;
  const neutralClosing = transition.kind === "neutral_close";
  const currentStatus = workOrder?.sales_status || "lead";
  const closing = ["won", "lost"].includes(nextStatus);
  const reopening = ["won", "lost"].includes(currentStatus) && !closing;
  const isLost = nextStatus === "lost";
  const finalReason = lostReason === "Other" ? otherReason.trim() : lostReason.trim();
  const canConfirm = !isLost || Boolean(finalReason);

  const title = neutralClosing
    ? "Close this opportunity without a Won/Lost outcome?"
    : closing
    ? `Mark this opportunity ${nextStatus === "won" ? "Won" : "Lost"}?`
    : reopening
      ? `Reopen this opportunity as ${nextStatus.replace("_", " ")}?`
      : `Move opportunity to ${nextStatus.replace("_", " ")}?`;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose?.()}>
      <AlertDialogContent className="w-[95vw] max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {neutralClosing
              ? `${workOrder?.client_name || "This opportunity"} will leave Current Pipeline and remain inspectable under All Records as Closed (Neutral). No Won/Lost outcome or close date will be fabricated. Its follow-up schedule will be cleared, and existing WorkOrder and Smartsheet links will remain intact.`
              : closing
              ? `${workOrder?.client_name || "This opportunity"} will be closed today. Close date fills automatically, follow-up scheduling will be cleared, and expected-close/task-planning values stay preserved as historical sales context.`
              : reopening
                ? `The current close date and lost reason will be cleared from the live opportunity. Their previous values remain in sales change history. Review the preserved expected-close/task plan and schedule a new follow-up after reopening.`
                : `${workOrder?.client_name || "This opportunity"} will move to the selected sales stage.`}
          </AlertDialogDescription>
          {transition.nextTask && (
            <p className="text-sm font-medium text-gray-700">
              {transition.reconcileSameTask
                ? `The existing Task Description “${transition.nextTask}” stays unchanged. The stored Sales Status will be reconciled only after confirmation and a conflict-safe save.`
                : `Task Description will change to “${transition.nextTask}” when you confirm.`}
            </p>
          )}
        </AlertDialogHeader>

        {isLost && (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Lost reason <span className="text-red-600">*</span></Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger className="h-11 sm:h-9"><SelectValue placeholder="Select why this opportunity was lost" /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {lostReason === "Other" && (
              <div className="space-y-1.5">
                <Label>Reason details</Label>
                <Input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Enter the reason" autoFocus className="h-11 sm:h-9" />
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter className="gap-2 sm:gap-0">
          <AlertDialogCancel className="h-11 sm:h-9" onClick={() => onClose?.()}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => onConfirm?.({ lostReason: isLost ? finalReason : "" })}
            className={isLost ? "h-11 bg-red-600 hover:bg-red-700 sm:h-9" : "h-11 sm:h-9"}
          >
            {neutralClosing ? "Close Without Outcome" : closing ? `Mark ${nextStatus === "won" ? "Won" : "Lost"}` : reopening ? "Reopen Opportunity" : "Move Opportunity"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
