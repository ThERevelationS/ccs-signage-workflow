import { useRef, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getPermitLineRecommendation, isStepComplete } from "./permitQueue";

const dateTypes = new Set(["submitted_date", "followup_date", "permit_received_date"]);
const stepName = step => step.name || "Permit step";
const valueOf = step => step.type === "checkbox" ? !!step.checked : step.value || "";

export function PermitChecklist({ line, today, canEdit, onOpen }) {
  const steps = line.steps || [];
  const open = steps.filter(step => !isStepComplete(step, steps));
  const done = steps.filter(step => isStepComplete(step, steps));
  const recommendation = getPermitLineRecommendation(line, today);
  const current = recommendation.step;
  const upcoming = open.filter(step => step !== current);
  const row = (step, complete) => (
    <li key={step.id}>
      <button type="button" disabled={!canEdit} onClick={() => onOpen(line, step)}
        className="flex min-h-9 w-full items-center gap-2 border-b border-slate-100 px-2 text-left text-sm hover:bg-slate-50 disabled:opacity-80">
        {complete ? <Check className="h-4 w-4 shrink-0 text-emerald-700" /> : <span aria-hidden className="mx-1 h-2 w-2 shrink-0 rounded-full border border-slate-400" />}
        <span className="min-w-0 flex-1 break-words">{stepName(step)}</span>
        {complete && typeof step.value === "string" && <span className="max-w-[42%] truncate text-xs text-slate-600">{step.value}</span>}
        {canEdit && <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
      </button>
    </li>
  );
  return <section aria-label="Permit checklist" className="space-y-2">
    <div className="flex items-baseline justify-between gap-2"><h4 className="font-semibold text-slate-900">Permit checklist</h4>
      <span className="text-xs text-slate-600">{done.length} of {steps.length} done</span></div>
    {current && <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border-l-4 border-purple-600 bg-purple-50 px-3 py-2">
      <div><p className="text-xs font-bold uppercase tracking-wide text-purple-800">Do now</p><p className="break-words font-semibold">{stepName(current)}</p></div>
      <Button type="button" size="sm" disabled={!canEdit} onClick={() => onOpen(line, current)}>
        {current.type === "submitted_date" ? "Record submission" : current.type === "checkbox" ? "Check off step" : "Update step"}
      </Button>
    </div>}
    {!current && <div className="rounded-md border-l-4 border-slate-300 bg-slate-50 px-3 py-2">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-600">{recommendation.key === "waiting" ? "Waiting" : recommendation.key === "completed" ? "Complete" : "Next action"}</p>
      <p className="text-sm text-slate-900">{recommendation.nextAction}</p>
    </div>}
    {!!upcoming.length && <div><h5 className="border-b px-2 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">{current ? "Up next" : "Other checklist steps"}</h5><ul>{upcoming.map(step => row(step, false))}</ul></div>}
    {!!done.length && <details className="rounded border bg-white"><summary className="cursor-pointer px-2 py-2 text-xs font-semibold text-emerald-800">Done ({done.length})</summary><ul>{done.map(step => row(step, true))}</ul></details>}
  </section>;
}

export function PermitHandoff({ initial, today, onSave, onClose, canEdit }) {
  const [record, setRecord] = useState(initial);
  const [value, setValue] = useState(() => initial.step.type === "checkbox" ? !initial.step.checked : valueOf(initial.step));
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const { line, step } = record;
  const checkbox = step.type === "checkbox";
  const filing = step.type === "submitted_date" && !line.submitted_date && !!value;
  const recommendation = result && getPermitLineRecommendation(result, today);
  const next = recommendation?.step;
  async function save(e) {
    e.preventDefault();
    if (!canEdit || inFlight.current || value === valueOf(step)) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const saved = await onSave(line, step, checkbox ? { checked: value } : { value });
      if (!saved?.id) throw new Error("The update was not confirmed. Close this window and check the latest permit before retrying.");
      setResult(saved);
    } catch (err) {
      setError(err?.message || "The permit update could not be confirmed.");
    } finally {
      inFlight.current = false; setBusy(false);
    }
  }
  return <Dialog open onOpenChange={open => { if (!open && !inFlight.current) onClose(); }}>
    <DialogContent hideClose={busy} className="max-h-[90dvh] w-[calc(100vw_-_2rem)] max-w-md overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{result ? filing ? "Submission recorded" : "Step updated" : stepName(step)}</DialogTitle>
        <DialogDescription>{line.row_name || line.office_type || "Permit"} · {line.locality_name || "Office not set"}</DialogDescription>
      </DialogHeader>
      {result ? <>
        <p role="status" className="rounded border-l-4 border-emerald-600 bg-emerald-50 p-3 text-sm">
          {recommendation.nextAction}
        </p>
        {step.type === "followup_date" && <p className="text-sm">Next follow-up reminder: <strong>{result.next_followup_date || "Not scheduled"}</strong></p>}
        <DialogFooter><Button variant="outline" onClick={onClose}>Back to permits</Button>
          {next && <Button className="h-auto whitespace-normal" onClick={() => { setRecord({ line: result, step: next }); setValue(next.type === "checkbox" ? !next.checked : valueOf(next)); setResult(null); }}>Continue to {stepName(next)}</Button>}
        </DialogFooter>
      </> : <form onSubmit={save} className="space-y-4">
        {checkbox ? <label className="flex items-center gap-2"><input type="checkbox" checked={value} disabled={busy || !canEdit} onChange={e => setValue(e.target.checked)} />Mark this step complete</label> :
          <label className="block text-sm font-semibold">{step.type === "followup_date" ? "Follow-up step date" : dateTypes.has(step.type) ? "Date" : stepName(step)}
            <input type={dateTypes.has(step.type) ? "date" : "text"} className="mt-1 block min-h-10 w-full rounded border px-3" value={value} disabled={busy || !canEdit} onChange={e => setValue(e.target.value)} />
          </label>}
        {step.type === "followup_date" && <p className="text-sm text-slate-700">This step sets a reminder {step.followup_interval_days || 14} days after the date you enter. It does not record office contact.</p>}
        {step.type === "submitted_date" && !line.submitted_date && <p className="text-sm text-slate-700">Confirm only if the application was sent. Saving records the filing date and starts the submission workflow.</p>}
        {step.type === "permit_received_date" && <p className="text-sm text-slate-700">Recording receipt does not close the permit.</p>}
        {error && <p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-800">{error}</p>}
        <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !canEdit || value === valueOf(step) || !!error}>{busy ? "Saving..." : filing ? "Confirm submission" : "Save update"}</Button>
        </DialogFooter>
      </form>}
    </DialogContent>
  </Dialog>;
}
