import { useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// Standalone employee -> admin note from the Time Clock. Deliberately not tied
// to any punch or TimeEntry - it lands in the admin review panel as its own
// item and an admin acknowledges it there.
export default function AdminNoteDialog({
  open,
  userName,
  busy = false,
  error = "",
  onSend,
  onCancel,
}) {
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState("");
  const shownError = localError || error;

  const submit = async () => {
    setLocalError("");
    if (note.trim().length < 3) {
      setLocalError("Write at least a few words for the admin.");
      return;
    }
    try {
      await onSend(note.trim());
    } catch (err) {
      setLocalError(err?.message || "The note could not be sent.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy && !next) onCancel?.(); }}>
      <DialogContent className="clay-card border-none max-w-md">
        <DialogHeader><DialogTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5 text-slate-600" /> Note to admin{userName ? ` - ${userName}` : ""}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Send a message straight to the Time Clock admins. It does not change any of your punches - use the correction buttons on your Time Clock page for that.
          </p>
          <div>
            <Label>Your note</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={5}
              maxLength={1000}
              placeholder="Example: The badge printer jammed this morning so I could not scan in - can you check the kiosk?"
              disabled={busy}
            />
            <p className="mt-1 text-xs text-slate-500">{note.trim().length}/1000</p>
          </div>
          {shownError && <p className="text-sm text-red-600">{shownError}</p>}
          <div className="flex gap-3 pt-1">
            <Button type="button" variant="outline" onClick={onCancel} disabled={busy} className="flex-1">Cancel</Button>
            <Button type="button" onClick={submit} disabled={busy} className="flex-1">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send to admin"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
