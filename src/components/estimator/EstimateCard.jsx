import React, { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, User, Calendar } from "lucide-react";
import { format } from "date-fns";
import { estimateQuoteExpiration, localDateStamp, quoteExpirationDate } from "@/components/estimator/quoteLifecycle";
import { staffEntities } from "@/components/staff/staffEntities";

const CUSTOMER_NOTE_CACHE_MS = 30_000;
const customerNoteCache = new Map();

function loadCustomerNote(customerId) {
  const id = String(customerId || "").trim();
  if (!id) return Promise.resolve("");
  const cached = customerNoteCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = staffEntities.Customer.get(id)
    .then((customer) => String(customer?.notes || "").trim())
    .catch((error) => {
      customerNoteCache.delete(id);
      // A deleted Customer record is a missing note, not a load failure.
      if (Number(error?.status ?? error?.response?.status) === 404) return "";
      throw error;
    });
  customerNoteCache.set(id, { expiresAt: Date.now() + CUSTOMER_NOTE_CACHE_MS, promise });
  return promise;
}

const STATUS_STYLES = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  calculated: "bg-amber-50 text-amber-700 border-amber-200",
  sent: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  archived: "bg-slate-100 text-slate-500 border-slate-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

export default function EstimateCard({ estimate }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteState, setNoteState] = useState({ status: "idle", text: "" });
  const total = Number(estimate.quote_total || estimate.total_cost || 0);
  const sections = (estimate.line_items || []).length;
  const customerId = String(estimate.customer_id || "").trim();

  const openCustomerNote = () => {
    setNoteOpen(true);
    if (!customerId || noteState.status !== "idle") return;
    setNoteState({ status: "loading", text: "" });
    loadCustomerNote(customerId).then(
      (text) => setNoteState({ status: "loaded", text }),
      () => setNoteState({ status: "error", text: "" }),
    );
  };

  const closeCustomerNote = (event) => {
    if (event?.relatedTarget && event.currentTarget.contains(event.relatedTarget)) return;
    setNoteOpen(false);
  };

  const validDays = estimate.quote_valid_days ?? estimate.valid_days;
  const sentWithQuote =
    (estimate.status || "draft") === "sent" && estimate.quote_issue_date && validDays;
  const expires = sentWithQuote
    ? estimateQuoteExpiration(estimate)
    : "";
  const expired = !!expires && localDateStamp() > expires;
  const expiringSoon =
    !!expires && !expired && expires <= localDateStamp(new Date(Date.now() + 7 * 86400000));

  return (
    <Link
      to={`/EstimateDetail?id=${estimate.id}`}
      onMouseEnter={openCustomerNote}
      onMouseLeave={() => setNoteOpen(false)}
      onFocus={openCustomerNote}
      onBlur={closeCustomerNote}
      aria-describedby={noteOpen && customerId ? `estimate-${estimate.id}-customer-note` : undefined}
      className="clay-card relative p-4 border-l-4 border-l-red-400 block hover:shadow-lg transition-shadow cursor-pointer"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-red-500 flex-shrink-0" />
            <h3 className="font-semibold text-gray-900 truncate hover:text-red-600">
              {estimate.project_name}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5" />
              {estimate.client_name || "—"}
            </span>
            {estimate.estimate_number && (
              <span className="font-mono text-xs text-gray-400">{estimate.estimate_number}</span>
            )}
            {estimate.created_date && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {format(new Date(estimate.created_date), "MMM d, yyyy")}
              </span>
            )}
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="text-lg font-bold text-gray-900">
            ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-400">{sections} section{sections === 1 ? "" : "s"}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
            STATUS_STYLES[estimate.status] || STATUS_STYLES.draft
          }`}
        >
          {estimate.status || "draft"}
        </span>
        <span className="flex items-center gap-1.5">
          {expired && (
            <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">EXPIRED</span>
          )}
          {expiringSoon && (
            <span className="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              EXPIRES {format(new Date(`${expires}T00:00:00`), "MMM d")}
            </span>
          )}
          {estimate.pipeline_sync_pending && (
            <span className="text-[9px] font-bold text-red-700 bg-red-50 border border-red-200 rounded px-1.5 py-0.5">SYNC ISSUE</span>
          )}
        </span>
      </div>
      {noteOpen && customerId && (
        <div
          id={`estimate-${estimate.id}-customer-note`}
          role="tooltip"
          aria-live="polite"
          className="pointer-events-none absolute bottom-12 left-3 right-3 z-20 max-h-32 overflow-y-auto break-words rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950 shadow-lg"
        >
          <span className="font-semibold">Customer note: </span>
          {noteState.status === "loading" && "Loading..."}
          {noteState.status === "error" && "Customer notes are unavailable."}
          {noteState.status === "loaded" && (noteState.text || "No customer notes on file.")}
        </div>
      )}
    </Link>
  );
}