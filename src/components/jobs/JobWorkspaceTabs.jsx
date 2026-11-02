// D-03 — Job workspace tab strip + tab panels (CoreBridge "Order.aspx" tabs,
// COREBRIDGE_MAP.md §5): Products / Order Contact / Address Info / Notes /
// Order History / Overrides / Payments.
//
// This file renders the strip and the SELF-CONTAINED panels (contact,
// address, notes, history, overrides). The Products and Payments panels are
// the page's existing products table + financials card — the parent swaps
// them in by active tab so their state (transition handlers, deposit form)
// never remounts-loses anything.
//
// Zero entity reads inside this file: the parent owns the lazy
// ProductActivity/OpportunityActivity query and passes its rows down.

import { Link } from "react-router-dom";
import {
  JOB_WORKSPACE_TABS,
  orderContactFields,
  addressInfoGroups,
  orderNoteRows,
  productOverrideRows,
  overrideEventRows,
} from "./jobWorkspaceTabsModel.js";
import { ORDER_HISTORY_ACTOR_CSS, ORDER_HISTORY_ACTOR_LABELS, historyToCsv } from "./orderHistoryModel.js";
import { EmptyState } from "@/components/kit";

const clean = (v) => String(v ?? "").trim();

const fmtAt = (v) => {
  const s = clean(v);
  if (!s) return "";
  const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
  return Number.isNaN(d.getTime())
    ? s
    : `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};

// ---------------------------------------------------------------------------
// Tab strip — one button per registry entry; badges are caller-computed
// counts ({products, notes, overrides, payments}).
// ---------------------------------------------------------------------------

export function WorkspaceTabBar({ active, onSelect, badges = {} }) {
  return (
    <div
      role="tablist"
      aria-label="Job workspace sections"
      className="flex flex-wrap items-center gap-1 border-b border-gray-200"
    >
      {JOB_WORKSPACE_TABS.map((tab) => {
        const isActive = tab.key === active;
        const count = badges[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            data-tab={tab.key}
            onClick={() => onSelect(tab.key)}
            className={
              "rounded-t border border-b-0 px-3 py-1.5 text-xs font-medium transition-colors " +
              (isActive
                ? "border-gray-300 bg-white text-sky-800 shadow-[inset_0_2px_0_0_theme(colors.sky.600)]"
                : "border-transparent text-gray-500 hover:bg-gray-100 hover:text-gray-800")
            }
          >
            {tab.label}
            {Number.isFinite(count) && count > 0 && (
              <span
                className={
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                  (isActive ? "bg-sky-100 text-sky-700" : "bg-gray-100 text-gray-500")
                }
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order Contact — the people on the order (orderContactFields).
// ---------------------------------------------------------------------------

export function OrderContactPanel({ workOrder }) {
  const fields = orderContactFields(workOrder);
  return (
    <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="contact">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <div key={f.key}>
            <dt className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{f.label}</dt>
            <dd className={`mt-0.5 text-sm ${f.missing ? "text-gray-300" : "text-gray-800"}`}>
              {f.missing ? "—" : f.value}
            </dd>
          </div>
        ))}
      </dl>
      {workOrder?.customer_id && (
        <div className="mt-3 text-xs">
          <Link className="text-sky-700 hover:underline" to={`/Customer360?id=${workOrder.customer_id}`}>
            Open customer record →
          </Link>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Address Info — site / billing / ship-to blocks (addressInfoGroups).
// ---------------------------------------------------------------------------

export function AddressInfoPanel({ workOrder }) {
  const groups = addressInfoGroups(workOrder);
  return (
    <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="address">
      <div className="grid gap-3 md:grid-cols-3">
        {groups.map((g) => (
          <div key={g.key} className="rounded border border-gray-200 bg-gray-50/60 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</div>
            {g.missing ? (
              <div className="mt-2 text-xs text-gray-400">Not recorded.</div>
            ) : (
              <>
                {g.name && <div className="mt-1.5 text-sm font-medium text-gray-800">{g.name}</div>}
                {g.attention && <div className="text-xs text-gray-500">Attn: {g.attention}</div>}
                <div className="mt-1 text-sm text-gray-700">
                  {g.lines.map((l, i) => <div key={i}>{l}</div>)}
                </div>
                {(g.phone || g.email) && (
                  <div className="mt-1.5 text-xs text-gray-500">
                    {[g.phone, g.email].filter(Boolean).join(" · ")}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Notes — order + work + per-product channel notes, newest first.
// ---------------------------------------------------------------------------

const SCOPE_TONES = {
  order: "bg-sky-100 text-sky-700",
  work: "bg-violet-100 text-violet-700",
  product: "bg-amber-100 text-amber-800",
};

export function NotesPanel({ workOrder }) {
  const rows = orderNoteRows(workOrder);
  if (!rows.length) {
    return (
      <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="notes">
        <EmptyState compact title="No notes on this order yet." />
      </div>
    );
  }
  return (
    <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="notes">
      <ul className="divide-y divide-gray-100">
        {rows.map((n) => (
          <li key={n.key} className="flex items-start gap-2 px-1 py-2">
            <span className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${SCOPE_TONES[n.scope] || "bg-gray-100 text-gray-600"}`}>
              {n.scope_label}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-pre-line text-sm text-gray-800">{n.text}</span>
              <span className="mt-0.5 block text-[10px] text-gray-400">
                {[n.channel_label, n.product, n.done === true ? "done" : "", n.done === false ? "open" : ""]
                  .filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="shrink-0 text-right text-[10px] text-gray-400">
              {n.author && <span className="block">{n.author}</span>}
              {n.at && <span className="block">{fmtAt(n.at)}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Order History — merged chronological feed (mergeOrderHistorySources output
// passed in by the parent), actor-colored, newest first + CSV download.
// ---------------------------------------------------------------------------

export function OrderHistoryPanel({ feed = [], loading = false, error = "", workOrder }) {
  const ref = clean(workOrder?.corbridge_invoice_number || workOrder?.title || workOrder?.id);
  const rows = [...feed].reverse(); // merged feed is chronological → newest first
  const downloadCsv = () => {
    const blob = new Blob([historyToCsv(feed)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `order-history-${ref || "wo"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="history">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] text-gray-400">
          Status changes, conversions, payments and activity — staff black, customer green, vendor blue, system gray.
        </span>
        {rows.length > 0 && (
          <button type="button" onClick={downloadCsv}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 text-xs font-semibold text-sky-700 hover:bg-sky-50">
            Download history
          </button>
        )}
      </div>
      {loading && <div className="py-2 text-xs text-gray-400">Loading order history…</div>}
      {error && <div className="rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">{error}</div>}
      {!loading && !rows.length && (
        <EmptyState compact title="No order history recorded yet." />
      )}
      <ul className="divide-y divide-gray-100">
        {rows.map((row, idx) => {
          const actorCss = ORDER_HISTORY_ACTOR_CSS[row.actor_type] || ORDER_HISTORY_ACTOR_CSS.system;
          return (
            <li key={row.id || idx} className="flex items-baseline gap-2 px-1 py-1.5 text-xs">
              <span className="w-36 shrink-0 text-gray-400">{fmtAt(row.occurred_at) || "—"}</span>
              <span className={`shrink-0 font-medium ${actorCss}`} title={ORDER_HISTORY_ACTOR_LABELS[row.actor_type] || row.actor_type}>
                {row.actor || row.actor_type || "—"}
              </span>
              <span className="min-w-0 flex-1 text-gray-700">{row.label}</span>
              {row.amount !== null && row.amount !== undefined && row.amount !== "" && (
                <span className="shrink-0 font-medium text-gray-800">
                  ${Number(row.amount).toFixed(2)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overrides — products flagged "Overridden during order entry" + the lazy
// ProductActivity override audit rows.
// ---------------------------------------------------------------------------

export function OverridesPanel({ workOrder, productActivity = [], loading = false }) {
  const flagged = productOverrideRows(workOrder);
  const events = overrideEventRows(productActivity);
  const empty = !flagged.length && !events.length;
  return (
    <div className="rounded-b rounded-tr border border-gray-200 bg-white p-3" data-panel="overrides">
      {loading && <div className="py-1 text-xs text-gray-400">Loading override audit…</div>}
      {empty && !loading && (
        <EmptyState
          compact
          title="No overrides on this order."
          message="Products edited by hand after estimate conversion land here with who/when/what changed."
        />
      )}
      {flagged.length > 0 && (
        <>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Flagged products ({flagged.length})
          </div>
          <ul className="mb-3 divide-y divide-gray-100 rounded border border-amber-100 bg-amber-50/50">
            {flagged.map((f) => (
              <li key={f.product_id} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-gray-800">{f.name}</span>
                  <span
                    className="rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900"
                    title={f.tooltip}
                  >
                    {f.badge}
                  </span>
                </div>
                {f.edits.length > 0 && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-gray-500">
                    {f.edits.map((e, i) => (
                      <li key={i}>
                        {String(e.field || "").replace(/_/g, " ")}: {String(e.from ?? "—")} → {String(e.to ?? "—")}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {events.length > 0 && (
        <>
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Override audit ({events.length})
          </div>
          <ul className="divide-y divide-gray-100">
            {events.map((e) => (
              <li key={e.key} className="flex items-baseline justify-between gap-2 px-1 py-1.5 text-xs">
                <span className="w-36 shrink-0 text-gray-400">{fmtAt(e.at) || "—"}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-800">{e.product || "Order"}</span>
                  <span className="text-gray-500"> · {e.label}</span>
                  {(e.from !== "" || e.to !== "") && (
                    <span className="text-gray-400"> ({String(e.from || "—")} → {String(e.to || "—")})</span>
                  )}
                </span>
                <span className="shrink-0 text-gray-400">{e.actor || ""}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
