import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { Customer } from "@/api/gatedEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { loadQuoteDefaults } from "@/components/estimator/quoteDefaults";
import { buildStatement, paymentsFromArCsv } from "@/components/statements/statementModel";
import StatementView from "@/components/statements/StatementView";
import {
  AlertCircle,
  FileText,
  Loader2,
  Mail,
  Printer,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";
import {
  buildNotifyContext,
  resolveCustomerEmail,
  statusGateAllows,
} from "@/components/comms/notifyModel";
import { sendCustomerNotification } from "@/components/comms/notifySend";

const clean = (v) => String(v ?? "").trim();
const today = () => new Date().toISOString().slice(0, 10);

const inputCls =
  "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";

// Invoice/Payment are backend-only entities — every read goes through the
// deployed invoicingAction function with the staff session token.
const invokeAction = async (sessionToken, body) => {
  const r = await base44.functions.invoke("invoicingAction", { session_token: sessionToken, ...body });
  const data = r?.data || r;
  if (!data?.success) throw new Error(data?.error || "Request failed.");
  return data;
};

const customerLabel = (c) => clean(c?.company_name) || clean(c?.name) || "Unnamed customer";
const customerActive = (c) => c && c.deleted !== true && !clean(c.merged_into_customer_id);

const matchesQuery = (c, q) => {
  if (!q) return true;
  const hay = [
    c.company_name, c.name, c.contact_first_name, c.contact_last_name,
    c.billing_contact_name, c.contact_email, c.billing_contact_email,
    c.contact_office_phone, c.company_phone,
  ].map((v) => clean(v).toLowerCase()).join("|");
  return hay.includes(q);
};

export default function CustomerStatements() {
  const { sessionToken, isRegistered, currentUser } = useAuth();
  const actor = clean(currentUser?.email || currentUser?.full_name);
  const [query, setQuery] = useState("");
  const [asOf, setAsOf] = useState(today());
  const [selected, setSelected] = useState(new Set());
  const [statements, setStatements] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => { document.title = "Customer Statements"; }, []);

  const { data: allCustomers = [], isFetching: customersLoading, refetch: refetchCustomers } = useQuery({
    queryKey: ["customer-statements", "customers"],
    enabled: Boolean(sessionToken),
    queryFn: () =>
      loadAllEntityRows({
        entity: Customer,
        sort: "company_name",
        label: "Statement customers",
        cacheTtlMs: 30000,
      }),
  });
  const customers = useMemo(
    () => (allCustomers || []).filter(customerActive),
    [allCustomers]
  );

  const { data: company = null } = useQuery({
    queryKey: ["customer-statements", "company"],
    enabled: Boolean(sessionToken),
    queryFn: () => loadQuoteDefaults().catch(() => null),
    staleTime: 60000,
  });

  const visible = useMemo(
    () => customers.filter((c) => matchesQuery(c, clean(query).toLowerCase())),
    [customers, query]
  );
  const selectedCustomers = useMemo(
    () => customers.filter((c) => selected.has(c.id)),
    [customers, selected]
  );

  const toggle = (id) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelected((s) => {
      const next = new Set(s);
      const allOn = visible.length > 0 && visible.every((c) => next.has(c.id));
      if (allOn) visible.forEach((c) => next.delete(c.id));
      else visible.forEach((c) => next.add(c.id));
      return next;
    });

  /**
   * Pull the customer's issued invoices + applied payments, then build the
   * pure statement. list_invoices caps at 250 rows — first try one unfiltered
   * call shared by every target; when the cap is hit, refetch per customer
   * with the company-name query so the server narrows before slicing.
   * Payments come from one export_ar call (payments_csv is uncapped) matched
   * to the customer's invoice numbers.
   */
  const buildForTargets = useCallback(async (targets) => {
    const [first, ar] = await Promise.all([
      invokeAction(sessionToken, { action: "list_invoices" }),
      invokeAction(sessionToken, { action: "export_ar" }).catch(() => ({ payments_csv: "" })),
    ]);
    const payments = paymentsFromArCsv(ar?.payments_csv || "");
    const hitListCap = (first.invoices || []).length >= 250;

    const invoicePools = new Map();
    if (!hitListCap) {
      const byCustomer = new Map();
      for (const inv of first.invoices || []) {
        const cid = clean(inv.customer_id);
        if (!byCustomer.has(cid)) byCustomer.set(cid, []);
        byCustomer.get(cid).push(inv);
      }
      for (const c of targets) invoicePools.set(c.id, byCustomer.get(c.id) || []);
    } else {
      for (const c of targets) {
        const data = await invokeAction(sessionToken, {
          action: "list_invoices",
          query: clean(c.company_name),
        });
        invoicePools.set(
          c.id,
          (data.invoices || []).filter((inv) => clean(inv.customer_id) === c.id)
        );
      }
    }

    const built = targets.map((c) => {
      const invs = invoicePools.get(c.id) || [];
      const numbers = new Set(invs.map((i) => clean(i.invoice_number)).filter(Boolean));
      const custPayments = payments.filter((p) => numbers.has(clean(p.invoice_number)));
      return buildStatement({ customer: c, invoices: invs, payments: custPayments, asOfDate: asOf });
    });
    return { built, hitListCap };
  }, [sessionToken, asOf]);

  const generate = useCallback(async (targets) => {
    if (!sessionToken || !targets.length || busy) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      const { built, hitListCap } = await buildForTargets(targets);
      setStatements(built);
      if (hitListCap) {
        setNotice("More than 250 invoices on file — per-customer lookups were used; very high-volume accounts may still be capped.");
      }
      const withNoActivity = built.filter((s) => s.lines.length === 0).length;
      if (withNoActivity) {
        setNotice((n) => `${n ? `${n} ` : ""}${withNoActivity} of ${built.length} statement${built.length === 1 ? "" : "s"} have no activity on or before ${asOf}.`);
      }
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "Statement generation failed.");
    } finally {
      setBusy("");
    }
  }, [sessionToken, asOf, busy, buildForTargets]);

  // "Email statement" — renders the monthly_statement notification template
  // against the freshly built statement and sends through the sendStaffEmail
  // bridge, then writes the standard OpportunityActivity audit row
  // (details.notify_kind = monthly_statement) so sends are dedupe-able.
  const emailStatement = useCallback(async (customer) => {
    if (!sessionToken || !customer?.id || busy) return;
    setBusy(`email:${customer.id}`);
    setError("");
    setNotice("");
    try {
      const { built } = await buildForTargets([customer]);
      const statement = built[0];
      if (!statement || !statusGateAllows("monthly_statement", statement)) {
        throw new Error(`No statement activity for ${customerLabel(customer)} on or before ${statement?.asOf || asOf}.`);
      }
      const to = resolveCustomerEmail(customer);
      if (!to.includes("@")) {
        throw new Error(`${customerLabel(customer)} has no email address on file.`);
      }
      const ctx = buildNotifyContext({ customer, statement, company });
      const res = await sendCustomerNotification({
        kind: "monthly_statement",
        ctx,
        to,
        sessionToken,
        actor,
        log: {
          targetId: `statement:${customer.id}:${statement.asOf}`,
          targetRef: `Statement as of ${statement.asOf}`,
          customerId: customer.id,
          customerName: customerLabel(customer),
          contactName: ctx.contact_name,
        },
      });
      setNotice(
        `Statement emailed to ${to}.` +
        (res.logError ? ` The log write failed: ${res.logError} — resolve the log before resending.` : "")
      );
    } catch (err) {
      setError(err?.response?.data?.error || err?.message || "The statement email could not be sent.");
    } finally {
      setBusy("");
    }
  }, [sessionToken, actor, asOf, busy, buildForTargets, company]);

  if (!isRegistered) return null;

  const allVisibleOn = visible.length > 0 && visible.every((c) => selected.has(c.id));

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Customer Statements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            CoreBridge-style statement of account — activity ledger, aging and a printable remittance copy.
          </p>
        </div>
        <button type="button" onClick={() => refetchCustomers()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <RefreshCw className={`h-4 w-4 ${customersLoading ? "animate-spin" : ""}`} />Refresh
        </button>
      </div>

      <div className="mb-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 md:grid-cols-[1fr_170px_auto] md:items-end">
        <div>
          <label className={labelCls}>Find customers</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} pl-9`} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, contact, email…" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Statement as of</label>
          <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value || today())} />
        </div>
        <div className="flex gap-2">
          <button type="button" disabled={!selectedCustomers.length || Boolean(busy)}
            onClick={() => generate(selectedCustomers)}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
            {selectedCustomers.length > 1 ? `Generate all (${selectedCustomers.length})` : "Generate"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {notice}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {customersLoading && customers.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading customers…
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Users className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            {customers.length === 0 ? "No customers yet." : "No customers match your search."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" className="h-4 w-4 align-middle accent-violet-600"
                    title="Select all shown"
                    checked={allVisibleOn} onChange={toggleAllVisible} />
                </th>
                <th className="px-3 py-2.5">Customer</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Terms</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const contact = [clean(c.contact_first_name), clean(c.contact_last_name)].filter(Boolean).join(" ")
                  || clean(c.billing_contact_name);
                const on = selected.has(c.id);
                return (
                  <tr key={c.id} onClick={() => toggle(c.id)}
                    className={`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${on ? "bg-violet-50/60 dark:bg-violet-950/20" : ""}`}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={on} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">{customerLabel(c)}</div>
                      {clean(c.contact_email || c.billing_contact_email) && (
                        <div className="text-xs text-slate-500">{clean(c.contact_email) || clean(c.billing_contact_email)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{contact || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500">{clean(c.terms) || "—"}</td>
                    <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1.5">
                        <button type="button" disabled={Boolean(busy)} onClick={() => generate([c])}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-violet-300 px-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300">
                          <FileText className="h-3.5 w-3.5" />Statement
                        </button>
                        <button type="button" disabled={Boolean(busy)} onClick={() => emailStatement(c)}
                          title={`Email the ${asOf} statement to ${customerLabel(c)}`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-300 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300">
                          {busy === `email:${c.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                          Email statement
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selected.size > 0 && (
        <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          {selected.size} customer{selected.size === 1 ? "" : "s"} selected — Generate all produces a printable stack
          (one page per customer) plus a CSV export of each activity ledger.
        </p>
      )}

      {statements && statements.length > 0 && (
        <StatementView
          statements={statements}
          company={company}
          onClose={() => setStatements(null)}
        />
      )}
    </div>
  );
}