import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { OpportunityActivity } from "@/api/gatedEntities";
import { EmptyState, RecordLink, StatusChip } from "@/components/kit";
import { ensureIdempotentEntityCreate, newCreationRequestKey } from "@/components/estimator/idempotentEntityCreate";
import { sendStaffEmail } from "@/components/comms/sendStaffEmail";
import {
  FOLLOWUP_KIND_META,
  FOLLOWUP_SECTIONS,
  findDueFollowups,
  groupDueFollowups,
} from "@/components/comms/followupModel";

// Due follow-up queue for the comms automation workflow. Purely prop-driven:
// the host page loads estimates (staffDataRead), invoices (invoicingAction
// list_invoices), OpportunityActivity rows, customers, and rules — this
// component renders the grouped queue and performs the three row actions.
//
// Send path: sendStaffEmail({ sessionToken, to, subject, body, kind }) — the
// session-authed staff email bridge that invokes sendGmail internally (the old
// sendEmail gateway is intentionally disabled). Only AFTER a confirmed send
// (or a Skip / Mark-done choice) do we append an OpportunityActivity log row
// through the same ensureIdempotentEntityCreate path CRM events use, so the
// follow-up can never be suggested twice. Every action row is written closed
// (completed_at + outcome) so it never enters the open CRM event queue, and
// carries details.followup_kind / details.followup_target_id markers that
// followupModel.followupLogMarker dedupes on.

const clean = (v) => String(v ?? "").trim();
const keyOf = (f) => `${f.kind}:${f.targetId}`;

const SECTION_TITLES = {
  quote_1: "Quote follow-ups — 1st touch",
  quote_2: "Quote follow-ups — 2nd touch",
  invoice_1: "Overdue invoices — 1st notice",
  invoice_2: "Overdue invoices — 2nd notice",
};

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const btn =
  "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";
const btnSend = `${btn} bg-violet-600 text-white hover:bg-violet-700`;
const btnGhost = `${btn} border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800`;

// Row action states render through the kit chip -- tone names come from
// statusTones' shared vocabulary (sky working, emerald done, red failed).
const STATUS_BADGE = {
  sending: { label: "Sending…", tone: "sky" },
  sent: { label: "Sent", tone: "emerald" },
  writing: { label: "Logging…", tone: "sky" },
  done: { label: "Done", tone: "slate" },
  failed: { label: "Failed", tone: "red" },
};

const DISPOSITION_SOURCE = {
  sent: "followup_automation",
  skipped: "followup_skip",
  manual_done: "followup_manual_done",
};

