import React from "react";
import { AlertCircle, AlertTriangle, Info, DollarSign } from "lucide-react";

// Pricing diagnostics + severity-aware validation:
//   pricing-availability issues (from channelLetterPricingAvailability) render
//   first and always block save —
//     channel_catalog → settings / inventory / equipment-record pricing is
//       missing, malformed, or the record was deleted.
//     channel         → an authored project value can't produce a real price.
//   error  → blocks save (red)
//   warn   → should fix (amber)
//   info   → fyi (slate)
export default function ValidationWarnings({ project, pricingIssues = [] }) {
  const issues = [];
  const items = project?.items || [];
  const equipment = project?.selected_equipment || [];

  // Project-level
  if (items.length === 0 && (project?.letter_purchases || []).length === 0) {
    issues.push({ level: "warn", msg: "No line items or letter purchases yet." });
  }
  if (equipment.length === 0 && items.length > 0) {
    issues.push({ level: "error", msg: "No equipment selected — required to save." });
  }

  // Equipment vs install-height mismatch
  const maxItemHeight = items.reduce(
    (m, it) => Math.max(m, parseFloat(it.installation_height_feet) || 0),
    0
  );
  if (maxItemHeight > 0) {
    const lifts = equipment.filter((e) => ["ladder", "scissor_lift", "boom_lift", "scaffold"].includes(e.equipment_type));
    if (lifts.length > 0) {
      const maxReach = lifts.reduce((m, e) => Math.max(m, parseFloat(e.max_height_feet) || 0), 0);
      if (maxReach > 0 && maxReach < maxItemHeight) {
        issues.push({
          level: "error",
          msg: `Equipment max reach (${maxReach}ft) is below the tallest install (${maxItemHeight}ft).`
        });
      }
    } else if (equipment.length > 0 && maxItemHeight > 8) {
      issues.push({ level: "warn", msg: `Install reaches ${maxItemHeight}ft but no lift/ladder selected.` });
    }
  }

  // Per-item
  items.forEach((it, i) => {
    const num = i + 1;
    if (!it.qty_letters || it.qty_letters <= 0) {
      issues.push({ level: "warn", msg: `Item #${num}: Letter quantity is 0.` });
    }
    if (it.installation_type === "raceway" && (!it.raceway_length_feet || it.raceway_length_feet <= 0)) {
      issues.push({ level: "warn", msg: `Item #${num}: Raceway selected but length is 0 ft.` });
    }
    if (!it.installation_height_feet || it.installation_height_feet <= 0) {
      issues.push({ level: "warn", msg: `Item #${num}: Install height is 0 ft.` });
    }
    if (!it.wall_material) {
      issues.push({ level: "info", msg: `Item #${num}: Wall material not set.` });
    }
    if (!it.materials || it.materials.length === 0) {
      issues.push({ level: "info", msg: `Item #${num}: No materials attached.` });
    }
  });

  const catalogIssues = (pricingIssues || []).filter(i => i.kind === "channel_catalog");
  const inputIssues = (pricingIssues || []).filter(i => i.kind !== "channel_catalog");

  if (issues.length === 0 && pricingIssues.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
        Estimate looks good — no issues detected.
      </div>
    );
  }

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");
  const infos = issues.filter((i) => i.level === "info");

  return (
    <div className="space-y-2">
      {catalogIssues.length > 0 && (
        <PricingGroup
          tone="catalog"
          title={`Pricing records unavailable (${catalogIssues.length})`}
          note="These settings or inventory records are missing, malformed, or were deleted — save is blocked until they are fixed in Pricing Settings, Materials / Equipment Inventory, or the dimensional material library."
          issues={catalogIssues}
        />
      )}
      {inputIssues.length > 0 && (
        <PricingGroup
          tone="input"
          title={`Pricing needs attention (${inputIssues.length})`}
          note="These values can't produce a real price — fix them or use a saved acknowledged snapshot. Save is blocked."
          issues={inputIssues}
        />
      )}
      {errors.length > 0 && <Group level="error" issues={errors} />}
      {warns.length > 0 && <Group level="warn" issues={warns} />}
      {infos.length > 0 && <Group level="info" issues={infos} />}
    </div>
  );
}

const PRICING_STYLES = {
  catalog: {
    box: "border-red-300 bg-red-50",
    header: "text-red-900",
    text: "text-red-900",
    note: "text-red-800",
  },
  input: {
    box: "border-amber-300 bg-amber-50",
    header: "text-amber-900",
    text: "text-amber-900",
    note: "text-amber-800",
  },
};

const PricingGroup = ({ tone, title, note, issues }) => {
  const s = PRICING_STYLES[tone];
  const visible = issues.slice(0, 8);
  return (
    <div className={`rounded-lg border p-3 ${s.box}`} role="alert">
      <div className={`flex items-center gap-2 mb-1 text-xs font-semibold uppercase tracking-wide ${s.header}`}>
        <DollarSign className="w-3.5 h-3.5" />
        {title}
      </div>
      <p className={`text-[11px] mb-1.5 ${s.note}`}>{note}</p>
      <ul className={`text-xs space-y-0.5 list-disc list-inside ${s.text}`}>
        {visible.map((w, i) => (
          <li key={`${w.field}-${w.index ?? w.itemIndex ?? "p"}-${i}`}>{w.message}</li>
        ))}
        {issues.length > visible.length && (
          <li className="opacity-70 list-none">+{issues.length - visible.length} more...</li>
        )}
      </ul>
    </div>
  );
};

const STYLES = {
  error: {
    box: "border-red-300 bg-red-50",
    header: "text-red-900",
    text: "text-red-900",
    icon: AlertCircle,
    label: "Must fix",
  },
  warn: {
    box: "border-amber-200 bg-amber-50",
    header: "text-amber-900",
    text: "text-amber-900",
    icon: AlertTriangle,
    label: "Heads up",
  },
  info: {
    box: "border-slate-200 bg-slate-50",
    header: "text-slate-700",
    text: "text-slate-700",
    icon: Info,
    label: "FYI",
  },
};

const Group = ({ level, issues }) => {
  const s = STYLES[level];
  const Icon = s.icon;
  const visible = issues.slice(0, 6);
  return (
    <div className={`rounded-lg border p-3 ${s.box}`}>
      <div className={`flex items-center gap-2 mb-1.5 text-xs font-semibold uppercase tracking-wide ${s.header}`}>
        <Icon className="w-3.5 h-3.5" />
        {s.label} ({issues.length})
      </div>
      <ul className={`text-xs space-y-0.5 list-disc list-inside ${s.text}`}>
        {visible.map((w, i) => (
          <li key={i}>{w.msg}</li>
        ))}
        {issues.length > visible.length && (
          <li className="opacity-70 list-none">+{issues.length - visible.length} more...</li>
        )}
      </ul>
    </div>
  );
};
