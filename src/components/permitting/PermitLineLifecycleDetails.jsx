import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BadgeCheck, ChevronDown, ChevronRight, FileKey2 } from "lucide-react";
import { differenceInCalendarDays, format, isValid } from "date-fns";
import { getPermitLineHandoffReadiness, getPermitLineLifecycleSummary, isPermitLineEffectivelyComplete } from "./permitQueue";
import PermitLineHistory from "./PermitLineHistory";

function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isValid(date) ? date : null;
}

function formatDate(value) {
  const date = parseLocalDate(value);
  return date ? format(date, "MMM d, yyyy") : "";
}

function CommitTextField({ label, value, placeholder, disabled, onCommit }) {
  const normalizedValue = value || "";
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => {
    setDraft(normalizedValue);
  }, [normalizedValue]);

  const commit = () => {
    const nextValue = draft.trim();
    if (nextValue === normalizedValue) return;
    onCommit(nextValue);
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <Input
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") {
            setDraft(normalizedValue);
            event.currentTarget.blur();
          }
        }}
        disabled={disabled}
        placeholder={placeholder}
        className="h-8 text-xs bg-white"
      />
    </label>
  );
}

function CommitMoneyField({ label, value, disabled, onCommit }) {
  const normalizedValue = value === null || value === undefined || value === "" ? "" : String(value);
  const [draft, setDraft] = useState(normalizedValue);
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft(normalizedValue);
    setError("");
  }, [normalizedValue]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("");
      if (normalizedValue !== "") onCommit(null);
      return;
    }
    const amount = Number(trimmed);
    if (!Number.isFinite(amount) || amount < 0) {
      setError("Enter a valid amount of $0 or more.");
      return;
    }
    setError("");
    if (amount !== Number(normalizedValue)) onCommit(amount);
  };

  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">$</span>
        <Input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setError(""); }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(normalizedValue);
              setError("");
              event.currentTarget.blur();
            }
          }}
          disabled={disabled}
          placeholder="0.00"
          className="h-8 bg-white pl-6 text-xs"
        />
      </div>
      {error && <span className="mt-1 block text-[10px] font-medium text-red-600">{error}</span>}
    </label>
  );
}

function DateField({ label, value, disabled, onCommit, today = "", showTodayShortcut = false }) {
  const canUseToday = showTodayShortcut && !disabled && !value && !!parseLocalDate(today);
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
        {canUseToday && (
          <button
            type="button"
            onClick={() => onCommit(today)}
            className="inline-flex min-h-7 items-center rounded px-2 text-[10px] font-semibold text-blue-700 hover:bg-blue-50 hover:text-blue-900"
            title={`Set ${label.toLowerCase()} to today (${formatDate(today)})`}
          >
            Today
          </button>
        )}
      </div>
      <Input
        type="date"
        aria-label={label}
        value={value || ""}
        onChange={(event) => onCommit(event.target.value || null)}
        disabled={disabled}
        className="h-8 text-xs bg-white"
      />
    </div>
  );
}

