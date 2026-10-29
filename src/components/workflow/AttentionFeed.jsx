import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Eye,
  ClipboardList,
  DollarSign,
  FileWarning,
  GitBranch,
  Inbox,
  Loader2,
  Package,
  Receipt,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingCart,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from "lucide-react";

const money = (n) => `$${Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function AttentionFeed() {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [feed, setFeed] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState("");
  const [handled, setHandled] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("attention_handled") || "[]")); } catch { return new Set(); }
  });
  const markHandled = (id) => {
    setHandled((prev) => {
      const next = new Set(prev);
      next.add(id);
      try { localStorage.setItem("attention_handled", JSON.stringify([...next].slice(-300))); } catch {}
      return next;
    });
  };
  const [soundOn, setSoundOn] = useState(() => localStorage.getItem("attention_sound") !== "off");
  // Per-user notification prefs (#328): sections hidden via the settings
  // popover persist in localStorage; snoozed sections hide until their
  // timestamp passes (#332).
  const [hiddenSections, setHiddenSections] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("attention_hidden_sections") || "[]")); } catch { return new Set(); }
  });
  const [digestOn, setDigestOn] = useState(() => { try { return localStorage.getItem("attention_digest_opt_in") === "1"; } catch { return false; } });
  const [digestSending, setDigestSending] = useState(false);
  const [watchHits, setWatchHits] = useState([]);
  const sendDigest = async () => {
    if (digestSending || !sessionToken) return;
    setDigestSending(true);
    try { await base44.functions.invoke("opportunityWorkspaceAction", { session_token: sessionToken, action: "send_digest" }); } catch { /* fail-soft */ } finally { setDigestSending(false); }
  };
  const toggleDigest = () => {
    const next = !digestOn;
    setDigestOn(next);
    try { localStorage.setItem("attention_digest_opt_in", next ? "1" : "0"); } catch {}
    if (next) sendDigest();
  };
  const [snoozed, setSnoozed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("attention_snoozed") || "{}"); } catch { return {}; }
  });
  const [prefsOpen, setPrefsOpen] = useState(false);
  const toggleHidden = (key) => {
    setHiddenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem("attention_hidden_sections", JSON.stringify([...next])); } catch {}
      return next;
    });
    if (section === key) setSection("");
  };
  const snoozeSection = (key, hours = 4) => {
    setSnoozed((prev) => {
      const next = { ...prev, [key]: Date.now() + hours * 3600000 };
      try { localStorage.setItem("attention_snoozed", JSON.stringify(next)); } catch {}
      return next;
    });
    if (section === key) setSection("");
  };
  const toggleSound = () => {
    setSoundOn((on) => {
      const next = !on;
      try { localStorage.setItem("attention_sound", next ? "on" : "off"); } catch {}
      return next;
    });
  };

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      const [r, watchRes] = await Promise.all([
        base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken,
          action: "attention_feed",
          today: new Date().toLocaleDateString("en-CA"),
        }),
        // Watch-rule hits (#349): "tell me when X reaches state Y" — the
        // dispatcher surfaces matching watched records here.
        base44.functions.invoke("opportunityWorkspaceAction", {
          session_token: sessionToken,
          action: "check_watches",
        }).catch(() => null),
      ]);
      const d = r?.data || r;
      if (d?.success) setFeed(d);
      const hits = (watchRes?.data || watchRes)?.hits;
      setWatchHits(Array.isArray(hits) ? hits : []);
    } catch { /* fail-soft — strip hides itself */ }
    finally { setLoading(false); }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    if (!sessionToken) return;
    setLoading(true);
    try {
      await base44.functions.invoke("customerPortalAction", {
        session_token: sessionToken,
        action: "mark_all_read",
      });
    } catch { /* non-fatal */ }
    await load();
  };

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
        secondary: `due ${i.due_date} · ${money(i.balance_due)} open${i.salesperson_email ? ` · ${i.salesperson_email}` : ""}`,
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
        secondary: `${r.overdue ? `OVERDUE ${r.due_date} · ` : ""}${r.status}${r.assigned_estimator ? ` · ${r.assigned_estimator}` : " · unassigned"}`,
        href: r.opportunity_id ? `/Opportunities?open=${r.opportunity_id}` : "/Opportunities",
      })),
    },
    {
      key: "staleQuotes",
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
      label: "quotes expiring soon",
      count: (feed.quotes_expiring_soon || []).length,
      icon: Clock,
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
      label: "low stock",
      count: (feed.low_stock || []).length,
      icon: Package,
      tone: "text-teal-700 bg-teal-50 border-teal-300 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800",
      items: (feed.low_stock || []).slice(0, 6).map((it) => ({
        id: it.id,
        primary: it.label,
        secondary: `${it.quantity_on_hand} on hand · reorder at ${it.reorder_point}${it.supplier ? ` · ${it.supplier}` : ""}`,
        href: it.id ? `/PurchaseOrders?draft_item=${it.id}` : "/Inventory",
      })),
    },
    {
      key: "jobs",
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
      label: "permit fees due",
      count: (feed.permit_fees_due || []).length,
      icon: DollarSign,
      tone: "text-sky-700 bg-sky-50 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
      items: (feed.permit_fees_due || []).slice(0, 6).map((p) => ({
        id: p.id,
        primary: `${p.row_name || "Permit fee"}${p.locality_name ? ` · ${p.locality_name}` : ""}`,
        secondary: `${p.fee_amount ? money(p.fee_amount) : "fee"} due${p.work_order_title ? ` · ${p.work_order_title}` : ""}`,
        href: p.work_order_id ? `/MainWorkflow?wo=${p.work_order_id}` : "/Permitting",
      })),
    },
    {
      key: "unassigned",
      label: "unassigned requests",
      count: (feed.unassigned_estimating_requests || []).length,
      icon: Inbox,
      tone: "text-red-700 bg-red-50 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
      items: (feed.unassigned_estimating_requests || []).slice(0, 6).map((r) => ({
        id: r.id,
        primary: `${r.request_number || "Request"}${r.opportunity_title ? ` - ${r.opportunity_title}` : ""}`,
        secondary: "Unassigned over 2 days - needs an estimator",
        href: "/EstimatingQueues",
      })),
    },
    {
      key: "recalc",
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
  ].filter((c) => c.count > 0 && !hiddenSections.has(c.key) && !(snoozed[c.key] && snoozed[c.key] > Date.now())) : [];

  if (!feed) return null;
  if (categories.length === 0 && !loading) return null;

  const active = categories.find((c) => c.key === section);

  return (
    <div className="mb-3 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      {watchHits.length > 0 && (
        <div className="mb-1 flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-2 py-1 text-[11px] font-bold text-violet-700 dark:border-violet-800 dark:bg-violet-950/40" title={watchHits.map((h) => `${h.label || h.record_id} ${h.field}=${h.current}`).join("; ")}>
          <Eye className="h-3.5 w-3.5" />{watchHits.length} watched record{watchHits.length === 1 ? "" : "s"} matched — {watchHits.slice(0, 3).map((h) => `${h.label || h.entity} ${h.field} is now "${h.current}"`).join("; ")}{watchHits.length > 3 ? ` +${watchHits.length - 3} more` : ""}
        </div>
      )}
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
        <button type="button" onClick={toggleSound} title={soundOn ? "Mute notification sound" : "Unmute notification sound"}
          className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
          {soundOn ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {soundOn ? "Sound on" : "Sound off"}
        </button>
        <div className="relative ml-auto">
          <button type="button" onClick={() => setPrefsOpen((v) => !v)} title="Notification preferences"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <Settings className="h-3.5 w-3.5" />
          </button>
          {prefsOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Daily email digest</p>
              <label className="flex items-center gap-1.5 px-1 py-1 text-xs text-slate-700 dark:text-slate-300">
                <input type="checkbox" checked={digestOn} onChange={toggleDigest} className="h-3 w-3" />
                Email me a daily digest
              </label>
              {digestOn && (
                <button type="button" onClick={sendDigest} disabled={digestSending}
                  className="mb-1 px-1 text-[10px] font-semibold text-violet-600 hover:text-violet-800 disabled:opacity-50">
                  {digestSending ? "Sending..." : "Send a digest now"}
                </button>
              )}
              <p className="mb-1 border-t border-slate-100 pt-1 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-800">Sections</p>
              {["portal","invoices","pos","cos","follow","sent","requests","unassigned","stock","jobs","permits","fees","recalc"].map((key) => {
                const cat = categories.find((c) => c.key === key);
                const label = cat?.label || key;
                const isSnoozed = snoozed[key] && snoozed[key] > Date.now();
                return (
                  <div key={key} className="flex items-center gap-2 px-1 py-0.5">
                    <label className="flex flex-1 cursor-pointer items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                      <input type="checkbox" checked={!hiddenSections.has(key)} onChange={() => toggleHidden(key)} className="h-3 w-3" />
                      {label}{isSnoozed ? " (snoozed)" : ""}
                    </label>
                    {!isSnoozed && (
                      <button type="button" onClick={() => snoozeSection(key)} title="Snooze 4 hours"
                        className="text-[9px] font-semibold text-slate-400 hover:text-amber-600">zzz</button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </button>
      </div>
      {open && active && (
        <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-700">
          {active.items.filter((it) => !handled.has(it.id)).map((it) => (
            <div key={it.id} className="flex w-full items-center gap-1 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800">
              <button type="button" onClick={() => navigate(it.href)}
                className="flex flex-1 items-center justify-between gap-3 text-left">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{it.primary}</span>
                <span className="truncate text-xs text-slate-500">{it.secondary}</span>
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); markHandled(it.id); }}
                title="Mark as handled"
                className="shrink-0 rounded p-0.5 text-slate-300 hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {active.count > active.items.length && (
            <div className="px-3 py-1.5 text-xs text-slate-400">+{active.count - active.items.length} more</div>
          )}
          {active.key === "portal" && (
            <button type="button" onClick={markAllRead} disabled={loading}
              className="w-full border-t border-slate-100 px-3 py-1.5 text-left text-xs font-semibold text-violet-600 hover:bg-violet-50 disabled:opacity-50 dark:border-slate-800 dark:text-violet-300 dark:hover:bg-slate-800">
              Mark all portal messages read
            </button>
          )}
        </div>
      )}
    </div>
  );
}
