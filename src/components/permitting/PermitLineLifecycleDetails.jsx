import React, { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
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
    </div>
  );
}
