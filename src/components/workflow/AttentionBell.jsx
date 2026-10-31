import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";
import { usePolling } from "@/lib/usePolling";
import { computedAttentionCount } from "./attentionComputedModel";

const SECTION_KEYS = [
  "unread_portal_messages",
  "overdue_invoices",
  "overdue_pos",
  "proposed_cos",
  "overdue_follow_ups",
  "open_estimating_requests",
  "stale_sent_estimates",
  "low_stock",
  "overdue_jobs",
  "expiring_permits",
  "permit_fees_due",
];

export default function AttentionBell({ compact = false, shellGlass = false }) {
  const { sessionToken } = useAuth();
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "attention_feed",
        today: new Date().toLocaleDateString("en-CA"),
      });
      const feed = r?.data || r || {};
      setCount(SECTION_KEYS.reduce((sum, key) => sum + (Array.isArray(feed[key]) ? feed[key].length : 0), 0) + computedAttentionCount());
    } catch { /* fail soft — bell just stays quiet */ }
  }, [sessionToken]);

  // usePolling already skips hidden tabs and open 429 breakers and only
  // refreshes on focus when the interval was due.
  usePolling(load, 180000, { initialDelayMs: 2000 });

  return (
    <button
      type="button"
      onClick={() => navigate("/MainWorkflow")}
      title={`${count} item${count === 1 ? "" : "s"} need attention`}
      className={`relative inline-flex items-center justify-center rounded-xl ${shellGlass ? "ccs-glass-control ccs-glass-neutral text-slate-100" : "clay-button border-2 text-gray-800 border-gray-200"} ${compact ? "h-7 w-7" : "h-9 w-9"}`}
    >
      <Bell className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-red-600 px-1 text-[9px] font-bold leading-4 text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}