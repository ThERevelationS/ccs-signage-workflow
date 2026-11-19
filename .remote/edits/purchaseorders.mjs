// Edits for src/pages/PurchaseOrders.jsx — UI-kit adoption.
export default [
  // 1. Kit import; drop Search (FilterSearchInput carries its own icon) and
  //    Link (all deep-links now go through RecordLink).
  {
    old: `import { Link } from "react-router-dom";
import { TableSkeleton } from "@/components/ui/table-skeleton";`,
    new: `import { TableSkeleton } from "@/components/ui/table-skeleton";`,
  },
  {
    old: `import { NotificationTriggers } from "@/components/workflow/NotificationService";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Send,
  X,
} from "lucide-react";`,
    new: `import { NotificationTriggers } from "@/components/workflow/NotificationService";
import {
  DataTableShell,
  FilterBar,
  FilterSearchInput,
  PageHeader,
  RecordLink,
  StatusChip,
  Td,
  Tr,
  filterInputCls,
} from "@/components/kit";
import {
  CheckCircle2,
  ChevronRight,
  FileText,
  Loader2,
  Package,
  Plus,
  Receipt,
  RefreshCw,
  Send,
  X,
} from "lucide-react";`,
  },
  // 2. Drop local STATUS_STYLES; alias inputCls to the kit vocabulary.
  {
    old: `const STATUS_STYLES = {
  draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300",
  partially_received: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  received: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/60 dark:text-red-300",
};

const inputCls = "min-h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-violet-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100";
const labelCls`,
    new: `// Shared kit input vocabulary (adds placeholder styling over the old copy).
const inputCls = filterInputCls;
const labelCls`,
  },
  // 3. StatusBadge renders through kit StatusChip (STATUS_LABELS retained for
  //    the filter pills; label prop keeps "Partial" wording).
  {
    old: `function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return (
    <span className={\`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold \${STATUS_STYLES[s] || STATUS_STYLES.draft}\`}>
      {STATUS_LABELS[s] || s}
    </span>
  );
}`,
    new: `function StatusBadge({ status }) {
  const s = clean(status) || "draft";
  return <StatusChip status={s} label={STATUS_LABELS[s] || s} />;
}`,
  },
  // 4. Payment-status chips in the detail header -> StatusChip.
  {
    old: `                  <StatusBadge status={po.status} />
                  {po.payment_status === "paid" && (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300">Paid</span>
                  )}
                  {po.payment_status === "invoiced" && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">Vendor bill received</span>
                  )}`,
    new: `                  <StatusBadge status={po.status} />
                  {po.payment_status === "paid" && <StatusChip status="paid" />}
                  {po.payment_status === "invoiced" && <StatusChip tone="amber" label="Vendor bill received" />}`,
  },
  // 5. Linked WO/estimate/opportunity rows -> RecordLink.
  {
    old: `              {po.work_order_id && <div>WorkOrder: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/JobWorkspace?wo=\${po.work_order_id}\`}>{po.work_order_id}</Link></div>}
              {po.estimate_id && <div>Estimate: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/EstimateDetail?id=\${po.estimate_id}\`}>{po.estimate_id}</Link></div>}
              {po.opportunity_id && <div>Opportunity: <Link className="text-violet-600 hover:underline dark:text-violet-300" to={\`/Opportunities?open=\${po.opportunity_id}\`}>{po.opportunity_id}</Link></div>}`,
    new: `              {po.work_order_id && <div>WorkOrder: <RecordLink kind="workorder" id={po.work_order_id} /></div>}
              {po.estimate_id && <div>Estimate: <RecordLink kind="estimate" id={po.estimate_id} /></div>}
              {po.opportunity_id && <div>Opportunity: <RecordLink kind="opportunity" id={po.opportunity_id} /></div>}`,
  },
  // 6. Page header -> PageHeader (icon Package already imported).
  {
    old: `      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Purchase Orders</h1>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Vendor POs and receiving.{openValue > 0 ? \` Open PO value: \${usd(openValue)}.\` : ""}{overdueCount > 0 ? \` \${overdueCount} overdue.\` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
            <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
          </button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
            <Plus className="h-4 w-4" />New PO
          </button>
        </div>
      </div>`,
    new: `      <PageHeader
        breadcrumbs={[{ label: "Financials", to: "/Financials" }, { label: "Purchase Orders" }]}
        icon={Package}
        title="Purchase Orders"
        subtitle={\`Vendor POs and receiving.\${openValue > 0 ? \` Open PO value: \${usd(openValue)}.\` : ""}\${overdueCount > 0 ? \` \${overdueCount} overdue.\` : ""}\`}
        actions={(
          <>
            <button type="button" onClick={load} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300">
              <RefreshCw className={\`h-4 w-4 \${loading ? "animate-spin" : ""}\`} />Refresh
            </button>
            <button type="button" onClick={() => setShowCreate(true)} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700">
              <Plus className="h-4 w-4" />New PO
            </button>
          </>
        )}
      />`,
  },
  // 7. Filter row -> FilterBar (pills = presets, SavedViews = views).
  {
    old: `      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={\`\${inputCls} pl-9\`} value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search PO # or vendor…" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {["", "draft", "sent", "partially_received", "received", "cancelled"].map((s) => (
            <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
              className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}\`}>
              {s ? STATUS_LABELS[s] : "All"}
            </button>
          ))}
        </div>
        <SavedViews
          storageKey="views.purchase_orders"
          getState={() => ({ status, query })}
          activeName={viewName}
          onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
        />
      </div>`,
    new: `      <FilterBar
        search={(
          <FilterSearchInput value={query} onChange={(e) => { setViewName(""); setQuery(e.target.value); }} placeholder="Search PO # or vendor…" />
        )}
        presets={(
          <div className="flex flex-wrap gap-1.5">
            {["", "draft", "sent", "partially_received", "received", "cancelled"].map((s) => (
              <button type="button" key={s || "all"} onClick={() => { setViewName(""); setStatus(s); }}
                className={\`min-h-9 rounded-full px-3 text-xs font-semibold \${status === s ? "bg-violet-600 text-white" : "border border-slate-300 text-slate-600 dark:border-slate-600 dark:text-slate-300"}\`}>
                {s ? STATUS_LABELS[s] : "All"}
              </button>
            ))}
          </div>
        )}
        views={(
          <SavedViews
            storageKey="views.purchase_orders"
            getState={() => ({ status, query })}
            activeName={viewName}
            onApply={(s, name) => { setStatus(s.status || ""); setQuery(s.query || ""); setViewName(name || ""); }}
          />
        )}
      />`,
  },
  // 8. List table -> DataTableShell (empty state gains a next-step CTA).
  {
    old: `      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        {loading && purchaseOrders.length === 0 ? (
          <TableSkeleton columns={6} />
        ) : visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Package className="mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
            No purchase orders yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <tr>
                <th className="px-4 py-2.5">PO #</th><th className="px-4 py-2.5">Vendor</th>
                <th className="px-4 py-2.5">Expected</th><th className="px-4 py-2.5 text-right">Total</th>
                <th className="px-4 py-2.5">Status</th><th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {visibleOrders.map((po) => (
                <tr key={po.id} onClick={() => setOpenId(po.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-slate-100">{po.po_number}</td>
                  <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300">{po.vendor_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {po.expected_date || "—"}
                    {isOverdue(po) && <span className="ml-1.5 inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-700 dark:bg-red-950/60 dark:text-red-300">Overdue</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right font-medium">{usd(po.total)}</td>
                  <td className="px-4 py-2.5"><StatusBadge status={po.status} /></td>
                  <td className="px-2 py-2.5 text-slate-400"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>`,
    new: `      {loading && purchaseOrders.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"><TableSkeleton columns={6} /></div>
      ) : (
        <DataTableShell
          head={["PO #", "Vendor", "Expected", { label: "Total", className: "text-right" }, "Status", { label: "", className: "px-2" }]}
          isEmpty={visibleOrders.length === 0}
          emptyState={woParam
            ? { icon: Package, title: "No purchase orders for this job.", message: "POs created with a linked work order appear here." }
            : { icon: Package, title: "No purchase orders yet.", message: "Create the first PO to start vendor ordering and receiving.", actionLabel: "New PO", onAction: () => setShowCreate(true) }}
        >
          {visibleOrders.map((po) => (
            <Tr key={po.id} onClick={() => setOpenId(po.id)} className="cursor-pointer">
              <Td className="font-semibold text-slate-900 dark:text-slate-100">{po.po_number}</Td>
              <Td className="text-slate-700 dark:text-slate-300">{po.vendor_name}</Td>
              <Td className="text-slate-500">
                {po.expected_date || "—"}
                {isOverdue(po) && <StatusChip status="overdue" size="sm" className="ml-1.5" />}
              </Td>
              <Td className="text-right font-medium">{usd(po.total)}</Td>
              <Td><StatusBadge status={po.status} /></Td>
              <Td className="px-2 text-slate-400"><ChevronRight className="h-4 w-4" /></Td>
            </Tr>
          ))}
        </DataTableShell>
      )}`,
  },
];
