import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { buildStatement } from "@/components/statements/statementModel";
import StatementView from "@/components/statements/StatementView";
import {
  Receipt,
  ShieldCheck,
  Clock,
  Ban,
  FileText,
  Hammer,
  MessageSquare,
  LayoutGrid,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Megaphone,
  X,
} from "lucide-react";

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const todayStamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const fmtStamp = (stamp) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(stamp || "").trim());
  if (!m) return String(stamp || "—");
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString();
};

const ANNOUNCEMENT_DISMISS_KEY = "ccs_portal_dismissed_announcements";

const INVOICE_STYLES = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-800",
  partially_paid: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-red-100 text-red-800",
  void: "bg-slate-100 text-slate-500",
};

const QUOTE_STYLES = {
  sent: "bg-blue-100 text-blue-800",
  approved: "bg-emerald-100 text-emerald-800",
  draft: "bg-slate-100 text-slate-700",
  calculated: "bg-slate-100 text-slate-700",
};

const JOB_STYLES = {
  open: { label: "Open", cls: "bg-slate-100 text-slate-700" },
  in_progress: { label: "In progress", cls: "bg-blue-100 text-blue-800" },
  scheduled: { label: "Scheduled", cls: "bg-indigo-100 text-indigo-800" },
  on_hold: { label: "On hold", cls: "bg-amber-100 text-amber-800" },
  completed: { label: "Completed", cls: "bg-emerald-100 text-emerald-800" },
  cancelled: { label: "Cancelled", cls: "bg-slate-100 text-slate-500" },
};

const JOB_STEPS = ["open", "in_progress", "completed"];

const KIND_LABELS = {
  message: null,
  estimate_approved: "Quote approved",
  estimate_revision_requested: "Revision requested",
  payment_notice: "Payment notice",
  job_revision_requested: "Job change requested",
  system: null,
};

const call = (body) =>
  base44.functions.invoke("customerPortalAction", body).then((r) => {
    const data = r?.data || r;
    if (!data?.success) throw new Error(data?.error || "Request failed.");
    return data;
  });

