import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, CircleDollarSign, Contact, ExternalLink, FileClock, FileText, FolderOpen, Loader2, UserRound, Wrench } from "lucide-react";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";

const CellHistory = base44.entities.CellHistory;

const SALES_STATUSES = [
  { value: "lead", label: "Lead" },
  { value: "quoted", label: "Quoted" },
  { value: "follow_up", label: "Follow Up" },
  { value: "on_hold", label: "On Hold" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const SUGGESTED_PROBABILITY_BY_STATUS = {
  lead: 10,
  quoted: 50,
  follow_up: 70,
  on_hold: 25,
};

const SALES_HISTORY_FIELDS = new Set([
  "sales_status",
  "sales_rep",
  "lead_source",
  "estimate_amount",
  "quoted_amount",
  "probability",
  "quote_date",
  "date_estimate_sent",
  "follow_up_date",
  "expected_close_date",
  "close_date",
  "lost_reason",
  "current_task_description",
  "current_task_deadline",
  "current_task_assigned_to",
]);

const FIELD_LABELS = {
  sales_status: "Sales status",
  sales_rep: "Sales owner",
  lead_source: "Lead source",
  estimate_amount: "Estimate value",
  quoted_amount: "Quoted value",
  probability: "Probability",
  quote_date: "Quote date",
  date_estimate_sent: "Estimate sent",
  follow_up_date: "Follow-up date",
  expected_close_date: "Expected close",
  close_date: "Close date",
  lost_reason: "Lost reason",
  current_task_description: "Next action",
  current_task_deadline: "Task deadline",
  current_task_assigned_to: "Task owner",
};

const money = (value) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
}).format(Number(value) || 0);

const displayValue = (field, value) => {
  if (value === undefined || value === null || value === "") return "—";
  if (["estimate_amount", "quoted_amount"].includes(field)) return money(value);
  if (field === "probability") return `${value}%`;
  if (field === "sales_status") return String(value).replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  return String(value);
};

