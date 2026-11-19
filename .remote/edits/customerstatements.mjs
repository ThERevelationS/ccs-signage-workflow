// Edits for src/pages/CustomerStatements.jsx — UI-kit adoption.
export default [
  // 0a. Link is superseded by RecordLink.
  {
    old: `import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";`,
    new: `import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";`,
  },
  // 0b. Search is superseded by FilterSearchInput's built-in icon.
  {
    old: `  Printer,
  RefreshCw,
  Search,
  Users,
} from "lucide-react";`,
    new: `  Printer,
  RefreshCw,
  Users,
} from "lucide-react";`,
  },
  // 1. Kit import.
  {
    old: `import { CcsDateField } from "@/components/ui/ccs-date-field";

const clean = (v) => String(v ?? "").trim();`,
    new: `import { CcsDateField } from "@/components/ui/ccs-date-field";
import {
  DataTableShell,
  FilterField,
  FilterSearchInput,
  PageHeader,
  RecordLink,
  Td,
  Th,
  Tr,
  filterInputCls,
} from "@/components/kit";

const clean = (v) => String(v ?? "").trim();`,
  },
  // 2. inputCls aliases the kit vocabulary; labelCls is superseded by
  //    FilterField's built-in label.
  {
    old: `const inputCls =
  "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls =
  "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400";`,
    new: `// Shared kit input vocabulary (adds placeholder styling over the old copy).
const inputCls = filterInputCls;`,
  },
  // 3. Page header -> PageHeader.
  {
    old: `      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Customer Statements</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            CoreBridge-style statement of account — activity ledger, aging and a printable remittance copy.
          </p>
        </div>
        <button type="button" onClick={() => refetchCustomers()}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
          <RefreshCw className={\`h-4 w-4 \${customersLoading ? "animate-spin" : ""}\`} />Refresh
        </button>
      </div>`,
    new: `      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Customer Statements" }]}
        icon={FileText}
        title="Customer Statements"
        subtitle="CoreBridge-style statement of account — activity ledger, aging and a printable remittance copy."
        actions={(
          <button type="button" onClick={() => refetchCustomers()}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={\`h-4 w-4 \${customersLoading ? "animate-spin" : ""}\`} />Refresh
          </button>
        )}
      />`,
  },
  // 4. Controls card: labelled fields through FilterField + FilterSearchInput
  //    (the card grid itself is unchanged).
  {
    old: `        <div>
          <label className={labelCls}>Find customers</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className={\`\${inputCls} pl-9\`} value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company, contact, email…" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Statement as of</label>
          <CcsDateField className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value || today())} />
        </div>`,
    new: `        <FilterField label="Find customers">
          <FilterSearchInput containerClassName="min-w-0" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search company, contact, email…" />
        </FilterField>
        <FilterField label="Statement as of">
          <CcsDateField className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value || today())} />
        </FilterField>`,
  },
  // 5. Customer table -> DataTableShell (empty state via the shell).
  {
    old: `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
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
                    className={\`cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50 \${on ? "bg-violet-50/60 dark:bg-violet-950/20" : ""}\`}>
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={on} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Link className="font-semibold text-sky-600 hover:underline dark:text-sky-400" to={\`/Customer360?id=\${c.id}\`} onClick={(e) => e.stopPropagation()}>
                        {customerLabel(c)}
                      </Link>
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
                          title={\`Email the \${asOf} statement to \${customerLabel(c)}\`}
                          className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-300 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300">
                          {busy === \`email:\${c.id}\` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
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
      </div>`,
    new: `      {customersLoading && customers.length === 0 ? (
        <div className="flex items-center justify-center rounded-2xl border border-slate-200 bg-white py-16 text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          <Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading customers…
        </div>
      ) : (
        <DataTableShell
          head={[
            <Th key="sel" className="w-10 px-3">
              <input type="checkbox" className="h-4 w-4 align-middle accent-violet-600"
                title="Select all shown"
                checked={allVisibleOn} onChange={toggleAllVisible} />
            </Th>,
            "Customer", "Contact", "Terms", { label: "Actions", className: "text-right" },
          ]}
          isEmpty={visible.length === 0}
          emptyState={customers.length === 0
            ? { icon: Users, title: "No customers yet.", message: "Add a customer before generating statements." }
            : { icon: Users, title: "No customers match your search.", message: "Try a different company, contact, or email." }}
        >
          {visible.map((c) => {
            const contact = [clean(c.contact_first_name), clean(c.contact_last_name)].filter(Boolean).join(" ")
              || clean(c.billing_contact_name);
            const on = selected.has(c.id);
            return (
              <Tr key={c.id} onClick={() => toggle(c.id)}
                className={\`cursor-pointer \${on ? "bg-violet-50/60 dark:bg-violet-950/20" : ""}\`}>
                <Td className="px-3" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" className="h-4 w-4 accent-violet-600" checked={on} onChange={() => toggle(c.id)} />
                </Td>
                <Td className="px-3">
                  <RecordLink kind="customer" id={c.id} className="font-semibold" onClick={(e) => e.stopPropagation()}>
                    {customerLabel(c)}
                  </RecordLink>
                  {clean(c.contact_email || c.billing_contact_email) && (
                    <div className="text-xs text-slate-500">{clean(c.contact_email) || clean(c.billing_contact_email)}</div>
                  )}
                </Td>
                <Td className="px-3 text-slate-600 dark:text-slate-300">{contact || "—"}</Td>
                <Td className="px-3 text-slate-500">{clean(c.terms) || "—"}</Td>
                <Td className="px-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="inline-flex items-center gap-1.5">
                    <button type="button" disabled={Boolean(busy)} onClick={() => generate([c])}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-violet-300 px-2.5 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300">
                      <FileText className="h-3.5 w-3.5" />Statement
                    </button>
                    <button type="button" disabled={Boolean(busy)} onClick={() => emailStatement(c)}
                      title={\`Email the \${asOf} statement to \${customerLabel(c)}\`}
                      className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-sky-300 px-2.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 dark:border-sky-800 dark:text-sky-300">
                      {busy === \`email:\${c.id}\` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                      Email statement
                    </button>
                  </div>
                </Td>
              </Tr>
            );
          })}
        </DataTableShell>
      )}`,
  },
];
