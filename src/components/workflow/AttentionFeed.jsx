import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  GitBranch,
  Inbox,
  Loader2,
  Receipt,
  RefreshCw,
  ShoppingCart,
} from "lucide-react";

const money = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AttentionFeed() {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("");

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "attention_feed",
      });
      const d = r?.data || r;
      if (d?.success) setFeed(d);
    } catch { /* fail-soft — strip hides itself */ }
    finally { setLoading(false); }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const categories = feed ? [
    {
      key: "portal",
      label: "portal messages",
      count: (feed.unread_portal_messages || []).length,
      icon: Inbox,
      tone: "text-violet-700 bg-violet-50 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
      items: (feed.unread_portal_messages || []).slice(0, 6).map((m) => ({
        id: m.id,
        primary: m.related_label || m.author_name || "Customer message",
        secondary: m.excerpt,
        href: m.customer_id ? `/EstimatorCustomers?customer=${m.customer_id}` : "/EstimatorCustomers",
      })),
    },
    {
      key: "invoices",
      label: `overdue invoices${feed.overdue_invoice_total ? ` (${money(feed.overdue_invoice_total)})` : ""}`,
      count: (feed.overdue_invoices || []).length,
      icon: Receipt,
      tone: "text-red-700 bg-red-50 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
      items: (feed.overdue_invoices || []).slice(0, 6).map((i) => ({
        id: i.id,
        primary: `${i.invoice_number || "Invoice"}${i.customer_name ? ` · ${i.customer_name}` : ""}`,
        secondary: `due ${i.due_date} · ${money(i.balance_due)} open`,
        href: `/Invoices?invoice=${i.id}`,
      })),
    },
    {
      key: "pos",
      label: "overdue POs",
      count: (feed.overdue_pos || []).length,
      icon: ShoppingCart,
      tone: "text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      items: (feed.overdue_pos || []).slice(0, 6).map((p) => ({
        id: p.id,
        primary: `${p.po_number || "PO"}${p.vendor_name ? ` · ${p.vendor_name}` : ""}`,
        secondary: `expected ${p.expected_date} · ${p.status}`,
        href: `/PurchaseOrders?po=${p.id}`,
      })),
    },
    {
      key: "cos",
      label: "proposed COs",
      count: (feed.proposed_cos || []).length,
      icon: GitBranch,
      tone: "text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      items: (feed.proposed_cos || []).slice(0, 6).map((c) => ({
        id: c.id,
        primary: `${c.change_order_number || "CO"}${c.customer_display_name ? ` · ${c.customer_display_name}` : ""}`,
        secondary: `${c.proposed_by === "customer_portal" ? "customer request" : "staff draft"} · ${money(c.amount_delta)}`,
        href: `/ChangeOrders?co=${c.id}`,
      })),
    },
    {
      key: "followups",
      label: "overdue follow-ups",
      count: (feed.overdue_follow_ups || []).length,
      icon: Bell,
      tone: "text-orange-700 bg-orange-50 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
      items: (feed.overdue_follow_ups || []).slice(0, 6).map((o) => ({
        id: o.id,
        primary: `${o.title || o.customer_display_name || "Opportunity"}${o.salesperson ? ` · ${o.salesperson}` : ""}`,
        secondary: `${o.next_action || "follow-up"} · due ${o.next_action_due}`,
        href: `/Opportunities?open=${o.id}`,
      })),
    },
    {
      key: "requests",
      label: "estimate requests",
      count: (feed.open_estimating_requests || []).length,
      icon: ClipboardList,
      tone: "text-slate-700 bg-slate-50 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
      items: (feed.open_estimating_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: `${r.request_number || "Request"}${r.opportunity_title ? ` · ${r.opportunity_title}` : ""}`,
        secondary: `${r.status}${r.assigned_estimator ? ` · ${r.assigned_estimator}` : " · unassigned"}`,
        href: r.opportunity_id ? `/Opportunities?open=${r.opportunity_id}` : "/Opportunities",
      })),
    },
  ].filter((c) => c.count > 0) : [];

  if (!feed) return null;
  if (categories.length === 0 && !loading) return null;

  const active = categories.find((c) => c.key === section);

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
          <Bell className="h-3.5 w-3.5 text-violet-600" />
          Needs attention
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {categories.map((c) => (
          <button key={c.key} type="button"
            onClick={() => { setSection(section === c.key ? "" : c.key); setOpen(true); }}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${c.tone} ${section === c.key ? "ring-2 ring-violet-400" : ""}`}>
            <c.icon className="h-3 w-3" />
            {c.count} {c.label}
          </button>
        ))}
        <button type="button" onClick={load} disabled={loading}
          className="ml-auto rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open && active && (
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {active.items.map((it) => (
            <button key={it.id} type="button" onClick={() => navigate(it.href)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{it.primary}</span>
              <span className="truncate text-xs text-slate-500">{it.secondary}</span>
            </button>
          ))}
          {active.count > active.items.length && (
            <div className="px-3 py-1.5 text-xs text-slate-400">+{active.count - active.items.length} more</div>
          )}
        </div>
      )}
    </div>
  );
}
