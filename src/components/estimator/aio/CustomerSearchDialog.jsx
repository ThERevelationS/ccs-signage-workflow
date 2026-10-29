import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";

const RECENT_KEY = "ccs_recent_customers";
const RECENT_LIMIT = 5;

const STATUS_STYLES = {
  active: "bg-emerald-100 text-emerald-800",
  inactive: "bg-slate-100 text-slate-500",
  prospect: "bg-blue-100 text-blue-800",
};

const readRecentIds = () => {
  try {
    const ids = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(ids) ? ids.filter(Boolean).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
};

const rememberRecentId = (id) => {
  if (!id) return;
  try {
    const next = [id, ...readRecentIds().filter((r) => r !== id)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private mode, quota) — recents are best-effort.
  }
};

export default function CustomerSearchDialog({ open, onClose, customers = [], onSelect }) {
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState([]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setRecentIds(readRecentIds());
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = customers.filter((c) => {
    if (!q) return true;
    return [
      c.company_name,
      c.contact_email,
      c.company_phone,
      `${c.contact_first_name || ""} ${c.contact_last_name || ""}`,
      c.billing_city,
    ]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  const recentCustomers = recentIds
    .map((id) => customers.find((c) => c.id === id))
    .filter(Boolean);
  const recentIdSet = new Set(recentCustomers.map((c) => c.id));
  const visibleResults = q ? results : results.filter((c) => !recentIdSet.has(c.id));

  const sectionLabel = (text) => (
    <div className="px-3 py-1 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
      {text}
    </div>
  );

  const renderCustomer = (c) => {
    const status = String(c.customer_status || "prospect").toLowerCase();
    return (
      <button
        type="button"
        role="option"
        aria-selected={false}
        key={c.id}
        onClick={() => {
          rememberRecentId(c.id);
          onSelect(c);
          onClose();
        }}
        className="w-full text-left px-3 py-2 hover:bg-gray-50"
      >
        <div className="text-[13px] font-semibold text-gray-800 flex items-center gap-1.5">
          <span className="truncate">{c.company_name}</span>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize flex-shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.prospect}`}
          >
            {status}
          </span>
        </div>
        <div className="text-[11px] text-gray-500">
          {[
            `${c.contact_first_name || ""} ${c.contact_last_name || ""}`.trim(),
            c.contact_email,
            c.company_phone,
            c.billing_city,
          ]
            .filter(Boolean)
            .join(" · ") || "No contact details"}
        </div>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">Find a Customer</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by company, contact, email, phone or city…"
            className="w-full h-[32px] pl-8 pr-2 border border-gray-300 rounded-sm text-[13px] focus:outline-none focus:border-red-400"
          />
        </div>

        <div
          role="listbox"
          aria-label="Customer results"
          className="max-h-[340px] overflow-y-auto border border-gray-200 rounded-sm divide-y divide-gray-100"
        >
          {results.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray-400">No matching customers.</div>
          ) : (
            <>
              {!q && recentCustomers.length > 0 && (
                <>
                  {sectionLabel("Recent")}
                  {recentCustomers.map(renderCustomer)}
                  {visibleResults.length > 0 && sectionLabel("All customers")}
                </>
              )}
              {visibleResults.map(renderCustomer)}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}