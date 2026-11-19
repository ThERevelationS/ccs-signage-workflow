// Shared category→item mapping for the unified attention feed. Used by both
// AttentionFeed (the /MainWorkflow strip) and NotificationCenter (the bell
// dropdown Feed tab) so section items deep-link identically everywhere (#331).
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  DollarSign,
  FileWarning,
  GitBranch,
  Inbox,
  Layers,
  Mail,
  Package,
  Phone,
  Receipt,
  RotateCcw,
  Scale,
  ShoppingCart,
  Wrench,
} from "lucide-react";
import { FOLLOWUP_KIND_META } from "@/components/comms/followupModel";

const _clean = (v) => String(v ?? "").trim();
export const feedMoney = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Every section key the bell badge counts — kept in one place so the badge,
// the prefs toggle list, and the digest counts stay aligned.
export const FEED_SECTION_KEYS = [
  "unread_portal_messages",
  "overdue_invoices",
  "overdue_pos",
  "proposed_cos",
  "overdue_follow_ups",
  "stale_sent_estimates",
  "quotes_expiring_soon",
  "quotes_expired",
  "open_estimating_requests",
  "estimate_requests",
  "unassigned_estimating_requests",
  "low_stock",
  "needs_recalc_parts",
  "sync_pending_estimates",
  "overdue_jobs",
  "expiring_permits",
  "permit_fees_due",
];

// The prefs popover lists these keys — the LEGACY toggles ("follow", "sent")
// are kept so previously-stored hide/snooze prefs keep applying; each
// category's `prefKey` maps back to its stored pref key. (The old code
// compared hiddenSections against category keys like "followups", so stored
// "follow"/"sent" toggles never matched — prefKey fixes that.)
export const PREF_SECTION_KEYS = [
  "alerts", "portal", "invoices", "pos", "cos", "follow", "sent", "requests",
  "estimate_requests", "unassigned", "stock", "jobs", "permits", "fees",
  "recalc", "syncPending", "quotesExpiringSoon", "quotesExpired",
  "overdue_products", "crm_events_due", "comms_followups_due", "recon_variance_batches",
];

