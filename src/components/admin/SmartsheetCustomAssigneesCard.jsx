import { useState } from "react";
import { Button } from "@/components/ui/button";
import CustomAssigneeDialog from "@/components/sales/CustomAssigneeDialog";
import { confirmSmartsheetCustomAssignee } from "@/components/admin/customAssigneeReviewPersistence";

export default function SmartsheetCustomAssigneesCard({ review, result, loadedRecord, sessionToken, disabled, onBusyChange, onChanged }) {
  const [selected, setSelected] = useState("");
  if (!review?.ready || result?.status !== "ready") return null;
  const field = result.analysis?.fields?.find((item) => item.field === "current_task_assigned_to");
  const column = field?.status === "matched" && field.matches?.length === 1 ? field.matches[0] : null;
  if (!column) return null;
  const confirm = async (label) => {
    if (disabled) throw new Error("Wait for the current review operation to finish.");
    onBusyChange(true);
    try {
      await confirmSmartsheetCustomAssignee({ label, sheetId: result.sheet.id, column, loadedRecord, sessionToken });
      onChanged();
    } finally { onBusyChange(false); }
  };
  return <section className="rounded-lg border bg-card p-3 text-card-foreground space-y-3">
    <h3 className="text-sm font-semibold">Custom assigned-name review</h3>
    <p className="text-xs text-muted-foreground">An unmatched Smartsheet name may be retained as confirmed custom text, including a former staff name. This does not identify a user, grant access, change old rows, or enable sync.</p>
    <p className="text-xs break-words">Confirmed custom names: {(review.owners.confirmedCustom || []).join(", ") || "None"}</p>
    <div className="flex flex-wrap gap-2">{review.owners.unresolved.map((name) => <Button key={name} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal break-words" disabled={disabled || !sessionToken} onClick={() => setSelected(name)}>Review “{name}” as custom</Button>)}</div>
    {review.owners.ambiguous.length > 0 && <p className="text-xs text-destructive">Ambiguous user matches remain blocked; custom-name confirmation cannot bypass them.</p>}
    {selected && <CustomAssigneeDialog key={selected} initialName={selected} readOnly disabled={disabled} onClose={() => setSelected("")} onConfirm={confirm} description={`Confirm “${selected}” as custom assignment text for this Smartsheet column, not an alias for an existing user. Only the review decision is saved. Run Analyze Live Mapping again afterward.`} />}
  </section>;
}