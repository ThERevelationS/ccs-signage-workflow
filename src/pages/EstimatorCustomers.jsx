import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Users, Search, Phone, Mail } from "lucide-react";
import { backfillCustomersFromWorkOrders } from "@/components/estimator/customerSync";

const FILTERS = [
  { key: "", label: "All" },
  { key: "active", label: "Active" },
  { key: "prospect", label: "Prospects" },
  { key: "inactive", label: "Inactive" },
];

export default function EstimatorCustomers() {
  const location = useLocation();
  const status = new URLSearchParams(location.search).get("status") || "";
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const load = async () => {
      const res = await base44.entities.Customer.list("company_name", 1000);
      setCustomers(res || []);
      setLoading(false);
      // Pull in any client that only exists in the Sales Pipeline / workflow
      const merged = await backfillCustomersFromWorkOrders(res || []);
      if (merged.length !== (res || []).length) {
        setCustomers(
          [...merged].sort((a, b) =>
            String(a.company_name || "").localeCompare(String(b.company_name || ""))
          )
        );
      }
    };
    load();
  }, []);

  const term = search.trim().toLowerCase();
  const rows = customers
    .filter((c) => (status ? (c.customer_status || "prospect") === status : true))
    .filter((c) =>
      term
        ? [c.company_name, c.contact_first_name, c.contact_last_name, c.contact_email]
            .filter(Boolean)
            .some((v) => String(v).toLowerCase().includes(term))
        : true
    );

  return (
    <div className="clay-scope min-h-full bg-gradient-to-br from-rose-50 to-orange-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-3">
        <div className="bg-white px-4 py-3 flex items-center gap-2">
          <Users className="w-4 h-4 text-red-500" />
          <h1 className="text-xs font-bold tracking-wide text-gray-600">CUSTOMERS</h1>
          <span className="ml-auto text-xs text-gray-400">{customers.length} total</span>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key || "all"}
              to={f.key ? `/EstimatorCustomers?status=${f.key}` : "/EstimatorCustomers"}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                status === f.key
                  ? "bg-red-600 text-white border-red-600"
                  : "bg-white/70 text-gray-600 border-gray-200 hover:border-red-300"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customers"
            className="pl-9 bg-white border-none h-11"
          />
        </div>

        <div className="bg-white">
          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-gray-400">Loading customers…</div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-gray-500">No customers found.</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {rows.map((c) => (
                <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-gray-800 truncate">{c.company_name}</div>
                    <div className="text-xs text-gray-500 truncate flex items-center gap-3">
                      <span>
                        {[c.contact_first_name, c.contact_last_name].filter(Boolean).join(" ") || "—"}
                      </span>
                      {c.contact_email && (
                        <span className="hidden sm:flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {c.contact_email}
                        </span>
                      )}
                      {c.company_phone && (
                        <span className="hidden sm:flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {c.company_phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-500 capitalize flex-shrink-0">
                    {c.customer_status || "prospect"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}