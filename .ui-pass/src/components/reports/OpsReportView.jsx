import React, { useMemo, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { staffEntities } from "@/components/staff/staffEntities";
import { loadAllEntityRows } from "@/components/estimator/loadAllEntityRows";
import { useAllWorkOrders } from "@/lib/workOrderCache";
import { downloadCsv } from "@/components/shared/exportCsv";
import { loadGlLookup } from "@/components/shared/loadGlLookup";
import { GL_EXPORT_HEADERS, glExportRows, reportToGlEntries } from "@/components/shared/glExport";
import { paymentsFromArCsv } from "@/components/statements/statementModel";
import { TableSkeleton } from "@/components/ui/table-skeleton";
import {
  EmptyState,
  FilterBar,
  FilterField,
  FilterSelect,
  PageHeader,
  filterInputCls,
} from "@/components/kit";
import { BarChart3, Download, RefreshCw } from "lucide-react";
import {
  DEFAULT_QUEUE_FILTERS,
  filterQueueRows,
  flattenQueueRows,
  parseLocalDate,
} from "@/components/queues/productQueueModel";
import { OPS_REPORTS, OPS_REPORT_GROUPS, OPS_REPORT_MAP, SALES_DATE_BASES } from "./opsReportModel";
import { CcsDateField } from "@/components/ui/ccs-date-field";

const clean = (v) => String(v ?? "").trim();
const norm = (v) => clean(v).toLowerCase();

const DEFAULT_FILTERS = {
  from: "", to: "",
  salesperson: "all", location: "all",
  responsibility: "all", assignedTo: "all", designer: "all",
  dateBasis: "issue_date",
};

// Range filters share one from/to pair; the label tells the user which date
// the range applies to for the active report.
const RANGE_LABELS = { dueRange: "Due", createdRange: "Created", issueRange: "Issued", monthRange: "Month" };

// Session-gated datasets: these reads carry the staff session token to a
// function, so they cannot resolve (or even start) without a session.
const SESSION_GATED = new Set(["invoices", "payments", "purchaseOrders"]);

// Open purchase orders whose line detail the Parts Needed report will fetch.
// list_purchase_orders returns header snapshots only — line_items ship on
// get_purchase_order — so each open PO costs one invoke.
const OPEN_PO_DETAIL_CAP = 60;

// Filter controls share the kit's filterInputCls vocabulary (FilterBar and
// its FilterField/FilterSelect children carry the same styles).

const usd = (n) => {
  const v = Number(n || 0);
  return `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmt = (value, col) => {
  if (value === null || value === undefined || value === "") return "—";
  switch (col?.format) {
    case "money": return usd(value);
    case "int": return Number(value || 0).toLocaleString();
    case "num1": return Number(value || 0).toFixed(1);
    case "percent": return `${(Number(value || 0) * 100).toFixed(1)}%`;
    default: return String(value);
  }
};

const alignCls = (align) => (align === "right" ? "text-right" : "text-left");

function ReportTable({ report, onClearFilters }) {
  const { columns, rows, totals, rowLinks } = report;
  return (
    <div className="max-h-[70vh] overflow-auto ccs-scrollbar-hidden rounded-xl border border-slate-200 dark:border-slate-700">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="sticky top-0 bg-slate-100 dark:bg-slate-800">
            {columns.map((c) => (
              <th
                key={c.key}
                className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 ${alignCls(c.align)}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-800/40">
              {columns.map((c, ci) => {
                const cell = fmt(row[ci], c);
                const link = rowLinks?.[i];
                return (
                  <td key={c.key} className={`px-3 py-1.5 text-slate-800 dark:text-slate-200 ${alignCls(c.align)}`}>
                    {ci === 0 && link ? (
                      <Link className="text-sky-700 hover:underline dark:text-sky-400" to={link}>{cell}</Link>
                    ) : cell}
                  </td>
                );
              })}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="p-0">
                <EmptyState
                  compact
                  title="No data for this report."
                  message="Widen the date range or adjust the filters to see more rows."
                  actionLabel={onClearFilters ? "Clear filters" : undefined}
                  onAction={onClearFilters}
                />
              </td>
            </tr>
          )}
        </tbody>
        {totals && (
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/60">
              {totals.map((cell, ci) => (
                <td key={ci} className={`px-3 py-2 text-slate-900 dark:text-slate-100 ${alignCls(columns[ci]?.align)}`}>
                  {fmt(cell, columns[ci])}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

const uniqueSorted = (values) => [...new Set(values.map(clean).filter(Boolean))].sort((a, b) => a.localeCompare(b));

// Labelled "All + options" select for the report filter bar -- the kit
// FilterField supplies the label styling, FilterSelect the control.
function ReportFilterSelect({ label, value, onChange, options }) {
  return (
    <FilterField label={label}>
      <FilterSelect value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="all">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </FilterSelect>
    </FilterField>
  );
}

export default function OpsReportView({ reportKey, onSelect }) {
  const { sessionToken } = useAuth();
  const def = OPS_REPORT_MAP[reportKey] || OPS_REPORTS[0];
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [glNote, setGlNote] = useState("");
  const [glBusy, setGlBusy] = useState(false);
  useEffect(() => { setFilters(DEFAULT_FILTERS); setGlNote(""); }, [reportKey]);
  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value }));

  const { data: workOrders = [], isLoading: woLoading, error: woError, refetch: refetchWos } = useAllWorkOrders();

  const needSet = useMemo(
    () => new Set(Array.isArray(def.needs) ? def.needs : [def.needs]),
    [def],
  );

  const estimatesQuery = useQuery({
    queryKey: ["opsReports", "estimates"],
    queryFn: () => loadAllEntityRows({
      entity: staffEntities.AllInOneEstimate,
      sort: "-created_date",
      label: "Ops Reports estimates",
    }),
    enabled: needSet.has("estimates"),
    staleTime: 120000,
  });

  const invoicesQuery = useQuery({
    queryKey: ["opsReports", "invoices", sessionToken],
    queryFn: async () => {
      const res = await base44.functions.invoke("invoicingAction", {
        session_token: sessionToken,
        action: "list_invoices",
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Invoice data could not be verified completely.");
      return data.invoices || [];
    },
    enabled: needSet.has("invoices") && Boolean(sessionToken),
    staleTime: 120000,
  });

  // Payments have no list action — one export_ar call returns payments_csv,
  // parsed exactly the way CustomerStatements does.
  const paymentsQuery = useQuery({
    queryKey: ["opsReports", "payments", sessionToken],
    queryFn: async () => {
      const res = await base44.functions.invoke("invoicingAction", {
        session_token: sessionToken,
        action: "export_ar",
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Payment data could not be verified completely.");
      return paymentsFromArCsv(data.payments_csv || "");
    },
    enabled: needSet.has("payments") && Boolean(sessionToken),
    staleTime: 120000,
  });

  const builderPartsQuery = useQuery({
    queryKey: ["opsReports", "builderParts"],
    queryFn: () => loadAllEntityRows({
      entity: staffEntities.BuilderPart,
      sort: "-updated_date",
      label: "Ops Reports builder parts",
    }),
    enabled: needSet.has("builderParts"),
    staleTime: 120000,
  });

  const builderProductsQuery = useQuery({
    queryKey: ["opsReports", "builderProducts"],
    queryFn: () => loadAllEntityRows({
      entity: staffEntities.BuilderProduct,
      sort: "-updated_date",
      label: "Ops Reports builder products",
    }),
    enabled: needSet.has("builderProducts"),
    staleTime: 120000,
  });

  const inventoryQuery = useQuery({
    queryKey: ["opsReports", "inventoryItems"],
    queryFn: () => loadAllEntityRows({
      entity: staffEntities.Inventory,
      sort: "-updated_date",
      label: "Ops Reports inventory",
    }),
    enabled: needSet.has("inventoryItems"),
    staleTime: 120000,
  });

  // PurchaseOrder is not staff-readable — purchaseOrderAction it is. The list
  // action returns header snapshots only; line_items (needed for on-order
  // qty per inventory item) live on get_purchase_order, so open POs are
  // fetched in small batches and capped to protect the invoke budget.
  const purchaseOrdersQuery = useQuery({
    queryKey: ["opsReports", "purchaseOrders", sessionToken],
    queryFn: async () => {
      const res = await base44.functions.invoke("purchaseOrderAction", {
        session_token: sessionToken,
        action: "list_purchase_orders",
      });
      const data = res?.data || res;
      if (!data?.success) throw new Error(data?.error || "Purchase order data could not be verified completely.");
      const open = (data.purchase_orders || [])
        .filter((po) => ["sent", "partially_received"].includes(clean(po?.status)))
        .slice(0, OPEN_PO_DETAIL_CAP);
      const out = [];
      for (let i = 0; i < open.length; i += 5) {
        // eslint-disable-next-line no-await-in-loop -- intentional small batches
        const chunk = await Promise.all(open.slice(i, i + 5).map((po) =>
          base44.functions.invoke("purchaseOrderAction", {
            session_token: sessionToken,
            action: "get_purchase_order",
            purchase_order_id: po.id,
          }).then((r) => (r?.data || r)?.purchase_order || null).catch(() => null)));
        out.push(...chunk.filter(Boolean));
      }
      return out;
    },
    enabled: needSet.has("purchaseOrders") && Boolean(sessionToken),
    staleTime: 120000,
  });

  const queryByNeed = {
    workOrders: { isLoading: woLoading, error: woError, refetch: refetchWos },
    estimates: estimatesQuery,
    invoices: invoicesQuery,
    payments: paymentsQuery,
    builderParts: builderPartsQuery,
    builderProducts: builderProductsQuery,
    inventoryItems: inventoryQuery,
    purchaseOrders: purchaseOrdersQuery,
  };
  const dataByNeed = {
    workOrders,
    estimates: estimatesQuery.data || [],
    invoices: invoicesQuery.data || [],
    payments: paymentsQuery.data || [],
    builderParts: builderPartsQuery.data || [],
    builderProducts: builderProductsQuery.data || [],
    inventoryItems: inventoryQuery.data || [],
    purchaseOrders: purchaseOrdersQuery.data || [],
  };

  const needed = [...needSet];
  const loading = needed.some((k) => queryByNeed[k]?.isLoading)
    || needed.some((k) => SESSION_GATED.has(k) && !sessionToken);
  const loadError = needed.map((k) => queryByNeed[k]?.error).find(Boolean) || null;
  const retry = () => needed.forEach((k) => queryByNeed[k]?.refetch?.());

  const estimates = dataByNeed.estimates;

  // --- filter option lists ------------------------------------------------------
  const options = useMemo(() => {
    const flat = flattenQueueRows(workOrders);
    return {
      responsibility: uniqueSorted(flat.map((r) => r.responsibility)),
      assignedTo: uniqueSorted(flat.map((r) => r.assignedTo)),
      designer: uniqueSorted(flat.map((r) => r.designer)),
      salesperson: uniqueSorted([
        ...workOrders.map((w) => w?.sales_rep || w?.representative),
        ...estimates.map((e) => e?.salesperson),
      ]),
      location: uniqueSorted(estimates.map((e) => e?.sales_center)),
    };
  }, [workOrders, estimates]);

  // --- filtered inputs + build ---------------------------------------------------
  const report = useMemo(() => {
    const from = parseLocalDate(filters.from);
    const to = parseLocalDate(filters.to);
    const eod = to ? new Date(to.getTime() + 86399999) : null;
    const inRange = (dateStr) => {
      if (!from && !to) return true;
      const d = parseLocalDate(dateStr);
      if (!d) return false;
      return (!from || d >= from) && (!eod || d <= eod);
    };

    let queueRows = [];
    let wos = workOrders;
    let ests = estimates;
    let invs = dataByNeed.invoices;
    let pays = dataByNeed.payments;

    if (needSet.has("workOrders")) {
      queueRows = filterQueueRows(flattenQueueRows(workOrders), {
        ...DEFAULT_QUEUE_FILTERS,
        responsibility: filters.responsibility,
        assignedTo: filters.assignedTo,
        designer: filters.designer,
      });
      if (def.filters.includes("dueRange") && (from || to)) {
        queueRows = queueRows.filter((r) => inRange(r.due || r.woDue));
      }
      wos = workOrders.filter((wo) => {
        if (def.filters.includes("createdRange") && !inRange(wo?.created_date)) return false;
        if (filters.salesperson !== "all" && norm(wo?.sales_rep || wo?.representative) !== norm(filters.salesperson)) return false;
        return true;
      });
    }
    if (needSet.has("estimates")) {
      ests = estimates.filter((est) => {
        if (def.filters.includes("createdRange") && !inRange(est?.created_date)) return false;
        if (filters.salesperson !== "all" && clean(est?.salesperson) !== filters.salesperson) return false;
        if (filters.location !== "all" && clean(est?.sales_center) !== filters.location) return false;
        return true;
      });
    }
    if (needSet.has("invoices")) {
      invs = invs.filter((inv) => {
        if (def.filters.includes("issueRange") && !inRange(inv?.issue_date || inv?.due_date)) return false;
        // monthRange bounds the sales report's basis month — the invoice
        // side lands on its basis date, payments on their paid date.
        if (def.filters.includes("monthRange") && (from || to)) {
          const basisDate = filters.dateBasis === "paid_date" ? inv?.paid_date : inv?.issue_date;
          if (!inRange(basisDate)) return false;
        }
        return true;
      });
      if (def.filters.includes("monthRange") && (from || to)) {
        pays = pays.filter((p) => inRange(p?.paid_date || p?.created_date));
      }
    }

    return def.build({
      queueRows,
      workOrders: wos,
      estimates: ests,
      invoices: invs,
      payments: pays,
      builderParts: dataByNeed.builderParts,
      builderProducts: dataByNeed.builderProducts,
      inventoryItems: dataByNeed.inventoryItems,
      purchaseOrders: dataByNeed.purchaseOrders,
      dateBasis: filters.dateBasis,
      now: new Date(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are the stable query data refs
  }, [
    def, workOrders, filters, needSet,
    estimatesQuery.data, invoicesQuery.data, paymentsQuery.data,
    builderPartsQuery.data, builderProductsQuery.data,
    inventoryQuery.data, purchaseOrdersQuery.data,
  ]);

  const exportCsv = () => {
    const headers = report.columns.map((c) => c.label);
    const body = report.totals ? [...report.rows, report.totals] : report.rows;
    downloadCsv(`${def.key}.csv`, headers, body);
  };

  // GL-coded export: same report rows as Export CSV — the totals row stays
  // out so a journal import never double-counts the rollup — mapped to
  // date/memo/entity_ref/gl_account/debit/credit. gl_account resolves via the
  // MarkupCategory/Inventory/PartTemplate mappings; unmapped rows still
  // export and are counted so Manage Accounts can be completed.
  const exportGl = async () => {
    if (glBusy || !report.rows.length) return;
    setGlBusy(true);
    setGlNote("");
    try {
      const lookup = await loadGlLookup();
      const entries = reportToGlEntries({ columns: report.columns, rows: report.rows, source: def.title });
      const { rows, unmapped } = glExportRows(entries, lookup);
      downloadCsv(`${def.key}-gl.csv`, GL_EXPORT_HEADERS, rows);
      setGlNote(unmapped
        ? `${unmapped} of ${rows.length} GL rows have no account mapping — map categories/items in Manage Accounts.`
        : `${rows.length} GL rows exported — all mapped.`);
    } catch (e) {
      setGlNote(e?.message || "GL export failed.");
    } finally {
      setGlBusy(false);
    }
  };

  const has = (f) => def.filters.includes(f);
  const rangeKey = Object.keys(RANGE_LABELS).find((k) => def.filters.includes(k));
  const rangeLabel = rangeKey ? RANGE_LABELS[rangeKey] : "Date";
  const filtersActive = filters.from || filters.to || filters.salesperson !== "all" || filters.location !== "all"
    || filters.responsibility !== "all" || filters.assignedTo !== "all" || filters.designer !== "all"
    || filters.dateBasis !== DEFAULT_FILTERS.dateBasis;
  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      {/* Report picker */}
      <aside className="w-full max-h-52 shrink-0 overflow-y-auto border-b border-slate-200 bg-white px-3 py-4 dark:border-slate-700 dark:bg-slate-900 md:w-56 md:max-h-none md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center gap-2 px-1">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Ops Reports</span>
        </div>
        {OPS_REPORT_GROUPS.map((group) => (
          <div key={group} className="mb-4">
            <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{group}</div>
            {OPS_REPORTS.filter((r) => r.group === group).map((r) => (
              <button
                key={r.key}
                onClick={() => onSelect(r.key)}
                className={`block w-full rounded-lg px-2 py-1.5 text-left text-sm ${
                  r.key === def.key
                    ? "bg-violet-100 font-semibold text-violet-800 dark:bg-violet-900/40 dark:text-violet-200"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {r.title}
              </button>
            ))}
          </div>
        ))}
      </aside>

      {/* Report body */}
      <main className="min-w-0 flex-1 overflow-y-auto p-4 md:p-6">
        <div className="mx-auto max-w-6xl">
          <PageHeader
            className="mb-1"
            breadcrumbs={[{ label: "Ops Reports" }, { label: def.title }]}
            title={def.title}
            subtitle={def.description}
            actions={(
              <>
                <button
                  type="button"
                  onClick={retry}
                  className="rounded-lg border border-slate-300 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                  title="Reload data"
                >
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={exportCsv}
                  disabled={!report.rows.length}
                  className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  <Download className="h-3.5 w-3.5" /> Export CSV
                </button>
                <button
                  type="button"
                  onClick={exportGl}
                  disabled={glBusy || !report.rows.length}
                  title="Journal-style CSV (date, memo, entity_ref, gl_account, debit, credit) with GL account codes"
                  className="flex items-center gap-1.5 rounded-lg border border-violet-300 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-50 disabled:opacity-50 dark:border-violet-800 dark:text-violet-300 dark:hover:bg-violet-950/40"
                >
                  {glBusy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                  Download GL export
                </button>
              </>
            )}
          />
          {glNote && (
            <p className="mb-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">{glNote}</p>
          )}

          {/* Filters */}
          {def.filters.length > 0 && (
          <FilterBar
            className="items-end bg-white dark:bg-slate-900"
            actions={filtersActive ? (
              <button type="button" onClick={clearFilters} className="pb-1 text-xs font-medium text-violet-600 hover:underline dark:text-violet-300">
                Clear filters
              </button>
            ) : null}
          >
            {rangeKey && (
              <>
                <FilterField label={`${rangeLabel} From`}>
                  <CcsDateField className={filterInputCls} value={filters.from} onChange={(e) => set("from", e.target.value)} />
                </FilterField>
                <FilterField label={`${rangeLabel} To`}>
                  <CcsDateField className={filterInputCls} value={filters.to} onChange={(e) => set("to", e.target.value)} />
                </FilterField>
              </>
            )}
            {has("responsibility") && (
              <ReportFilterSelect label="Responsibility" value={filters.responsibility} onChange={(v) => set("responsibility", v)} options={options.responsibility} />
            )}
            {has("assignedTo") && (
              <ReportFilterSelect label="Assigned To" value={filters.assignedTo} onChange={(v) => set("assignedTo", v)} options={options.assignedTo} />
            )}
            {has("designer") && (
              <ReportFilterSelect label="Designer" value={filters.designer} onChange={(v) => set("designer", v)} options={options.designer} />
            )}
            {has("salesperson") && (
              <ReportFilterSelect label="Salesperson" value={filters.salesperson} onChange={(v) => set("salesperson", v)} options={options.salesperson} />
            )}
            {has("location") && (
              <ReportFilterSelect label="Sales Center" value={filters.location} onChange={(v) => set("location", v)} options={options.location} />
            )}
            {has("dateBasis") && (
              <FilterField label="Date Basis">
                <FilterSelect value={filters.dateBasis} onChange={(e) => set("dateBasis", e.target.value)}>
                  {Object.entries(SALES_DATE_BASES).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </FilterSelect>
              </FilterField>
            )}
          </FilterBar>
          )}

          {def.notes && (
            <p className="mb-3 text-[11px] leading-snug text-slate-400 dark:text-slate-500">{def.notes}</p>
          )}

          {loading ? (
            <TableSkeleton columns={5} rows={8} />
          ) : loadError ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
              <div className="font-semibold">{def.title} could not be verified completely.</div>
              <div className="mt-1 text-xs">{loadError?.message || "Data could not be loaded."}</div>
              <button onClick={retry} className="mt-2 rounded-lg border border-red-300 px-2.5 py-1 text-xs font-semibold hover:bg-red-100 dark:border-red-800 dark:hover:bg-red-900/40">
                Retry
              </button>
            </div>
          ) : (
            <ReportTable report={report} onClearFilters={filtersActive ? clearFilters : undefined} />
          )}
        </div>
      </main>
    </div>
  );
}