import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { validateCustomAssigneeName } from "@/components/sales/customAssigneeName";

export default function CustomAssigneeDialog({ initialName = "", readOnly = false, description, disabled = false, onClose, onConfirm }) {
  const [name, setName] = useState(initialName);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const submit = async (event) => {
    event.preventDefault();
    if (!confirmed || disabled || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      await onConfirm(validateCustomAssigneeName(name));
      onClose();
    } catch (failure) {
      setError(failure?.message || "The assigned name could not be confirmed.");
    } finally { inFlight.current = false; setBusy(false); }
  };
  return <Dialog open onOpenChange={(open) => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent hideClose={busy} className="w-[95vw] max-w-md max-h-[90dvh] overflow-y-auto" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Confirm assigned name</DialogTitle><DialogDescription>{description || "Use a custom name for this opportunity without creating a user account, granting access, or linking it to an existing person. Existing matching users keep their normal assignment."}</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4">
        <label className="block space-y-2 text-sm">Assigned name<Input autoFocus value={name} maxLength={100} readOnly={readOnly} disabled={busy || disabled} onChange={(event) => { setName(event.target.value); setConfirmed(false); setError(""); }} className="h-11" /></label>
        <label className="flex min-h-11 items-start gap-3 text-sm"><input type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={confirmed} disabled={busy || disabled || !name.trim()} onChange={(event) => setConfirmed(event.target.checked)} /><span>I confirm “{name.trim() || "this name"}” is the assigned name I want to use.</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" className="min-h-11" disabled={!confirmed || busy || disabled || !name.trim()}>{busy ? "Confirming…" : "Confirm name"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}