export default function SalesOpportunityDialog({
  workOrder,
  users = [],
  leadSources = [],
  isRegistered,
  onClose,
  onUpdateFields,
  onRequestStatusChange,
  onOpenFullDetails,
}) {
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");

  useEffect(() => {
    let active = true;
    if (!workOrder?.id) {
      setHistory([]);
      return undefined;
    }
    setHistoryLoading(true);
    setHistoryError("");
    loadAllEntityRows({
      entity: CellHistory,
      query: { entity_type: "WorkOrder", entity_id: workOrder.id },
      sort: "-created_date",
      label: "Sales opportunity change history",
    })
      .then((rows) => {
        if (!active) return;
        setHistory((rows || []).filter((row) => SALES_HISTORY_FIELDS.has(row.field_name)).slice(0, 75));
      })
      .catch((error) => {
        if (!active) return;
        setHistory([]);
        setHistoryError(error?.message || "Sales history could not be loaded.");
      })
      .finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
  }, [workOrder?.id, workOrder?.updated_date]);

  const value = Number(workOrder?.quoted_amount ?? workOrder?.estimate_amount ?? 0) || 0;
  const statusLabel = SALES_STATUSES.find((status) => status.value === workOrder?.sales_status)?.label || "Lead";
  const closeout = ["won", "lost"].includes(workOrder?.sales_status);
  const probabilityIsSet = typeof workOrder?.probability === "number" && Number.isFinite(workOrder.probability);
  const suggestedProbability = SUGGESTED_PROBABILITY_BY_STATUS[workOrder?.sales_status || "lead"];
  const weightedContribution = probabilityIsSet ? value * (workOrder.probability / 100) : null;
  const clientNotes = useMemo(() => (workOrder?.work_notes || [])
    .filter((note) => ["client", "admin", "other"].includes(note?.type))
    .slice()
    .sort((a, b) => String(b?.timestamp || "").localeCompare(String(a?.timestamp || "")))
    .slice(0, 5), [workOrder?.work_notes]);

  if (!workOrder) return null;

  const update = (changes) => onUpdateFields?.(workOrder.id, changes);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose?.()}>
      <DialogContent className="max-h-[94vh] w-[96vw] max-w-5xl overflow-y-auto p-0">
        <DialogHeader className="border-b bg-slate-50 px-5 py-4 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="truncate text-xl">{workOrder.client_name || "Unnamed opportunity"}</DialogTitle>
                <Badge variant="outline">{statusLabel}</Badge>
                {workOrder.in_pipeline === true && <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Current Pipeline</Badge>}
              </div>
              <p className="mt-1 text-sm text-gray-500">{workOrder.description || workOrder.title || "No job description yet"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {workOrder.estimate_id && (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/EstimateDetail?id=${workOrder.estimate_id}`} target="_blank" rel="noreferrer"><FileText className="mr-1.5 h-4 w-4" />Source Estimate<ExternalLink className="ml-1 h-3 w-3" /></a>
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => onOpenFullDetails?.(workOrder)}><Wrench className="mr-1.5 h-4 w-4" />Full Work Order</Button>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5 p-4 sm:p-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border bg-white p-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500"><CircleDollarSign className="h-4 w-4" />Opportunity Value</div>
              <div className="mt-2 text-2xl font-bold text-gray-900">{money(value)}</div>
              <div className="mt-1 text-xs text-gray-500">{workOrder.quoted_amount != null ? "Quoted value" : "Estimate value"}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Status</Label>
              <Select value={workOrder.sales_status || "lead"} onValueChange={(nextStatus) => onRequestStatusChange?.(workOrder, nextStatus)} disabled={!isRegistered}>
                <SelectTrigger className="mt-2 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{SALES_STATUSES.map((status) => <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Probability</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input type="number" min="0" max="100" value={workOrder.probability ?? ""} disabled={!isRegistered} onChange={(event) => update({ probability: Math.max(0, Math.min(100, Number(event.target.value) || 0)) })} className="h-9" />
                <span className="text-sm text-gray-500">%</span>
              </div>
              {probabilityIsSet ? (
                <div className="mt-2 text-xs text-gray-500">Weighted contribution: <span className="font-semibold text-gray-700">{money(weightedContribution)}</span></div>
              ) : suggestedProbability != null && !closeout ? (
                <button type="button" disabled={!isRegistered} onClick={() => update({ probability: suggestedProbability })} className="mt-2 text-left text-xs font-medium text-blue-700 hover:underline disabled:cursor-not-allowed disabled:text-gray-400">
                  Suggested starting point for {statusLabel}: {suggestedProbability}% · Apply
                </button>
              ) : (
                <div className="mt-2 text-xs text-gray-400">No probability set.</div>
              )}
            </div>
            <div className="rounded-xl border bg-white p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Sales Owner</Label>
              <Select value={workOrder.sales_rep || "__unassigned__"} onValueChange={(value) => update({ sales_rep: value === "__unassigned__" ? "" : value })} disabled={!isRegistered}>
                <SelectTrigger className="mt-2 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unassigned__">Unassigned</SelectItem>
                  {workOrder.sales_rep && !users.some((user) => user.full_name === workOrder.sales_rep) && <SelectItem value={workOrder.sales_rep}>{workOrder.sales_rep}</SelectItem>}
                  {users.filter((user) => user.full_name).map((user) => <SelectItem key={user.email} value={user.full_name}>{user.full_name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <Label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lead Source</Label>
              <Select value={workOrder.lead_source || "__unspecified__"} onValueChange={(value) => update({ lead_source: value === "__unspecified__" ? "" : value })} disabled={!isRegistered}>
                <SelectTrigger className="mt-2 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__unspecified__">Unspecified</SelectItem>
                  {workOrder.lead_source && !leadSources.includes(workOrder.lead_source) && <SelectItem value={workOrder.lead_source}>{workOrder.lead_source}</SelectItem>}
                  {leadSources.filter(Boolean).map((source) => <SelectItem key={source} value={source}>{source}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-gray-800"><CalendarClock className="h-4 w-4 text-orange-600" />Next Action</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div><Label className="text-xs text-gray-500">Follow-up date</Label><Input type="date" value={workOrder.follow_up_date || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ follow_up_date: event.target.value })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-gray-500">Expected close</Label><Input type="date" value={workOrder.expected_close_date || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ expected_close_date: event.target.value })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-gray-500">Task deadline</Label><Input type="date" value={workOrder.current_task_deadline || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ current_task_deadline: event.target.value })} className="mt-1 h-9" /></div>
                <div><Label className="text-xs text-gray-500">Task owner</Label><div className="mt-1 h-9 rounded-md border px-3 py-2 text-sm text-gray-700">{workOrder.current_task_assigned_to || "Unassigned"}</div></div>
                <div className="sm:col-span-2"><Label className="text-xs text-gray-500">Next action / task</Label><Input value={workOrder.current_task_description || ""} disabled={!isRegistered || closeout} onChange={(event) => update({ current_task_description: event.target.value })} placeholder="What needs to happen next?" className="mt-1 h-9" /></div>
              </div>
              {!closeout && !workOrder.follow_up_date && !workOrder.current_task_deadline && <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">This opportunity has no scheduled next action.</div>}
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-gray-800"><Contact className="h-4 w-4 text-blue-600" />Customer & Contact</div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><div className="text-xs text-gray-400">Primary contact</div><div className="font-medium text-gray-800">{workOrder.contact_name || workOrder.representative || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Phone</div><div className="font-medium text-gray-800">{workOrder.contact_phone || "—"}</div></div>
                <div className="sm:col-span-2"><div className="text-xs text-gray-400">Email</div><div className="break-all font-medium text-gray-800">{workOrder.contact_email || "—"}</div></div>
                <div className="sm:col-span-2"><div className="text-xs text-gray-400">Install location</div><div className="font-medium text-gray-800">{workOrder.install_location || [workOrder.billing_address, workOrder.township_city].filter(Boolean).join(", ") || "—"}</div></div>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-gray-800"><FileText className="h-4 w-4 text-indigo-600" />Quote & Closeout</div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><div className="text-xs text-gray-400">Estimate / invoice</div><div className="font-medium text-gray-800">{workOrder.corbridge_invoice_number || workOrder.est_inv_at || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Estimate sent</div><div className="font-medium text-gray-800">{workOrder.date_estimate_sent || workOrder.quote_date || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Expected close</div><div className="font-medium text-gray-800">{workOrder.expected_close_date || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Close date</div><div className="font-medium text-gray-800">{workOrder.close_date || "—"}</div></div>
                <div><div className="text-xs text-gray-400">Lost reason</div><div className={`font-medium ${workOrder.sales_status === "lost" ? "text-red-700" : "text-gray-800"}`}>{workOrder.lost_reason || "—"}</div></div>
              </div>
              {workOrder.corbridge_link && <Button variant="outline" size="sm" className="mt-3" asChild><a href={workOrder.corbridge_link} target="_blank" rel="noreferrer">Open CoreBridge <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
            </div>

            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-center gap-2 font-semibold text-gray-800"><FolderOpen className="h-4 w-4 text-violet-600" />Files & Notes</div>
              <div className="mt-3 text-sm text-gray-600">{workOrder.files?.length || 0} uploaded file{workOrder.files?.length === 1 ? "" : "s"}</div>
              {workOrder.google_drive_folder_url && <Button variant="outline" size="sm" className="mt-2" asChild><a href={workOrder.google_drive_folder_url} target="_blank" rel="noreferrer">Open Drive Folder <ExternalLink className="ml-1 h-3 w-3" /></a></Button>}
              <div className="mt-3 space-y-2">
                {clientNotes.length === 0 ? <div className="text-xs text-gray-400">No recent client/admin notes.</div> : clientNotes.map((note) => (
                  <div key={note.id || note.timestamp} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-700">
                    <div>{note.text}</div>
                    <div className="mt-1 text-[11px] text-gray-400">{note.created_by || "Unknown"}{note.timestamp ? ` · ${new Date(note.timestamp).toLocaleDateString()}` : ""}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-white p-4">
            <div className="flex items-center gap-2 font-semibold text-gray-800"><FileClock className="h-4 w-4 text-slate-600" />Sales Activity</div>
            <p className="mt-1 text-xs text-gray-500">Verified saved field changes. Older imported/legacy activity may be incomplete.</p>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {historyLoading ? <div className="flex items-center justify-center py-8 text-sm text-gray-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading history…</div> : historyError ? <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{historyError}</div> : history.length === 0 ? <div className="py-6 text-center text-sm text-gray-400">No captured sales changes yet.</div> : history.map((entry) => (
                <div key={entry.id} className="flex gap-3 rounded-lg border border-gray-100 px-3 py-2">
                  <UserRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800">{FIELD_LABELS[entry.field_name] || entry.field_name} changed</div>
                    <div className="mt-0.5 text-xs text-gray-500"><span className="line-through">{displayValue(entry.field_name, entry.old_value)}</span> → <span className="font-medium text-gray-700">{displayValue(entry.field_name, entry.new_value)}</span></div>
                    <div className="mt-1 text-[11px] text-gray-400">{entry.changed_by_name || entry.changed_by_email || "Unknown"}{entry.created_date ? ` · ${format(new Date(entry.created_date), "MMM d, yyyy h:mm a")}` : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