function InvoiceView({ invoice, payments }) {
  return (
    <>
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">{invoice.invoice_number || "Invoice"}</h2>
            <p className="mt-1 text-sm text-slate-500">{invoice.customer_display_name}</p>
            {invoice.description && <p className="mt-2 max-w-xl text-sm text-slate-600">{invoice.description}</p>}
          </div>
          <div className="text-right">
            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${INVOICE_STYLES[invoice.status] || INVOICE_STYLES.draft}`}>
              {(invoice.status || "draft").replace(/_/g, " ")}
            </span>
            <p className="mt-3 text-3xl font-bold text-slate-900">{money(invoice.total)}</p>
            {Number(invoice.balance_due) > 0 && (
              <p className="mt-1 text-sm font-medium text-red-700">{money(invoice.balance_due)} due</p>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 sm:grid-cols-4">
          <div><p className="text-xs text-slate-500">Issued</p><p className="mt-0.5 text-sm font-medium text-slate-800">{invoice.issue_date || "—"}</p></div>
          <div>
            <p className="text-xs text-slate-500">Due</p>
            <p className="mt-0.5 flex items-center gap-1 text-sm font-medium text-slate-800">
              {invoice.due_date || "—"}
              {Number(invoice.balance_due) > 0 && invoice.due_date && new Date(invoice.due_date) < new Date() && <Clock className="h-3.5 w-3.5 text-red-500" />}
            </p>
          </div>
          <div><p className="text-xs text-slate-500">Paid to date</p><p className="mt-0.5 text-sm font-medium text-slate-800">{money(invoice.amount_paid)}</p></div>
          <div><p className="text-xs text-slate-500">Billing</p><p className="mt-0.5 text-sm font-medium text-slate-800">{(invoice.billing_type || "standard").replace(/_/g, " ")}</p></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Qty</th>
              <th className="px-4 py-3 text-right">Rate</th>
              <th className="px-4 py-3 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.line_items || []).map((item, index) => (
              <tr key={index} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 text-slate-800">{item.description || "Item"}</td>
                <td className="px-4 py-3 text-right text-slate-600">{Number(item.quantity) || 0}</td>
                <td className="px-4 py-3 text-right text-slate-600">{money(item.unit_price)}</td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{money(item.amount)}</td>
              </tr>
            ))}
            {(!invoice.line_items || invoice.line_items.length === 0) && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">No line items on this invoice.</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td colSpan={3} className="px-4 py-2.5 text-right text-sm text-slate-500">Subtotal</td>
              <td className="px-4 py-2.5 text-right text-sm font-medium">{money(invoice.subtotal)}</td>
            </tr>
            {Number(invoice.tax) > 0 && (
              <tr className="bg-slate-50">
                <td colSpan={3} className="px-4 py-2.5 text-right text-sm text-slate-500">Tax</td>
                <td className="px-4 py-2.5 text-right text-sm font-medium">{money(invoice.tax)}</td>
              </tr>
            )}
            <tr className="bg-slate-50">
              <td colSpan={3} className="px-4 py-2.5 text-right font-semibold text-slate-900">Total</td>
              <td className="px-4 py-2.5 text-right font-semibold text-slate-900">{money(invoice.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {(payments || []).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-900">Payments received</h3>
          <ul className="mt-3 divide-y divide-slate-100">
            {payments.map((p, index) => (
              <li key={index} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-600">{p.paid_at || "—"} · {(p.method || "payment").replace(/_/g, " ")}</span>
                <span className="font-medium text-emerald-700">{money(p.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

function QuoteCard({ quote, onRespond, busy }) {
  const [mode, setMode] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  const respondable = quote.can_respond;
  const sections = Array.isArray(quote.sections) ? quote.sections : [];
  // Proof-approval / payment terms render only when the estimate payload
  // carries a terms field (optional-chained — absent keys stay hidden).
  const quoteTerms = [quote?.proof_approval_terms, quote?.terms, quote?.payment_terms, quote?.quote_terms_conditions]
    .find((v) => typeof v === "string" && v.trim()) || "";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Quote {quote.estimate_number}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{quote.quote_title || quote.project_name || "Estimate"}</h3>
          {quote.status === "sent" && quote.quote_valid_until ? (
            <span className={`mt-1 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
              todayStamp() > quote.quote_valid_until ? "bg-red-100 text-red-700" : "bg-blue-50 text-blue-700"
            }`}>
              <Clock className="h-3 w-3" />
              {todayStamp() > quote.quote_valid_until ? "Expired — request a revision" : `Quote valid until ${fmtStamp(quote.quote_valid_until)}`}
            </span>
          ) : (
            quote.quote_valid_days > 0 && <p className="mt-0.5 text-xs text-slate-400">Valid {quote.quote_valid_days} days</p>
          )}
        </div>
        <div className="text-right">
          <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${QUOTE_STYLES[quote.status] || QUOTE_STYLES.draft}`}>
            {(quote.status || "draft").replace(/_/g, " ")}
          </span>
          {Number(quote.quote_total) > 0 && <p className="mt-2 text-2xl font-bold text-slate-900">{money(quote.quote_total)}</p>}
        </div>
      </div>
      {sections.length > 0 && (
        <div className="mt-3">
          <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800">
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Hide" : "View"} quote details
          </button>
          {open && (
            <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              <ul className="divide-y divide-slate-100">
                {sections.map((s, i) => (
                  <li key={s.section_key || i} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800">{s.name}{s.quantity > 1 ? ` × ${s.quantity}` : ""}</p>
                      {s.description && <p className="mt-0.5 text-xs text-slate-500 whitespace-pre-wrap">{s.description}</p>}
                      {s.decision && (
                        <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${s.decision === "accepted" ? "bg-emerald-100 text-emerald-800" : s.decision === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                          {s.decision === "accepted" ? "Accepted" : s.decision === "rejected" ? "Declined" : "Question asked"}
                        </span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">{money(s.amount)}</span>
                      {quote.can_respond && quote.section_acceptance_mode !== false && s.section_key && !s.decision && (
                        <span className="flex gap-1">
                          <button type="button" onClick={() => onRespond(quote, "accepted", "", { key: s.section_key, label: s.name })} disabled={busy} title="Accept this section" className="rounded-md border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-100">✓</button>
                          <button type="button" onClick={() => onRespond(quote, "rejected", "", { key: s.section_key, label: s.name })} disabled={busy} title="Decline this section" className="rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-100">✗</button>
                          <button type="button" onClick={() => onRespond(quote, "question", "", { key: s.section_key, label: s.name })} disabled={busy} title="Ask about this section" className="rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 hover:bg-amber-100">?</button>
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quote total</span>
                <span className="text-sm font-bold text-slate-900">{money(quote.quote_total)}</span>
              </div>
            </div>
          )}
        </div>
      )}
      {respondable && !mode && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode("approve")} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
            <CheckCircle2 className="h-4 w-4" />Approve quote
          </button>
          <button type="button" onClick={() => setMode("changes")} disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            Request changes
          </button>
        </div>
      )}
      {respondable && mode === "approve" && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-medium text-emerald-900">Approve {quote.estimate_number || "this quote"} for {money(quote.quote_total)}?</p>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Optional note for the team…"
            className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRespond(quote, "approve", note)} disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Confirm approval
            </button>
            <button type="button" onClick={() => { setMode(""); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
      {respondable && mode === "changes" && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">What should change on this quote?</p>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Describe the revisions you'd like…"
            className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRespond(quote, "request_changes", note)} disabled={busy || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request
            </button>
            <button type="button" onClick={() => onRespond(quote, "declined", note)} disabled={busy || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              title="Decline this quote — a reason is required">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Decline quote
            </button>
            <button type="button" onClick={() => { setMode(""); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
      {quote.status === "approved" && (
        <p className="mt-4 flex items-center gap-1.5 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />Approved — thank you. We'll take it from here.</p>
      )}
      {quoteTerms && (
        <p className="mt-3 whitespace-pre-line text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Terms:</span> {quoteTerms}
        </p>
      )}
    </div>
  );
}

function JobCard({ job, onRequestChange, busy }) {
  const style = JOB_STYLES[job.status] || { label: (job.status || "open").replace(/_/g, " "), cls: "bg-slate-100 text-slate-700" };
  const stepIndex = JOB_STEPS.indexOf(job.status);
  const progress = job.task_progress;
  const pct = progress && progress.total ? Math.round((progress.completed / progress.total) * 100) : (job.status === "completed" ? 100 : stepIndex > 0 ? 50 : 0);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const active = !["completed", "cancelled"].includes(job.status);
  // Deposit + terms surface only when the portal payload carries them — the
  // concurrent WO deposit fields (deposit_required/deposit_amount) and any
  // proof-approval terms flow through automatically once jobPortalView
  // returns them; until then these stay undefined and nothing renders.
  const depositAmount = Number(job?.deposit_amount) || Number(job?.deposit_total) || 0;
  const depositPercent = Number(job?.deposit_percent) || 0;
  const depositPaid = Number(job?.deposit_paid) || Number(job?.deposit_amount_paid) || 0;
  const depositDue = job?.deposit_required === true || depositAmount > 0 || depositPercent > 0;
  const jobTerms = [job?.proof_approval_terms, job?.terms, job?.terms_and_conditions]
    .find((v) => typeof v === "string" && v.trim()) || "";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{job.work_order_number || "Job"}</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">{job.title || "Work order"}</h3>
        </div>
        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${style.cls}`}>{style.label}</span>
      </div>
      <div className="mt-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div className={`h-full rounded-full ${job.status === "completed" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${Math.max(4, pct)}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[11px] text-slate-500">
          <span>Started</span><span>In progress</span><span>Complete</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
        {job.install_date && <span>Install: <span className="font-medium text-slate-700">{job.install_date}</span></span>}
        {job.due_date && <span>Due: <span className="font-medium text-slate-700">{job.due_date}</span></span>}
        {job.install_location && <span>Site: <span className="font-medium text-slate-700">{job.install_location}</span></span>}
        {progress && <span>Tasks: <span className="font-medium text-slate-700">{progress.completed}/{progress.total}</span></span>}
      </div>
      {depositDue && (
        <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-800">
          Deposit required{depositAmount > 0 ? `: ${money(depositAmount)}` : depositPercent > 0 ? `: ${depositPercent}%` : ""}
          {depositPaid > 0 ? ` · ${money(depositPaid)} received` : ""}
        </div>
      )}
      {jobTerms && (
        <p className="mt-2 whitespace-pre-line text-[11px] text-slate-500">
          <span className="font-semibold text-slate-600">Terms:</span> {jobTerms}
        </p>
      )}
      {active && onRequestChange && !changing && (
        <button type="button" onClick={() => setChanging(true)} disabled={busy}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Request a change to this job
        </button>
      )}
      {active && changing && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-medium text-amber-900">What should change on this job? We'll draft a change order for review.</p>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Move the install date, swap the panel color, add a vinyl banner…"
            className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={() => onRequestChange(job, note)} disabled={busy || !note.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send request
            </button>
            <button type="button" onClick={() => { setChanging(false); setNote(""); }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function InvoiceRow({ invoice, payments, onNotice, busy }) {
  const [open, setOpen] = useState(false);
  const [noticing, setNoticing] = useState(false);
  const [note, setNote] = useState("");
  const due = Number(invoice.balance_due) > 0;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center justify-between gap-3 p-4 text-left">
        <div>
          <p className="font-semibold text-slate-900">{invoice.invoice_number || "Invoice"}</p>
          <p className="text-xs text-slate-500">{invoice.issue_date ? `Issued ${invoice.issue_date}` : "Draft"}{invoice.due_date ? ` · due ${invoice.due_date}` : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="font-semibold text-slate-900">{money(invoice.total)}</p>
            {due && <p className="text-xs font-medium text-red-700">{money(invoice.balance_due)} due</p>}
          </div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${INVOICE_STYLES[invoice.status] || INVOICE_STYLES.draft}`}>
            {(invoice.status || "draft").replace(/_/g, " ")}
          </span>
          {open ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <InvoiceView invoice={invoice} payments={payments} />
          {due && !noticing && (
            <button type="button" onClick={() => setNoticing(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
              <AlertCircle className="h-4 w-4" />Let us know a payment is on the way
            </button>
          )}
          {due && noticing && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm font-medium text-blue-900">Tell us how you're paying (optional):</p>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Check #1042 mailed today, ACH tomorrow…"
                className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm" />
              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => { onNotice(invoice, note); setNoticing(false); setNote(""); }} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Send notice
                </button>
                <button type="button" onClick={() => setNoticing(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Thread({ messages, onSend, busy, customerName }) {
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState(null);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages.length]);
  const send = () => {
    const text = draft.trim();
    if (!text && !attachment?.base64) return;
    onSend(text, attachment);
    setDraft("");
    setAttachment(null);
  };
  return (
    <div className="flex min-h-[420px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No messages yet — send one below and we'll reply here.
          </div>
        )}
        {messages.map((m) => {
          const mine = m.author_side === "customer";
          const label = KIND_LABELS[m.kind];
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                mine ? "bg-blue-600 text-white" : m.author_side === "system" ? "bg-slate-100 text-slate-600" : "bg-slate-100 text-slate-800"
              }`}>
                {label && <p className={`mb-0.5 text-[10px] font-bold uppercase tracking-wide ${mine ? "text-blue-200" : "text-slate-500"}`}>{label}</p>}
                {!mine && m.author_side === "staff" && <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">{m.author_name || "CCS Signage"}</p>}
                {m.related_label && <p className={`mb-0.5 text-[11px] ${mine ? "text-blue-200" : "text-slate-500"}`}>Re: {m.related_label}</p>}
                <p className="whitespace-pre-wrap">{m.body}</p>
                {m.attachment_url && (
                  <a href={m.attachment_url} target="_blank" rel="noreferrer" className={`mt-1 inline-flex items-center gap-1 text-[11px] underline ${mine ? "text-blue-100" : "text-blue-600"}`}>
                    {m.attachment_name || "Attachment"}
                  </a>
                )}
                <p className={`mt-1 text-[10px] ${mine ? "text-blue-200" : "text-slate-400"}`}>
                  {m.created_date ? new Date(m.created_date).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <div className="border-t border-slate-100 p-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
          <textarea rows={2} value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={`Message CCS Signage about your ${customerName ? "account" : "project"}…`}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none" />
          <label className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 cursor-pointer hover:border-blue-400">
            <input type="file" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) { setAttachment(null); return; }
              const reader = new FileReader();
              reader.onload = () => setAttachment({ name: file.name, mime: file.type || "application/octet-stream", base64: String(reader.result || "").split(",")[1] || "" });
              reader.readAsDataURL(file);
            }} />
            {attachment ? attachment.name : "Attach file"}
            {attachment && <button type="button" onClick={(e) => { e.preventDefault(); setAttachment(null); }} className="ml-1 text-slate-400 hover:text-red-500">×</button>}
          </label>
          </div>
          <button type="button" onClick={send} disabled={busy || (!draft.trim() && !attachment)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}

const TABS = [
  { key: "overview", label: "Overview", icon: LayoutGrid },
  { key: "quotes", label: "Quotes", icon: FileText },
  { key: "jobs", label: "Jobs", icon: Hammer },
  { key: "invoices", label: "Invoices", icon: Receipt },
  { key: "messages", label: "Messages", icon: MessageSquare },
];

export default function CustomerPortal() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token")?.trim() || "", []);
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [statement, setStatement] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(ANNOUNCEMENT_DISMISS_KEY) || "[]")); }
    catch { return new Set(); }
  });
  const msgKeyRef = useRef(crypto.randomUUID());

  const load = useCallback(async () => {
    try {
      const data = await call({ action: "bootstrap", token });
      setState({ loading: false, data, error: "" });
    } catch (error) {
      setState({ loading: false, data: null, error: error?.message || "This portal link is invalid, expired, or revoked." });
    }
  }, [token]);

  useEffect(() => {
    document.title = "Customer Portal | CCS Signage";
    if (!token) {
      setState({ loading: false, data: null, error: "This portal link is incomplete. Please use the link exactly as it was sent to you." });
      return;
    }
    load();
  }, [token, load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const data = state.data;
  const isCustomer = data?.kind === "customer";
  const estimates = data?.estimates || [];
  const jobs = data?.jobs || [];
  const invoices = data?.invoices || [];
  const messages = data?.messages || [];
  const openBalance = invoices.reduce((sum, i) => sum + (Number(i.balance_due) || 0), 0);
  const openInvoices = invoices
    .filter((i) => Number(i.balance_due) > 0)
    .slice()
    .sort((a, b) => String(a.issue_date || "").localeCompare(String(b.issue_date || "")));
  const awaiting = estimates.filter((e) => e.can_respond);
  const activeJobs = jobs.filter((j) => !["completed", "cancelled"].includes(j.status));
  const unreadFromStaff = data?.unread_for_customer || 0;
  const announcements = (data?.announcements || []).filter((a) => !dismissed.has(a.title));
  const paymentNotices = messages.filter((m) => m.kind === "payment_notice").slice(-5).reverse();

  const dismissAnnouncement = (title) => {
    setDismissed((prev) => {
      const next = new Set([...prev, title]);
      try { localStorage.setItem(ANNOUNCEMENT_DISMISS_KEY, JSON.stringify([...next])); } catch { /* storage unavailable */ }
      return next;
    });
  };

  // Statement of account: the portal bootstrap already carries invoices +
  // payments_by_invoice, so the statement builds inline via the shared pure
  // model — the staff invoicingAction statement path needs a session token
  // a portal link cannot supply.
  const openStatement = () => {
    const payments = Object.entries(data?.payments_by_invoice || {}).flatMap(([invoiceId, rows]) =>
      (Array.isArray(rows) ? rows : []).map((p) => ({
        invoice_id: invoiceId,
        paid_date: String(p?.paid_at ?? "").slice(0, 10),
        amount: Number(p?.amount) || 0,
        method: p?.method || "other",
        status: "recorded",
      })));
    setStatement(buildStatement({
      customer: { company_name: data?.customer?.name, terms: data?.customer?.terms },
      invoices,
      payments,
      asOfDate: todayStamp(),
    }));
  };

  const respond = async (quote, decision, note, section) => {
    setBusy(true);
    try {
      const payload = { action: "estimate_respond", token, estimate_id: quote.id, decision, note, creation_request_key: crypto.randomUUID() };
      if (section?.key) { payload.section_key = section.key; payload.section_label = section.label || ""; }
      await call(payload);
      setToast(section?.key ? (decision === "accepted" ? "Section accepted — thank you!" : decision === "rejected" ? "Section declined — noted." : "Question sent.") : decision === "approve" ? "Quote approved — thank you!" : "Revision request sent.");
      await load();
    } catch (error) {
      setToast(error?.message || "Could not submit your response.");
    } finally { setBusy(false); }
  };

  const notice = async (invoice, note) => {
    setBusy(true);
    try {
      await call({ action: "payment_notice", token, invoice_id: invoice.id, note, creation_request_key: crypto.randomUUID() });
      setToast("Payment notice sent — thank you.");
      await load();
    } catch (error) {
      setToast(error?.message || "Could not send the notice.");
    } finally { setBusy(false); }
  };

  const requestJobChange = async (job, note) => {
    setBusy(true);
    try {
      const d = await call({ action: "request_job_revision", token, work_order_id: job.id, note, creation_request_key: crypto.randomUUID() });
      setToast(`Change request sent${d?.change_order_number ? ` — ${d.change_order_number} drafted for review` : ""}.`);
      await load();
    } catch (error) {
      setToast(error?.message || "Could not send the change request.");
    } finally { setBusy(false); }
  };

  const sendMessage = async (text, attachment) => {
    setBusy(true);
    try {
      const payload = { action: "post_message", token, body: text, creation_request_key: msgKeyRef.current };
      if (attachment?.base64) {
        payload.attachment_name = attachment.name;
        payload.attachment_mime = attachment.mime;
        payload.attachment_base64 = attachment.base64;
      }
      await call(payload);
      msgKeyRef.current = crypto.randomUUID();
      await load();
    } catch (error) {
      setToast(error?.message || "Message could not be sent.");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:py-10">
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-900 text-white">
              <Receipt className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">CCS Signage</h1>
              <p className="text-sm text-slate-500">
                {isCustomer ? `Customer portal — ${data?.customer?.name || "your account"}` : "Customer portal"}
              </p>
            </div>
          </div>
          {!state.loading && !state.error && (
            <button type="button" onClick={() => { setState((s) => ({ ...s, loading: true })); load(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <RefreshCw className="h-3.5 w-3.5" />Refresh
            </button>
          )}
        </div>

        {!state.loading && announcements.length > 0 && announcements.map((a) => (
          <div key={a.title} className={`flex gap-3 rounded-2xl border p-4 ${a.priority === "urgent" || a.priority === "high" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <Megaphone className={`mt-0.5 h-5 w-5 shrink-0 ${a.priority === "urgent" || a.priority === "high" ? "text-red-500" : "text-amber-500"}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{a.title}</p>
              {a.message && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{a.message}</p>}
              {a.image_url && <img src={a.image_url} alt="" className="mt-2 max-h-40 rounded-lg" />}
            </div>
            <button type="button" onClick={() => dismissAnnouncement(a.title)} className="h-fit rounded-lg p-1 text-slate-400 hover:bg-white/60 hover:text-slate-600" aria-label="Dismiss">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}

        {state.loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500">
            <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Loading your portal…
          </div>
        )}

        {!state.loading && state.error && (
          <div className="rounded-2xl border border-red-200 bg-white p-10 text-center">
            <Ban className="mx-auto mb-3 h-8 w-8 text-red-400" />
            <p className="font-medium text-slate-900">Link unavailable</p>
            <p className="mt-1 text-sm text-slate-500">{state.error}</p>
            <p className="mt-4 text-xs text-slate-400">If you believe this is a mistake, contact CCS Signage for a new link.</p>
          </div>
        )}

        {!state.loading && data && !isCustomer && (
          <>
            {data.kind === "staff_view" && data.estimate && (
              <>
                <div className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                  <span className="font-semibold">Shared read-only view</span> — this link opens one quote, view-only. Contact CCS Signage with any questions or change requests.
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-slate-900">{data.estimate.estimate_number || "Estimate"}</p>
                      <p className="text-sm text-slate-600">{data.estimate.project_name || data.estimate.quote_title || "Project"}</p>
                      {data.estimate.client_name && <p className="mt-0.5 text-xs text-slate-500">{data.estimate.client_name}</p>}
                    </div>
                    <div className="text-right">
                      {data.estimate.quote_total != null && <p className="text-lg font-bold text-slate-900">{money(data.estimate.quote_total)}</p>}
                      <p className="text-xs text-slate-500">{data.estimate.status || ""}{data.estimate.quote_expiration_date ? ` · valid until ${data.estimate.quote_expiration_date}` : ""}</p>
                    </div>
                  </div>
                  {Array.isArray(data.estimate.sections) && data.estimate.sections.length > 0 && (
                    <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
                      {data.estimate.sections.map((s, i) => (
                        <div key={i} className="flex items-center justify-between gap-3 py-2">
                          <span className="text-sm text-slate-700">{s.name || s.section_label || `Section ${i + 1}`}</span>
                          {s.quote_total != null && <span className="text-sm font-semibold text-slate-800">{money(s.quote_total)}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Read-only view — this page reflects the live estimate.</span>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>Print / PDF</Button>
                </div>
              </>
            )}
            {data.kind !== "staff_view" && (
            <InvoiceView invoice={data.invoice} payments={data.payments} />
            )}
            {Number(data.invoice?.balance_due) > 0 && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="text-sm font-medium text-blue-900">Balance due: <span className="font-bold">{money(data.invoice.balance_due)}</span></p>
                <p className="mt-1 text-xs text-blue-700">To pay, contact CCS Signage and reference invoice {data.invoice.invoice_number}.</p>
              </div>
            )}
            {data.kind !== "staff_view" && (
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Read-only view — this page reflects live billing records.</span>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print / PDF</Button>
            </div>
            )}
          </>
        )}

        {!state.loading && isCustomer && (
          <>
            <div className="flex flex-wrap gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm">
              {TABS.map((t) => {
                const Icon = t.icon;
                const badge = t.key === "messages" && unreadFromStaff > 0 ? unreadFromStaff : t.key === "quotes" && awaiting.length > 0 ? awaiting.length : 0;
                return (
                  <button type="button" key={t.key} onClick={() => setTab(t.key)}
                    className={`relative inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                      tab === t.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
                    }`}>
                    <Icon className="h-4 w-4" />{t.label}
                    {badge > 0 && (
                      <span className="ml-0.5 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">{badge}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {toast && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-800">{toast}</div>
            )}

            {tab === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Quotes awaiting you</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{awaiting.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Active jobs</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{activeJobs.length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Open invoices</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{invoices.filter((i) => Number(i.balance_due) > 0).length}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <p className="text-xs text-slate-500">Balance due</p>
                    <p className="mt-1 text-2xl font-bold text-slate-900">{money(openBalance)}</p>
                  </div>
                </div>

                {awaiting.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">
                      {awaiting.length === 1 ? "A quote is waiting for your response." : `${awaiting.length} quotes are waiting for your response.`}
                    </p>
                    <button type="button" onClick={() => setTab("quotes")} className="mt-2 text-sm font-semibold text-amber-800 underline">Review quotes →</button>
                  </div>
                )}

                {paymentNotices.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900">Your recent notices</h3>
                    <ul className="mt-3 divide-y divide-slate-100">
                      {paymentNotices.map((m) => (
                        <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">{m.related_label || "Payment notice"}</p>
                            {m.body && <p className="truncate text-xs text-slate-500">{m.body}</p>}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="text-[11px] text-slate-400">
                              {m.created_date ? new Date(m.created_date).toLocaleDateString() : ""}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${m.read_by_staff ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                              {m.read_by_staff ? "Received" : "Sent"}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-sm font-semibold text-slate-900">Recent activity</h3>
                  {messages.length === 0 && <p className="mt-2 text-sm text-slate-400">Nothing yet — activity will appear here as your project moves.</p>}
                  <ul className="mt-3 space-y-2.5">
                    {messages.slice(-6).reverse().map((m) => (
                      <li key={m.id} className="flex items-start gap-2.5 text-sm">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${m.author_side === "customer" ? "bg-blue-500" : "bg-slate-400"}`} />
                        <div>
                          <p className="text-slate-700">
                            <span className="font-medium">{KIND_LABELS[m.kind] || (m.author_side === "customer" ? "You" : m.author_name || "CCS Signage")}</span>
                            {m.kind === "message" ? `: ${m.body.slice(0, 90)}${m.body.length > 90 ? "…" : ""}` : ` ${m.related_label ? `— ${m.related_label}` : ""}`}
                          </p>
                          <p className="text-[11px] text-slate-400">{m.created_date ? new Date(m.created_date).toLocaleString() : ""}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                {data?.customer && (data.customer.name || data.customer.contact_name || data.customer.email) && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <h3 className="text-sm font-semibold text-slate-900">Your account</h3>
                    <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                      {data.customer.name && (
                        <div><dt className="text-xs text-slate-500">Company</dt><dd className="mt-0.5 font-medium text-slate-800">{data.customer.name}</dd></div>
                      )}
                      {data.customer.contact_name && (
                        <div><dt className="text-xs text-slate-500">Contact</dt><dd className="mt-0.5 font-medium text-slate-800">{data.customer.contact_name}</dd></div>
                      )}
                      {data.customer.email && (
                        <div><dt className="text-xs text-slate-500">Email</dt><dd className="mt-0.5 font-medium text-slate-800">{data.customer.email}</dd></div>
                      )}
                    </dl>
                    <p className="mt-3 text-[11px] text-slate-400">Account details are maintained by CCS Signage — message us if anything looks off.</p>
                  </div>
                )}
              </div>
            )}

            {tab === "quotes" && (
              <div className="space-y-4">
                {estimates.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">No quotes shared with you yet.</div>
                )}
                {estimates.map((q) => <QuoteCard key={q.id} quote={q} onRespond={respond} busy={busy} />)}
              </div>
            )}

            {tab === "jobs" && (
              <div className="space-y-4">
                {jobs.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">No jobs on your account yet.</div>
                )}
                {jobs.map((j) => <JobCard key={j.id} job={j} onRequestChange={requestJobChange} busy={busy} />)}
              </div>
            )}

            {tab === "invoices" && (
              <div className="space-y-4">
                {/* Statements: open invoices + running balance. The printable
                    sheet reuses the staff StatementView overlay (Print + CSV)
                    built from portal bootstrap data — no staff session needed. */}
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">Statements</h3>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {openInvoices.length} open invoice{openInvoices.length === 1 ? "" : "s"} · open balance{" "}
                        <span className="font-semibold text-slate-800">{money(openBalance)}</span>
                      </p>
                    </div>
                    <button type="button" onClick={openStatement}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                      <FileText className="h-4 w-4" />Download statement
                    </button>
                  </div>
                  {openInvoices.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                            <th className="pb-1.5 pr-3">Issued</th>
                            <th className="pb-1.5 pr-3">Invoice</th>
                            <th className="pb-1.5 pr-3">Due</th>
                            <th className="pb-1.5 pr-3 text-right">Total</th>
                            <th className="pb-1.5 pr-3 text-right">Open</th>
                            <th className="pb-1.5 text-right">Running</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            let running = 0;
                            return openInvoices.map((i) => {
                              running += Number(i.balance_due) || 0;
                              return (
                                <tr key={i.id} className="border-b border-slate-50 last:border-0">
                                  <td className="py-1.5 pr-3 text-slate-500">{i.issue_date || "—"}</td>
                                  <td className="py-1.5 pr-3 font-medium text-slate-800">{i.invoice_number || "Invoice"}</td>
                                  <td className="py-1.5 pr-3 text-slate-500">{i.due_date || "—"}</td>
                                  <td className="py-1.5 pr-3 text-right text-slate-600">{money(i.total)}</td>
                                  <td className="py-1.5 pr-3 text-right font-medium text-red-700">{money(i.balance_due)}</td>
                                  <td className="py-1.5 text-right font-semibold text-slate-900">{money(running)}</td>
                                </tr>
                              );
                            });
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {invoices.length === 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-400">No invoices on your account yet.</div>
                )}
                {invoices.map((i) => (
                  <InvoiceRow key={i.id} invoice={i} payments={data.payments_by_invoice?.[i.id] || []} onNotice={notice} busy={busy} />
                ))}
              </div>
            )}

            {tab === "messages" && (
              <Thread messages={messages} onSend={sendMessage} busy={busy} customerName={data?.customer?.name} />
            )}

            {statement && (
              <StatementView
                statements={[statement]}
                company={{ company_name: data?.company?.name, company_logo_url: data?.company?.logo_url }}
                onClose={() => setStatement(null)}
              />
            )}

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" />Secure link · reflects live account records</span>
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}