// P-02/P-03/W-012 UI consumer: the structured interview -> proposal dialog.
// Renders the CHANNEL_INTERVIEW_FIELDS contract grouped by section, shows
// live missing/conflict/assumption issues from the model, and applies via
// `channelInterviewToProjectDraft` — preview → explicit apply, never silent.
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { CHANNEL_INTERVIEW_FIELDS, sanitizeChannelInterview, channelInterviewIssues, channelInterviewToProjectDraft } from "./channelInterviewModel.js";

const SECTION_LABELS = {
  sign_set: "Letter set",
  mounting: "Mounting & structure",
  electrical: "Electrical",
  site: "Site & access",
};

const FieldInput = ({ field, value, onChange }) => {
  if (field.kind === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={value === true} onCheckedChange={(c) => onChange(c === true ? true : null)} />
        <span className="text-slate-600">yes / leave blank if unknown</span>
      </label>
    );
  }
  if (field.kind === "enum") {
    return (
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || null)}>
        <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          {field.options.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  if (field.kind === "text") {
    return <Textarea rows={2} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
  }
  const step = field.kind === "integer" ? "1" : "0.5";
  return <Input type="number" step={step} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)} className="h-8" />;
};

export default function ChannelIntakeDialog({ open, onClose, onApply }) {
  const [answers, setAnswers] = useState({});
  const set = (k, v) => setAnswers((p) => ({ ...p, [k]: v }));

  const { issues, draft } = useMemo(() => {
    const clean = sanitizeChannelInterview(answers);
    return { issues: channelInterviewIssues(clean.answers), draft: channelInterviewToProjectDraft(clean.answers) };
  }, [answers]);

  const missing = issues.filter((i) => i.kind === "missing");
  const conflicts = issues.filter((i) => i.kind === "conflict");
  const assumptions = issues.filter((i) => i.kind === "unverified_assumption");
  const answered = Object.values(answers).filter((v) => v !== null && v !== undefined && v !== "").length;

  const sections = useMemo(() => {
    const g = {};
    for (const f of CHANNEL_INTERVIEW_FIELDS) (g[f.section] = g[f.section] || []).push(f);
    return g;
  }, []);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-indigo-600" /> Structured Intake — Channel Letters
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {Object.entries(sections).map(([sec, fields]) => (
            <div key={sec}>
              <h3 className="text-sm font-semibold text-slate-700 mb-2">{SECTION_LABELS[sec] || sec}</h3>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="text-xs text-slate-500 block mb-1">{f.label}{f.required ? " *" : ""}</label>
                    <FieldInput field={f} value={answers[f.key] ?? null} onChange={(v) => set(f.key, v)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-700">Intake review — {answered} answered, {draft.items.length} item(s) will be created</p>
          {conflicts.map((i, n) => <p key={n} className="flex items-start gap-2 text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{i.message}</p>)}
          {missing.map((i, n) => <p key={n} className="flex items-start gap-2 text-amber-700"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />Missing: {i.message}</p>)}
          {assumptions.map((i, n) => <p key={n} className="flex items-start gap-2 text-slate-600"><Info className="w-4 h-4 mt-0.5 shrink-0" />Assumption flagged: {i.field}</p>)}
          {conflicts.length === 0 && missing.length === 0 && assumptions.length === 0 && (
            <Badge variant="outline" className="text-emerald-700 border-emerald-300">No issues — clean intake</Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={answered === 0}
            onClick={() => { onApply(draft); onClose(); setAnswers({}); }}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            Apply to project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
