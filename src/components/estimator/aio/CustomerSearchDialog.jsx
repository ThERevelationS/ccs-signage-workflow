import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";

export default function CustomerSearchDialog({ open, onClose, customers = [], onSelect }) {
  const [query, setQuery] = useState("");

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

        <div className="max-h-[340px] overflow-y-auto border border-gray-200 rounded-sm divide-y divide-gray-100">
          {results.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-gray-400">No matching customers.</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSelect(c);
                  onClose();
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50"
              >
                <div className="text-[13px] font-semibold text-gray-800">{c.company_name}</div>
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
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}