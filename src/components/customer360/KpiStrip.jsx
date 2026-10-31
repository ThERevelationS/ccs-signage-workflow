import React from "react";
import { KpiStrip } from "@/components/kit";

// Thin adapter over the shared kit KpiStrip. The page still speaks the
// historical items vocabulary ({ label, value, hint, tone: "warn" | "bad" })
// plus a title tooltip; this maps it onto the kit tile model so every KPI
// row in the app renders the same tile chrome.
const TONE_MAP = { warn: "amber", bad: "red" };

export default function Customer360KpiStrip({ items }) {
  const tiles = (items || []).map((it) => ({
    label: it.label,
    value: it.value,
    hint: it.hint || it.title || undefined,
    tone: TONE_MAP[it.tone] || undefined,
  }));
  return <KpiStrip tiles={tiles} className="mb-0 lg:grid-cols-6" />;
}
