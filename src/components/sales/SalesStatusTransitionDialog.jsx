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
  const currentStatus = workOrder?.sales_status || "lead";
  const closing = ["won", "lost"].includes(nextStatus);
  const reopening = ["won", "lost"].includes(currentStatus) && !closing;
  const isLost = nextStatus === "lost";
  const finalReason = lostReason === "Other" ? otherReason.trim() : lostReason.trim();
  const canConfirm = !isLost || Boolean(finalReason);

  const title = closing
    ? `Mark this opportunity ${nextStatus === "won" ? "Won" : "Lost"}?`
    : reopening
      ? `Reopen this opportunity as ${nextStatus.replace("_", " ")}?`
      : `Move opportunity to ${nextStatus.replace("_", " ")}?`;

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose?.()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {closing
              ? `${workOrder?.client_name || "This opportunity"} will be closed on today's date. Its sales history remains preserved and it can be reopened later.`
              : reopening
                ? `The current close date and lost reason will be cleared from the live opportunity. Their previous values remain in sales change history.`
                : `${workOrder?.client_name || "This opportunity"} will move to the selected sales stage.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {isLost && (
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label>Lost reason <span className="text-red-600">*</span></Label>
              <Select value={lostReason} onValueChange={setLostReason}>
                <SelectTrigger><SelectValue placeholder="Select why this opportunity was lost" /></SelectTrigger>
                <SelectContent>
                  {LOST_REASONS.map((reason) => <SelectItem key={reason} value={reason}>{reason}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {lostReason === "Other" && (
              <div className="space-y-1.5">
                <Label>Reason details</Label>
                <Input value={otherReason} onChange={(event) => setOtherReason(event.target.value)} placeholder="Enter the reason" autoFocus />
              </div>
            )}
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => onClose?.()}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={!canConfirm}
            onClick={() => onConfirm?.({ lostReason: isLost ? finalReason : "" })}
            className={isLost ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {closing ? `Mark ${nextStatus === "won" ? "Won" : "Lost"}` : reopening ? "Reopen Opportunity" : "Move Opportunity"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
