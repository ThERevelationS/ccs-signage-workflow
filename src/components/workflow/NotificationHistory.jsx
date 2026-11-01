import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Bell,
  Clock,
  Gift,
  History as HistoryIcon,
  Loader2,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useAuth } from "@/components/auth/EmailGate";
import { fetchNotificationHistory, unhandleNotification } from "./notificationClient";
import { NOTIFICATION_CATEGORIES, notificationCategoryLabel } from "./notificationModel.mjs";

const fmt = (isoDate) => {
  const t = Date.parse(String(isoDate || ""));
  if (!Number.isFinite(t)) return "";
  return new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

// Notification history log (#350): the Notification entity IS the log — this
// view filters it (category, search text, handled included/excluded) and
// deep-links back into the record each row was about.
export default function NotificationHistory({ onClose }) {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [includeHandled, setIncludeHandled] = useState(true);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const data = await fetchNotificationHistory(sessionToken, {
      category: category || undefined,
      q: q || undefined,
      include_handled: includeHandled,
      since_days: 90,
      limit: 200,
    });
    if (data) setRows(data.notifications || []);
    setLoading(false);
  }, [sessionToken, category, q, includeHandled]);

  useEffect(() => { load(); }, [load]);

  const open = (n) => {
    if (n.deep_link) {
      onClose?.();
      navigate(n.deep_link);
    }
  };

  const unhandle = async (n) => {
    setRows((prev) => prev.map((x) => (x.id === n.id ? { ...x, handled_at: null } : x)));
    await unhandleNotification(sessionToken, n.id).catch(() => {});
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-[36rem] max-w-[95vw] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <HistoryIcon className="h-4 w-4 text-violet-600" />
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Notification history</span>
          <button type="button" onClick={onClose} className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
            <option value="">All categories</option>
            {NOTIFICATION_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <label className="flex flex-1 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 dark:border-slate-700">
            <Search className="h-3 w-3 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or body"
              className="w-full bg-transparent text-xs outline-none dark:text-slate-200" />
          </label>
          <label className="flex items-center gap-1 text-[11px] text-slate-500">
            <input type="checkbox" checked={includeHandled} onChange={(e) => setIncludeHandled(e.target.checked)} className="h-3 w-3" />
            include handled
          </label>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center gap-2 px-4 py-8 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading history
            </div>
          )}
          {!loading && rows.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-slate-400">No notifications match.</div>
          )}
          {!loading && rows.map((n) => {
            const handled = !!n.handled_at;
            const snoozed = n.snoozed_until && Date.parse(n.snoozed_until) > Date.now();
            return (
              <div key={n.id} className="flex items-start gap-2 border-b border-slate-50 px-4 py-2 last:border-0 dark:border-slate-800/60">
                <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${handled ? "border-slate-200 bg-slate-50 dark:border-slate-700" : n.severity === "critical" ? "border-red-300 bg-red-50" : n.severity === "warning" ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white dark:border-slate-700"}`}>
                  {n.category === "quote_approved" ? <Gift className="h-3 w-3 text-emerald-600" />
                    : n.severity === "critical" ? <AlertTriangle className="h-3 w-3 text-red-600" />
                    : n.severity === "warning" ? <Clock className="h-3 w-3 text-amber-600" />
                    : <Bell className="h-3 w-3 text-slate-500" />}
                </span>
                <button type="button" onClick={() => open(n)} className="min-w-0 flex-1 text-left">
                  <span className={`block truncate text-xs font-semibold ${handled ? "text-slate-400 line-through" : "text-slate-800 dark:text-slate-200"}`}>
                    {n.title}
                  </span>
                  {n.body && <span className="block truncate text-[11px] text-slate-500">{n.body}</span>}
                  <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-slate-400">
                    {notificationCategoryLabel(n.category)} · {fmt(n.created_date)}
                    {n.read_at ? " · read" : " · unread"}
                    {handled ? ` · handled ${n.handled_by ? `by ${n.handled_by}` : ""}` : ""}
                    {snoozed ? ` · snoozed until ${fmt(n.snoozed_until)}` : ""}
                    {n.source_event ? ` · ${n.source_event}` : ""}
                  </span>
                </button>
                {handled && (
                  <button type="button" title="Reopen — clear the handled state" onClick={() => unhandle(n)}
                    className="shrink-0 rounded p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800">
                    <RotateCcw className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-100 px-4 py-1.5 text-[10px] text-slate-400 dark:border-slate-800">
          Last 90 days · newest first · the Notification entity is the durable log
        </div>
      </div>
    </div>
  );
}
