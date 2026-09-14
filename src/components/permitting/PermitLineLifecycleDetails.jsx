import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, BadgeCheck, FileKey2 } from "lucide-react";
import { differenceInCalendarDays, format, isValid } from "date-fns";

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

function DateField({ label, value, disabled, onCommit }) {
  return (
    <label className="min-w-0">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <Input
        type="date"
        value={value || ""}
        onChange={(event) => onCommit(event.target.value || null)}
        disabled={disabled}
        className="h-8 text-xs bg-white"
      />
    </label>
  );
}

export default function PermitLineLifecycleDetails({ lineItem, onUpdateField, isRegistered, today }) {
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
          />
          <DateField
            label="Last resubmitted"
            value={lineItem.resubmitted_date}
            disabled={!isRegistered}
            onCommit={(value) => update("resubmitted_date", value)}
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
          />
          <DateField
            label="Closeout date"
            value={lineItem.closeout_date}
            disabled={!isRegistered}
            onCommit={(value) => update("closeout_date", value)}
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
          />
        </div>
      </div>
    </div>
  );
}
