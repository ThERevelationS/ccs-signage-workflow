import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function SmartsheetMissingOwnersCard({ review, sessionToken, disabled, onBusyChange, onChanged }) {
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  const missing = review?.ready ? review.owners?.base44Only || [] : [];
  if (!missing.length) return null;
  const add = async () => {
    if (!selected || disabled || !sessionToken) return;
    onBusyChange(true);
    setError("");
    try {
      const response = await base44.functions.invoke("smartsheetMetadataAdminAction", {
        session_token: sessionToken,
        action: "append_options",
        target: "current_task_assigned_to",
        options: [selected.suggested_option],
        confirmation: "ADD_ONLY_VERIFIED_PICKLIST_OPTIONS",
      });
      const result = response?.data || response;
      if (!result?.success) throw new Error(result?.error || "The name could not be added safely.");
      setSelected(null);
      onChanged();
    } catch (cause) {
      setError(cause?.response?.data?.error || cause?.message || "The name could not be added safely.");
    } finally {
      onBusyChange(false);
    }
  };
  return <section className="rounded-lg border bg-card p-3 text-card-foreground space-y-2">
    <h3 className="text-sm font-semibold">Eligible users missing from Smartsheet</h3>
    <p className="text-xs text-muted-foreground">Choose each name deliberately. Only the existing Task Assigned picklist is extended; no row or user record changes.</p>
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">{missing.map((person) => <Button key={person.full_name} type="button" variant="outline" className="min-h-11 h-auto whitespace-normal" disabled={disabled || !sessionToken} onClick={() => setSelected(person)}>Add {person.suggested_option} ({person.full_name})</Button>)}</div>
    <AlertDialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Add this Smartsheet choice?</AlertDialogTitle><AlertDialogDescription>Append “{selected?.suggested_option}” for {selected?.full_name} to the Task Assigned picklist. Existing choices and rows remain unchanged. Re-analyze mappings afterward.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel disabled={disabled}>Cancel</AlertDialogCancel><AlertDialogAction disabled={disabled} onClick={(event) => { event.preventDefault(); add(); }}>Add choice</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}