function FollowupRow({ item, defaultTo, actor, sessionToken, onChanged }) {
  const key = keyOf(item);
  // Editable draft — lazily seeded from the model suggestion so template
  // changes propagate until the user touches a field.
  const [draft, setDraft] = useState(null);
  const [row, setRow] = useState({ status: "idle", error: "" });
  const value = draft || {
    to: defaultTo || "",
    subject: item.suggestedSubject,
    body: item.suggestedBody,
  };
  const edit = (patch) => setDraft((d) => ({ ...(d || value), ...patch }));
  const busy = ["sending", "writing", "sent", "done"].includes(row.status);

  const writeLog = (disposition) =>
    ensureIdempotentEntityCreate({
      entity: OpportunityActivity,
      keyField: "creation_request_key",
      key: newCreationRequestKey("followup"),
      label: "Follow-up log",
      data: {
        event_type: "E-Mail: Follow Up",
        summary: clean(value.subject) || FOLLOWUP_KIND_META[item.kind].label,
        subject: clean(value.subject),
        notes: clean(value.body),
        contact_name: clean(item.contactName),
        contact_id: "",
        company_name: clean(item.customerName),
        customer_id: clean(item.customerId),
        opportunity_id: clean(item.opportunityId),
        work_order_id: clean(item.workOrderId),
        assigned_to: clean(actor),
        due_at: "",
        completed_at: new Date().toISOString(),
        outcome: disposition === "skipped" ? "cancelled" : "completed",
        // Entity enum allows manual/auto_followup/system only — the exact
        // workflow source is preserved inside details for dedupe + audit.
        source: "auto_followup",
        actor: clean(actor),
        details: {
          followup_kind: item.kind,
          followup_target_id: item.targetId,
          followup_target_ref: clean(item.targetRef),
          followup_disposition: disposition,
          followup_source: DISPOSITION_SOURCE[disposition] || "followup_automation",
          sent_to: disposition === "sent" ? clean(value.to) : "",
          days_overdue: item.daysOverdue,
          days_since_sent: item.daysSinceSent ?? "",
          days_past_due: item.daysPastDue ?? "",
        },
      },
    });

  const send = async () => {
    if (busy || row.status === "sending") return; // never double-send on retry
    const to = clean(value.to);
    if (!to.includes("@")) {
      setRow({ status: "failed", error: "Add a recipient email address first." });
      return;
    }
    setRow({ status: "sending", error: "" });
    try {
      // sendStaffEmail throws on backend {error} and maps a 404 /
      // missing-function response to "Email bridge is not deployed yet."
      await sendStaffEmail({
        sessionToken,
        to,
        subject: clean(value.subject),
        body: clean(value.body),
        kind: `followup:${item.kind}`,
        // Replies route to the staff member working the queue (actor is their
        // email); a non-email actor falls back to the SMTP_REPLY_TO default.
        replyTo: clean(actor).includes("@") ? clean(actor) : undefined,
      });
    } catch (e) {
      setRow({ status: "failed", error: e?.message || "Email could not be sent." });
      return;
    }
    // The email is out — a log failure must never flip this back to "failed"
    // (that would invite a double-send); it surfaces as a sent-state warning.
    try {
      await writeLog("sent");
    } catch (e) {
      setRow({
        status: "sent",
        error: `Email sent, but the log write failed: ${e?.message || "unknown error"}. Resolve the log before resending.`,
      });
      return;
    }
    setRow({ status: "sent", error: "" });
    onChanged?.();
  };

  const mark = async (disposition) => {
    if (busy) return;
    setRow({ status: "writing", error: "" });
    try {
      await writeLog(disposition);
    } catch (e) {
      setRow({ status: "failed", error: e?.message || "Could not log this follow-up." });
      return;
    }
    setRow({ status: "done", error: "" });
    onChanged?.();
  };

  const badge = STATUS_BADGE[row.status];
  const meta = FOLLOWUP_KIND_META[item.kind];
  const ageLine = item.target === "invoice"
    ? `due ${item.dueDate} · invoice ${item.daysPastDue}d past due`
    : `sent ${item.daysSinceSent}d ago`;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.customerId ? (
              <RecordLink
                kind="customer"
                id={item.customerId}
                className="truncate text-sm font-semibold"
              >
                {item.customerName || "Customer"}
              </RecordLink>
            ) : (
              <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                {item.customerName || "Customer"}
              </span>
            )}
            {item.targetId ? (
              <RecordLink
                kind={item.target === "invoice" ? "invoice" : "estimate"}
                id={item.targetId}
                className="text-xs"
              >
                {item.targetRef}
              </RecordLink>
            ) : (
              <span className="text-xs text-slate-500">{item.targetRef}</span>
            )}
            <StatusChip tone="red" size="sm">{item.daysOverdue}d overdue</StatusChip>
            {badge && <StatusChip tone={badge.tone} label={badge.label} size="sm" />}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            {meta.label} · follow-up due {item.dueDate} · {ageLine}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button className={btnSend} disabled={busy} onClick={send} title="Send via the sendStaffEmail bridge">
            {row.status === "sending" ? "Sending…" : "Send"}
          </button>
          <button className={btnGhost} disabled={busy} onClick={() => mark("skipped")}>Skip</button>
          <button className={btnGhost} disabled={busy} onClick={() => mark("manual_done")}>
            Mark done w/o email
          </button>
        </div>
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-[minmax(180px,260px)_1fr]">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">To</span>
          <input
            className={inputCls}
            placeholder="recipient@example.com"
            value={value.to}
            disabled={busy}
            onChange={(e) => edit({ to: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Subject</span>
          <input className={inputCls} value={value.subject} disabled={busy} onChange={(e) => edit({ subject: e.target.value })} />
        </label>
        <label className="flex flex-col gap-0.5 md:col-span-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Body</span>
          <textarea
            className={`${inputCls} min-h-[96px] font-normal leading-relaxed`}
            value={value.body}
            disabled={busy}
            onChange={(e) => edit({ body: e.target.value })}
          />
        </label>
      </div>

      {row.error && <div className="mt-1.5 text-[11px] text-rose-700 dark:text-rose-400">{row.error}</div>}
    </div>
  );
}

export default function FollowupQueue({
  estimates = [],
  invoices = [],
  activities = [],
  customers = [],
  rules,
  sessionToken,
  actor = "",
  onChanged,
  title = "Follow-up queue",
}) {
  const customersById = useMemo(
    () => new Map((customers || []).map((c) => [clean(c?.id), c])),
    [customers],
  );

  // Recipient resolution mirrors invoicingAction.email_invoice: the estimate/
  // invoice contact email first, then the customer record's known addresses.
  const resolveEmail = (f) => {
    if (clean(f.contactEmail).includes("@")) return clean(f.contactEmail);
    const c = customersById.get(clean(f.customerId));
    if (!c) return "";
    const candidates = [
      c.contact_email, c.billing_contact_email, c.email,
      c.contact_office_email, c.billing_email,
      ...(Array.isArray(c.contacts) ? c.contacts.map((ct) => ct?.email) : []),
    ];
    return candidates.map((v) => clean(v).toLowerCase()).find((v) => v.includes("@")) || "";
  };

  const due = useMemo(
    () => findDueFollowups({ estimates, invoices, activities, rules, now: new Date() }),
    [estimates, invoices, activities, rules],
  );
  const groups = useMemo(() => groupDueFollowups(due), [due]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
        <span className="text-xs text-slate-500">{due.length} due</span>
      </div>

      {due.length === 0 && (
        <EmptyState
          compact
          icon={CheckCircle2}
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700"
          title="All caught up"
          message="No follow-ups are due."
        />
      )}

      {FOLLOWUP_SECTIONS.map((section) => {
        const items = groups[section] || [];
        if (!items.length) return null;
        return (
          <section key={section} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {SECTION_TITLES[section]}
              </h4>
              <StatusChip tone="slate" size="sm" showDot={false}>{items.length}</StatusChip>
            </div>
            {items.map((item) => (
              <FollowupRow
                key={keyOf(item)}
                item={item}
                defaultTo={resolveEmail(item)}
                actor={actor}
                sessionToken={sessionToken}
                onChanged={onChanged}
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}