export default function PermitLineLifecycleDetails({ lineItem, onUpdateField, isRegistered, today }) {
  const lifecycleSummary = useMemo(() => getPermitLineLifecycleSummary(lineItem), [lineItem]);
  const handoffReadiness = useMemo(() => getPermitLineHandoffReadiness(lineItem, today), [lineItem, today]);
  const correctionStatus = String(lineItem?.correction_status || "").toLowerCase();
  const hasActiveCorrections = ["corrections_received", "working_corrections"].includes(correctionStatus);
  const storedCompletionNeedsRepair = lineItem?.status === "completed" && !isPermitLineEffectivelyComplete(lineItem);
  const canMarkLineComplete = !!lineItem?.permit_received_date
    && lineItem?.status !== "completed"
    && !handoffReadiness.hasBlockers
    && !hasActiveCorrections;
  const hasAdditionalDetails = useMemo(() => [
    lineItem?.correction_status,
    lineItem?.corrections_received_date,
    lineItem?.resubmitted_date,
    lineItem?.closeout_status,
    lineItem?.inspection_date,
    lineItem?.closeout_date,
    lineItem?.jurisdiction_fee_amount,
    lineItem?.jurisdiction_fee_status,
    lineItem?.jurisdiction_fee_paid_date,
  ].some((value) => value !== null && value !== undefined && value !== ""), [lineItem]);
  const [showAdditionalDetails, setShowAdditionalDetails] = useState(hasAdditionalDetails || handoffReadiness.hasIssues);

  useEffect(() => {
    if (hasAdditionalDetails || handoffReadiness.hasIssues) setShowAdditionalDetails(true);
  }, [hasAdditionalDetails, handoffReadiness.hasIssues]);

  const expirationState = useMemo(() => {
    const expiration = parseLocalDate(lineItem?.expiration_date);
    const todayDate = parseLocalDate(today);
    if (!expiration || !todayDate) return null;
    const days = differenceInCalendarDays(expiration, todayDate);
    if (days < 0) return { tone: "expired", label: `Expired ${formatDate(lineItem.expiration_date)}` };
    if (days === 0) return { tone: "soon", label: "Expires today" };
    if (days <= 30) return { tone: "soon", label: `Expires in ${days} day${days === 1 ? "" : "s"}` };
    return { tone: "current", label: `Expires ${formatDate(lineItem.expiration_date)}` };
  }, [lineItem?.expiration_date, today]);

  const update = (field, value) => onUpdateField(lineItem.id, field, value);

  return (
    <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700">
          <FileKey2 className="h-3.5 w-3.5 text-slate-500" /> Permit details
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            lifecycleSummary.tone === "danger"
              ? "border-red-200 bg-red-50 text-red-700"
              : lifecycleSummary.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : lifecycleSummary.tone === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : lifecycleSummary.tone === "info"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-600"
          }`}>
            {lifecycleSummary.label}
          </span>
          {expirationState && (
            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              expirationState.tone === "expired"
                ? "border-red-200 bg-red-50 text-red-700"
                : expirationState.tone === "soon"
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}>
              {expirationState.tone === "expired" ? <AlertTriangle className="h-3 w-3" /> : <BadgeCheck className="h-3 w-3" />}
              {expirationState.label}
            </span>
          )}
        </div>
      </div>

      {(lineItem.submitted_date || lineItem.permit_received_date) && (
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
          {lineItem.submitted_date && (
            <span><span className="font-semibold">Submitted:</span> {formatDate(lineItem.submitted_date)}</span>
          )}
          {lineItem.permit_received_date && (
            <span><span className="font-semibold">Issued / received:</span> {formatDate(lineItem.permit_received_date)}</span>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <CommitTextField
          label="Application / Reference #"
          value={lineItem.application_reference_number}
          placeholder="Case or tracking #"
          disabled={!isRegistered}
          onCommit={(value) => update("application_reference_number", value)}
        />
        <CommitTextField
          label="Permit #"
          value={lineItem.permit_number}
          placeholder="Issued permit #"
          disabled={!isRegistered}
          onCommit={(value) => update("permit_number", value)}
        />
        <CommitTextField
          label="Permit document"
          value={lineItem.permit_document_url}
          placeholder="Paste the permit file or portal link"
          disabled={!isRegistered}
          onCommit={(value) => update("permit_document_url", value)}
        />
        <CommitTextField
          label="Next action"
          value={lineItem.next_action}
          placeholder="What happens next? (e.g. Call the office Friday)"
          disabled={!isRegistered}
          onCommit={(value) => update("next_action", value)}
        />
        <CommitTextField
          label="How it was submitted"
          value={lineItem.submission_method}
          placeholder="portal / email / fax / in-person / mail"
          disabled={!isRegistered}
          onCommit={(value) => update("submission_method", value)}
        />
        <CommitTextField
          label="Confirmation #"
          value={lineItem.confirmation_number}
          placeholder="Office's submission reference"
          disabled={!isRegistered}
          onCommit={(value) => update("confirmation_number", value)}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isRegistered}
            onClick={() => update("urgent", !lineItem.urgent)}
            className={`min-h-11 rounded-full border px-3 text-[11px] font-semibold ${lineItem.urgent ? "border-red-400 bg-red-50 text-red-800" : "border-gray-300 bg-white text-gray-600"}`}
          >
            {lineItem.urgent ? "⚠ URGENT" : "Mark urgent"}
          </button>
        </div>
        <CommitTextField
          label="Revision #"
          value={lineItem.application_revision}
          placeholder="1"
          disabled={!isRegistered}
          onCommit={(value) => update("application_revision", value === "" ? null : Number(value) || null)}
        />
        <DateField
          label="Denied on"
          value={lineItem.denial_date}
          disabled={!isRegistered}
          onCommit={(value) => update("denial_date", value)}
        />
        <CommitTextField
          label="Denial reason"
          value={lineItem.denial_reason}
          placeholder="Why the office denied it"
          disabled={!isRegistered}
          onCommit={(value) => update("denial_reason", value)}
        />
        <DateField
          label="Appeal deadline"
          value={lineItem.appeal_deadline}
          disabled={!isRegistered}
          onCommit={(value) => update("appeal_deadline", value)}
        />
        <CommitTextField
          label="Fee payment link"
          value={lineItem.fee_payment_link}
          placeholder="Office's online-pay URL"
          disabled={!isRegistered}
          onCommit={(value) => update("fee_payment_link", value)}
        />
        <DateField
          label="Office reply expected"
          value={lineItem.expected_response_date}
          disabled={!isRegistered}
          onCommit={(value) => update("expected_response_date", value)}
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isRegistered}
            onClick={() => update("correction_required", !lineItem.correction_required)}
            className={`min-h-11 rounded-full border px-3 text-[11px] font-semibold ${lineItem.correction_required ? "border-orange-400 bg-orange-50 text-orange-800" : "border-gray-300 bg-white text-gray-600"}`}
          >
            {lineItem.correction_required ? "Correction needed" : "Correction notice"}
          </button>
        </div>
        <DateField
          label="Fix by"
          value={lineItem.correction_deadline}
          disabled={!isRegistered}
          onCommit={(value) => update("correction_deadline", value)}
        />
        <DateField
          label="Fixed on"
          value={lineItem.correction_resolved_date}
          disabled={!isRegistered}
          onCommit={(value) => update("correction_resolved_date", value)}
        />
        <DateField
          label="Check back on"
          value={lineItem.follow_up_date}
          disabled={!isRegistered}
          onCommit={(value) => update("follow_up_date", value)}
        />
        <CommitTextField
          label="Call / chase notes"
          value={lineItem.notes}
          placeholder="e.g. 10/22 — called office, resubmit Friday"
          disabled={!isRegistered}
          onCommit={(value) => update("notes", value)}
        />
        <CommitTextField
          label="Inspector contact"
          value={lineItem.inspector_contact}
          placeholder="Inspector name or phone"
          disabled={!isRegistered}
          onCommit={(value) => update("inspector_contact", value)}
        />
        <DateField
          label="Approval date"
          value={lineItem.approval_date}
          disabled={!isRegistered}
          onCommit={(value) => update("approval_date", value)}
        />
        <DateField
          label="Expiration date"
          value={lineItem.expiration_date}
          disabled={!isRegistered}
          onCommit={(value) => update("expiration_date", value)}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAdditionalDetails((open) => !open)}
        className="mt-2 inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-slate-600 hover:bg-white hover:text-slate-900"
        aria-expanded={showAdditionalDetails}
      >
        {showAdditionalDetails ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {showAdditionalDetails ? "Hide additional details" : "Show corrections, inspections & fees"}
        {hasAdditionalDetails && !showAdditionalDetails && (
          <span className="ml-1 rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700">Recorded info</span>
        )}
      </button>

      {showAdditionalDetails && (
        <>
      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Corrections / resubmission</span>
          <span className="text-[10px] text-slate-500">Track the current correction cycle for this office line.</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Correction state</span>
            <Select
              value={lineItem.correction_status || "__none__"}
              onValueChange={(value) => update("correction_status", value === "__none__" ? null : value)}
              disabled={!isRegistered}
            >
              <SelectTrigger className="h-8 bg-white text-xs">
                <SelectValue placeholder="No corrections recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No corrections recorded</SelectItem>
                <SelectItem value="corrections_received">Corrections received</SelectItem>
                <SelectItem value="working_corrections">Working corrections</SelectItem>
                <SelectItem value="resubmitted">Resubmitted</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <DateField
            label="Corrections received"
            value={lineItem.corrections_received_date}
            disabled={!isRegistered}
            onCommit={(value) => update("corrections_received_date", value)}
            today={today}
            showTodayShortcut={["corrections_received", "working_corrections", "resubmitted"].includes(String(lineItem.correction_status || "").toLowerCase())}
          />
          <DateField
            label="Last resubmitted"
            value={lineItem.resubmitted_date}
            disabled={!isRegistered}
            onCommit={(value) => update("resubmitted_date", value)}
            today={today}
            showTodayShortcut={String(lineItem.correction_status || "").toLowerCase() === "resubmitted"}
          />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Inspection / closeout</span>
          <span className="text-[10px] text-slate-500">Optional — record only when this permit line has a required post-issuance inspection or closeout step.</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Closeout state</span>
            <Select
              value={lineItem.closeout_status || "__none__"}
              onValueChange={(value) => update("closeout_status", value === "__none__" ? null : value)}
              disabled={!isRegistered}
            >
              <SelectTrigger className="h-8 bg-white text-xs">
                <SelectValue placeholder="No closeout tracked" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No closeout tracked</SelectItem>
                <SelectItem value="inspection_required">Inspection required</SelectItem>
                <SelectItem value="inspection_scheduled">Inspection scheduled</SelectItem>
                <SelectItem value="inspection_failed">Inspection failed</SelectItem>
                <SelectItem value="inspection_passed">Inspection passed</SelectItem>
                <SelectItem value="closed_out">Closed out</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <DateField
            label="Inspection date"
            value={lineItem.inspection_date}
            disabled={!isRegistered}
            onCommit={(value) => update("inspection_date", value)}
            today={today}
            showTodayShortcut={["inspection_scheduled", "inspection_failed", "inspection_passed"].includes(String(lineItem.closeout_status || "").toLowerCase())}
          />
          <DateField
            label="Closeout date"
            value={lineItem.closeout_date}
            disabled={!isRegistered}
            onCommit={(value) => update("closeout_date", value)}
            today={today}
            showTodayShortcut={String(lineItem.closeout_status || "").toLowerCase() === "closed_out"}
          />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-200 pt-2">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Jurisdiction fee</span>
          <span className="text-[10px] text-slate-500">Record the actual office fee only; do not copy estimator or repository estimates.</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <CommitMoneyField
            label="Actual fee amount"
            value={lineItem.jurisdiction_fee_amount}
            disabled={!isRegistered}
            onCommit={(value) => update("jurisdiction_fee_amount", value)}
          />
          <label className="min-w-0">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">Payment status</span>
            <Select
              value={lineItem.jurisdiction_fee_status || "__not_recorded__"}
              onValueChange={(value) => update("jurisdiction_fee_status", value === "__not_recorded__" ? null : value)}
              disabled={!isRegistered}
            >
              <SelectTrigger className="h-8 bg-white text-xs">
                <SelectValue placeholder="Not recorded" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__not_recorded__">Not recorded</SelectItem>
                <SelectItem value="due">Due</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="waived">Waived</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <DateField
            label="Paid date"
            value={lineItem.jurisdiction_fee_paid_date}
            disabled={!isRegistered}
            onCommit={(value) => update("jurisdiction_fee_paid_date", value)}
            today={today}
            showTodayShortcut={String(lineItem.jurisdiction_fee_status || "").toLowerCase() === "paid"}
          />
        </div>
      </div>
        </>
      )}

      {handoffReadiness.applicable && (
        <div className={`mt-3 rounded-md border px-3 py-2 ${handoffReadiness.hasBlockers ? "border-red-200 bg-red-50/80" : handoffReadiness.hasIssues ? "border-amber-200 bg-amber-50/80" : "border-emerald-200 bg-emerald-50/70"}`}>
          <div className="flex items-start gap-2">
            {handoffReadiness.hasIssues ? (
              <AlertTriangle className={`mt-0.5 h-4 w-4 flex-shrink-0 ${handoffReadiness.hasBlockers ? "text-red-600" : "text-amber-600"}`} />
            ) : (
              <BadgeCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-semibold ${handoffReadiness.hasBlockers ? "text-red-800" : handoffReadiness.hasIssues ? "text-amber-800" : "text-emerald-800"}`}>
                {handoffReadiness.hasBlockers ? "Not ready to hand off" : handoffReadiness.hasIssues ? "Handoff needs review" : "Handoff record complete"}
              </div>
              {handoffReadiness.hasIssues ? (
                <div className={`mt-1 space-y-0.5 text-[10px] ${handoffReadiness.hasBlockers ? "text-red-700" : "text-amber-700"}`}>
                  {[...handoffReadiness.blockers, ...handoffReadiness.reviews].slice(0, 3).map((item) => <div key={item}>• {item}</div>)}
                  {handoffReadiness.issueCount > 3 && <div>• +{handoffReadiness.issueCount - 3} more item{handoffReadiness.issueCount - 3 === 1 ? "" : "s"}</div>}
                </div>
              ) : (
                <div className="mt-0.5 text-[10px] text-emerald-700">No recorded fee, identifier, correction, or closeout issues remain for this permit line.</div>
              )}
              {storedCompletionNeedsRepair && (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-red-200 bg-white/80 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[10px] leading-snug text-red-800">
                    This line is stored as complete, but recorded permit facts still make it active. Reopen it before continuing so completion remains explicit and auditable.
                  </div>
                  <button
                    type="button"
                    onClick={() => update("status", "active")}
                    disabled={!isRegistered}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-red-300 bg-white px-3 text-[11px] font-semibold text-red-900 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reopen line
                  </button>
                </div>
              )}
              {canMarkLineComplete && (
                <div className="mt-2 flex flex-col gap-2 rounded-md border border-amber-200 bg-white/75 p-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-[10px] leading-snug text-amber-800">
                    The permit is recorded as issued/received, but this workflow line is still active. Completing it changes only the line status; recorded permit details remain unchanged.
                  </div>
                  <button
                    type="button"
                    onClick={() => update("status", "completed")}
                    disabled={!isRegistered}
                    className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md border border-amber-300 bg-white px-3 text-[11px] font-semibold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Mark line complete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <PermitLineHistory lineItemId={lineItem.id} lineUpdatedDate={lineItem.updated_date} />
    </div>
  );
}