// Stable key the prefs popover / hide+snooze overlays use per category.
export function buildAttentionCategories({ feed, computed, overdueProductRows = [], mergedInvoices = [], mergedPos = [], persisted = [] } = {}) {
  if (!feed) return [];
  return [
    {
      key: "alerts",
      prefKey: "alerts",
      label: "alerts",
      count: persisted.length,
      icon: Bell,
      tone: "text-violet-700 bg-violet-50 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
      notifications: true,
      items: persisted.slice(0, 8).map((n) => ({
        id: n.id,
        notification: n,
        primary: n.title || "Notification",
        secondary: n.body || "",
        href: n.deep_link || "/MainWorkflow",
      })),
    },
    {
      key: "portal",
      prefKey: "portal",
      label: "portal messages",
      count: (feed.unread_portal_messages || []).length,
      icon: Inbox,
      tone: "text-violet-700 bg-violet-50 border-violet-300 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
      items: (feed.unread_portal_messages || []).slice(0, 6).map((m) => ({
        id: m.id,
        primary: m.related_label || m.author_name || "Customer message",
        secondary: m.excerpt,
        // #338: the staff portal-messages surface is the customer detail
        // (PortalPanel) on EstimatorCustomers, not the generic Customer360.
        href: m.customer_id ? `/EstimatorCustomers?customer=${m.customer_id}` : "/EstimatorCustomers",
      })),
    },
    {
      key: "invoices",
      prefKey: "invoices",
      label: `overdue invoices${feed.overdue_invoice_total ? ` (${feedMoney(feed.overdue_invoice_total)})` : ""}`,
      count: mergedInvoices.length,
      icon: Receipt,
      tone: "text-red-700 bg-red-50 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
      items: mergedInvoices.slice(0, 6).map((i) => ({
        id: i.id,
        primary: `${i.invoice_number || "Invoice"}${i.customer_name ? ` · ${i.customer_name}` : ""}`,
        secondary: `due ${i.due_date} · ${feedMoney(i.balance_due)} open${i.salesperson_email ? ` · ${i.salesperson_email}` : ""}`,
        href: `/Invoices?invoice=${i.id}`,
      })),
    },
    {
      key: "pos",
      prefKey: "pos",
      label: "overdue POs",
      count: mergedPos.length,
      icon: ShoppingCart,
      tone: "text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      items: mergedPos.slice(0, 6).map((p) => ({
        id: p.id,
        primary: `${p.po_number || "PO"}${p.vendor_name ? ` · ${p.vendor_name}` : ""}`,
        secondary: `expected ${p.expected_date} · ${p.status}`,
        href: `/PurchaseOrders?po=${p.id}`,
      })),
    },
    {
      key: "cos",
      prefKey: "cos",
      label: "proposed COs",
      count: (feed.proposed_cos || []).length,
      icon: GitBranch,
      tone: "text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      items: (feed.proposed_cos || []).slice(0, 6).map((c) => ({
        id: c.id,
        primary: `${c.change_order_number || "CO"}${c.customer_display_name ? ` · ${c.customer_display_name}` : ""}`,
        secondary: `${c.proposed_by === "customer_portal" ? "customer request" : "staff draft"} · ${feedMoney(c.amount_delta)}`,
        href: `/ChangeOrders?co=${c.id}`,
      })),
    },
    {
      key: "followups",
      prefKey: "follow",
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
      prefKey: "requests",
      label: "estimate requests",
      count: (feed.open_estimating_requests || []).length,
      icon: ClipboardList,
      tone: "text-slate-700 bg-slate-50 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-600",
      items: (feed.open_estimating_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: `${r.request_number || "Request"}${r.opportunity_title ? ` · ${r.opportunity_title}` : ""}`,
        secondary: `${r.overdue ? `OVERDUE ${r.due_date} · ` : ""}${r.status}${r.assigned_estimator ? ` · ${r.assigned_estimator}` : " · unassigned"}`,
        href: r.opportunity_id ? `/Opportunities?open=${r.opportunity_id}` : "/Opportunities",
      })),
    },
    {
      key: "estimate_requests",
      prefKey: "estimate_requests",
      label: "assigned to me",
      count: (feed.estimate_requests || []).length,
      icon: ClipboardList,
      tone: "text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      items: (feed.estimate_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: `${r.request_number || "Request"}${r.opportunity_title ? ` · ${r.opportunity_title}` : ""}`,
        secondary: `${r.overdue ? `OVERDUE ${r.due_date} · ` : ""}${r.status}${r.assigned_estimator ? ` · ${r.assigned_estimator}` : ""}`,
        href: r.opportunity_id ? `/Opportunities?open=${r.opportunity_id}` : "/Opportunities",
      })),
    },
    {
      key: "staleQuotes",
      prefKey: "sent",
      label: "stale sent quotes",
      count: (feed.stale_sent_estimates || []).length,
      icon: Bell,
      tone: "text-blue-700 bg-blue-50 border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800",
      items: (feed.stale_sent_estimates || []).slice(0, 6).map((e) => ({
        id: e.id,
        primary: `${e.project_name || "Estimate"}${e.estimate_number ? ` · #${e.estimate_number}` : ""}`,
        secondary: `${e.client_name || ""}${e.days_sent ? ` · sent ${e.days_sent}d ago` : ""}${e.quote_total ? ` · $${Number(e.quote_total).toLocaleString()}` : ""}`,
        href: `/EstimateDetail?id=${e.id}`,
      })),
    },
    {
      key: "quotesExpiringSoon",
      prefKey: "quotesExpiringSoon",
      label: "quotes expiring soon",
      count: (feed.quotes_expiring_soon || []).length,
      icon: AlertTriangle,
      tone: "text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      items: (feed.quotes_expiring_soon || []).slice(0, 6).map((e) => ({
        id: e.id,
        primary: `${e.project_name || "Estimate"}${e.estimate_number ? ` · #${e.estimate_number}` : ""}`,
        secondary: `${e.client_name || ""}${e.days_until_expiry != null ? ` · expires in ${e.days_until_expiry}d` : ""}${e.salesperson_email ? ` · ${e.salesperson_email}` : ""}`,
        href: `/EstimateDetail?id=${e.id}`,
      })),
    },
    {
      key: "quotesExpired",
      prefKey: "quotesExpired",
      label: "expired quotes",
      count: (feed.quotes_expired || []).length,
      icon: AlertTriangle,
      tone: "text-red-700 bg-red-50 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
      items: (feed.quotes_expired || []).slice(0, 6).map((e) => ({
        id: e.id,
        primary: `${e.project_name || "Estimate"}${e.estimate_number ? ` · #${e.estimate_number}` : ""}`,
        secondary: `${e.client_name || ""}${e.quote_expiration_date ? ` · expired ${e.quote_expiration_date}` : ""}${e.salesperson_email ? ` · ${e.salesperson_email}` : ""}`,
        href: `/EstimateDetail?id=${e.id}`,
      })),
    },
    {
      key: "stock",
      prefKey: "stock",
      label: "low stock",
      count: (feed.low_stock || []).length,
      icon: Package,
      tone: "text-teal-700 bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      items: (feed.low_stock || []).slice(0, 6).map((it) => ({
        id: it.id,
        primary: it.label,
        secondary: `${it.quantity_on_hand} on hand · reorder at ${it.reorder_point}${it.supplier ? ` · ${it.supplier}` : ""}`,
        // #337: low-stock → draft-PO surface prefilled with this item.
        href: it.id ? `/PurchaseOrders?draft_item=${it.id}` : "/Inventory",
      })),
    },
    {
      key: "jobs",
      prefKey: "jobs",
      label: "overdue jobs",
      count: (feed.overdue_jobs || []).length,
      icon: Wrench,
      tone: "text-rose-700 bg-rose-50 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
      items: (feed.overdue_jobs || []).slice(0, 6).map((w) => ({
        id: w.id,
        primary: `${w.title || "Work order"}${w.client_name ? ` · ${w.client_name}` : ""}`,
        secondary: `${w.current_stage || "job"} · due ${w.due_date}`,
        href: `/MainWorkflow?wo=${w.id}`,
      })),
    },
    {
      key: "permits",
      prefKey: "permits",
      label: "permits expiring",
      count: (feed.expiring_permits || []).length,
      icon: FileWarning,
      tone: "text-indigo-700 bg-indigo-50 border-indigo-300 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
      items: (feed.expiring_permits || []).slice(0, 6).map((p) => ({
        id: p.id,
        primary: `${p.row_name || "Permit"}${p.locality_name ? ` · ${p.locality_name}` : ""}`,
        secondary: `${p.expired ? "EXPIRED" : "expires"} ${p.expiration_date}${p.work_order_title ? ` · ${p.work_order_title}` : ""}`,
        href: p.work_order_id ? `/MainWorkflow?wo=${p.work_order_id}` : "/Permitting",
      })),
    },
    {
      key: "fees",
      prefKey: "fees",
      label: "permit fees due",
      count: (feed.permit_fees_due || []).length,
      icon: DollarSign,
      tone: "text-sky-700 bg-sky-50 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      items: (feed.permit_fees_due || []).slice(0, 6).map((p) => ({
        id: p.id,
        primary: `${p.row_name || "Permit fee"}${p.locality_name ? ` · ${p.locality_name}` : ""}`,
        secondary: `${p.fee_amount ? feedMoney(p.fee_amount) : "fee"} due${p.work_order_title ? ` · ${p.work_order_title}` : ""}`,
        href: p.work_order_id ? `/MainWorkflow?wo=${p.work_order_id}` : "/Permitting",
      })),
    },
    {
      key: "unassigned",
      prefKey: "unassigned",
      label: "unassigned requests",
      count: (feed.unassigned_estimating_requests || []).length,
      icon: Inbox,
      // #342: >2d unassigned requests are an escalation — the reddest tone in
      // the strip and a leading marker in each row.
      tone: "text-red-800 bg-red-100 border-red-400 dark:bg-red-950/60 dark:text-red-200 dark:border-red-700",
      items: (feed.unassigned_estimating_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: `⚠ ${r.request_number || "Request"}${r.opportunity_title ? ` - ${r.opportunity_title}` : ""}`,
        secondary: "Unassigned over 2 days - needs an estimator",
        href: "/EstimatingQueues",
      })),
    },
    {
      key: "recalc",
      prefKey: "recalc",
      label: "needs recalc",
      count: (feed.needs_recalc_parts || []).length,
      icon: RotateCcw,
      tone: "text-amber-700 bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
      items: (feed.needs_recalc_parts || []).slice(0, 6).map((p) => ({
        id: p.id,
        primary: p.part_name || "Part",
        secondary: "Flagged needs_recalc - price may be stale",
        href: p.estimate_id ? `/EstimateDetail?id=${p.estimate_id}` : "/EstimatorQueues",
      })),
    },
    {
      key: "syncPending",
      prefKey: "syncPending",
      label: "sync pending >24h",
      // #343: pipeline_sync_pending rows the feed flagged stale — they were
      // already in the payload but had no rendered section.
      count: (feed.sync_pending_estimates || []).length,
      icon: RotateCcw,
      tone: "text-orange-700 bg-orange-50 border-orange-300 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800",
      items: (feed.sync_pending_estimates || []).slice(0, 6).map((e) => ({
        id: e.id,
        primary: `${e.project_name || "Estimate"}${e.estimate_number ? ` · #${e.estimate_number}` : ""}`,
        secondary: `pipeline sync pending since ${String(e.updated_date || "").slice(0, 10)} · ${e.status || "unknown"}`,
        href: `/EstimateDetail?id=${e.id}`,
      })),
    },
    // --- Computed sections (unified alerts) --------------------------------
    {
      key: "overdue_products",
      prefKey: "overdue_products",
      label: "overdue products",
      count: overdueProductRows.length,
      icon: Layers,
      tone: "text-cyan-700 bg-cyan-50 border-cyan-300 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800",
      items: overdueProductRows.slice(0, 6).map((r) => ({
        id: `product:${r.workOrderId}:${r.productId}`,
        primary: `${r.productName}${r.company ? ` · ${r.company}` : ""}`,
        secondary: `${r.status} · due ${r.due}${r.hardDue ? " · hard due" : ""}`,
        href: "/ProductQueues?queue=all",
      })),
    },
    {
      key: "crm_events_due",
      prefKey: "crm_events_due",
      label: "CRM events due",
      count: (computed?.crm_events_due || []).length,
      icon: Phone,
      tone: "text-fuchsia-700 bg-fuchsia-50 border-fuchsia-300 dark:bg-fuchsia-950/40 dark:text-fuchsia-300 dark:border-fuchsia-800",
      items: (computed?.crm_events_due || []).slice(0, 6).map((a) => ({
        id: `crm:${a.id}`,
        primary: `${a.subject || a.summary || a.event_type || "CRM event"}${a.company_name ? ` · ${a.company_name}` : ""}`,
        secondary: `${a.event_type || "event"} · due ${String(a.due_at || "").slice(0, 10)}${a.assigned_to ? ` · ${a.assigned_to}` : ""}`,
        href: "/CrmEvents",
      })),
    },
    {
      key: "comms_followups_due",
      prefKey: "comms_followups_due",
      label: "comms follow-ups due",
      count: (computed?.comms_followups_due || []).length,
      icon: Mail,
      tone: "text-lime-700 bg-lime-50 border-lime-300 dark:bg-lime-950/40 dark:text-lime-300 dark:border-lime-800",
      items: (computed?.comms_followups_due || []).slice(0, 6).map((f) => ({
        id: `followup:${f.kind}:${f.targetId}`,
        primary: `${f.targetRef || "Follow-up"}${f.customerName ? ` · ${f.customerName}` : ""}`,
        secondary: `${FOLLOWUP_KIND_META[f.kind]?.label || f.kind} · due ${f.dueDate}${f.daysOverdue ? ` · ${f.daysOverdue}d over` : ""}`,
        href: "/CommsFollowups",
      })),
    },
    {
      key: "recon_variance_batches",
      prefKey: "recon_variance_batches",
      label: "recon variance",
      count: (computed?.recon_variance_batches || []).length,
      icon: Scale,
      tone: "text-yellow-700 bg-yellow-50 border-yellow-300 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800",
      items: (computed?.recon_variance_batches || []).slice(0, 6).map((b) => ({
        id: `recon:${b.id}`,
        primary: `${b.batch_number || "Batch"}${b.location ? ` · ${b.location}` : ""}`,
        secondary: `closed ${String(b.closed_at || "").slice(0, 10)} · ${Number(b.variance) > 0 ? "over" : "short"} ${feedMoney(Math.abs(Number(b.variance) || 0))}`,
        href: "/Reconciliation",
      })),
    },
  ];
}