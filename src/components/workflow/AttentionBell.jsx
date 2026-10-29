import { useCallback, useEffect, useRef, useState } from "react";

// Subtle WebAudio chime when the attention count grows — opt-out via
// localStorage.attention_sound === "off" (toggled in AttentionFeed).
export function chimeAttentionIncrease() {
  try {
    if (localStorage.getItem("attention_sound") === "off") return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => ctx.close();
  } catch { /* audio blocked — stay quiet */ }
}
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useAuth } from "@/components/auth/EmailGate";

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
  const prevCountRef = useRef(null);

  const load = useCallback(async () => {
    if (!sessionToken) return;
    try {
      const r = await base44.functions.invoke("opportunityWorkspaceAction", {
        session_token: sessionToken,
        action: "attention_feed",
        today: new Date().toLocaleDateString("en-CA"),
      });
      const feed = r?.data || r || {};
      const next = SECTION_KEYS.reduce((sum, key) => sum + (Array.isArray(feed[key]) ? feed[key].length : 0), 0);
      if (prevCountRef.current !== null && next > prevCountRef.current) chimeAttentionIncrease();
      prevCountRef.current = next;
      setCount(next);
    } catch { /* fail soft — bell just stays quiet */ }
  }, [sessionToken]);

  useEffect(() => {
    load();
    // Skip the 60s poll while the tab is hidden — keeps the attention_feed
    // calls (and their entity_list budget) from piling up in the background.
    const t = setInterval(() => { if (!document.hidden) load(); }, 60000);
    const onVisible = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

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
