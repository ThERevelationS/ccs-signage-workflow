import React from "react";
import { TabsTrigger } from "@/components/ui/tabs";

// Compact currency formatting: $1.2k / $980
const compact = (v) => {
  const n = parseFloat(v) || 0;
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return `$${Math.round(n)}`;
};

// Map color prop to active/accent tailwind classes. Defaults to purple (Channel Letters legacy).
const COLOR_STYLES = {
  purple: {
    active: "data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-purple-50 data-[state=inactive]:text-purple-900",
  },
  blue: {
    active: "data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-blue-50 data-[state=inactive]:text-blue-900",
  },
  red: {
    active: "data-[state=active]:bg-red-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-red-50 data-[state=inactive]:text-red-900",
  },
  green: {
    active: "data-[state=active]:bg-green-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-green-50 data-[state=inactive]:text-green-900",
  },
  orange: {
    active: "data-[state=active]:bg-orange-600 data-[state=active]:text-white data-[state=active]:shadow-md",
    accent: "data-[state=inactive]:bg-orange-50 data-[state=inactive]:text-orange-900",
  },
};

export default function TabBadgeTrigger({ value, icon: Icon, label, amount, count, warn, accent, color = "purple" }) {
  const hasAmount = parseFloat(amount) > 0;
  const styles = COLOR_STYLES[color] || COLOR_STYLES.purple;
  return (
    <TabsTrigger
      value={value}
      className={`
        flex flex-row items-center justify-center gap-1.5 h-7 px-2 rounded-lg
        text-slate-700
        ${styles.active}
        ${accent ? styles.accent : ""}
        relative transition-all
      `}
    >
      <Icon className="w-3.5 h-3.5" />
      <span className="text-xs font-medium">{label}</span>
      {count != null && (
        <span className="text-[10px] bg-slate-200 text-slate-700 data-[state=active]:bg-white/20 data-[state=active]:text-white rounded-full px-1.5 py-0 leading-tight">
          {count}
        </span>
      )}
      {hasAmount && (
        <span className="text-[10px] tabular-nums font-semibold opacity-80 leading-tight">
          {compact(amount)}
        </span>
      )}
      {warn && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" title="Action required" />
      )}
    </TabsTrigger>
  );
}